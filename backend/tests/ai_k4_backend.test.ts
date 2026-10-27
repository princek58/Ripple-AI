import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import app from '../src/app.js';
import config from '../src/config.js';
import { createDatabase, setDatabase, closeDatabase, getDatabase } from '../src/db/connection.js';
import { updateProjectAISettings, getProjectAISettings } from '../src/db/aiRepository.js';
import { buildScreenContext } from '../src/services/ai/contextBuilder.js';
import { buildSystemPrompt } from '../src/services/ai/promptBuilder.js';
import {
  getAIConfig,
  AI_CONSENT_VERSION,
  AI_CONSENT_TEXT,
  AI_MAX_OUTPUT_TOKENS,
} from '../src/services/ai/aiConfig.js';
import { resetRateLimiter } from '../src/services/ai/rateLimiter.js';

describe('Step K4a: Rich Screen Context, Consent v2, and Fallback Model', () => {
  const projId = '11111111-1111-1111-1111-111111111111';
  const scanId = '22222222-2222-2222-2222-222222222222';
  const nodeModuleAId = '33333333-3333-3333-3333-333333333331';
  const nodeModuleBId = '33333333-3333-3333-3333-333333333332';
  const nodeChildAId = '33333333-3333-3333-3333-333333333333';
  const nodeChildBId = '33333333-3333-3333-3333-333333333334';
  const finding1Id = '44444444-4444-4444-4444-444444444441';
  const finding2Id = '44444444-4444-4444-4444-444444444442';
  const fix1Id = '55555555-5555-5555-5555-555555555551';
  const report1Id = '66666666-6666-6666-6666-666666666661';

  let tempStorage: string;
  let originalStoragePath: string;

  beforeEach(() => {
    resetRateLimiter();
    tempStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'ripple-k4-test-'));
    originalStoragePath = config.storagePath;
    config.storagePath = tempStorage;

    const db = createDatabase(':memory:');
    setDatabase(db);

    // Runtime canary strings: should NEVER appear in context
    const canaryProjName = String.fromCharCode(80, 114, 111, 106) + 'CanaryAlpha';
    const canaryAbsPath = String.fromCharCode(67, 58, 92) + 'CanarySecretAbsoluteStorage';

    db.prepare(`
      INSERT OR IGNORE INTO projects (id, name, created_at, size_bytes, file_count)
      VALUES (?, ?, CURRENT_TIMESTAMP, 100, 2)
    `).run(projId, canaryProjName);

    db.prepare(`
      INSERT OR IGNORE INTO scans (id, project_id, started_at, status, files_total, files_skipped)
      VALUES (?, ?, CURRENT_TIMESTAMP, 'completed', 2, 0)
    `).run(scanId, projId);

    db.prepare(`
      INSERT OR IGNORE INTO project_files (id, project_id, scan_id, path, size, language, sensitive)
      VALUES ('pf1', ?, ?, 'src/auth/login.ts', 200, 'typescript', 0),
             ('pf2', ?, ?, 'src/api/users.ts', 250, 'typescript', 0)
    `).run(projId, scanId, projId, scanId);

    // Module nodes (Level 1)
    db.prepare(`
      INSERT OR IGNORE INTO nodes (id, project_id, scan_id, type, level, parent_id, label, path)
      VALUES (?, ?, ?, 'module', 1, NULL, 'AuthModule', 'module:AuthModule'),
             (?, ?, ?, 'module', 1, NULL, 'UserModule', 'module:UserModule')
    `).run(nodeModuleAId, projId, scanId, nodeModuleBId, projId, scanId);

    // Child nodes (Level 3)
    db.prepare(`
      INSERT OR IGNORE INTO nodes (id, project_id, scan_id, type, level, parent_id, label, path, line_start)
      VALUES (?, ?, ?, 'backend', 3, ?, 'LoginHandler', 'src/auth/login.ts', 15),
             (?, ?, ?, 'api', 3, ?, 'UserApi', 'src/api/users.ts', 25)
    `).run(nodeChildAId, projId, scanId, nodeModuleAId, nodeChildBId, projId, scanId, nodeModuleBId);

    // Cross-module edge
    db.prepare(`
      INSERT OR IGNORE INTO edges (id, project_id, scan_id, source_id, target_id, relation, status, confidence, evidence_json)
      VALUES ('edge-1', ?, ?, ?, ?, 'calls', 'resolved', 'confirmed', '{"file":"src/auth/login.ts","line":15}')
    `).run(projId, scanId, nodeChildAId, nodeChildBId);

    // Findings
    db.prepare(`
      INSERT OR IGNORE INTO findings (id, project_id, scan_id, rule_id, title, summary, severity, confidence, verification, evidence_json, node_ids_json, created_at)
      VALUES (?, ?, ?, 'secret_pattern', 'Hardcoded credential', 'Sensitive token exposed', 'critical', 'confirmed', 'not_tested', ?, ?, CURRENT_TIMESTAMP),
             (?, ?, ?, 'broken_import', 'Missing module import', 'Cannot resolve path', 'high', 'likely', 'not_tested', ?, ?, CURRENT_TIMESTAMP)
    `).run(
      finding1Id,
      projId,
      scanId,
      JSON.stringify([{ file: 'src/auth/login.ts', line_start: 15, line_end: 15 }]),
      JSON.stringify([nodeChildAId]),
      finding2Id,
      projId,
      scanId,
      JSON.stringify([{ file: 'src/api/users.ts', line_start: 25, line_end: 25 }]),
      JSON.stringify([nodeChildBId])
    );

    // Fixes
    db.prepare(`
      INSERT OR IGNORE INTO fixes (id, finding_id, diff_text, files_json, status, approved_at)
      VALUES (?, ?, '--- a/src/api/users.ts\\n+++ b/src/api/users.ts\\n@@ -1 +1 @@\\n-broken\\n+fixed', '["src/api/users.ts"]', 'proposed', NULL)
    `).run(fix1Id, finding2Id);

    // Tests
    db.prepare(`
      INSERT OR IGNORE INTO test_runs (id, project_id, scan_id, name, status, created_at)
      VALUES ('tr-1', ?, ?, 'tests/auth.test.ts', 'not_run', CURRENT_TIMESTAMP)
    `).run(projId, scanId);

    // Reports
    db.prepare(`
      INSERT OR IGNORE INTO reports (id, project_id, created_at, markdown)
      VALUES (?, ?, '2026-10-27 10:00:00', '# Security Audit Report\\n\\n## Summary\\n\\nFindings: 2')
    `).run(report1Id, projId);
  });

  afterEach(() => {
    config.storagePath = originalStoragePath;
    closeDatabase();
    try {
      fs.rmSync(tempStorage, { recursive: true, force: true });
    } catch {}
    resetRateLimiter();
  });

  describe('Item 1: System prompt rewrite', () => {
    it('prompt contains friendly senior developer tone, language flexibility, and practical instructions', () => {
      const prompt = buildSystemPrompt();
      expect(prompt).toContain('senior developer');
      expect(prompt).toContain('natural Hinglish, Hindi in Roman letters, English');
      expect(prompt).toContain('under about 6 sentences');
      expect(prompt).toContain('Ripple has not confirmed this');
      expect(prompt).toContain('read-only by default');
      expect(prompt).toContain('Politely decline harmful or illegal requests');
      expect(prompt).toContain('general programming, web and software questions');
      expect(prompt).toContain('Plain text only, no HTML, no links');
      expect(prompt).toContain('<<<BEGIN_UNTRUSTED_CONTEXT>>>');
      expect(prompt).toContain('<<<BEGIN_UNTRUSTED_USER_MESSAGE>>>');
    });
  });

  describe('Item 2: Limits', () => {
    it('AI_MAX_OUTPUT_CHARS defaults to 4000 and AI_MAX_OUTPUT_TOKENS is 1500', () => {
      delete process.env.AI_MAX_OUTPUT_CHARS;
      const cfg = getAIConfig();
      expect(cfg.maxOutputChars).toBe(4000);
      expect(AI_MAX_OUTPUT_TOKENS).toBe(1500);
    });
  });

  describe('Item 3: Richer screen context without clicked node', () => {
    it('overview screen includes visible modules, connections, and top findings', () => {
      const db = getDatabase();
      const ctx = buildScreenContext(db, projId, { screen: 'overview' }, false);

      expect(ctx).toContain('Visible Modules:');
      expect(ctx).toContain('AuthModule');
      expect(ctx).toContain('UserModule');
      expect(ctx).toContain('Module Connections:');
      expect(ctx).toContain('AuthModule -> UserModule');
      expect(ctx).toContain('Top Findings:');
      expect(ctx).toContain('[critical]');
      expect(ctx).toContain('[high]');
      expect(ctx).toContain('src/auth/login.ts:15');
      expect(ctx.length).toBeLessThanOrEqual(6000);
    });

    it('graph screen without focus includes visible modules and connections', () => {
      const db = getDatabase();
      const ctx = buildScreenContext(db, projId, { screen: 'graph' }, false);

      expect(ctx).toContain('Architecture Graph Overview:');
      expect(ctx).toContain('Visible Modules:');
      expect(ctx).toContain('AuthModule');
      expect(ctx).toContain('Module Connections:');
      expect(ctx).toContain('Top Findings:');
      expect(ctx.length).toBeLessThanOrEqual(6000);
    });

    it('graph screen with focused node includes both node details and modules block', () => {
      const db = getDatabase();
      const ctx = buildScreenContext(db, projId, { screen: 'graph', node_id: nodeChildAId }, false);

      expect(ctx).toContain('Selected Graph Node:');
      expect(ctx).toContain('LoginHandler');
      expect(ctx).toContain('Visible Modules:');
      expect(ctx).toContain('AuthModule');
      expect(ctx).toContain('Module Connections:');
      expect(ctx).toContain('Top Findings:');
      expect(ctx.length).toBeLessThanOrEqual(6000);
    });

    it('projects screen includes visible modules, connections, and top findings', () => {
      const db = getDatabase();
      const ctx = buildScreenContext(db, projId, { screen: 'projects' }, false);

      expect(ctx).toContain('Visible Modules:');
      expect(ctx).toContain('AuthModule');
      expect(ctx).toContain('Module Connections:');
      expect(ctx).toContain('Top Findings:');
      expect(ctx.length).toBeLessThanOrEqual(6000);
    });

    it('investigations screen without finding_id includes top findings with rule and relative path', () => {
      const db = getDatabase();
      const ctx = buildScreenContext(db, projId, { screen: 'investigations' }, false);

      expect(ctx).toContain('Top Findings:');
      expect(ctx).toContain('Hardcoded credential');
      expect(ctx).toContain('rule: secret_pattern');
      expect(ctx).toContain('src/auth/login.ts:15');
      expect(ctx.length).toBeLessThanOrEqual(6000);
    });

    it('fixes screen without fix_id includes counts and list of first 10 items', () => {
      const db = getDatabase();
      const ctx = buildScreenContext(db, projId, { screen: 'fixes' }, false);

      expect(ctx).toContain('Fixes Summary:');
      expect(ctx).toContain('proposed: 1');
      expect(ctx).toContain('Fix Items:');
      expect(ctx).toContain('Missing module import');
      expect(ctx).toContain('status=proposed');
      expect(ctx).toContain('src/api/users.ts');
      expect(ctx.length).toBeLessThanOrEqual(6000);
    });

    it('tests screen includes counts and list of first 10 items', () => {
      const db = getDatabase();
      const ctx = buildScreenContext(db, projId, { screen: 'tests' }, false);

      expect(ctx).toContain('Test Suite Overview:');
      expect(ctx).toContain('Not run: 1');
      expect(ctx).toContain('Test Items:');
      expect(ctx).toContain('tests/auth.test.ts: status=not_run');
      expect(ctx.length).toBeLessThanOrEqual(6000);
    });

    it('reports screen without report_id includes count and list of first 10 items', () => {
      const db = getDatabase();
      const ctx = buildScreenContext(db, projId, { screen: 'reports' }, false);

      expect(ctx).toContain('Audit Reports: 1 report(s) available.');
      expect(ctx).toContain('Report Items:');
      expect(ctx).toContain('Report from 2026-10-27 10:00:00 (status: ready)');
      expect(ctx.length).toBeLessThanOrEqual(6000);
    });

    it('never-scanned project retains exact un-scanned message across screens', () => {
      const unscannedId = '77777777-7777-7777-7777-777777777777';
      const db = getDatabase();
      db.prepare(`
        INSERT INTO projects (id, name, created_at, size_bytes, file_count)
        VALUES (?, 'Unscanned', CURRENT_TIMESTAMP, 0, 0)
      `).run(unscannedId);

      const screens = ['overview', 'projects', 'graph', 'investigations', 'fixes', 'tests', 'reports'];
      for (const s of screens) {
        const ctx = buildScreenContext(db, unscannedId, { screen: s }, false);
        expect(ctx).toBe('This project has not been scanned yet.');
      }
    });

    it('runtime canary project name and absolute storage path never appear in context across all screens', () => {
      const db = getDatabase();
      const canaryProjName = String.fromCharCode(80, 114, 111, 106) + 'CanaryAlpha';
      const canaryStorage = String.fromCharCode(67, 58, 92) + 'CanarySecretAbsoluteStorage';

      const screens = ['overview', 'projects', 'graph', 'investigations', 'fixes', 'tests', 'reports'];
      for (const s of screens) {
        const ctx = buildScreenContext(db, projId, { screen: s }, false);
        expect(ctx).not.toContain(canaryProjName);
        expect(ctx).not.toContain(canaryStorage);
        expect(ctx).not.toContain(tempStorage);
        expect(ctx.length).toBeLessThanOrEqual(6000);
      }
    });
  });

  describe('Item 4: Consent version v2 and outdated consent handling', () => {
    it('GET /api/projects/:id/ai-settings returns current_consent_version as 2026-10-v2 and shows mismatch when stored is v1', async () => {
      updateProjectAISettings(projId, {
        ai_enabled: true,
        consent_version: '2026-10-v1',
      });

      const res = await request(app).get(`/api/projects/${projId}/ai-settings`);
      expect(res.status).toBe(200);
      expect(res.body.data.consent_version).toBe('2026-10-v1');
      expect(res.body.data.current_consent_version).toBe('2026-10-v2');
      expect(res.body.data.consent_text).toContain(
        'The chat may also send the names and counts of modules and the titles of the top findings of the screen you are on.'
      );
    });

    it('POST /api/projects/:id/chat returns 403 AI_DISABLED [CONSENT_OUTDATED] when stored consent version differs', async () => {
      updateProjectAISettings(projId, {
        ai_enabled: true,
        consent_version: '2026-10-v1',
      });

      const res = await request(app)
        .post(`/api/projects/${projId}/chat`)
        .send({ message: 'What is on my screen?', screen: 'overview' });

      expect(res.status).toBe(403);
      expect(res.body.data).toBeNull();
      expect(res.body.error).toBe('AI_DISABLED [CONSENT_OUTDATED]');
    });

    it('PUT /api/projects/:id/ai-settings rejects old consent version and accepts 2026-10-v2', async () => {
      // Rejects old version
      const badRes = await request(app)
        .put(`/api/projects/${projId}/ai-settings`)
        .send({ ai_enabled: true, consent_version: '2026-10-v1' });
      expect(badRes.status).toBe(400);
      expect(badRes.body.error).toContain('AI_CONSENT_REQUIRED');

      // Accepts v2
      const okRes = await request(app)
        .put(`/api/projects/${projId}/ai-settings`)
        .send({ ai_enabled: true, consent_version: '2026-10-v2' });
      expect(okRes.status).toBe(200);
      expect(okRes.body.data.ai_enabled).toBe(true);
      expect(okRes.body.data.consent_version).toBe('2026-10-v2');
    });
  });

  describe('Item 5: Fallback model with mock server', () => {
    let mockServer: http.Server;
    let mockBaseUrl: string;
    let callLog: Array<{ model: string; method?: string; url?: string; headers?: http.IncomingHttpHeaders }> = [];
    let mockResponseHandler: (req: http.IncomingMessage, res: http.ServerResponse, callIndex: number) => void;

    beforeEach(async () => {
      callLog = [];
      mockServer = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (c) => {
          raw += c;
        });
        req.on('end', () => {
          const match = req.url?.match(/\/models\/([^:]+):/);
          const model = match ? decodeURIComponent(match[1]) : 'unknown';
          callLog.push({ model, method: req.method, url: req.url, headers: req.headers });
          mockResponseHandler(req, res, callLog.length - 1);
        });
      });

      await new Promise<void>((resolve) => {
        mockServer.listen(0, '127.0.0.1', () => {
          const addr = mockServer.address() as any;
          mockBaseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });

      process.env.AI_PROVIDER = 'gemini';
      process.env.AI_API_KEY = 'test-secret-key-123456';
      process.env.AI_MODEL = 'primary-preview-model';
      process.env.AI_FALLBACK_MODEL = 'fallback-stable-model';
      process.env.AI_API_BASE = mockBaseUrl;
      process.env.AI_TIMEOUT_MS = '5000';

      updateProjectAISettings(projId, {
        ai_enabled: true,
        consent_version: AI_CONSENT_VERSION,
      });
    });

    afterEach(async () => {
      delete process.env.AI_PROVIDER;
      delete process.env.AI_API_KEY;
      delete process.env.AI_MODEL;
      delete process.env.AI_FALLBACK_MODEL;
      delete process.env.AI_API_BASE;
      delete process.env.AI_TIMEOUT_MS;

      mockServer.closeAllConnections?.();
      await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    });

    it('first 503 upstream fails over to fallback model 200 within same budget and reports fallback model', async () => {
      mockResponseHandler = (_req, res, callIndex) => {
        if (callIndex === 0) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE' } }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: 'Response from fallback model' }] } }],
            })
          );
        }
      };

      const res = await request(app)
        .post(`/api/projects/${projId}/chat`)
        .send({ message: 'Explain architecture', screen: 'overview' });

      expect(res.status).toBe(200);
      expect(res.body.data.text).toBe('Response from fallback model');
      expect(res.body.data.model).toBe('fallback-stable-model');
      expect(callLog.length).toBe(2);
      expect(callLog[0].model).toBe('primary-preview-model');
      expect(callLog[1].model).toBe('fallback-stable-model');

      // Ensure key never appears in body or URL
      expect(JSON.stringify(res.body)).not.toContain('test-secret-key-123456');
      expect(callLog[0].url).not.toContain('test-secret-key-123456');
      expect(callLog[1].url).not.toContain('test-secret-key-123456');
    });

    it('first 404 upstream (AI_MODEL_NOT_FOUND) fails over to fallback model 200', async () => {
      mockResponseHandler = (_req, res, callIndex) => {
        if (callIndex === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 404, status: 'NOT_FOUND' } }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: 'Recovered with fallback' }] } }],
            })
          );
        }
      };

      const res = await request(app)
        .post(`/api/projects/${projId}/chat`)
        .send({ message: 'Explain graph', screen: 'graph' });

      expect(res.status).toBe(200);
      expect(res.body.data.text).toBe('Recovered with fallback');
      expect(res.body.data.model).toBe('fallback-stable-model');
      expect(callLog.length).toBe(2);
    });

    it('429, 400, and 403 upstream errors are NOT retried on fallback model', async () => {
      const errorCodes = [
        { status: 429, name: 'RESOURCE_EXHAUSTED', expectedHttp: 429, expectedCode: 'AI_QUOTA_EXHAUSTED' },
        { status: 400, name: 'INVALID_ARGUMENT', expectedHttp: 400, expectedCode: 'AI_REQUEST_REJECTED' },
        { status: 403, name: 'PERMISSION_DENIED', expectedHttp: 403, expectedCode: 'AI_REQUEST_REJECTED' },
      ];

      for (const errCase of errorCodes) {
        callLog = [];
        mockResponseHandler = (_req, res) => {
          res.writeHead(errCase.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: errCase.status, status: errCase.name } }));
        };

        const res = await request(app)
          .post(`/api/projects/${projId}/chat`)
          .send({ message: `Test error ${errCase.status}`, screen: 'overview' });

        expect(res.status).toBe(errCase.expectedHttp);
        expect(res.body.error).toContain(errCase.expectedCode);
        expect(callLog.length).toBe(1); // exactly ONE call made, no fallback retry
      }
    });

    it('no fallback configured means no second call on 503', async () => {
      delete process.env.AI_FALLBACK_MODEL;

      mockResponseHandler = (_req, res) => {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE' } }));
      };

      const res = await request(app)
        .post(`/api/projects/${projId}/chat`)
        .send({ message: 'Will fail without fallback', screen: 'overview' });

      expect(res.status).toBe(503);
      expect(res.body.error).toContain('AI_UNAVAILABLE');
      expect(callLog.length).toBe(1);
    });

    it('when both primary and fallback fail, returns the first safe error code', async () => {
      mockResponseHandler = (_req, res, callIndex) => {
        if (callIndex === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 404, status: 'NOT_FOUND' } }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 500, status: 'INTERNAL' } }));
        }
      };

      const res = await request(app)
        .post(`/api/projects/${projId}/chat`)
        .send({ message: 'Both fail test', screen: 'overview' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('AI_MODEL_NOT_FOUND [NOT_FOUND]');
      expect(callLog.length).toBe(2);
    });

    it('fallback model call counts against rate limiter', async () => {
      process.env.AI_RATE_PER_MINUTE = '2';
      resetRateLimiter();

      mockResponseHandler = (_req, res, callIndex) => {
        if (callIndex === 0) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE' } }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: 'Fallback answer' }] } }],
            })
          );
        }
      };

      // Request 1 uses 2 provider attempts (primary + fallback)
      const res1 = await request(app)
        .post(`/api/projects/${projId}/chat`)
        .send({ message: 'Query 1', screen: 'overview' });
      expect(res1.status).toBe(200);
      expect(callLog.length).toBe(2);

      // Request 2 should immediately hit local rate limiter (2 calls already used out of 2)
      const res2 = await request(app)
        .post(`/api/projects/${projId}/chat`)
        .send({ message: 'Query 2', screen: 'overview' });
      expect(res2.status).toBe(429);
      expect(res2.body.error).toContain('AI_RATE_LIMITED');
    });
  });
});
