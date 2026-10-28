import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { GeminiAdapter } from '../src/services/ai/adapters/geminiAdapter.js';
import { OpenAICompatibleAdapter } from '../src/services/ai/adapters/openaiCompatibleAdapter.js';
import { getOpenAIModelOptions } from '../src/services/ai/modelOptions.js';
import { getAIConfig, createAICacheKey, AI_CONSENT_TEXT, AI_CONSENT_VERSION } from '../src/services/ai/aiConfig.js';
import { AIServiceError, extractSafeErrorDetails, sanitizeEnumWord } from '../src/services/ai/errors.js';
import type { AIConfig } from '../src/services/ai/types.js';

describe('Provider-Neutral AI Adapters (Addendum v2 & Step K1)', () => {
  let mockServer: http.Server;
  let mockBaseUrl: string;
  let lastCapturedRequest: {
    method?: string;
    url?: string;
    headers?: http.IncomingHttpHeaders;
    body?: any;
  } = {};
  let mockHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void = () => {};

  beforeEach(async () => {
    lastCapturedRequest = {};
    mockServer = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        lastCapturedRequest = {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: raw ? JSON.parse(raw) : null,
        };
        mockHandler(req, res);
      });
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as any;
        mockBaseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    mockServer.closeAllConnections?.();
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  describe('Model Options resolution function', () => {
    it('uses max_completion_tokens and omits temperature for reasoning models (o1, o3, o3-mini)', () => {
      const optsO1 = getOpenAIModelOptions('o1', 1000, 0.7);
      expect(optsO1).toEqual({ max_completion_tokens: 1000 });
      expect(optsO1.temperature).toBeUndefined();
      expect(optsO1.max_tokens).toBeUndefined();

      const optsO3Mini = getOpenAIModelOptions('o3-mini', 2500, 0.2);
      expect(optsO3Mini).toEqual({ max_completion_tokens: 2500 });
      expect(optsO3Mini.temperature).toBeUndefined();
    });

    it('uses max_tokens and includes temperature for standard models (gpt-4o, gpt-3.5-turbo)', () => {
      const opts4o = getOpenAIModelOptions('gpt-4o', 800, 0.5);
      expect(opts4o).toEqual({ max_tokens: 800, temperature: 0.5 });

      const opts35 = getOpenAIModelOptions('gpt-3.5-turbo', 500, 0.8);
      expect(opts35).toEqual({ max_tokens: 500, temperature: 0.8 });
    });
  });

  describe('Sanitization & Safe Error Extraction', () => {
    it('accepts only enum words matching ^[A-Z_]{3,64}$ and drops lowercase, spaces, or symbols', () => {
      expect(sanitizeEnumWord('PERMISSION_DENIED')).toBe('PERMISSION_DENIED');
      expect(sanitizeEnumWord('API_KEY_INVALID')).toBe('API_KEY_INVALID');
      expect(sanitizeEnumWord('NOT_FOUND')).toBe('NOT_FOUND');
      expect(sanitizeEnumWord('AB')).toBeUndefined(); // < 3 chars
      expect(sanitizeEnumWord('lowercase_error')).toBeUndefined();
      expect(sanitizeEnumWord('Invalid Key with Spaces')).toBeUndefined();
      expect(sanitizeEnumWord(null)).toBeUndefined();
      expect(sanitizeEnumWord(123)).toBeUndefined();
    });

    it('extracts status word and details reason enum while ignoring hostile error message', () => {
      const hostilePayload = {
        error: {
          code: 400,
          status: 'INVALID_ARGUMENT',
          message: 'HOSTILE_LEAK: User secret in memory dump at /root/.secret',
          details: [
            { reason: 'API_KEY_INVALID', metadata: { leak: 'do not show' } },
          ],
        },
      };

      const extracted = extractSafeErrorDetails(hostilePayload);
      expect(extracted.statusWord).toBe('INVALID_ARGUMENT');
      expect(extracted.reason).toBe('API_KEY_INVALID');
    });

    it('creates AI_AUTH_FAILED error with sanitized reason', () => {
      const err = new AIServiceError('AI_AUTH_FAILED', 401, 'INVALID_API_KEY');
      expect(err.code).toBe('AI_AUTH_FAILED');
      expect(err.upstream_status).toBe(401);
      expect(err.shortCode).toBe('AI_AUTH_FAILED [INVALID_API_KEY]');
    });
  });

  describe('Gemini Adapter (Step 2a & 2b Fixes)', () => {
    const testConfig: AIConfig = {
      configured: true,
      provider: 'gemini',
      apiKey: 'test-gemini-key-xyz',
      model: 'gemini-1.5-pro',
      apiBase: '',
      ratePerMinute: 15,
      timeoutMs: 5000,
      maxOutputChars: 4000,
    };

    it('sends key in header x-goog-api-key and NEVER in query URL', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: 'Response from Gemini' }] } },
            ],
          })
        );
      };

      const adapter = new GeminiAdapter({
        ...testConfig,
        apiBase: mockBaseUrl,
      });

      const response = await adapter.generate({ userPrompt: 'Inspect code' });
      expect(response.text).toBe('Response from Gemini');

      // Assert header contains key
      expect(lastCapturedRequest.headers?.['x-goog-api-key']).toBe('test-gemini-key-xyz');
      // Assert URL does NOT contain query parameter or key
      expect(lastCapturedRequest.url).toBe('/v1beta/models/gemini-1.5-pro:generateContent');
      expect(lastCapturedRequest.url).not.toContain('?key=');
      expect(lastCapturedRequest.url).not.toContain('test-gemini-key-xyz');
    });

    it('joins ALL text parts of candidates[0].content.parts and ignores non-text parts', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    { text: 'First part of analysis. ' },
                    { inlineData: { mimeType: 'image/png' } }, // non-text part ignored
                    { text: 'Second part of analysis.' },
                  ],
                },
              },
            ],
          })
        );
      };

      const adapter = new GeminiAdapter({
        ...testConfig,
        apiBase: mockBaseUrl,
      });

      const response = await adapter.generate({ userPrompt: 'Join parts' });
      expect(response.text).toBe('First part of analysis. Second part of analysis.');
    });

    it('wraps network errors so that no URL or key can appear in error message', async () => {
      // Use an unreachable port to force network failure
      const adapter = new GeminiAdapter({
        ...testConfig,
        apiBase: 'http://127.0.0.1:59999',
      });

      try {
        await adapter.generate({ userPrompt: 'network test' });
        expect.fail('Expected network call to fail');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AIServiceError);
        expect(err.code).toBe('AI_UNREACHABLE');
        expect(err.message).toBe('AI_UNREACHABLE');
        // Crucial security proof: error text does not contain key or target URL
        expect(err.message).not.toContain('test-gemini-key-xyz');
        expect(err.message).not.toContain('59999');
      }
    });

    it('extracts upstream_status and upstream_reason, mapping 404 to AI_MODEL_NOT_FOUND', async () => {
      const adapter = new GeminiAdapter({
        ...testConfig,
        apiBase: mockBaseUrl,
      });

      mockHandler = (_req, res) => {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              code: 404,
              status: 'NOT_FOUND',
              message: 'HOSTILE_BODY: model gemini-unknown does not exist',
            },
          })
        );
      };

      try {
        await adapter.generate({ userPrompt: 'test' });
        expect.fail('Expected 404 to throw');
      } catch (err: any) {
        expect(err.code).toBe('AI_MODEL_NOT_FOUND');
        expect(err.upstream_status).toBe(404);
        expect(err.upstream_status_word).toBe('NOT_FOUND');
        expect(err.shortCode).toBe('AI_MODEL_NOT_FOUND [NOT_FOUND]');
        // Hostile message must NEVER appear
        expect(err.message).not.toContain('HOSTILE_BODY');
      }
    });

    it('extracts reason enum API_KEY_INVALID for 400/403', async () => {
      const adapter = new GeminiAdapter({
        ...testConfig,
        apiBase: mockBaseUrl,
      });

      mockHandler = (_req, res) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              code: 400,
              status: 'INVALID_ARGUMENT',
              message: 'HOSTILE: key bad',
              details: [{ reason: 'API_KEY_INVALID' }],
            },
          })
        );
      };

      try {
        await adapter.generate({ userPrompt: 'test' });
        expect.fail('Expected 400 to throw');
      } catch (err: any) {
        expect(err.code).toBe('AI_REQUEST_REJECTED');
        expect(err.upstream_status).toBe(400);
        expect(err.upstream_status_word).toBe('INVALID_ARGUMENT');
        expect(err.upstream_reason).toBe('API_KEY_INVALID');
        expect(err.shortCode).toBe('AI_REQUEST_REJECTED [API_KEY_INVALID]');
        expect(err.message).not.toContain('HOSTILE');
      }
    });

    it('aborts on timeout and throws AI_TIMEOUT', async () => {
      const adapter = new GeminiAdapter({
        ...testConfig,
        apiBase: mockBaseUrl,
        timeoutMs: 50,
      });

      mockHandler = (_req, res) => {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'delayed' }] } }] }));
        }, 150);
      };

      try {
        await adapter.generate({ userPrompt: 'test timeout' });
        expect.fail('Expected timeout error');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AIServiceError);
        expect(err.code).toBe('AI_TIMEOUT');
      }
    });

    it('generateStream streams chunks via SSE alt=sse and preserves x-goog-api-key header', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: {"candidates":[{"content":{"parts":[{"text":"Hello "}]}}]}\n\n');
        res.write('data: {"candidates":[{"content":{"parts":[{"text":"from Gemini stream!"}]}}]}\n\n');
        res.end();
      };

      const adapter = new GeminiAdapter({
        ...testConfig,
        apiBase: mockBaseUrl,
      });

      const chunks: string[] = [];
      for await (const chunk of adapter.generateStream({ userPrompt: 'Stream test' })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello ', 'from Gemini stream!']);
      expect(lastCapturedRequest.headers?.['x-goog-api-key']).toBe('test-gemini-key-xyz');
      expect(lastCapturedRequest.url).toContain('/v1beta/models/gemini-1.5-pro:streamGenerateContent?alt=sse');
      expect(lastCapturedRequest.url).not.toContain('?key=');
    });

    it('generateStream handles 429 quota exhausted by throwing AIServiceError', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } }));
      };

      const adapter = new GeminiAdapter({
        ...testConfig,
        apiBase: mockBaseUrl,
      });

      await expect(async () => {
        for await (const _chunk of adapter.generateStream({ userPrompt: 'Quota test' })) {}
      }).rejects.toThrow('AI_QUOTA_EXHAUSTED');
    });

    it('generateStream throws AI_NO_ANSWER on empty stream', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: {"candidates":[]}\n\n');
        res.end();
      };

      const adapter = new GeminiAdapter({
        ...testConfig,
        apiBase: mockBaseUrl,
      });

      await expect(async () => {
        for await (const _chunk of adapter.generateStream({ userPrompt: 'Empty test' })) {}
      }).rejects.toThrow('AI_NO_ANSWER');
    });
  });

  describe('OpenAI-compatible Adapter (Step 2a & 2b Fixes)', () => {
    const testConfig: AIConfig = {
      configured: true,
      provider: 'openai_compatible',
      apiKey: 'test-openai-key-abc',
      model: 'gpt-4o',
      apiBase: '',
      ratePerMinute: 15,
      timeoutMs: 5000,
      maxOutputChars: 4000,
    };

    it('asserts Authorization Bearer header, payload formatting, and key omission from body', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ message: { content: 'Fixed the missing env var' } }],
          })
        );
      };

      const adapter = new OpenAICompatibleAdapter({
        ...testConfig,
        apiBase: mockBaseUrl,
      });

      const response = await adapter.generate({
        systemPrompt: 'You are Ripple AI security analyzer.',
        history: [{ role: 'user', content: 'What is this finding?' }, { role: 'assistant', content: 'A vulnerability.' }],
        userPrompt: 'How to remediate?',
        maxTokens: 500,
        temperature: 0.2,
      });

      expect(response.text).toBe('Fixed the missing env var');
      expect(response.provider).toBe('openai_compatible');
      expect(response.model).toBe('gpt-4o');

      // Assert Authorization header
      expect(lastCapturedRequest.headers?.authorization).toBe('Bearer test-openai-key-abc');
      expect(lastCapturedRequest.url).toBe('/chat/completions');
      expect(lastCapturedRequest.body.model).toBe('gpt-4o');
      expect(lastCapturedRequest.body.messages).toEqual([
        { role: 'system', content: 'You are Ripple AI security analyzer.' },
        { role: 'user', content: 'What is this finding?' },
        { role: 'assistant', content: 'A vulnerability.' },
        { role: 'user', content: 'How to remediate?' },
      ]);
      expect(lastCapturedRequest.body.max_tokens).toBe(500);
      expect(lastCapturedRequest.body.temperature).toBe(0.2);

      expect(JSON.stringify(lastCapturedRequest.body)).not.toContain('test-openai-key-abc');
    });

    it('maps error codes and extracts safe status word without leaking upstream provider message', async () => {
      const adapter = new OpenAICompatibleAdapter({
        ...testConfig,
        apiBase: mockBaseUrl,
      });

      const errorCases = [
        { status: 401, statusWord: 'UNAUTHENTICATED', expectedCode: 'AI_REQUEST_REJECTED' },
        { status: 403, statusWord: 'PERMISSION_DENIED', expectedCode: 'AI_REQUEST_REJECTED' },
        { status: 400, statusWord: 'INVALID_ARGUMENT', expectedCode: 'AI_REQUEST_REJECTED' },
        { status: 404, statusWord: 'NOT_FOUND', expectedCode: 'AI_MODEL_NOT_FOUND' },
        { status: 429, statusWord: 'RESOURCE_EXHAUSTED', expectedCode: 'AI_QUOTA_EXHAUSTED' },
        { status: 500, statusWord: 'INTERNAL', expectedCode: 'AI_UNAVAILABLE' },
      ];

      for (const { status, statusWord, expectedCode } of errorCases) {
        mockHandler = (_req, res) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: {
                message: 'HOSTILE_BODY_ATTACK_STRING',
                status: statusWord,
              },
            })
          );
        };

        try {
          await adapter.generate({ userPrompt: 'test' });
          expect.fail(`Expected status ${status} to throw`);
        } catch (err: any) {
          expect(err).toBeInstanceOf(AIServiceError);
          expect(err.code).toBe(expectedCode);
          expect(err.upstream_status).toBe(status);
          expect(err.upstream_status_word).toBe(statusWord);
          expect(err.shortCode).toBe(`${expectedCode} [${statusWord}]`);
          expect(err.message).not.toContain('HOSTILE_BODY_ATTACK_STRING');
        }
      }
    });

    it('wraps network errors without leaking URL or key', async () => {
      const adapter = new OpenAICompatibleAdapter({
        ...testConfig,
        apiBase: 'http://127.0.0.1:59998',
      });

      try {
        await adapter.generate({ userPrompt: 'network test' });
        expect.fail('Expected network call to fail');
      } catch (err: any) {
        expect(err.code).toBe('AI_UNREACHABLE');
        expect(err.message).not.toContain('test-openai-key-abc');
        expect(err.message).not.toContain('59998');
      }
    });

    it('maps empty or filtered response to AI_NO_ANSWER', async () => {
      const adapter = new OpenAICompatibleAdapter({
        ...testConfig,
        apiBase: mockBaseUrl,
      });

      mockHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: '   ' } }] }));
      };

      await expect(adapter.generate({ userPrompt: 'test' })).rejects.toThrow('AI_NO_ANSWER');
    });

    it('aborts on timeout and throws AI_TIMEOUT for openai compatible adapter', async () => {
      const adapter = new OpenAICompatibleAdapter({
        ...testConfig,
        apiBase: mockBaseUrl,
        timeoutMs: 50,
      });

      mockHandler = (_req, res) => {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ choices: [{ message: { content: 'delayed' } }] }));
        }, 150);
      };

      try {
        await adapter.generate({ userPrompt: 'test timeout' });
        expect.fail('Expected timeout error');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AIServiceError);
        expect(err.code).toBe('AI_TIMEOUT');
      }
    });

    it('generateStream streams chunks via SSE with stream: true and Authorization Bearer header', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n');
        res.write('data: {"choices":[{"delta":{"content":"world from OpenAI stream!"}}]}\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
      };

      const adapter = new OpenAICompatibleAdapter({
        ...testConfig,
        apiBase: mockBaseUrl,
      });

      const chunks: string[] = [];
      for await (const chunk of adapter.generateStream({ userPrompt: 'Stream test' })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello ', 'world from OpenAI stream!']);
      expect(lastCapturedRequest.headers?.authorization).toBe('Bearer test-openai-key-abc');
      expect(lastCapturedRequest.body?.stream).toBe(true);
      expect(lastCapturedRequest.url).toBe('/chat/completions');
    });

    it('generateStream handles 401 auth failure by throwing AIServiceError', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid API key', status: 'UNAUTHENTICATED' } }));
      };

      const adapter = new OpenAICompatibleAdapter({
        ...testConfig,
        apiBase: mockBaseUrl,
      });

      await expect(async () => {
        for await (const _chunk of adapter.generateStream({ userPrompt: 'Auth test' })) {}
      }).rejects.toThrow('AI_REQUEST_REJECTED [UNAUTHENTICATED]');
    });

    it('generateStream throws AI_NO_ANSWER on empty stream', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: [DONE]\n\n');
        res.end();
      };

      const adapter = new OpenAICompatibleAdapter({
        ...testConfig,
        apiBase: mockBaseUrl,
      });

      await expect(async () => {
        for await (const _chunk of adapter.generateStream({ userPrompt: 'Empty test' })) {}
      }).rejects.toThrow('AI_NO_ANSWER');
    });
  });

  describe('Configuration Fallbacks & Cache Keys', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) {
          delete process.env[key];
        }
      }
      Object.assign(process.env, originalEnv);
    });

    it('falls back to GEMINI_* when AI_* are unset and provider is gemini', () => {
      delete process.env.AI_PROVIDER;
      delete process.env.AI_API_KEY;
      delete process.env.AI_MODEL;
      delete process.env.AI_API_BASE;

      process.env.GEMINI_API_KEY = 'fallback-key-999';
      process.env.GEMINI_MODEL = 'gemini-1.5-flash';

      const config = getAIConfig();
      expect(config.configured).toBe(true);
      expect(config.provider).toBe('gemini');
      expect(config.apiKey).toBe('fallback-key-999');
      expect(config.model).toBe('gemini-1.5-flash');
      expect(config.apiBase).toBe('https://generativelanguage.googleapis.com');
    });

    it('prefers AI_* over GEMINI_* when both are provided', () => {
      process.env.AI_PROVIDER = 'openai_compatible';
      process.env.AI_API_KEY = 'ai-key-1';
      process.env.AI_MODEL = 'gpt-4o-mini';
      process.env.AI_API_BASE = 'https://custom.openai.endpoint/v1';

      process.env.GEMINI_API_KEY = 'gemini-key-2';
      process.env.GEMINI_MODEL = 'gemini-1.5-pro';

      const config = getAIConfig();
      expect(config.configured).toBe(true);
      expect(config.provider).toBe('openai_compatible');
      expect(config.apiKey).toBe('ai-key-1');
      expect(config.model).toBe('gpt-4o-mini');
      expect(config.apiBase).toBe('https://custom.openai.endpoint/v1');
    });

    it('cache key includes provider and model', () => {
      const key1 = createAICacheKey('gemini', 'gemini-1.5-flash', 'payload1');
      const key2 = createAICacheKey('openai_compatible', 'gpt-4o', 'payload1');

      expect(key1).toContain('gemini:gemini-1.5-flash:');
      expect(key2).toContain('openai_compatible:gpt-4o:');
      expect(key1).not.toBe(key2);
    });

    it('has exact provider-neutral consent text and version 2026-10-v2', () => {
      expect(AI_CONSENT_VERSION).toBe('2026-10-v2');
      expect(AI_CONSENT_TEXT).toBe(
        'Turning this on sends the question and a short summary of the selected finding or file (rule, severity, file path, line numbers) to the AI service configured in this app (its name is shown next to the switch). With the code switch on, up to 7 lines around the cited line are also sent. The chat may also send the names and counts of modules and the titles of the top findings of the screen you are on. Free tiers of some AI services may use this text to improve their products and human reviewers may read it. Never turn this on for code you do not own or may not share.'
      );
    });
  });
});
