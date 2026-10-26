import { Router } from 'express';
import { getAIConfig } from '../services/ai/aiConfig.js';

const aiRouter = Router();

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

export default aiRouter;
