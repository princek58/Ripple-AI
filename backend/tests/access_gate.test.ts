import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import app from '../src/app.js';
import { resetAccessRateLimiter } from '../src/middleware/auth.js';

describe('DEP1 Part 2 - Access Gate (Backend)', () => {
  const originalAccessCode = process.env.APP_ACCESS_CODE;
  const originalSessionSecret = process.env.APP_SESSION_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  const TEST_ACCESS_CODE = 'test-dep1-secret-code-xyz';
  const TEST_SESSION_SECRET = 'test-dep1-session-secret-987';

  beforeEach(() => {
    resetAccessRateLimiter();
    delete process.env.APP_ACCESS_CODE;
    delete process.env.APP_SESSION_SECRET;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    resetAccessRateLimiter();
    if (originalAccessCode === undefined) delete process.env.APP_ACCESS_CODE;
    else process.env.APP_ACCESS_CODE = originalAccessCode;

    if (originalSessionSecret === undefined) delete process.env.APP_SESSION_SECRET;
    else process.env.APP_SESSION_SECRET = originalSessionSecret;

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('1. no code set means no gate', async () => {
    delete process.env.APP_ACCESS_CODE;
    delete process.env.APP_SESSION_SECRET;

    const statusRes = await request(app).get('/api/access/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.required).toBe(false);
    expect(statusRes.body.data.authenticated).toBe(true);

    const projectsRes = await request(app).get('/api/projects');
    expect(projectsRes.status).toBe(200);
  });

  it('2. protected route returns 401 AUTH_REQUIRED when APP_ACCESS_CODE is set', async () => {
    process.env.APP_ACCESS_CODE = TEST_ACCESS_CODE;
    process.env.APP_SESSION_SECRET = TEST_SESSION_SECRET;

    const statusRes = await request(app).get('/api/access/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.required).toBe(true);
    expect(statusRes.body.data.authenticated).toBe(false);

    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBe('Access code required [AUTH_REQUIRED]');
  });

  it('3. wrong code returns 401 and delay not skipped', async () => {
    process.env.APP_ACCESS_CODE = TEST_ACCESS_CODE;
    process.env.APP_SESSION_SECRET = TEST_SESSION_SECRET;

    const start = Date.now();
    const res = await request(app)
      .post('/api/access')
      .send({ code: 'wrong-passcode' });
    const elapsed = Date.now() - start;

    expect(res.status).toBe(401);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBe('Access denied [ACCESS_DENIED]');
    // 300ms constant delay was not skipped (allow slight timer variance)
    expect(elapsed).toBeGreaterThanOrEqual(270);
  });

  it('4. right code sets cookie flags and unlocks protected routes', async () => {
    process.env.APP_ACCESS_CODE = TEST_ACCESS_CODE;
    process.env.APP_SESSION_SECRET = TEST_SESSION_SECRET;

    const loginRes = await request(app)
      .post('/api/access')
      .send({ code: TEST_ACCESS_CODE });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.success).toBe(true);

    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const sessionCookie = cookies[0];
    expect(sessionCookie).toContain('ripple_session=');
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);

    // Extract cookie value for subsequent request
    const cookieHeaderVal = sessionCookie.split(';')[0];

    // Status endpoint now reports authenticated
    const statusRes = await request(app)
      .get('/api/access/status')
      .set('Cookie', cookieHeaderVal);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.required).toBe(true);
    expect(statusRes.body.data.authenticated).toBe(true);

    // Protected route is now accessible
    const projectsRes = await request(app)
      .get('/api/projects')
      .set('Cookie', cookieHeaderVal);
    expect(projectsRes.status).toBe(200);
  });

  it('4b. sets Secure flag on cookie when NODE_ENV=production', async () => {
    process.env.APP_ACCESS_CODE = TEST_ACCESS_CODE;
    process.env.APP_SESSION_SECRET = TEST_SESSION_SECRET;
    process.env.NODE_ENV = 'production';

    const loginRes = await request(app)
      .post('/api/access')
      .send({ code: TEST_ACCESS_CODE });

    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies[0]).toMatch(/Secure/i);
  });

  it('5. expired or tampered cookie is rejected', async () => {
    process.env.APP_ACCESS_CODE = TEST_ACCESS_CODE;
    process.env.APP_SESSION_SECRET = TEST_SESSION_SECRET;

    // Tampered cookie
    const tamperedCookie = 'ripple_session=123456789.badhexsignature123456789';
    const resTampered = await request(app)
      .get('/api/projects')
      .set('Cookie', tamperedCookie);
    expect(resTampered.status).toBe(401);
    expect(resTampered.body.error).toBe('Access code required [AUTH_REQUIRED]');

    // Expired cookie (valid signature but expired timestamp)
    const expiredTime = Date.now() - 10000;
    const expiredSig = crypto
      .createHmac('sha256', TEST_SESSION_SECRET)
      .update(String(expiredTime))
      .digest('hex');
    const expiredCookie = `ripple_session=${expiredTime}.${expiredSig}`;

    const resExpired = await request(app)
      .get('/api/projects')
      .set('Cookie', expiredCookie);
    expect(resExpired.status).toBe(401);
    expect(resExpired.body.error).toBe('Access code required [AUTH_REQUIRED]');
  });

  it('6. enforces rate limit of at most 10 attempts per minute per IP', async () => {
    process.env.APP_ACCESS_CODE = TEST_ACCESS_CODE;
    process.env.APP_SESSION_SECRET = TEST_SESSION_SECRET;

    // Send 10 attempts (allowed)
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/access')
        .send({ code: 'wrong' });
      expect(res.status).toBe(401);
    }

    // 11th attempt is rate limited
    const limitedRes = await request(app)
      .post('/api/access')
      .send({ code: 'wrong' });

    expect(limitedRes.status).toBe(429);
    expect(limitedRes.headers['retry-after']).toBeDefined();
    expect(limitedRes.body.error).toContain('RATE_LIMITED');
  });

  it('7. logout clears the session cookie', async () => {
    process.env.APP_ACCESS_CODE = TEST_ACCESS_CODE;
    process.env.APP_SESSION_SECRET = TEST_SESSION_SECRET;

    const logoutRes = await request(app).post('/api/access/logout');
    expect(logoutRes.status).toBe(200);

    const cookies = logoutRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toMatch(/ripple_session=;/);
  });

  it('8. health endpoint stays open without authentication', async () => {
    process.env.APP_ACCESS_CODE = TEST_ACCESS_CODE;
    process.env.APP_SESSION_SECRET = TEST_SESSION_SECRET;

    const healthRes = await request(app).get('/api/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.data.status).toBe('ok');
  });

  it('9. missing APP_SESSION_SECRET returns 503 AUTH_NOT_CONFIGURED and logs variable name only', async () => {
    process.env.APP_ACCESS_CODE = TEST_ACCESS_CODE;
    delete process.env.APP_SESSION_SECRET;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app)
      .post('/api/access')
      .send({ code: TEST_ACCESS_CODE });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AUTH_NOT_CONFIGURED');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('APP_SESSION_SECRET')
    );

    consoleSpy.mockRestore();
  });

  it('10. secret code value is never returned in any response or error', async () => {
    process.env.APP_ACCESS_CODE = TEST_ACCESS_CODE;
    process.env.APP_SESSION_SECRET = TEST_SESSION_SECRET;

    const resAuthReq = await request(app).get('/api/projects');
    expect(resAuthReq.text).not.toContain(TEST_ACCESS_CODE);
    expect(resAuthReq.text).not.toContain(TEST_SESSION_SECRET);

    const resDeny = await request(app)
      .post('/api/access')
      .send({ code: 'wrong-code-attempt' });
    expect(resDeny.text).not.toContain(TEST_ACCESS_CODE);
    expect(resDeny.text).not.toContain(TEST_SESSION_SECRET);

    const resStatus = await request(app).get('/api/access/status');
    expect(resStatus.text).not.toContain(TEST_ACCESS_CODE);
    expect(resStatus.text).not.toContain(TEST_SESSION_SECRET);
  });
});
