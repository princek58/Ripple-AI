import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import app from '../src/app.js';

describe('DEP1 Part 3 - Production Serving Tests', () => {
  let tempDist: string;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDistPath = process.env.FRONTEND_DIST_PATH;
  const originalAccessCode = process.env.APP_ACCESS_CODE;

  beforeEach(() => {
    delete process.env.APP_ACCESS_CODE;
    tempDist = fs.mkdtempSync(path.join(os.tmpdir(), 'ripple-dist-test-'));

    // Create index.html and an asset file
    fs.writeFileSync(
      path.join(tempDist, 'index.html'),
      '<!DOCTYPE html><html><head><title>Ripple AI Test</title></head><body><div id="root">App Loaded</div></body></html>',
      'utf-8'
    );

    const assetsDir = path.join(tempDist, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(
      path.join(assetsDir, 'bundle-a1b2c3d4.js'),
      'console.log("bundle content");',
      'utf-8'
    );

    process.env.FRONTEND_DIST_PATH = tempDist;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;

    if (originalDistPath === undefined) delete process.env.FRONTEND_DIST_PATH;
    else process.env.FRONTEND_DIST_PATH = originalDistPath;

    if (originalAccessCode === undefined) delete process.env.APP_ACCESS_CODE;
    else process.env.APP_ACCESS_CODE = originalAccessCode;

    try {
      fs.rmSync(tempDist, { recursive: true, force: true });
    } catch {}
  });

  it('1. static file served with long cache for hashed assets', async () => {
    process.env.NODE_ENV = 'production';

    const res = await request(app).get('/assets/bundle-a1b2c3d4.js');
    expect(res.status).toBe(200);
    expect(res.text).toBe('console.log("bundle content");');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('2. SPA fallback serves index.html with no-cache for non-/api routes', async () => {
    process.env.NODE_ENV = 'production';

    // Root route
    const rootRes = await request(app).get('/');
    expect(rootRes.status).toBe(200);
    expect(rootRes.text).toContain('<title>Ripple AI Test</title>');
    expect(rootRes.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');

    // Deep SPA route
    const spaRes = await request(app).get('/app/overview');
    expect(spaRes.status).toBe(200);
    expect(spaRes.text).toContain('<title>Ripple AI Test</title>');
    expect(spaRes.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
  });

  it('3. /api unknown routes keep the JSON 404 and do not fall back to SPA', async () => {
    process.env.NODE_ENV = 'production';

    const resGet = await request(app).get('/api/completely-unknown-route');
    expect(resGet.status).toBe(404);
    expect(resGet.headers['content-type']).toContain('application/json');
    expect(resGet.body).toEqual({ data: null, error: 'Route not found' });

    const resPost = await request(app).post('/api/unknown-action');
    expect(resPost.status).toBe(404);
    expect(resPost.headers['content-type']).toContain('application/json');
    expect(resPost.body).toEqual({ data: null, error: 'Route not found' });
  });

  it('4. no static serving outside production', async () => {
    process.env.NODE_ENV = 'development';

    const assetRes = await request(app).get('/assets/bundle-a1b2c3d4.js');
    expect(assetRes.status).toBe(404);

    const spaRes = await request(app).get('/app/overview');
    expect(spaRes.status).toBe(404);
  });
});
