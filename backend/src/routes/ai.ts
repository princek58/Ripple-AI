import { Router } from 'express';
import { z } from 'zod';
import {
  getAIConfig,
  AI_CONSENT_TEXT,
  AI_CONSENT_VERSION,
  AI_MAX_OUTPUT_TOKENS,
  createProjectAICacheKey,
} from '../services/ai/aiConfig.js';
import {
  getProjectAISettings,
  updateProjectAISettings,
  getCachedAIResponse,
  setCachedAIResponse,
  isPublicDemoMode,
  getProjectChatHistory,
  saveChatMessage,
  clearProjectChatHistory,
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
    demo_mode: isPublicDemoMode(),
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
    ai_enabled: settings.ai_enabled,
    share_code: settings.share_code,
    consent_version: settings.consent_version,
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
  const currentAiEnabled = current?.ai_enabled ?? true;

  const { ai_enabled, share_code, consent_version } = bodyParsed.data;
  const targetAiEnabled = ai_enabled !== undefined ? ai_enabled : currentAiEnabled;

  if (isPublicDemoMode() && share_code === true) {
    return sendError(res, 'AI_REQUEST_REJECTED [DEMO_MODE]', 400);
  }

  if (targetAiEnabled && consent_version !== undefined && consent_version !== null && consent_version !== AI_CONSENT_VERSION) {
    return sendError(res, 'AI_CONSENT_REQUIRED [CONSENT_VERSION_MISMATCH]', 400);
  }

  if (share_code === true && !targetAiEnabled) {
    return sendError(res, 'AI_CONSENT_REQUIRED [SHARE_CODE_REQUIRES_AI_ENABLED]', 400);
  }

  const updated = updateProjectAISettings(id, {
    ai_enabled,
    share_code,
    consent_version: consent_version || AI_CONSENT_VERSION,
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
 * GET /api/projects/:id/chat/history
 * Returns { data: { items: [...] }, error: null } with up to the last 50 saved messages in chronological order.
 * Verifies project existence (404 if project not found, unless :id is 'general' which returns { items: [] }).
 */
aiRouter.get('/projects/:id/chat/history', (req, res) => {
  const { id } = req.params;
  if (id === 'general') {
    return sendSuccess(res, { items: [] });
  }

  const paramParsed = projectIdParamsSchema.safeParse(req.params);
  if (!paramParsed.success) {
    return sendError(res, 'Invalid project ID format, must be a UUID', 400);
  }

  const db = getDatabase();
  const repo = new ProjectsRepository(db);
  const project = repo.findById(id);
  if (!project) {
    return sendError(res, 'Project not found', 404);
  }

  const items = getProjectChatHistory(id, 50);
  return sendSuccess(res, { items });
});

/**
 * DELETE /api/projects/:id/chat/history
 * Deletes saved chat messages for :id and returns { data: { cleared: true }, error: null }.
 */
aiRouter.delete('/projects/:id/chat/history', (req, res) => {
  const { id } = req.params;
  if (id === 'general') {
    return sendSuccess(res, { cleared: true });
  }

  const paramParsed = projectIdParamsSchema.safeParse(req.params);
  if (!paramParsed.success) {
    return sendError(res, 'Invalid project ID format, must be a UUID', 400);
  }

  const db = getDatabase();
  const repo = new ProjectsRepository(db);
  const project = repo.findById(id);
  if (!project) {
    return sendError(res, 'Project not found', 404);
  }

  clearProjectChatHistory(id);
  return sendSuccess(res, { cleared: true });
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
  if (!settings.ai_enabled) {
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
    saveChatMessage(id, 'user', message);
    saveChatMessage(id, 'assistant', cached, aiConfig.provider, aiConfig.model);
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

  // If client history is omitted or empty, automatically load last 6 saved messages
  let effectiveHistory = history;
  if (!effectiveHistory || effectiveHistory.length === 0) {
    const saved = getProjectChatHistory(id, 6);
    if (saved.length > 0) {
      effectiveHistory = saved.map((s) => ({
        role: s.role,
        text: s.content,
      }));
    }
  }

  // 7. Invoke active adapter (with multi-key and multi-provider failover support)
  const candidates =
    aiConfig.candidates && aiConfig.candidates.length > 0
      ? aiConfig.candidates
      : [
          {
            provider: aiConfig.provider,
            apiKey: aiConfig.apiKey,
            model: aiConfig.model,
            apiBase: aiConfig.apiBase,
          },
        ];

  const startTime = Date.now();
  let aiRes: any = null;
  let activeProvider = aiConfig.provider;
  let activeModel = aiConfig.model;
  let firstError: any = null;
  let lastError: any = null;

  try {
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (i > 0) {
        // Each failover attempt consumes 1 unit from rate limiter
        consumeRateLimit(aiConfig.ratePerMinute);
      }

      const elapsed = Date.now() - startTime;
      const remainingTimeout = Math.max(1, aiConfig.timeoutMs - elapsed);
      if (remainingTimeout <= 1) {
        const timeoutErr = new AIServiceError('AI_TIMEOUT', 504);
        if (!firstError) firstError = timeoutErr;
        lastError = timeoutErr;
        break;
      }

      const candidateConfig = {
        ...aiConfig,
        provider: candidate.provider,
        apiKey: candidate.apiKey,
        model: candidate.model,
        apiBase: candidate.apiBase,
        timeoutMs: remainingTimeout,
      };
      const candidateAdapter = createAIAdapter(candidateConfig);

      try {
        aiRes = await candidateAdapter.generate({
          systemPrompt,
          history: effectiveHistory?.map((h) => ({ role: h.role, content: h.text })),
          userPrompt,
          maxTokens: AI_MAX_OUTPUT_TOKENS,
        });
        activeProvider = candidate.provider;
        activeModel = candidate.model;
        break; // Successfully got an answer!
      } catch (err: any) {
        if (!firstError) firstError = err;
        lastError = err;

        if (!(err instanceof AIServiceError)) {
          throw err;
        }

        const hasNext = i + 1 < candidates.length;
        if (!hasNext) {
          break;
        }

        const next = candidates[i + 1];
        const isDifferentKeyOrProvider =
          next.apiKey !== candidate.apiKey || next.provider !== candidate.provider;

        if (!isDifferentKeyOrProvider) {
          // Same key and provider (model fallback on the same key):
          // only retry on 5xx or 404 (do not retry 429, 400, 403 on same key)
          const canFallback =
            err.code === 'AI_UNAVAILABLE' || err.code === 'AI_MODEL_NOT_FOUND';
          if (!canFallback) {
            break;
          }
        } else {
          // Different key or different provider (multi-key or groq/openai failover)
          const canFailover =
            err.code === 'AI_QUOTA_EXHAUSTED' ||
            err.code === 'AI_UNAVAILABLE' ||
            err.code === 'AI_MODEL_NOT_FOUND' ||
            err.code === 'AI_TIMEOUT' ||
            err.code === 'AI_AUTH_FAILED' ||
            err.upstream_status === 429 ||
            (typeof err.upstream_status === 'number' && err.upstream_status >= 500) ||
            err.upstream_status === 404 ||
            err.upstream_status === 401 ||
            err.upstream_status === 403;

          if (!canFailover) {
            break;
          }
        }
      }
    }

    if (!aiRes) {
      throw firstError || lastError || new AIServiceError('AI_UNAVAILABLE', 502);
    }

    let answer = aiRes.text;
    if (answer.length > aiConfig.maxOutputChars) {
      answer = answer.slice(0, aiConfig.maxOutputChars);
    }

    // Cache key uses the provider & model that actually answered
    const activeCacheKey = createProjectAICacheKey({
      provider: activeProvider,
      model: activeModel,
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

    setCachedAIResponse(activeCacheKey, answer, activeProvider, activeModel);

    // Persist conversation turn into SQLite history
    saveChatMessage(id, 'user', message);
    saveChatMessage(id, 'assistant', answer, activeProvider, activeModel);

    const source = activeProvider === 'gemini' ? 'gemini' : 'ai';
    return sendSuccess(res, {
      text: answer,
      source,
      provider: activeProvider,
      model: activeModel,
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
