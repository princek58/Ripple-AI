import type { AIAdapter, AIConfig, AIRequest, AIResponse } from '../types.js';
import { AIServiceError, mapHttpStatusToAiError, extractSafeErrorDetails } from '../errors.js';
import { parseSSEStream } from '../sseParser.js';

export class GeminiAdapter implements AIAdapter {
  readonly provider = 'gemini' as const;
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  private buildRequestBody(request: AIRequest): Record<string, any> {
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    if (request.history && request.history.length > 0) {
      for (const turn of request.history) {
        contents.push({
          role: turn.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: turn.content }],
        });
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: request.userPrompt }],
    });

    const body: Record<string, any> = { contents };

    if (request.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: request.systemPrompt }],
      };
    }

    const generationConfig: Record<string, any> = {};
    if (typeof request.maxTokens === 'number') {
      generationConfig.maxOutputTokens = request.maxTokens;
    }
    if (typeof request.temperature === 'number') {
      generationConfig.temperature = request.temperature;
    }
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    return body;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!this.config.apiKey || !this.config.model) {
      throw new AIServiceError('AI_REQUEST_REJECTED');
    }

    const baseUrl = this.config.apiBase.replace(/\/+$/, '');
    const model = encodeURIComponent(this.config.model);
    // Non-negotiable security: key is sent ONLY in x-goog-api-key header, NEVER in URL query
    const url = `${baseUrl}/v1beta/models/${model}:generateContent`;
    const body = this.buildRequestBody(request);

    let res: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.config.apiKey,
        },
        body: JSON.stringify(body),
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

    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) {
      throw new AIServiceError('AI_NO_ANSWER');
    }

    // Join ALL text parts, ignoring parts without text
    const fullText = parts
      .map((p: any) => (p && typeof p.text === 'string' ? p.text : ''))
      .filter((t: string) => t.length > 0)
      .join('');

    if (fullText.trim().length === 0) {
      throw new AIServiceError('AI_NO_ANSWER');
    }

    return {
      text: fullText,
      provider: this.provider,
      model: this.config.model,
    };
  }

  async *generateStream(request: AIRequest): AsyncIterable<string> {
    if (!this.config.apiKey || !this.config.model) {
      throw new AIServiceError('AI_REQUEST_REJECTED');
    }

    const baseUrl = this.config.apiBase.replace(/\/+$/, '');
    const model = encodeURIComponent(this.config.model);
    // Non-negotiable security: key is sent ONLY in x-goog-api-key header, NEVER in URL query
    const url = `${baseUrl}/v1beta/models/${model}:streamGenerateContent?alt=sse`;
    const body = this.buildRequestBody(request);

    let res: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.config.apiKey,
        },
        body: JSON.stringify(body),
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
        if (!dataStr || dataStr === '[DONE]') continue;

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

        const parts = data?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (p && typeof p.text === 'string' && p.text.length > 0) {
              totalYielded += p.text.length;
              yield p.text;
            }
          }
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
