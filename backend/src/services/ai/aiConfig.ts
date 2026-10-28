import crypto from 'node:crypto';
import type { AIConfig, AIProvider, AICandidate } from './types.js';

export const AI_CONSENT_VERSION = '2026-10-v2';
export const AI_CONSENT_TEXT =
  'Turning this on sends the question and a short summary of the selected finding or file (rule, severity, file path, line numbers) to the AI service configured in this app (its name is shown next to the switch). With the code switch on, up to 7 lines around the cited line are also sent. The chat may also send the names and counts of modules and the titles of the top findings of the screen you are on. Free tiers of some AI services may use this text to improve their products and human reviewers may read it. Never turn this on for code you do not own or may not share.';

export const AI_MAX_OUTPUT_TOKENS = 1500;

export function parseApiKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/**
 * Returns current resolved AI configuration based on environment variables.
 * Fallbacks:
 * - If AI_PROVIDER is unset or empty, defaults to 'gemini'.
 * - If provider is 'gemini', falls back to GEMINI_API_KEY, GEMINI_MODEL, GEMINI_API_BASE when AI_* are not set.
 * - Supports comma-separated keys in GEMINI_API_KEY, GROQ_API_KEY, or AI_API_KEY.
 * - If GROQ_API_KEY is set, defaults GROQ_MODEL to 'llama-3.3-70b-versatile' and GROQ_BASE_URL to 'https://api.groq.com/openai/v1'.
 * - If GEMINI_API_KEY is NOT set but GROQ_API_KEY is set, Groq is the primary provider.
 * - If both are set, Gemini is primary with Groq as automatic failover candidates.
 */
export function getAIConfig(): AIConfig {
  const rawProvider = (process.env.AI_PROVIDER || '').trim().toLowerCase();

  const rawAiKey = (process.env.AI_API_KEY || '').trim();
  const rawAiModel = (process.env.AI_MODEL || '').trim();
  const rawAiBase = (process.env.AI_API_BASE || '').trim();

  // Gemini keys
  const geminiKeyStr =
    process.env.GEMINI_API_KEY ||
    (rawProvider !== 'openai_compatible' ? rawAiKey : '');
  const geminiKeys = parseApiKeys(geminiKeyStr);
  const geminiModel = (
    process.env.GEMINI_MODEL ||
    (rawProvider !== 'openai_compatible' ? rawAiModel : '') ||
    (geminiKeys.length > 0 ? 'gemini-1.5-flash' : '')
  ).trim();
  const geminiBase = (
    process.env.GEMINI_API_BASE ||
    (rawProvider !== 'openai_compatible' ? rawAiBase : '') ||
    'https://generativelanguage.googleapis.com'
  ).trim();

  // Groq keys
  const groqKeyStr = process.env.GROQ_API_KEY || '';
  const groqKeys = parseApiKeys(groqKeyStr);
  const groqModel = (
    process.env.GROQ_MODEL ||
    (groqKeys.length > 0 ? 'llama-3.3-70b-versatile' : '')
  ).trim();
  const groqBase = (
    process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'
  ).trim();

  // OpenAI keys
  const openaiKeyStr =
    process.env.OPENAI_API_KEY ||
    (rawProvider === 'openai_compatible' ? rawAiKey : '');
  const openaiKeys = parseApiKeys(openaiKeyStr);
  const openaiModel = (
    process.env.OPENAI_MODEL ||
    (rawProvider === 'openai_compatible' ? rawAiModel : '') ||
    ''
  ).trim();
  const openaiBase = (
    process.env.OPENAI_BASE_URL ||
    (rawProvider === 'openai_compatible' ? rawAiBase : '') ||
    'https://api.openai.com/v1'
  ).trim();

  const rawFallbackModel = (process.env.AI_FALLBACK_MODEL || '').trim();
  const fallbackModel = rawFallbackModel || null;

  const ratePerMinute = process.env.AI_RATE_PER_MINUTE
    ? parseInt(process.env.AI_RATE_PER_MINUTE, 10)
    : 10;

  const timeoutMs = process.env.AI_TIMEOUT_MS
    ? parseInt(process.env.AI_TIMEOUT_MS, 10)
    : 45000;

  const maxOutputChars = process.env.AI_MAX_OUTPUT_CHARS
    ? parseInt(process.env.AI_MAX_OUTPUT_CHARS, 10)
    : 4000;

  const candidates: AICandidate[] = [];
  let provider: AIProvider = 'gemini';
  let apiKey = '';
  let model = '';
  let apiBase = geminiBase;

  if (rawProvider === 'openai_compatible' && openaiKeys.length > 0 && openaiModel) {
    provider = 'openai_compatible';
    apiKey = openaiKeys[0];
    model = openaiModel;
    apiBase = openaiBase;

    for (const key of openaiKeys) {
      candidates.push({ provider: 'openai_compatible', apiKey: key, model: openaiModel, apiBase: openaiBase });
    }

    if (fallbackModel && fallbackModel !== openaiModel) {
      for (const key of openaiKeys) {
        candidates.push({ provider: 'openai_compatible', apiKey: key, model: fallbackModel, apiBase: openaiBase });
      }
    }

    if (groqKeys.length > 0 && groqModel) {
      for (const key of groqKeys) {
        candidates.push({ provider: 'groq', apiKey: key, model: groqModel, apiBase: groqBase });
      }
    }

    if (geminiKeys.length > 0 && geminiModel) {
      for (const key of geminiKeys) {
        candidates.push({ provider: 'gemini', apiKey: key, model: geminiModel, apiBase: geminiBase });
      }
    }
  } else if (geminiKeys.length > 0 && geminiModel) {
    provider = 'gemini';
    apiKey = geminiKeys[0];
    model = geminiModel;
    apiBase = geminiBase;

    for (const key of geminiKeys) {
      candidates.push({ provider: 'gemini', apiKey: key, model: geminiModel, apiBase: geminiBase });
    }

    if (fallbackModel && fallbackModel !== geminiModel) {
      for (const key of geminiKeys) {
        candidates.push({ provider: 'gemini', apiKey: key, model: fallbackModel, apiBase: geminiBase });
      }
    }

    if (groqKeys.length > 0 && groqModel) {
      for (const key of groqKeys) {
        candidates.push({ provider: 'groq', apiKey: key, model: groqModel, apiBase: groqBase });
      }
    }

    if (openaiKeys.length > 0 && openaiModel) {
      for (const key of openaiKeys) {
        candidates.push({ provider: 'openai', apiKey: key, model: openaiModel, apiBase: openaiBase });
      }
    }
  } else if (groqKeys.length > 0 && groqModel) {
    provider = 'groq';
    apiKey = groqKeys[0];
    model = groqModel;
    apiBase = groqBase;

    for (const key of groqKeys) {
      candidates.push({ provider: 'groq', apiKey: key, model: groqModel, apiBase: groqBase });
    }

    if (fallbackModel && fallbackModel !== groqModel) {
      for (const key of groqKeys) {
        candidates.push({ provider: 'groq', apiKey: key, model: fallbackModel, apiBase: groqBase });
      }
    }

    if (geminiKeys.length > 0 && geminiModel) {
      for (const key of geminiKeys) {
        candidates.push({ provider: 'gemini', apiKey: key, model: geminiModel, apiBase: geminiBase });
      }
    }

    if (openaiKeys.length > 0 && openaiModel) {
      for (const key of openaiKeys) {
        candidates.push({ provider: 'openai', apiKey: key, model: openaiModel, apiBase: openaiBase });
      }
    }
  } else if (openaiKeys.length > 0 && openaiModel) {
    provider = rawProvider === 'openai_compatible' ? 'openai_compatible' : 'openai';
    apiKey = openaiKeys[0];
    model = openaiModel;
    apiBase = openaiBase;

    for (const key of openaiKeys) {
      candidates.push({ provider: 'openai_compatible', apiKey: key, model: openaiModel, apiBase: openaiBase });
    }

    if (fallbackModel && fallbackModel !== openaiModel) {
      for (const key of openaiKeys) {
        candidates.push({ provider: 'openai_compatible', apiKey: key, model: fallbackModel, apiBase: openaiBase });
      }
    }
  } else {
    // Unconfigured
    provider = rawProvider === 'openai_compatible' ? 'openai_compatible' : 'gemini';
    apiKey = '';
    model = '';
    apiBase = provider === 'openai_compatible' ? openaiBase : geminiBase;
  }

  const configured = candidates.length > 0;

  return {
    configured,
    provider,
    apiKey,
    model,
    fallbackModel,
    apiBase,
    ratePerMinute,
    timeoutMs,
    maxOutputChars,
    candidates,
  };
}

/**
 * Builds an AI cache key that strictly includes provider, model, and payload hash.
 */
export function createAICacheKey(provider: string, model: string, inputPayload: string): string {
  const hash = crypto.createHash('sha256').update(inputPayload).digest('hex');
  return `${provider}:${model}:${hash}`;
}

export interface ProjectAICacheKeyParams {
  provider: string;
  model: string;
  projectId: string;
  scanId: string | null;
  screen: string;
  findingId?: string | null;
  nodeId?: string | null;
  fixId?: string | null;
  reportId?: string | null;
  shareCode: boolean;
  lang?: string | null;
  message: string;
  history?: Array<{ role: string; text: string }>;
}

/**
 * Builds cache key as sha256 of:
 * provider, model, project id, scan id, screen, ids, share_code, lang, normalised message and history text.
 * A changed scan id will never hit the cache.
 */
export function createProjectAICacheKey(params: ProjectAICacheKeyParams): string {
  const normalized = {
    provider: params.provider,
    model: params.model,
    projectId: params.projectId,
    scanId: params.scanId || 'never_scanned',
    screen: params.screen,
    findingId: params.findingId || null,
    nodeId: params.nodeId || null,
    fixId: params.fixId || null,
    reportId: params.reportId || null,
    shareCode: Boolean(params.shareCode),
    lang: params.lang || 'en',
    message: params.message.trim().toLowerCase(),
    history: (params.history || []).map((h) => ({
      role: h.role,
      text: h.text.trim().toLowerCase(),
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
