const timestamps: number[] = [];

/**
 * Checks sliding-window rate limit per minute.
 */
export function checkRateLimit(ratePerMinute: number): boolean {
  const now = Date.now();
  const windowStart = now - 60000;

  while (timestamps.length > 0 && (timestamps[0] ?? 0) < windowStart) {
    timestamps.shift();
  }

  if (timestamps.length >= ratePerMinute) {
    return false;
  }

  timestamps.push(now);
  return true;
}

export function resetRateLimiter(): void {
  timestamps.length = 0;
}
