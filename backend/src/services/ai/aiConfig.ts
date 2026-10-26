import crypto from 'node:crypto';
import type { AIConfig, AIProvider } from './types.js';

export const AI_CONSENT_VERSION = '2026-10-v1';
export const AI_CONSENT_TEXT =
  'Turning this on sends the question and a short summary of the selected finding or file (rule, severity, file path, line numbers) to the AI service configured in this app (its name is shown next to the switch). With the code switch on, up to 7 lines around the cited line are also sent. Free tiers of some AI services may use this text to improve their products and human reviewers may read it. Never turn this on for code you do not own or may not share.';

/**
 * Returns current resolved AI configuration based on environment variables.
 * Fallbacks:
 * - If AI_PROVIDER is unset or empty, defaults to 'gemini'.
 * - If provider is 'gemini', falls back to GEMINI_API_KEY, GEMINI_MODEL, GEMINI_API_BASE when AI_* are not set.
 * - AI_API_BASE defaults:
 *   - 'https://generativelanguage.googleapis.com' for gemini
 *   - 'https://api.openai.com/v1' for openai_compatible
 * - No default model name exists.
 * - Configured is true ONLY if both apiKey and model are non-empty.
 */
export function getAIConfig(): AIConfig {
  const rawProvider = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  const provider: AIProvider =
    rawProvider === 'openai_compatible' ? 'openai_compatible' : 'gemini';

  const rawAiKey = (process.env.AI_API_KEY || '').trim();
  const rawAiModel = (process.env.AI_MODEL || '').trim();
  const rawAiBase = (process.env.AI_API_BASE || '').trim();

  let apiKey = rawAiKey;
  let model = rawAiModel;
  let apiBase = rawAiBase;

  if (provider === 'gemini') {
    if (!apiKey) {
      apiKey = (process.env.GEMINI_API_KEY || '').trim();
    }
    if (!model) {
      model = (process.env.GEMINI_MODEL || '').trim();
    }
    if (!apiBase) {
      apiBase = (process.env.GEMINI_API_BASE || '').trim();
    }
  }

  if (!apiBase) {
    apiBase =
      provider === 'openai_compatible'
        ? 'https://api.openai.com/v1'
        : 'https://generativelanguage.googleapis.com';
  }

  const ratePerMinute = process.env.AI_RATE_PER_MINUTE
    ? parseInt(process.env.AI_RATE_PER_MINUTE, 10)
    : 15;

  const timeoutMs = process.env.AI_TIMEOUT_MS
    ? parseInt(process.env.AI_TIMEOUT_MS, 10)
    : 30000;

  const maxOutputChars = process.env.AI_MAX_OUTPUT_CHARS
    ? parseInt(process.env.AI_MAX_OUTPUT_CHARS, 10)
    : 4000;

  const configured = Boolean(apiKey && model);

  return {
    configured,
    provider,
    apiKey,
    model,
    apiBase,
    ratePerMinute,
    timeoutMs,
    maxOutputChars,
  };
}

/**
 * Builds an AI cache key that strictly includes provider and model.
 */
export function createAICacheKey(provider: string, model: string, inputPayload: string): string {
  const hash = crypto.createHash('sha256').update(inputPayload).digest('hex');
  return `${provider}:${model}:${hash}`;
}
