export type AIErrorCode =
  | 'AI_REQUEST_REJECTED'
  | 'AI_QUOTA_EXHAUSTED'
  | 'AI_MODEL_NOT_FOUND'
  | 'AI_UNAVAILABLE'
  | 'AI_UNREACHABLE'
  | 'AI_NO_ANSWER';

const ENUM_REGEX = /^[A-Z_]{3,64}$/;

/**
 * Validates enum words against ^[A-Z_]{3,64}$. Anything else is dropped.
 */
export function sanitizeEnumWord(val: unknown): string | undefined {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (ENUM_REGEX.test(trimmed)) {
      return trimmed;
    }
  }
  return undefined;
}

/**
 * Extracts safe upstream error metadata:
 * (1) HTTP status number
 * (2) Provider error status enum word (e.g. PERMISSION_DENIED, INVALID_ARGUMENT, NOT_FOUND)
 * (3) Reason enum from error.details[].reason (e.g. API_KEY_INVALID)
 * Strictly drops any free-form messages or unvalidated strings.
 */
export function extractSafeErrorDetails(data: any): {
  statusWord?: string;
  reason?: string;
} {
  let statusWord: string | undefined;
  let reason: string | undefined;

  if (data && typeof data === 'object') {
    const errObj = data.error || data;
    statusWord = sanitizeEnumWord(errObj.status);
    if (!statusWord && typeof errObj.code === 'string') {
      statusWord = sanitizeEnumWord(errObj.code);
    }

    if (Array.isArray(errObj.details)) {
      for (const item of errObj.details) {
        if (item && typeof item === 'object') {
          const r = sanitizeEnumWord(item.reason);
          if (r) {
            reason = r;
            break;
          }
        }
      }
    }
  }

  return { statusWord, reason };
}

/**
 * Custom error for AI operations.
 * Non-negotiable security constraints:
 * - Never echoes upstream error messages, bodies, URLs, or keys.
 * - Stores only status numbers and sanitized enum words.
 * - Produces short codes like "AI_REQUEST_REJECTED [PERMISSION_DENIED]".
 */
export class AIServiceError extends Error {
  readonly code: AIErrorCode;
  readonly upstream_status?: number;
  readonly upstream_reason?: string;
  readonly upstream_status_word?: string;

  constructor(
    code: AIErrorCode,
    upstream_status?: number,
    upstream_reason?: string,
    upstream_status_word?: string
  ) {
    const tag = upstream_reason || upstream_status_word;
    const short = tag ? `${code} [${tag}]` : code;
    super(short);
    this.name = 'AIServiceError';
    this.code = code;
    this.upstream_status = upstream_status;
    this.upstream_reason = upstream_reason;
    this.upstream_status_word = upstream_status_word;
  }

  get shortCode(): string {
    const tag = this.upstream_reason || this.upstream_status_word;
    return tag ? `${this.code} [${tag}]` : this.code;
  }
}

/**
 * Maps HTTP status codes to standardized typed error codes for both AI adapters.
 */
export function mapHttpStatusToAiError(status: number): AIErrorCode {
  if (status === 404) {
    return 'AI_MODEL_NOT_FOUND';
  }
  if (status === 401 || status === 403 || status === 400) {
    return 'AI_REQUEST_REJECTED';
  }
  if (status === 429) {
    return 'AI_QUOTA_EXHAUSTED';
  }
  if (status >= 500 && status <= 599) {
    return 'AI_UNAVAILABLE';
  }
  return 'AI_REQUEST_REJECTED';
}
