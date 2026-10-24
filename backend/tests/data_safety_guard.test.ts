import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import config from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRootDir = path.resolve(__dirname, '..');

describe('Data Safety & Storage Isolation Guard (Step 13c Part 2)', () => {
  it('config storage, tempStorage, and db paths must be inside os.tmpdir() and NEVER inside backend/ directory', () => {
    const tmpDir = path.resolve(os.tmpdir()).toLowerCase();
    const backendDir = path.resolve(backendRootDir).toLowerCase();

    const resolvedStorage = path.resolve(config.storagePath).toLowerCase();
    const resolvedTempStorage = path.resolve(config.tempStoragePath).toLowerCase();
    const resolvedDb = path.resolve(config.dbPath).toLowerCase();

    // 1. Must be inside os.tmpdir()
    expect(resolvedStorage.startsWith(tmpDir)).toBe(true);
    expect(resolvedTempStorage.startsWith(tmpDir)).toBe(true);
    expect(resolvedDb.startsWith(tmpDir)).toBe(true);

    // 2. Must NEVER be inside backend/
    expect(resolvedStorage.startsWith(backendDir)).toBe(false);
    expect(resolvedTempStorage.startsWith(backendDir)).toBe(false);
    expect(resolvedDb.startsWith(backendDir)).toBe(false);

    // 3. Explicitly verify they are not pointing to the real default paths
    expect(resolvedStorage).not.toBe(path.resolve(backendRootDir, 'storage').toLowerCase());
    expect(resolvedTempStorage).not.toBe(path.resolve(backendRootDir, 'storage', 'tmp').toLowerCase());
    expect(resolvedDb).not.toBe(path.resolve(backendRootDir, 'data', 'ripple.db').toLowerCase());
  });
});
