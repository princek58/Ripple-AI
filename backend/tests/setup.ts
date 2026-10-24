import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Ensure isolated environment variables are configured before any test imports config
let tempDir = process.env.RIPPLE_TEST_TEMP_DIR;
if (!tempDir || !fs.existsSync(tempDir)) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ripple_backend_test_'));
  process.env.RIPPLE_TEST_TEMP_DIR = tempDir;
}

const storageDir = path.join(tempDir, 'storage');
const tempStorageDir = path.join(storageDir, 'tmp');
const dataDir = path.join(tempDir, 'data');
const dbPath = path.join(dataDir, 'test_ripple.db');

fs.mkdirSync(tempStorageDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

process.env.STORAGE_PATH = storageDir;
process.env.TEMP_STORAGE_PATH = tempStorageDir;
process.env.DB_PATH = dbPath;
