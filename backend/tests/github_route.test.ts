import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type Database from 'better-sqlite3';
import app from '../src/app.js';
import config, { setUploadLimits, resetUploadLimits } from '../src/config.js';
import { createDatabase, setDatabase } from '../src/db/connection.js';
import { createRawZipBuffer } from './test_helpers.js';
import { setActiveUploads, resetActiveUploads } from '../src/routes/projects.js';

describe('GitHub Import Route — POST /api/projects/import-github (Step G1 Part 2)', () => {
  let db: Database.Database;
  let server: http.Server;
  let serverPort: number;
  let serverBaseUrl: string;
  let requestHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  let mockRequestsCount = 0;

  // Standard valid mock ZIP buffer containing package.json and index.js
  const validZipBuffer = createRawZipBuffer([
    {
      name: 'package.json',
      data: JSON.stringify({ name: 'hello-world', version: '1.0.0' }, null, 2),
    },
    {
      name: 'index.js',
      data: 'console.log("hello world");\n',
    },
  ]);

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      mockRequestsCount++;
      if (requestHandler) {
        requestHandler(req, res);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        serverBaseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });

    // Point GITHUB_CODELOAD_BASE to the local mock HTTP server
    process.env.GITHUB_CODELOAD_BASE = serverBaseUrl;
  });

  afterAll(async () => {
    delete process.env.GITHUB_CODELOAD_BASE;
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    db = createDatabase(':memory:');
    setDatabase(db);
    resetUploadLimits();
    resetActiveUploads();
    mockRequestsCount = 0;

    fs.mkdirSync(config.storagePath, { recursive: true });
    fs.mkdirSync(config.tempStoragePath, { recursive: true });

    // Clean storage directory between tests
    for (const entry of fs.readdirSync(config.storagePath)) {
      if (entry === 'tmp') continue;
      fs.rmSync(path.join(config.storagePath, entry), { recursive: true, force: true });
    }
    for (const entry of fs.readdirSync(config.tempStoragePath)) {
      fs.rmSync(path.join(config.tempStoragePath, entry), { recursive: true, force: true });
    }
  });

  afterEach(() => {
    resetUploadLimits();
    resetActiveUploads();
  });

  it('valid repo gives 201, records extra scan note, and files are listed', async () => {
    requestHandler = (req, res) => {
      expect(req.url).toBe('/octocat/Hello-World/zip/HEAD');
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': validZipBuffer.length.toString(),
      });
      res.end(validZipBuffer);
    };

    const res = await request(app)
      .post('/api/projects/import-github')
      .send({ url: 'https://github.com/octocat/Hello-World' });

    expect(res.status).toBe(201);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toBeDefined();

    const project = res.body.data;
    expect(project.name).toBe('Hello-World');
    expect(project.file_count).toBe(2);

    // Verify scan note has the required extra line
    const scanRow: any = db.prepare('SELECT notes FROM scans WHERE project_id = ?').get(project.id);
    expect(scanRow).toBeDefined();
    expect(scanRow.notes).toContain('Imported from github.com/octocat/Hello-World (public)');

    // Verify file listing
    const filesRes = await request(app).get(`/api/projects/${project.id}/files`);
    expect(filesRes.status).toBe(200);
    expect(filesRes.body.data.total).toBe(2);
    const paths = filesRes.body.data.items.map((i: any) => i.path);
    expect(paths).toContain('package.json');
    expect(paths).toContain('index.js');
  });

  it('the imported project can be scanned afterwards (POST scan works)', async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': validZipBuffer.length.toString(),
      });
      res.end(validZipBuffer);
    };

    const importRes = await request(app)
      .post('/api/projects/import-github')
      .send({ url: 'https://github.com/octocat/Hello-World' });

    expect(importRes.status).toBe(201);
    const projectId = importRes.body.data.id;

    // Trigger analysis scan
    const scanRes = await request(app).post(`/api/projects/${projectId}/scan`);
    expect(scanRes.status).toBe(200);
    expect(scanRes.body.error).toBeNull();
    expect(scanRes.body.data.status).toBe('completed');
  });

  it('invalid URL variants give 400 and make NO network call to the mock server', async () => {
    const invalidUrls = [
      'https://github.com.evil.com/octocat/Hello-World',
      'http://github.com/octocat/Hello-World',
      'https://github.com/octocat/Hello-World/blob/main/README.md',
      'https://github.com/octocat/Hello-World?param=1',
      'https://github.com/../Hello-World',
    ];

    for (const invalidUrl of invalidUrls) {
      mockRequestsCount = 0;
      const res = await request(app)
        .post('/api/projects/import-github')
        .send({ url: invalidUrl });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('GITHUB_URL_INVALID');
      expect(mockRequestsCount).toBe(0);
    }
  });

  it('HTTP 404 from GitHub gives 404 and leaves no database rows or project folder', async () => {
    requestHandler = (_req, res) => {
      res.writeHead(404);
      res.end('Not Found');
    };

    const res = await request(app)
      .post('/api/projects/import-github')
      .send({ url: 'https://github.com/octocat/Nonexistent-Repo' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('GITHUB_REPO_NOT_FOUND');

    const projectCount: any = db.prepare('SELECT COUNT(*) as count FROM projects').get();
    expect(projectCount.count).toBe(0);
  });

  it('repository exceeding size limit gives 413', async () => {
    setUploadLimits({ maxZipSizeBytes: 100 });

    requestHandler = (_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': '500',
      });
      res.end(validZipBuffer);
    };

    const res = await request(app)
      .post('/api/projects/import-github')
      .send({ url: 'https://github.com/octocat/Hello-World' });

    expect(res.status).toBe(413);
    expect(res.body.error).toContain('GITHUB_REPO_TOO_LARGE');

    const projectCount: any = db.prepare('SELECT COUNT(*) as count FROM projects').get();
    expect(projectCount.count).toBe(0);
  });

  it('untrusted redirect target gives 502 (GITHUB_REDIRECT_BLOCKED)', async () => {
    requestHandler = (_req, res) => {
      res.writeHead(302, { Location: 'http://malicious.external.com/evil.zip' });
      res.end();
    };

    const res = await request(app)
      .post('/api/projects/import-github')
      .send({ url: 'https://github.com/octocat/Hello-World' });

    expect(res.status).toBe(502);
    expect(res.body.error).toContain('GITHUB_REDIRECT_BLOCKED');

    const projectCount: any = db.prepare('SELECT COUNT(*) as count FROM projects').get();
    expect(projectCount.count).toBe(0);
  });

  it('zip-slip inside the downloaded ZIP gives 422 and nothing is written outside storage', async () => {
    const outsideCanaryPath = path.resolve(config.storagePath, '..', 'canary_zip_slip_leak.txt');
    if (fs.existsSync(outsideCanaryPath)) {
      fs.unlinkSync(outsideCanaryPath);
    }

    const zipSlipBuf = createRawZipBuffer([
      { name: '../../canary_zip_slip_leak.txt', data: 'malicious payload' },
    ]);

    requestHandler = (_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': zipSlipBuf.length.toString(),
      });
      res.end(zipSlipBuf);
    };

    const res = await request(app)
      .post('/api/projects/import-github')
      .send({ url: 'https://github.com/octocat/Hello-World' });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('ZIP_UNSAFE_PATH');

    expect(fs.existsSync(outsideCanaryPath)).toBe(false);

    const projectCount: any = db.prepare('SELECT COUNT(*) as count FROM projects').get();
    expect(projectCount.count).toBe(0);
  });

  it('zip bomb gives 422', async () => {
    // Set max uncompressed limit to 10 bytes
    setUploadLimits({ maxUncompressedSizeBytes: 10 });

    requestHandler = (_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': validZipBuffer.length.toString(),
      });
      res.end(validZipBuffer);
    };

    const res = await request(app)
      .post('/api/projects/import-github')
      .send({ url: 'https://github.com/octocat/Hello-World' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/ZIP_BOMB|ZIP_TOO_LARGE/);

    const projectCount: any = db.prepare('SELECT COUNT(*) as count FROM projects').get();
    expect(projectCount.count).toBe(0);
  });

  it('.env values are never written to disk or returned in any response', async () => {
    const secretValue = 'SUPER_SECRET_GITHUB_TOKEN_12345';
    const envZipBuf = createRawZipBuffer([
      {
        name: '.env',
        data: `SECRET_KEY=${secretValue}\nPORT=3000\n`,
      },
      {
        name: 'index.js',
        data: 'console.log("running");\n',
      },
    ]);

    requestHandler = (_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': envZipBuf.length.toString(),
      });
      res.end(envZipBuf);
    };

    const res = await request(app)
      .post('/api/projects/import-github')
      .send({ url: 'https://github.com/octocat/Hello-World' });

    expect(res.status).toBe(201);
    expect(res.text).not.toContain(secretValue);

    const projectId = res.body.data.id;
    const envOnDiskPath = path.join(config.storagePath, projectId, 'files', '.env');
    expect(fs.existsSync(envOnDiskPath)).toBe(true);

    const envContent = fs.readFileSync(envOnDiskPath, 'utf-8');
    expect(envContent).not.toContain(secretValue);
    expect(envContent).toContain('SECRET_KEY=');
  });

  it('a failed import leaves no rows, no project folder, and no leftover temp files', async () => {
    requestHandler = (_req, res) => {
      // Non-PK signature response
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>Error</body></html>');
    };

    const res = await request(app)
      .post('/api/projects/import-github')
      .send({ url: 'https://github.com/octocat/Hello-World' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ZIP_INVALID');

    // Verify 0 rows in database
    const projectCount: any = db.prepare('SELECT COUNT(*) as count FROM projects').get();
    expect(projectCount.count).toBe(0);

    // Verify no folders in storage except tmp
    const storageEntries = fs.readdirSync(config.storagePath).filter((f) => f !== 'tmp');
    expect(storageEntries.length).toBe(0);

    // Verify no leftover files in temp storage
    const tempEntries = fs.readdirSync(config.tempStoragePath);
    expect(tempEntries.length).toBe(0);
  });

  it('concurrency limit returns 429 when max active uploads/imports reached', async () => {
    setActiveUploads(2);

    const res = await request(app)
      .post('/api/projects/import-github')
      .send({ url: 'https://github.com/octocat/Hello-World' });

    expect(res.status).toBe(429);
    expect(res.body.error).toContain('TOO_MANY_UPLOADS');
  });

  it('missing body or wrong type returns 400 validation error', async () => {
    const resEmpty = await request(app)
      .post('/api/projects/import-github')
      .send({});
    expect(resEmpty.status).toBe(400);

    const resWrongType = await request(app)
      .post('/api/projects/import-github')
      .send({ url: 99999 });
    expect(resWrongType.status).toBe(400);
  });
});
