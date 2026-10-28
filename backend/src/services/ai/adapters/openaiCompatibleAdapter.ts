import type { AIAdapter, AIConfig, AIRequest, AIResponse, AIProvider } from '../types.js';
import { AIServiceError, mapHttpStatusToAiError, extractSafeErrorDetails } from '../errors.js';
import { isOpenAIReasoningModel } from '../modelOptions.js';
import { parseSSEStream } from '../sseParser.js';

export class OpenAICompatibleAdapter implements AIAdapter {
  readonly provider: AIProvider;
  private config: AIConfig;

  constructor(config: AIConfig, provider?: AIProvider) {
    this.config = config;
    this.provider = provider || (config.provider as AIProvider) || 'openai_compatible';
  }

  private buildPayload(request: AIRequest, stream: boolean = false): Record<string, any> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }

    if (request.history && request.history.length > 0) {
      for (const turn of request.history) {
        messages.push({
          role: turn.role,
          content: turn.content,
        });
      }
    }

    messages.push({
      role: 'user',
      content: request.userPrompt,
    });

    const isReasoning = isOpenAIReasoningModel(this.config.model);

    const payload: Record<string, any> = {
      model: this.config.model,
      messages,
    };

    if (stream) {
      payload.stream = true;
    }

    if (typeof request.maxTokens === 'number') {
      if (isReasoning) {
        payload.max_completion_tokens = request.maxTokens;
      } else {
        payload.max_tokens = request.maxTokens;
      }
    }

    if (!isReasoning && typeof request.temperature === 'number') {
      payload.temperature = request.temperature;
    }

    return payload;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!this.config.apiKey || !this.config.model) {
      throw new AIServiceError('AI_REQUEST_REJECTED');
    }

    const baseUrl = this.config.apiBase.replace(/\/+$/, '');
    const url = `${baseUrl}/chat/completions`;
    const payload = this.buildPayload(request, false);

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
    } catch (err: any) {
      clearTimeout(timeout);
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        throw new AIServiceError('AI_TIMEOUT');
      }
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

  async *generateStream(request: AIRequest): AsyncIterable<string> {
    if (!this.config.apiKey || !this.config.model) {
      throw new AIServiceError('AI_REQUEST_REJECTED');
    }

    const baseUrl = this.config.apiBase.replace(/\/+$/, '');
    const url = `${baseUrl}/chat/completions`;
    const payload = this.buildPayload(request, true);

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
    } catch (err: any) {
      clearTimeout(timeout);
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        throw new AIServiceError('AI_TIMEOUT');
      }
      throw new AIServiceError('AI_UNREACHABLE');
    }

    if (!res.ok) {
      clearTimeout(timeout);
      let errBody: any = null;
      try {
        errBody = await res.json();
      } catch {}
      const { statusWord, reason } = extractSafeErrorDetails(errBody);
      const code = mapHttpStatusToAiError(res.status);
      throw new AIServiceError(code, res.status, reason, statusWord);
    }

    if (!res.body) {
      clearTimeout(timeout);
      throw new AIServiceError('AI_NO_ANSWER');
    }

    let totalYielded = 0;
    try {
      for await (const line of parseSSEStream(res.body)) {
        if (!line.startsWith('data:')) continue;
        const dataStr = line.slice(5).trim();
        if (dataStr === '[DONE]') break;
        if (!dataStr) continue;

        let data: any;
        try {
          data = JSON.parse(dataStr);
        } catch {
          continue;
        }

        if (data.error) {
          const { statusWord, reason } = extractSafeErrorDetails(data);
          const code = mapHttpStatusToAiError(data.error.code || 500);
          throw new AIServiceError(code, data.error.code || 500, reason, statusWord);
        }

        const content = data?.choices?.[0]?.delta?.content;
        if (typeof content === 'string' && content.length > 0) {
          totalYielded += content.length;
          yield content;
        }
      }
    } catch (err: any) {
      if (err instanceof AIServiceError) {
        throw err;
      }
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        throw new AIServiceError('AI_TIMEOUT');
      }
      throw new AIServiceError('AI_UNREACHABLE');
    } finally {
      clearTimeout(timeout);
    }

    if (totalYielded === 0) {
      throw new AIServiceError('AI_NO_ANSWER');
    }
  }
}
