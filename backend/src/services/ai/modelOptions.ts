/**
 * Resolves model-specific token limit and temperature parameters for OpenAI-compatible chat completions.
 *
 * Based on OpenAI Chat Completions API specifications:
 * - For reasoning models (e.g. o1, o1-preview, o1-mini, o3, o3-mini):
 *   - 'max_tokens' is deprecated/disallowed in favor of 'max_completion_tokens'.
 *   - Custom 'temperature' is unsupported (fixed at 1 internally) and passing it triggers an API error.
 * - For standard models (e.g. gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo):
 *   - 'max_tokens' (or 'max_completion_tokens') sets the generation budget.
 *   - 'temperature' is passed if specified.
 */
export function getOpenAIModelOptions(
  model: string,
  maxTokens?: number,
  temperature?: number
): Record<string, any> {
  const isReasoning = /^(o1|o3)/i.test(model.trim());
  const options: Record<string, any> = {};

  if (isReasoning) {
    if (typeof maxTokens === 'number') {
      options.max_completion_tokens = maxTokens;
    }
    // temperature is omitted for reasoning models
  } else {
    if (typeof maxTokens === 'number') {
      options.max_tokens = maxTokens;
    }
    if (typeof temperature === 'number') {
      options.temperature = temperature;
    }
  }

  return options;
}
