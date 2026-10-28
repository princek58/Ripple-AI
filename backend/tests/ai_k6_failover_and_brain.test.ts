import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import app from '../src/app.js';
import { getDatabase } from '../src/db/connection.js';
import { updateProjectAISettings } from '../src/db/aiRepository.js';
import { AI_CONSENT_VERSION, getAIConfig } from '../src/services/ai/aiConfig.js';
import { resetRateLimiter } from '../src/services/ai/rateLimiter.js';

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
    resetRateLimiter();
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
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);

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

  it('6. GET /api/projects/:id/chat/history returns saved user + assistant turns in order after POST chat', async () => {
    process.env.GROQ_API_KEY = 'groq-key-history';
    process.env.GROQ_MODEL = 'llama-3.3-70b-versatile';
    process.env.GROQ_BASE_URL = mockGroqBaseUrl;
    delete process.env.GEMINI_API_KEY;

    groqHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'History turn 1 answer' } }] }));
    };

    // First POST chat
    const postRes = await request(app)
      .post(`/api/projects/${projId}/chat`)
      .send({ message: 'Hello AI assistant', screen: 'overview' });
    expect(postRes.status).toBe(200);

    // Fetch GET history
    const getRes = await request(app).get(`/api/projects/${projId}/chat/history`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.error).toBeNull();
    const items = getRes.body.data.items;
    expect(items.length).toBeGreaterThanOrEqual(2);
    const lastUser = items[items.length - 2];
    const lastAssistant = items[items.length - 1];
    expect(lastUser.role).toBe('user');
    expect(lastUser.content).toBe('Hello AI assistant');
    expect(lastAssistant.role).toBe('assistant');
    expect(lastAssistant.content).toBe('History turn 1 answer');
    expect(lastAssistant.provider).toBe('groq');
    expect(lastAssistant.model).toBe('llama-3.3-70b-versatile');
  });

  it('7. Automatic multi-turn memory: second POST with history: [] passes previous saved turn to adapter', async () => {
    process.env.GROQ_API_KEY = 'groq-key-memory';
    process.env.GROQ_MODEL = 'llama-3.3-70b-versatile';
    process.env.GROQ_BASE_URL = mockGroqBaseUrl;
    delete process.env.GEMINI_API_KEY;

    // Call 1
    groqHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'I am Ripple AI' } }] }));
    };
    await request(app)
      .post(`/api/projects/${projId}/chat`)
      .send({ message: 'Who are you?', screen: 'overview' });

    // Call 2 with empty history []
    groqHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'I remember our previous turn' } }] }));
    };

    const call2Res = await request(app)
      .post(`/api/projects/${projId}/chat`)
      .send({ message: 'What was my previous question?', screen: 'overview', history: [] });

    expect(call2Res.status).toBe(200);
    expect(call2Res.body.data.text).toBe('I remember our previous turn');

    // The second call sent to groq should contain the saved turn in messages
    const lastGroqCall = groqCalls[groqCalls.length - 1];
    expect(lastGroqCall.body).toBeDefined();
    const msgs = lastGroqCall.body.messages;
    const previousUserMsg = msgs.find((m: any) => m.content === 'Who are you?');
    const previousAssistantMsg = msgs.find((m: any) => m.content === 'I am Ripple AI');
    expect(previousUserMsg).toBeDefined();
    expect(previousAssistantMsg).toBeDefined();
  });

  it('8. DELETE /api/projects/:id/chat/history clears the history for that project', async () => {
    const delRes = await request(app).delete(`/api/projects/${projId}/chat/history`);
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({
      data: { cleared: true },
      error: null,
    });

    const getRes = await request(app).get(`/api/projects/${projId}/chat/history`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.items).toEqual([]);

    // Check 'general' project returns [] without error
    const genGet = await request(app).get('/api/projects/general/chat/history');
    expect(genGet.status).toBe(200);
    expect(genGet.body.data.items).toEqual([]);

    const genDel = await request(app).delete('/api/projects/general/chat/history');
    expect(genDel.status).toBe(200);
    expect(genDel.body.data.cleared).toBe(true);

    // Non-existent UUID project returns 404
    const notFound = await request(app).get('/api/projects/00000000-0000-0000-0000-000000000404/chat/history');
    expect(notFound.status).toBe(404);
  });

  it('9. buildScreenContext includes Project Workflow & Architecture Brief:, node breakdown, representative files, and Core Workflow Hubs, without leaking canary project name or absolute paths', async () => {
    const canaryProjName = 'SUPER_SECRET_CANARY_PROJ_NAME_XYZ123';
    const db = getDatabase();

    const canaryId = '00000000-0000-0000-0000-000000000777';
    db.prepare(`
      INSERT OR REPLACE INTO projects (id, name, created_at, size_bytes, file_count)
      VALUES (?, ?, CURRENT_TIMESTAMP, 500, 10)
    `).run(canaryId, canaryProjName);

    const scanId = 'scan-k6-brief-test';
    db.prepare(`
      INSERT OR REPLACE INTO scans (id, project_id, status, started_at, finished_at, files_total)
      VALUES (?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 10)
    `).run(scanId, canaryId);

    // Seed modules and representative child nodes
    db.prepare(`
      INSERT OR REPLACE INTO nodes (id, project_id, scan_id, label, type, level, path)
      VALUES ('mod-auth', ?, ?, 'AuthModule', 'module', 1, 'src/auth')
    `).run(canaryId, scanId);

    db.prepare(`
      INSERT OR REPLACE INTO nodes (id, project_id, scan_id, label, type, level, path, parent_id)
      VALUES ('file-login', ?, ?, 'LoginHandler', 'backend', 2, 'src/auth/login.ts', 'mod-auth')
    `).run(canaryId, scanId);

    db.prepare(`
      INSERT OR REPLACE INTO nodes (id, project_id, scan_id, label, type, level, path, parent_id)
      VALUES ('api-login', ?, ?, 'POST /auth/login', 'api', 2, 'src/auth/routes.ts', 'mod-auth')
    `).run(canaryId, scanId);

    db.prepare(`
      INSERT OR REPLACE INTO nodes (id, project_id, scan_id, label, type, level, path)
      VALUES ('mod-billing', ?, ?, 'BillingModule', 'module', 1, 'src/billing')
    `).run(canaryId, scanId);

    db.prepare(`
      INSERT OR REPLACE INTO nodes (id, project_id, scan_id, label, type, level, path, parent_id)
      VALUES ('file-invoice', ?, ?, 'InvoiceService', 'backend', 2, 'src/billing/invoice.ts', 'mod-billing')
    `).run(canaryId, scanId);

    // Connect nodes
    db.prepare(`
      INSERT OR REPLACE INTO edges (id, project_id, scan_id, source_id, target_id, relation, status, confidence)
      VALUES ('edge-1', ?, ?, 'file-login', 'file-invoice', 'calls', 'resolved', 'confirmed')
    `).run(canaryId, scanId);

    const { buildScreenContext } = await import('../src/services/ai/contextBuilder.js');
    const ctx = buildScreenContext(db, canaryId, { screen: 'overview' }, false);

    expect(ctx).toContain('Project Architecture Summary:');
    expect(ctx).toContain('Visible Modules:');
    expect(ctx).toContain('Project Workflow & Architecture Brief:');
    expect(ctx).toContain('Node Breakdown by Type:');
    expect(ctx).toContain('src/auth/login.ts');
    expect(ctx).toContain('Core Workflow Hubs');

    // Security check: no canary project name, no absolute path
    expect(ctx).not.toContain(canaryProjName);
    expect(ctx).not.toContain('C:');
    expect(ctx).not.toContain('c:\\');
    expect(ctx).not.toContain('/home/');
    expect(ctx).not.toContain('/Users/');
  });

  it('10. Multi-provider streaming failover: Gemini fails with 429 before first chunk, Groq streams SSE chunks, persists full message to SQLite', async () => {
    process.env.GEMINI_API_KEY = 'gemini-key-1';
    process.env.GEMINI_MODEL = 'gemini-1.5-flash';
    process.env.GEMINI_API_BASE = mockGeminiBaseUrl;

    process.env.GROQ_API_KEY = 'groq-key-1';
    process.env.GROQ_MODEL = 'llama-3.3-70b-versatile';
    process.env.GROQ_BASE_URL = mockGroqBaseUrl;

    // Gemini returns 429 rate limit error
    geminiHandler = (_req, res) => {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }));
    };

    // Groq streams chunks via SSE
    groqHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"Streaming answer from "}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":"Groq llama model!"}}]}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    };

    const res = await request(app)
      .post(`/api/projects/${projId}/chat`)
      .send({ message: 'Explain failover stream', screen: 'overview', stream: true });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('data: {"delta":"Streaming answer from "');
    expect(res.text).toContain('data: {"delta":"Groq llama model!"');
    expect(res.text).toContain('"provider":"groq"');
    expect(res.text).toContain('"done":true');
    expect(res.text).toContain('data: [DONE]');

    // Both servers were called in failover order
    expect(geminiCalls.length).toBe(1);
    expect(groqCalls.length).toBe(1);

    // Verify full accumulated message was persisted into SQLite
    const historyRes = await request(app).get(`/api/projects/${projId}/chat/history`);
    expect(historyRes.status).toBe(200);
    const msgs = historyRes.body.data.items;
    const assistantMsg = msgs.find((m: any) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content).toBe('Streaming answer from Groq llama model!');
    expect(assistantMsg.provider).toBe('groq');
    expect(assistantMsg.model).toBe('llama-3.3-70b-versatile');
  });
});
