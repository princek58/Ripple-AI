import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root resolution for consistent default paths
const backendRootDir = path.resolve(__dirname, '..');

export interface UploadLimits {
  maxZipSizeBytes: number;
  maxFilesCount: number;
  maxUncompressedSizeBytes: number;
  maxSingleFileSizeBytes: number;
  maxCompressionRatio: number;
}

let customUploadLimits: Partial<UploadLimits> = {};

export function setUploadLimits(limits: Partial<UploadLimits>): void {
  customUploadLimits = { ...limits };
}

export function resetUploadLimits(): void {
  customUploadLimits = {};
}

export function getUploadLimits(): UploadLimits {
  return {
    maxZipSizeBytes:
      customUploadLimits.maxZipSizeBytes ??
      (process.env.MAX_ZIP_SIZE_BYTES
        ? parseInt(process.env.MAX_ZIP_SIZE_BYTES, 10)
        : 50 * 1024 * 1024), // 50 MB
    maxFilesCount:
      customUploadLimits.maxFilesCount ??
      (process.env.MAX_FILES_COUNT ? parseInt(process.env.MAX_FILES_COUNT, 10) : 5000),
    maxUncompressedSizeBytes:
      customUploadLimits.maxUncompressedSizeBytes ??
      (process.env.MAX_UNCOMPRESSED_SIZE_BYTES
        ? parseInt(process.env.MAX_UNCOMPRESSED_SIZE_BYTES, 10)
        : 200 * 1024 * 1024), // 200 MB
    maxSingleFileSizeBytes:
      customUploadLimits.maxSingleFileSizeBytes ??
      (process.env.MAX_SINGLE_FILE_SIZE_BYTES
        ? parseInt(process.env.MAX_SINGLE_FILE_SIZE_BYTES, 10)
        : 5 * 1024 * 1024), // 5 MB
    maxCompressionRatio:
      customUploadLimits.maxCompressionRatio ??
      (process.env.MAX_COMPRESSION_RATIO
        ? parseInt(process.env.MAX_COMPRESSION_RATIO, 10)
        : 100), // 100:1 ratio limit
  };
}

let customStoragePath: string | null = null;
let customTempStoragePath: string | null = null;

export const config = {
  get port(): number {
    return process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
  },
  get nodeEnv(): string {
    return process.env.NODE_ENV || 'development';
  },
  get dbPath(): string {
    return (
      process.env.DB_PATH ||
      process.env.DATABASE_PATH ||
      path.resolve(backendRootDir, 'data', 'ripple.db')
    );
  },
  set storagePath(val: string) {
    customStoragePath = val;
  },
  get storagePath(): string {
    return (
      customStoragePath ||
      process.env.STORAGE_PATH ||
      path.resolve(backendRootDir, 'storage')
    );
  },
  set tempStoragePath(val: string) {
    customTempStoragePath = val;
  },
  get tempStoragePath(): string {
    return (
      customTempStoragePath ||
      process.env.TEMP_STORAGE_PATH ||
      path.resolve(backendRootDir, 'storage', 'tmp')
    );
  },
  get corsOrigin(): string {
    if (process.env.CORS_ORIGIN !== undefined) {
      return process.env.CORS_ORIGIN;
    }
    if (process.env.NODE_ENV === 'production') {
      return '';
    }
    return process.env.FRONTEND_URL || 'http://localhost:3000';
  },
  get trustProxy(): string {
    return process.env.TRUST_PROXY || '';
  },
  get frontendDistPath(): string {
    return (
      process.env.FRONTEND_DIST_PATH ||
      path.resolve(backendRootDir, '..', 'frontend', 'dist')
    );
  },
  get jsonBodyLimit(): string {
    return process.env.JSON_BODY_LIMIT || '1mb';
  },

  get githubCodeloadBase(): string {
    return process.env.GITHUB_CODELOAD_BASE || 'https://codeload.github.com';
  },

  get upload(): UploadLimits {
    return getUploadLimits();
  },
};

export default config;
