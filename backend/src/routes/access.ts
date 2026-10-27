import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { sendSuccess } from '../utils/response.js';
import { isSessionValid, checkAccessRateLimit } from '../middleware/auth.js';

const accessRouter = Router();

const accessBodySchema = z.object({
  code: z.string().min(1, 'Access code is required'),
});

/**
 * GET /api/access/status
 * Returns { required: boolean, authenticated: boolean }
 */
accessRouter.get('/access/status', (req, res) => {
  const accessCode = process.env.APP_ACCESS_CODE?.trim();
  const required = Boolean(accessCode && accessCode.length > 0);
  const authenticated = !required || isSessionValid(req.headers.cookie);

  return sendSuccess(res, {
    required,
    authenticated,
  });
});

/**
 * POST /api/access
 * Body: { code: string }
 * Compares with timingSafeEqual via HMAC.
 * On success, sets HttpOnly, SameSite=Lax (Secure when NODE_ENV=production) cookie valid for 12 hours.
 * On failure, enforces a constant 300ms delay and returns 401 [ACCESS_DENIED].
 * Rate limited to at most 10 attempts per minute per IP.
 */
accessRouter.post('/access', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const rate = checkAccessRateLimit(ip);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    return res.status(429).json({
      data: null,
      error: 'Too many attempts [RATE_LIMITED]',
    });
  }

  const accessCode = process.env.APP_ACCESS_CODE?.trim();
  if (!accessCode) {
    return sendSuccess(res, { success: true });
  }

  const secretKey = process.env.APP_SESSION_SECRET?.trim();
  if (!secretKey) {
    console.error('APP_SESSION_SECRET is required when APP_ACCESS_CODE is set');
    return res.status(503).json({
      data: null,
      error: 'AUTH_NOT_CONFIGURED',
    });
  }

  const parsed = accessBodySchema.safeParse(req.body);
  const inputCode = parsed.success ? parsed.data.code : '';

  const hmacInput = crypto.createHmac('sha256', secretKey).update(inputCode).digest();
  const hmacExpected = crypto.createHmac('sha256', secretKey).update(accessCode).digest();

  const isMatch = parsed.success && crypto.timingSafeEqual(hmacInput, hmacExpected);

  if (!isMatch) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return res.status(401).json({
      data: null,
      error: 'Access denied [ACCESS_DENIED]',
    });
  }

  const expiry = Date.now() + 12 * 60 * 60 * 1000;
  const sig = crypto.createHmac('sha256', secretKey).update(String(expiry)).digest('hex');
  const cookieValue = `${expiry}.${sig}`;

  res.cookie('ripple_session', cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });

  return sendSuccess(res, { success: true });
});

/**
 * POST /api/access/logout
 * Clears the session cookie
 */
accessRouter.post('/access/logout', (_req, res) => {
  res.clearCookie('ripple_session', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return sendSuccess(res, { success: true });
});

export default accessRouter;
