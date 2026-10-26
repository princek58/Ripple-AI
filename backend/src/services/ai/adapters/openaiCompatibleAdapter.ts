import type { AIAdapter, AIConfig, AIRequest, AIResponse } from '../types.js';
import { AIServiceError, mapHttpStatusToAiError, extractSafeErrorDetails } from '../errors.js';
import { getOpenAIModelOptions } from '../modelOptions.js';

export class OpenAICompatibleAdapter implements AIAdapter {
  readonly provider = 'openai_compatible' as const;
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!this.config.apiKey || !this.config.model) {
      throw new AIServiceError('AI_REQUEST_REJECTED');
    }

    const url = `${this.config.apiBase.replace(/\/+$/, '')}/chat/completions`;
    const modelOpts = getOpenAIModelOptions(
      this.config.model,
      request.maxTokens,
      request.temperature
    );

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    if (request.history && request.history.length > 0) {
      for (const msg of request.history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: request.userPrompt });

    const payload = {
      model: this.config.model,
      messages,
      ...modelOpts,
    };

    let res: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timeout);
      // Fixed typed error: never leaks underlying fetch error which might contain URL or credentials
      throw new AIServiceError('AI_UNREACHABLE');
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      let errBody: any = null;
      try {
        errBody = await res.json();
      } catch {}
      const { statusWord, reason } = extractSafeErrorDetails(errBody);
      const code = mapHttpStatusToAiError(res.status);
      throw new AIServiceError(code, res.status, reason, statusWord);
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new AIServiceError('AI_NO_ANSWER');
    }

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new AIServiceError('AI_NO_ANSWER');
    }

    return {
      text: content,
      provider: this.provider,
      model: this.config.model,
    };
  }
}
