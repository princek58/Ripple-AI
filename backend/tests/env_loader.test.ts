import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import request from 'supertest';
import app from '../src/app.js';
import { loadBackendEnv } from '../src/utils/envLoader.js';

describe('Environment Loader (Addendum v2 Step 1)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ripple-env-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    delete process.env.TEST_EXISTING_VAR;
    delete process.env.TEST_NEW_VAR;
    delete process.env.TEST_SECRET_KEY;
  });

  it('1. temp .env loads and a pre-set variable keeps priority', () => {
    const tempEnvPath = path.join(tempDir, '.env');
    fs.writeFileSync(
      tempEnvPath,
      'TEST_EXISTING_VAR=from_file\r\nTEST_NEW_VAR=loaded_from_file\r\n',
      'utf-8'
    );

    // Pre-set in environment before loading
    process.env.TEST_EXISTING_VAR = 'pre_set_priority';

    const result = loadBackendEnv({ filePath: tempEnvPath, forceInTest: true });

    expect(result).toBe(true);
    // Pre-set variable MUST retain its existing value (priority)
    expect(process.env.TEST_EXISTING_VAR).toBe('pre_set_priority');
    // Unset variable MUST be populated from the env file
    expect(process.env.TEST_NEW_VAR).toBe('loaded_from_file');
  });

  it('2. test mode does not read the real backend/.env', () => {
    // Under vitest, process.env.VITEST is true. Calling loadBackendEnv without forceInTest MUST return false
    expect(process.env.VITEST).toBeDefined();

    const loaded = loadBackendEnv();
    expect(loaded).toBe(false);
  });

  it('3. a broken or missing file does not crash', () => {
    const missingPath = path.join(tempDir, 'does_not_exist.env');
    expect(() => {
      const res = loadBackendEnv({ filePath: missingPath, forceInTest: true });
      expect(res).toBe(false);
    }).not.toThrow();

    // Directory as file or broken file
    const brokenPath = path.join(tempDir, 'broken.env');
    fs.mkdirSync(brokenPath); // a directory cannot be loaded as file
    expect(() => {
      const res = loadBackendEnv({ filePath: brokenPath, forceInTest: true });
      expect(res).toBe(false);
    }).not.toThrow();
  });

  it('4. the key never appears in any log or response', async () => {
    const secretKey = 'super-secret-key-xyz-123';
    process.env.AI_API_KEY = secretKey;
    process.env.AI_MODEL = 'gemini-1.5-flash';
    process.env.AI_PROVIDER = 'gemini';

    const logSpy = vi.spyOn(console, 'log');
    const errSpy = vi.spyOn(console, 'error');

    const res = await request(app).get('/api/ai/status');
    expect(res.status).toBe(200);

    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain(secretKey);
    expect(res.body).toEqual({
      data: {
        configured: true,
        provider: 'gemini',
        model: 'gemini-1.5-flash',
      },
      error: null,
    });

    // Verify key was never logged to console
    for (const call of logSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(secretKey);
    }
    for (const call of errSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(secretKey);
    }

    logSpy.mockRestore();
    errSpy.mockRestore();
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    delete process.env.AI_PROVIDER;
  });
});
