import { Router } from 'express';
import { z } from 'zod';
import {
  getAIConfig,
  AI_CONSENT_TEXT,
  AI_CONSENT_VERSION,
  createProjectAICacheKey,
} from '../services/ai/aiConfig.js';
import {
  getProjectAISettings,
  updateProjectAISettings,
  getCachedAIResponse,
  setCachedAIResponse,
} from '../db/aiRepository.js';
import { getDatabase } from '../db/connection.js';
import { ProjectsRepository } from '../db/projectsRepository.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { buildScreenContext } from '../services/ai/contextBuilder.js';
import { buildSystemPrompt, buildUserPrompt } from '../services/ai/promptBuilder.js';
import { createAIAdapter } from '../services/ai/aiService.js';
import { consumeRateLimit } from '../services/ai/rateLimiter.js';
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

const chatRequestSchema = z
  .object({
    message: z.string().min(1).max(1500),
    screen: z.enum([
      'overview',
      'projects',
      'graph',
      'investigations',
      'fixes',
      'tests',
      'reports',
      'landing',
      'general',
    ]),
    finding_id: z.string().uuid().optional(),
    node_id: z.string().uuid().optional(),
    fix_id: z.string().uuid().optional(),
    report_id: z.string().uuid().optional(),
    history: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          text: z.string().max(1000),
        })
      )
      .max(6)
      .optional(),
    lang: z.enum(['en', 'hi']).optional(),
  })
  .strict();

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
 * POST /api/projects/:id/chat
 * Explains findings, code architecture, and answers developer questions across all screens.
 */
aiRouter.post('/projects/:id/chat', async (req, res) => {
  const paramParsed = projectIdParamsSchema.safeParse(req.params);
  if (!paramParsed.success) {
    return sendError(res, 'Invalid project ID format, must be a UUID', 400);
  }

  const bodyParsed = chatRequestSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return sendError(res, 'Invalid chat request body', 400);
  }

  const { id } = paramParsed.data;
  const { message, screen, finding_id, node_id, fix_id, report_id, history, lang } =
    bodyParsed.data;

  const db = getDatabase();
  const repo = new ProjectsRepository(db);
  const project = repo.findById(id);
  if (!project) {
    return sendError(res, 'Project not found', 404);
  }

  // 1. Consent enforcement
  const settings = getProjectAISettings(id);
  if (!settings || !settings.ai_enabled) {
    return sendError(res, 'AI_DISABLED [CONSENT_REQUIRED]', 403);
  }

  // 2. Validate optional IDs (must belong to this project else 404)
  if (finding_id) {
    const row = db
      .prepare('SELECT project_id FROM findings WHERE id = ?')
      .get(finding_id) as any;
    if (!row || row.project_id !== id) {
      return sendError(res, 'Finding not found', 404);
    }
  }

  if (node_id) {
    const row = db
      .prepare('SELECT project_id FROM nodes WHERE id = ?')
      .get(node_id) as any;
    if (!row || row.project_id !== id) {
      return sendError(res, 'Node not found', 404);
    }
  }

  if (fix_id) {
    const row = db
      .prepare(
        'SELECT f.project_id FROM fixes fx JOIN findings f ON fx.finding_id = f.id WHERE fx.id = ?'
      )
      .get(fix_id) as any;
    if (!row || row.project_id !== id) {
      return sendError(res, 'Fix not found', 404);
    }
  }

  if (report_id) {
    const row = db
      .prepare('SELECT project_id FROM reports WHERE id = ?')
      .get(report_id) as any;
    if (!row || row.project_id !== id) {
      return sendError(res, 'Report not found', 404);
    }
  }

  // 3. Configuration enforcement
  const aiConfig = getAIConfig();
  if (!aiConfig.configured) {
    return sendError(res, 'AI_NOT_CONFIGURED', 503);
  }

  // 4. Rate limiting enforcement
  const rateLimitResult = consumeRateLimit(aiConfig.ratePerMinute);
  if (!rateLimitResult.allowed) {
    res.setHeader('Retry-After', String(rateLimitResult.retryAfterSeconds));
    return sendError(res, 'AI_RATE_LIMITED [LOCAL_LIMIT_EXCEEDED]', 429);
  }

  // 5. Cache check
  const lastScan = db
    .prepare(
      'SELECT id FROM scans WHERE project_id = ? ORDER BY started_at DESC LIMIT 1'
    )
    .get(id) as any;
  const scanId = lastScan ? lastScan.id : null;

  const cacheKey = createProjectAICacheKey({
    provider: aiConfig.provider,
    model: aiConfig.model,
    projectId: id,
    scanId,
    screen,
    findingId: finding_id,
    nodeId: node_id,
    fixId: fix_id,
    reportId: report_id,
    shareCode: settings.share_code,
    lang,
    message,
    history,
  });

  const cached = getCachedAIResponse(cacheKey);
  if (cached) {
    return sendSuccess(res, {
      text: cached,
      source: 'saved',
      provider: aiConfig.provider,
      model: aiConfig.model,
    });
  }

  // 6. Build prompt & context
  const contextText = buildScreenContext(
    db,
    id,
    { screen, finding_id, node_id, fix_id, report_id },
    settings.share_code
  );
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(contextText, message, lang);

  // 7. Invoke active adapter
  const adapter = createAIAdapter(aiConfig);
  try {
    const aiRes = await adapter.generate({
      systemPrompt,
      history: history?.map((h) => ({ role: h.role, content: h.text })),
      userPrompt,
      maxTokens: 1000,
    });

    let answer = aiRes.text;
    if (answer.length > aiConfig.maxOutputChars) {
      answer = answer.slice(0, aiConfig.maxOutputChars);
    }

    setCachedAIResponse(cacheKey, answer, aiConfig.provider, aiConfig.model);

    const source = aiConfig.provider === 'gemini' ? 'gemini' : 'ai';
    return sendSuccess(res, {
      text: answer,
      source,
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
          : err.code === 'AI_AUTH_FAILED'
          ? 401
          : err.code === 'AI_REQUEST_REJECTED'
          ? 400
          : err.code === 'AI_TIMEOUT'
          ? 504
          : 502);

      return res.status(httpStatus).json({ data: null, error: err.shortCode });
    }

    return res
      .status(502)
      .json({ data: null, error: 'AI_UNAVAILABLE [INTERNAL_ERROR]' });
  }
});

export default aiRouter;
