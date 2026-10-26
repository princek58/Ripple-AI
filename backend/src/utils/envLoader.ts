import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRootDir = path.resolve(__dirname, '..', '..');

export interface LoadEnvOptions {
  filePath?: string;
  forceInTest?: boolean;
}

/**
 * Loads environment variables from backend/.env using Node's built-in process.loadEnvFile.
 * - Real startup path only.
 * - Under Vitest or NODE_ENV=test, this is a NO-OP unless explicitly forced in unit tests with isolated temp files.
 * - Variables already set in process.env keep priority.
 * - File missing or broken does not throw (silently handled in try/catch).
 * - Never prints, logs, or returns any loaded values.
 */
export function loadBackendEnv(options?: LoadEnvOptions): boolean {
  const isTest = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
  if (isTest && !options?.forceInTest) {
    return false;
  }

  const targetPath = options?.filePath ?? path.resolve(backendRootDir, '.env');

  try {
    if (fs.existsSync(targetPath)) {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(targetPath);
        return true;
      }
    }
  } catch {
    // Intentionally suppressed: broken/unreadable env files must never crash the server
  }

  return false;
}
