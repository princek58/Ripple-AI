import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}

export function isSessionValid(cookieHeader?: string): boolean {
  const secretKey = process.env.APP_SESSION_SECRET?.trim();
  if (!secretKey) return false;

  const cookies = parseCookies(cookieHeader);
  const sessionVal = cookies['ripple_session'];
  if (!sessionVal) return false;

  const parts = sessionVal.split('.');
  if (parts.length !== 2) return false;

  const [expiryStr, sig] = parts;
  const expiry = parseInt(expiryStr, 10);
  if (isNaN(expiry) || Date.now() > expiry) {
    return false;
  }

  const expectedSig = crypto.createHmac('sha256', secretKey).update(expiryStr).digest('hex');
  const bufA = Buffer.from(sig);
  const bufB = Buffer.from(expectedSig);
  if (bufA.length !== bufB.length) return false;

  return crypto.timingSafeEqual(bufA, bufB);
}

const accessAttempts = new Map<string, number[]>();

export function checkAccessRateLimit(ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxAttempts = 10;

  const timestamps = (accessAttempts.get(ip) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxAttempts) {
    const oldest = timestamps[0];
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) };
  }
  timestamps.push(now);
  accessAttempts.set(ip, timestamps);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetAccessRateLimiter(): void {
  accessAttempts.clear();
}

/**
 * Global authentication middleware:
 * When APP_ACCESS_CODE is set:
 * every /api route except GET /api/health, GET /api/access/status and POST /api/access
 * requires a valid session cookie, otherwise 401 { data: null, error: "Access code required [AUTH_REQUIRED]" }.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const accessCode = process.env.APP_ACCESS_CODE?.trim();
  if (!accessCode) {
    return next();
  }

  const path = req.path.replace(/\/+$/, '') || '/';

  // Excluded routes:
  // GET /api/health
  // GET /api/access/status
  // POST /api/access
  // POST /api/access/logout
  if (req.method === 'GET' && path === '/api/health') {
    return next();
  }
  if (req.method === 'GET' && path === '/api/access/status') {
    return next();
  }
  if (req.method === 'POST' && (path === '/api/access' || path === '/api/access/logout')) {
    return next();
  }

  // Only protect /api routes
  if (!path.startsWith('/api')) {
    return next();
  }

  if (!isSessionValid(req.headers.cookie)) {
    return res.status(401).json({
      data: null,
      error: 'Access code required [AUTH_REQUIRED]',
    });
  }

  next();
}
