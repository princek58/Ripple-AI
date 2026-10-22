export type ZipErrorCode =
  | 'ZIP_INVALID'
  | 'ZIP_TOO_MANY_FILES'
  | 'ZIP_UNSAFE_PATH'
  | 'ZIP_BOMB'
  | 'ZIP_TOO_LARGE';

export class ZipError extends Error {
  public readonly code: ZipErrorCode;

  constructor(code: ZipErrorCode, message: string) {
    super(message);
    this.name = 'ZipError';
    this.code = code;
    Object.setPrototypeOf(this, ZipError.prototype);
  }
}

export interface ExtractedFile {
  path: string;
  size: number;
  language: string;
  sensitive: boolean;
}

export interface SkippedItem {
  path: string;
  reason: string;
}

export interface ExtractResult {
  files: ExtractedFile[];
  skipped: SkippedItem[];
  totalEntries: number;
  extractedCount: number;
  skippedCount: number;
  totalBytes: number;
}
