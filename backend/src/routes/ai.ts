import { Router } from 'express';
import { z } from 'zod';
import { getAIConfig, AI_CONSENT_TEXT, AI_CONSENT_VERSION, createAICacheKey } from '../services/ai/aiConfig.js';
import {
  getProjectAISettings,
  updateProjectAISettings,
  getAISettings,
  updateAISettings,
  getCachedAIResponse,
  setCachedAIResponse,
} from '../db/aiRepository.js';
import { getDatabase } from '../db/connection.js';
import { ProjectsRepository } from '../db/projectsRepository.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { buildFindingContext } from '../services/ai/contextBuilder.js';
import { buildSystemPrompt, buildUserPrompt } from '../services/ai/promptBuilder.js';
import { createAIAdapter } from '../services/ai/aiService.js';
import { checkRateLimit } from '../services/ai/rateLimiter.js';
import { AIServiceError } from '../services/ai/errors.js';

const aiRouter = Router();

const projectIdParamsSchema = z.object({
  id: z.string().uuid({ message: 'Invalid project ID format, must be a UUID' }),
});

const updateProjectSettingsSchema = z
  .object({
    ai_enabled: z.boolean().optional(),
    share_code: z.boolean().optional(),
    consent_version: z.string().nullable().optional(),
  })
  .strict();

const chatSchema = z.object({
  finding_id: z.string().uuid(),
  project_id: z.string().uuid(),
  question: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      })
    )
    .max(10)
    .optional(),
});

/**
 * GET /api/ai/status
 * Returns configured status, provider, and model name wrapped in { data, error } envelope.
 * Non-negotiable security guarantee: NEVER returns the API key or base URL credentials.
 */
aiRouter.get('/ai/status', (_req, res) => {
  const config = getAIConfig();
  return sendSuccess(res, {
    configured: config.configured,
    provider: config.provider,
    model: config.model || null,
  });
});

/**
 * GET /api/projects/:id/ai-settings
 * Returns current per-project AI consent and settings.
 */
aiRouter.get('/projects/:id/ai-settings', (req, res) => {
  const paramParsed = projectIdParamsSchema.safeParse(req.params);
  if (!paramParsed.success) {
    return sendError(res, 'Invalid project ID format, must be a UUID', 400);
  }

  const { id } = paramParsed.data;
  const db = getDatabase();
  const repo = new ProjectsRepository(db);
  const project = repo.findById(id);
  if (!project) {
    return sendError(res, 'Project not found', 404);
  }

  const settings = getProjectAISettings(id);
  return sendSuccess(res, {
    ai_enabled: settings?.ai_enabled ?? false,
    share_code: settings?.share_code ?? false,
    consent_version: settings?.consent_version ?? null,
    current_consent_version: AI_CONSENT_VERSION,
    consent_text: AI_CONSENT_TEXT,
  });
});

/**
 * PUT /api/projects/:id/ai-settings
 * Updates per-project AI consent and settings.
 * If enabling AI, consent_version must match AI_CONSENT_VERSION.
 */
aiRouter.put('/projects/:id/ai-settings', (req, res) => {
  const paramParsed = projectIdParamsSchema.safeParse(req.params);
  if (!paramParsed.success) {
    return sendError(res, 'Invalid project ID format, must be a UUID', 400);
  }

  const bodyParsed = updateProjectSettingsSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return sendError(res, 'Invalid settings body', 400);
  }

  const { id } = paramParsed.data;
  const db = getDatabase();
  const repo = new ProjectsRepository(db);
  const project = repo.findById(id);
  if (!project) {
    return sendError(res, 'Project not found', 404);
  }

  const current = getProjectAISettings(id);
  const currentAiEnabled = current?.ai_enabled ?? false;

  const { ai_enabled, share_code, consent_version } = bodyParsed.data;
  const targetAiEnabled = ai_enabled !== undefined ? ai_enabled : currentAiEnabled;

  if (targetAiEnabled && consent_version !== AI_CONSENT_VERSION) {
    return sendError(res, 'AI_CONSENT_REQUIRED [CONSENT_VERSION_MISMATCH]', 400);
  }

  if (share_code === true && !targetAiEnabled) {
    return sendError(res, 'AI_CONSENT_REQUIRED [SHARE_CODE_REQUIRES_AI_ENABLED]', 400);
  }

  const updated = updateProjectAISettings(id, {
    ai_enabled,
    share_code,
    consent_version,
  });

  return sendSuccess(res, {
    ai_enabled: updated.ai_enabled,
    share_code: updated.share_code,
    consent_version: updated.consent_version,
    current_consent_version: AI_CONSENT_VERSION,
    consent_text: AI_CONSENT_TEXT,
  });
});

/**
 * POST /api/ai/chat (temporary legacy handler while moving to /api/projects/:id/chat in Part 2)
 */
aiRouter.post('/ai/chat', async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid chat request body' });
  }

  const { finding_id, question, history } = parsed.data;

  const settings = getAISettings();
  if (!settings.ai_enabled) {
    return res.status(403).json({ error: 'AI_REQUEST_REJECTED [CONSENT_REQUIRED]' });
  }

  const aiConfig = getAIConfig();
  if (!aiConfig.configured) {
    return res.status(503).json({ error: 'AI_UNAVAILABLE [NOT_CONFIGURED]' });
  }

  if (!checkRateLimit(aiConfig.ratePerMinute)) {
    return res.status(429).json({ error: 'AI_QUOTA_EXHAUSTED' });
  }

  const db = getDatabase();
  const context = buildFindingContext(db, finding_id, settings.ai_code_enabled);
  if (!context) {
    return res.status(404).json({ error: 'Finding not found' });
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(context, question);

  const cachePayload = JSON.stringify({
    ruleId: context.ruleId,
    filePath: context.filePath,
    codeSnippet: context.codeSnippet,
    question,
    history: history ?? [],
  });
  const cacheKey = createAICacheKey(aiConfig.provider, aiConfig.model, cachePayload);
  const cachedResponse = getCachedAIResponse(cacheKey);

  if (cachedResponse) {
    return res.json({
      answer: cachedResponse,
      source: 'cache',
      provider: aiConfig.provider,
      model: aiConfig.model,
    });
  }

  const adapter = createAIAdapter(aiConfig);
  try {
    const aiRes = await adapter.generate({
      systemPrompt,
      history: history?.map((h) => ({ role: h.role, content: h.content })),
      userPrompt,
      maxTokens: 1000,
    });

    let answer = aiRes.text;
    if (answer.length > aiConfig.maxOutputChars) {
      answer = answer.slice(0, aiConfig.maxOutputChars);
    }

    setCachedAIResponse(cacheKey, answer, aiConfig.provider, aiConfig.model);

    return res.json({
      answer,
      source: 'ai',
      provider: aiConfig.provider,
      model: aiConfig.model,
    });
  } catch (err: any) {
    if (err instanceof AIServiceError) {
      const httpStatus =
        err.upstream_status ||
        (err.code === 'AI_QUOTA_EXHAUSTED'
          ? 429
          : err.code === 'AI_MODEL_NOT_FOUND'
          ? 404
          : err.code === 'AI_REQUEST_REJECTED'
          ? 400
          : 502);

      return res.status(httpStatus).json({ error: err.shortCode });
    }

    return res.status(502).json({ error: 'AI_UNAVAILABLE' });
  }
});

export default aiRouter;
