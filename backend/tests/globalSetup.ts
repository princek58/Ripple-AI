import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tempDir: string | null = null;

export async function setup() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ripple_backend_test_'));
  const storageDir = path.join(tempDir, 'storage');
  const tempStorageDir = path.join(storageDir, 'tmp');
  const dataDir = path.join(tempDir, 'data');
  const dbPath = path.join(dataDir, 'test_ripple.db');

  fs.mkdirSync(tempStorageDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  process.env.STORAGE_PATH = storageDir;
  process.env.TEMP_STORAGE_PATH = tempStorageDir;
  process.env.DB_PATH = dbPath;
  process.env.RIPPLE_TEST_TEMP_DIR = tempDir;
}

export async function teardown() {
  const dirToDelete = tempDir || process.env.RIPPLE_TEST_TEMP_DIR;
  if (dirToDelete && fs.existsSync(dirToDelete)) {
    const normalizedDir = path.resolve(dirToDelete).toLowerCase();
    const normalizedOsTmp = path.resolve(os.tmpdir()).toLowerCase();
    // Strict containment check: only delete if inside os.tmpdir and named ripple_backend_test_
    if (normalizedDir.startsWith(normalizedOsTmp) && normalizedDir.includes('ripple_backend_test_')) {
      try {
        fs.rmSync(dirToDelete, { recursive: true, force: true });
      } catch (err: any) {
        console.warn('[globalTeardown] Note on temp directory cleanup:', err.message);
      }
    }
  }
}
