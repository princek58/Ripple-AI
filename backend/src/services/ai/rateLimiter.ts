const timestamps: number[] = [];

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Checks sliding-window rate limit per minute and records the timestamp if allowed.
 */
export function consumeRateLimit(ratePerMinute: number): RateLimitResult {
  const now = Date.now();
  const windowStart = now - 60000;

  while (timestamps.length > 0 && (timestamps[0] ?? 0) < windowStart) {
    timestamps.shift();
  }

  if (timestamps.length >= ratePerMinute) {
    const oldest = timestamps[0] ?? windowStart;
    const retryAfter = Math.max(1, Math.ceil((oldest + 60000 - now) / 1000));
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  timestamps.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Legacy boolean helper for rate limiting.
 */
export function checkRateLimit(ratePerMinute: number): boolean {
  return consumeRateLimit(ratePerMinute).allowed;
}

export function resetRateLimiter(): void {
  timestamps.length = 0;
}
