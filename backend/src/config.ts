import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root resolution for consistent default paths
const backendRootDir = path.resolve(__dirname, '..');

export const config = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || process.env.DATABASE_PATH || path.resolve(backendRootDir, 'data', 'ripple.db'),
  storagePath: process.env.STORAGE_PATH || path.resolve(backendRootDir, 'storage'),
  corsOrigin: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000',
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '1mb',

  // Upload limits from Section 6 of RIPPLE_AI_MASTER_SPEC.md
  upload: {
    maxZipSizeBytes: process.env.MAX_ZIP_SIZE_BYTES
      ? parseInt(process.env.MAX_ZIP_SIZE_BYTES, 10)
      : 50 * 1024 * 1024, // 50 MB
    maxFilesCount: process.env.MAX_FILES_COUNT
      ? parseInt(process.env.MAX_FILES_COUNT, 10)
      : 5000,
    maxUncompressedSizeBytes: process.env.MAX_UNCOMPRESSED_SIZE_BYTES
      ? parseInt(process.env.MAX_UNCOMPRESSED_SIZE_BYTES, 10)
      : 200 * 1024 * 1024, // 200 MB
    maxSingleFileSizeBytes: process.env.MAX_SINGLE_FILE_SIZE_BYTES
      ? parseInt(process.env.MAX_SINGLE_FILE_SIZE_BYTES, 10)
      : 5 * 1024 * 1024, // 5 MB
  },
} as const;

export default config;
