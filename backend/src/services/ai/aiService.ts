import type { AIAdapter, AIConfig } from './types.js';
import { getAIConfig } from './aiConfig.js';
import { GeminiAdapter } from './adapters/geminiAdapter.js';
import { OpenAICompatibleAdapter } from './adapters/openaiCompatibleAdapter.js';

/**
 * Returns the appropriate adapter instance based on configured provider.
 */
export function createAIAdapter(config?: AIConfig): AIAdapter {
  const resolved = config ?? getAIConfig();
  if (
    resolved.provider === 'openai_compatible' ||
    resolved.provider === 'groq' ||
    resolved.provider === 'openai'
  ) {
    return new OpenAICompatibleAdapter(resolved, resolved.provider);
  }
  return new GeminiAdapter(resolved);
}
