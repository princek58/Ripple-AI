import { Router } from 'express';
import { z } from 'zod';
import { getAIConfig, AI_CONSENT_TEXT, AI_CONSENT_VERSION, createAICacheKey } from '../services/ai/aiConfig.js';
import { getAISettings, updateAISettings, getCachedAIResponse, setCachedAIResponse } from '../db/aiRepository.js';
import { getDatabase } from '../db/connection.js';
import { buildFindingContext } from '../services/ai/contextBuilder.js';
import { buildSystemPrompt, buildUserPrompt } from '../services/ai/promptBuilder.js';
import { createAIAdapter } from '../services/ai/aiService.js';
import { checkRateLimit } from '../services/ai/rateLimiter.js';
import { AIServiceError } from '../services/ai/errors.js';

const aiRouter = Router();

const updateSettingsSchema = z.object({
  ai_enabled: z.boolean().optional(),
  ai_code_enabled: z.boolean().optional(),
  consent_version: z.string().optional(),
});

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
 * Returns configured status, provider, and model name.
 * Non-negotiable security guarantee: NEVER returns the API key or base URL credentials.
 */
aiRouter.get('/ai/status', (_req, res) => {
  const config = getAIConfig();
  res.json({
    configured: config.configured,
    provider: config.provider,
    model: config.model || null,
  });
});

/**
 * GET /api/ai/settings
 * Returns current user AI consent and settings.
 */
aiRouter.get('/ai/settings', (_req, res) => {
  const settings = getAISettings();
  res.json({
    ...settings,
    consent_text: AI_CONSENT_TEXT,
    current_consent_version: AI_CONSENT_VERSION,
  });
});

/**
 * POST /api/ai/settings
 * Updates user AI consent and settings.
 * If enabling AI, consent_version must match AI_CONSENT_VERSION.
 */
aiRouter.post('/ai/settings', (req, res) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid settings body' });
  }

  const { ai_enabled, ai_code_enabled, consent_version } = parsed.data;

  if (ai_enabled === true && consent_version !== AI_CONSENT_VERSION) {
    return res.status(400).json({
      error: `Consent version must match current version ${AI_CONSENT_VERSION}`,
    });
  }

  const updated = updateAISettings({
    ai_enabled,
    ai_code_enabled,
    consent_version,
  });

  return res.json({
    ...updated,
    consent_text: AI_CONSENT_TEXT,
    current_consent_version: AI_CONSENT_VERSION,
  });
});

/**
 * POST /api/ai/chat
 * Explains findings and answers developer questions using configured AI adapter.
 */
aiRouter.post('/ai/chat', async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid chat request body' });
  }

  const { finding_id, question, history } = parsed.data;

  // 1. Consent enforcement
  const settings = getAISettings();
  if (!settings.ai_enabled) {
    return res.status(403).json({ error: 'AI_REQUEST_REJECTED [CONSENT_REQUIRED]' });
  }

  // 2. Configuration enforcement
  const aiConfig = getAIConfig();
  if (!aiConfig.configured) {
    return res.status(503).json({ error: 'AI_UNAVAILABLE [NOT_CONFIGURED]' });
  }

  // 3. Rate limiting enforcement
  if (!checkRateLimit(aiConfig.ratePerMinute)) {
    return res.status(429).json({ error: 'AI_QUOTA_EXHAUSTED' });
  }

  // 4. Build finding context with code permission check
  const db = getDatabase();
  const context = buildFindingContext(db, finding_id, settings.ai_code_enabled);
  if (!context) {
    return res.status(404).json({ error: 'Finding not found' });
  }

  // 5. Build prompt with UNTRUSTED delimiters
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(context, question);

  // 6. Check cache
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

  // 7. Invoke active adapter
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

    // Save to cache
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
