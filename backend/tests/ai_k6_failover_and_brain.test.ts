import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import app from '../src/app.js';
import { getDatabase } from '../src/db/connection.js';
import { updateProjectAISettings } from '../src/db/aiRepository.js';
import { AI_CONSENT_VERSION, getAIConfig } from '../src/services/ai/aiConfig.js';

describe('Step K6 Part 1: Multi-Key & Multi-Provider Auto-Failover (Gemini <-> Groq)', () => {
  const projId = '00000000-0000-0000-0000-000000000099';

  let mockGeminiServer: http.Server;
  let mockGeminiBaseUrl: string;
  let geminiCalls: Array<{ url?: string; headers?: http.IncomingHttpHeaders; body?: any }> = [];
  let geminiHandler: (req: http.IncomingMessage, res: http.ServerResponse, callIndex: number) => void = () => {};

  let mockGroqServer: http.Server;
  let mockGroqBaseUrl: string;
  let groqCalls: Array<{ url?: string; headers?: http.IncomingHttpHeaders; body?: any }> = [];
  let groqHandler: (req: http.IncomingMessage, res: http.ServerResponse, callIndex: number) => void = () => {};

  const originalEnv = { ...process.env };

  beforeEach(async () => {
    geminiCalls = [];
    groqCalls = [];

    // Create mock Gemini server
    mockGeminiServer = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        const idx = geminiCalls.length;
        geminiCalls.push({
          url: req.url,
          headers: req.headers,
          body: raw ? JSON.parse(raw) : null,
        });
        geminiHandler(req, res, idx);
      });
    });

    await new Promise<void>((resolve) => {
      mockGeminiServer.listen(0, '127.0.0.1', () => {
        const addr = mockGeminiServer.address() as any;
        mockGeminiBaseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Create mock Groq server (OpenAI-compatible)
    mockGroqServer = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        const idx = groqCalls.length;
        groqCalls.push({
          url: req.url,
          headers: req.headers,
          body: raw ? JSON.parse(raw) : null,
        });
        groqHandler(req, res, idx);
      });
    });

    await new Promise<void>((resolve) => {
      mockGroqServer.listen(0, '127.0.0.1', () => {
        const addr = mockGroqServer.address() as any;
        mockGroqBaseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Seed dummy project and scan
    const db = getDatabase();
    db.prepare(`
      INSERT OR IGNORE INTO projects (id, name, created_at, size_bytes, file_count)
      VALUES (?, 'Failover Project', CURRENT_TIMESTAMP, 100, 2)
    `).run(projId);

    db.prepare(`
      INSERT OR IGNORE INTO scans (id, project_id, status, started_at, finished_at, files_total)
      VALUES ('scan-k6-failover', ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 2)
    `).run(projId);

    updateProjectAISettings(projId, {
      ai_enabled: true,
      consent_version: AI_CONSENT_VERSION,
    });
  });

  afterEach(async () => {
    // Restore environment
    process.env = { ...originalEnv };

    mockGeminiServer.closeAllConnections?.();
    await new Promise<void>((resolve) => mockGeminiServer.close(() => resolve()));

    mockGroqServer.closeAllConnections?.();
    await new Promise<void>((resolve) => mockGroqServer.close(() => resolve()));
  });

  it('1. Gemini 429 rate-limit automatically fails over to Groq 200 and reports provider: "groq"', async () => {
    process.env.GEMINI_API_KEY = 'gemini-key-1';
    process.env.GEMINI_MODEL = 'gemini-1.5-flash';
    process.env.GEMINI_API_BASE = mockGeminiBaseUrl;

    process.env.GROQ_API_KEY = 'groq-key-1';
    process.env.GROQ_MODEL = 'llama-3.3-70b-versatile';
    process.env.GROQ_BASE_URL = mockGroqBaseUrl;

    geminiHandler = (_req, res) => {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }));
    };

    groqHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: 'Answer from Groq llama model after Gemini 429' } }],
        })
      );
    };

    const res = await request(app)
      .post(`/api/projects/${projId}/chat`)
      .send({ message: 'Explain architecture', screen: 'overview' });

    expect(res.status).toBe(200);
    expect(res.body.data.text).toBe('Answer from Groq llama model after Gemini 429');
    expect(res.body.data.provider).toBe('groq');
    expect(res.body.data.model).toBe('llama-3.3-70b-versatile');
    expect(res.body.data.source).toBe('ai');

    expect(geminiCalls.length).toBe(1);
    expect(groqCalls.length).toBe(1);
    expect(groqCalls[0].headers?.authorization).toBe('Bearer groq-key-1');
  });

  it('2. Gemini 503 fails over to Groq 200', async () => {
    process.env.GEMINI_API_KEY = 'gemini-key-1';
    process.env.GEMINI_MODEL = 'gemini-1.5-flash';
    process.env.GEMINI_API_BASE = mockGeminiBaseUrl;

    process.env.GROQ_API_KEY = 'groq-key-1';
    process.env.GROQ_MODEL = 'llama-3.3-70b-versatile';
    process.env.GROQ_BASE_URL = mockGroqBaseUrl;

    geminiHandler = (_req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE' } }));
    };

    groqHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: 'Groq recovered after Gemini 503' } }],
        })
      );
    };

    const res = await request(app)
      .post(`/api/projects/${projId}/chat`)
      .send({ message: 'Explain findings', screen: 'investigations' });

    expect(res.status).toBe(200);
    expect(res.body.data.text).toBe('Groq recovered after Gemini 503');
    expect(res.body.data.provider).toBe('groq');
    expect(geminiCalls.length).toBe(1);
    expect(groqCalls.length).toBe(1);
  });

  it('3. Comma-separated GEMINI_API_KEY="bad_key1,good_key2" rotates from key1 (429) to key2 (200)', async () => {
    process.env.GEMINI_API_KEY = 'bad_key1, good_key2';
    process.env.GEMINI_MODEL = 'gemini-1.5-flash';
    process.env.GEMINI_API_BASE = mockGeminiBaseUrl;
    delete process.env.GROQ_API_KEY;

    geminiHandler = (req, res, callIndex) => {
      const apiKeyHeader = req.headers['x-goog-api-key'];
      if (callIndex === 0) {
        expect(apiKeyHeader).toBe('bad_key1');
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }));
      } else {
        expect(apiKeyHeader).toBe('good_key2');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'Recovered using good_key2' }] } }],
          })
        );
      }
    };

    const res = await request(app)
      .post(`/api/projects/${projId}/chat`)
      .send({ message: 'Explain multi-key', screen: 'overview' });

    expect(res.status).toBe(200);
    expect(res.body.data.text).toBe('Recovered using good_key2');
    expect(res.body.data.provider).toBe('gemini');
    expect(geminiCalls.length).toBe(2);
  });

  it('4. Groq works as primary when only GROQ_API_KEY is set', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.AI_API_KEY;
    process.env.GROQ_API_KEY = 'primary-groq-key';
    delete process.env.GROQ_MODEL; // will test default llama-3.3-70b-versatile
    process.env.GROQ_BASE_URL = mockGroqBaseUrl;

    const config = getAIConfig();
    expect(config.configured).toBe(true);
    expect(config.provider).toBe('groq');
    expect(config.model).toBe('llama-3.3-70b-versatile');

    // Check GET /api/ai/status
    const statusRes = await request(app).get('/api/ai/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body).toEqual({
      data: {
        configured: true,
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        demo_mode: false,
      },
      error: null,
    });

    groqHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: 'Primary Groq response' } }],
        })
      );
    };

    const chatRes = await request(app)
      .post(`/api/projects/${projId}/chat`)
      .send({ message: 'Primary groq question', screen: 'overview' });

    expect(chatRes.status).toBe(200);
    expect(chatRes.body.data.text).toBe('Primary Groq response');
    expect(chatRes.body.data.provider).toBe('groq');
    expect(chatRes.body.data.model).toBe('llama-3.3-70b-versatile');
    expect(groqCalls.length).toBe(1);
    expect(groqCalls[0].headers?.authorization).toBe('Bearer primary-groq-key');
  });

  it('5. API key values never appear in any error, log, or response', async () => {
    const secretGeminiKey = 'ultra-secret-gemini-canary-key-999';
    const secretGroqKey = 'ultra-secret-groq-canary-key-888';

    process.env.GEMINI_API_KEY = secretGeminiKey;
    process.env.GEMINI_MODEL = 'gemini-1.5-flash';
    process.env.GEMINI_API_BASE = mockGeminiBaseUrl;

    process.env.GROQ_API_KEY = secretGroqKey;
    process.env.GROQ_MODEL = 'llama-3.3-70b-versatile';
    process.env.GROQ_BASE_URL = mockGroqBaseUrl;

    const logSpy = vi.spyOn(console, 'log');
    const errSpy = vi.spyOn(console, 'error');

    // Both fail with 500
    geminiHandler = (_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 500, status: 'INTERNAL' } }));
    };
    groqHandler = (_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 500, message: 'Groq failed' } }));
    };

    const res = await request(app)
      .post(`/api/projects/${projId}/chat`)
      .send({ message: 'Fail both test', screen: 'overview' });

    expect(res.status).toBeGreaterThanOrEqual(500);

    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain(secretGeminiKey);
    expect(bodyStr).not.toContain(secretGroqKey);

    for (const call of logSpy.mock.calls) {
      const callStr = JSON.stringify(call);
      expect(callStr).not.toContain(secretGeminiKey);
      expect(callStr).not.toContain(secretGroqKey);
    }
    for (const call of errSpy.mock.calls) {
      const callStr = JSON.stringify(call);
      expect(callStr).not.toContain(secretGeminiKey);
      expect(callStr).not.toContain(secretGroqKey);
    }
  });
});
