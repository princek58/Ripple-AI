import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type Database from 'better-sqlite3';
import app from '../src/app.js';
import config, { setUploadLimits, resetUploadLimits } from '../src/config.js';
import { createDatabase, setDatabase, closeDatabase } from '../src/db/connection.js';
import { createYazlZip, createRawZipBuffer } from './test_helpers.js';
import { resetActiveUploads } from '../src/routes/projects.js';

const TEST_DIR = path.resolve(__dirname, 'tmp_upload_test_suite');

describe('Step 3b Upload Route, Database Save and File Listing', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Fresh in-memory database with migrations automatically run
    db = createDatabase(':memory:');
    setDatabase(db);
    resetUploadLimits();
    resetActiveUploads();

    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(config.tempStoragePath, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    resetUploadLimits();
    resetActiveUploads();

    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }

    // Clean up any test project folders under config.storagePath
    if (fs.existsSync(config.storagePath)) {
      const entries = fs.readdirSync(config.storagePath);
      for (const entry of entries) {
        if (entry === 'tmp') continue;
        const p = path.join(config.storagePath, entry);
        if (fs.statSync(p).isDirectory()) {
          fs.rmSync(p, { recursive: true, force: true });
        }
      }
    }
  });

  it('1. valid ZIP gives 201 and its files are listed with pagination and q filter', async () => {
    const zipPath = path.join(TEST_DIR, 'valid-app.zip');
    await createYazlZip(
      [
        { name: 'src/index.ts', content: 'console.log("hello index");' },
        { name: 'src/utils.ts', content: 'export const add = (a: number, b: number) => a + b;' },
        { name: 'package.json', content: '{"name": "valid-app", "version": "1.0.0"}' },
        { name: 'README.md', content: '# Valid App Documentation' },
      ],
      zipPath
    );

    // 1. Upload ZIP
    const uploadRes = await request(app)
      .post('/api/projects')
      .attach('file', zipPath);

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.error).toBeNull();
    expect(uploadRes.body.data).toBeDefined();

    const project = uploadRes.body.data;
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(project.name).toBe('valid-app');
    expect(project.file_count).toBe(4);
    expect(project.size_bytes).toBeGreaterThan(0);
    expect(project.languages).toContain('TypeScript');
    expect(project.languages).toContain('JSON');
    expect(project.languages).toContain('Markdown');

    const projectId = project.id;

    // Verify storage on disk
    const projectFilesDir = path.join(config.storagePath, projectId, 'files');
    expect(fs.existsSync(projectFilesDir)).toBe(true);
    expect(fs.existsSync(path.join(projectFilesDir, 'src/index.ts'))).toBe(true);

    // 2. List files: default page 1, pageSize 50
    const listRes = await request(app).get(`/api/projects/${projectId}/files`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.error).toBeNull();
    expect(listRes.body.data.total).toBe(4);
    expect(listRes.body.data.page).toBe(1);
    expect(listRes.body.data.pageSize).toBe(50);
    expect(listRes.body.data.items.length).toBe(4);

    // 3. Pagination: page 1, pageSize 2
    const p1Res = await request(app).get(`/api/projects/${projectId}/files?page=1&pageSize=2`);
    expect(p1Res.status).toBe(200);
    expect(p1Res.body.data.items.length).toBe(2);
    expect(p1Res.body.data.page).toBe(1);
    expect(p1Res.body.data.pageSize).toBe(2);
    expect(p1Res.body.data.total).toBe(4);

    const p2Res = await request(app).get(`/api/projects/${projectId}/files?page=2&pageSize=2`);
    expect(p2Res.status).toBe(200);
    expect(p2Res.body.data.items.length).toBe(2);
    expect(p2Res.body.data.page).toBe(2);

    // 4. Case-insensitive substring search (q filter)
    const qRes = await request(app).get(`/api/projects/${projectId}/files?q=UTILS`);
    expect(qRes.status).toBe(200);
    expect(qRes.body.data.total).toBe(1);
    expect(qRes.body.data.items[0].path).toBe('src/utils.ts');
  });

  it('2. pageSize above 200 gives 400', async () => {
    // Generate valid project
    const zipPath = path.join(TEST_DIR, 'test.zip');
    await createYazlZip([{ name: 'test.txt', content: 'test' }], zipPath);
    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    const projectId = uploadRes.body.data.id;

    const res = await request(app).get(`/api/projects/${projectId}/files?pageSize=201`);
    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toMatch(/Validation error/);
  });

  it('3. file list never contains content', async () => {
    const zipPath = path.join(TEST_DIR, 'sample.zip');
    const secretCode = 'SECRET_ALGORITHM_SOURCE_CODE_NEVER_LEAK';
    await createYazlZip(
      [
        { name: 'src/secret.ts', content: secretCode },
        { name: 'config.json', content: '{"sensitive": true}' },
      ],
      zipPath
    );

    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    const projectId = uploadRes.body.data.id;

    const listRes = await request(app).get(`/api/projects/${projectId}/files`);
    expect(listRes.status).toBe(200);
    const items = listRes.body.data.items;

    expect(items.length).toBe(2);
    for (const item of items) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('path');
      expect(item).toHaveProperty('size');
      expect(item).toHaveProperty('language');
      expect(item).toHaveProperty('sensitive');

      // Crucial: No content or source code keys
      expect(item).not.toHaveProperty('content');
      expect(item).not.toHaveProperty('source');
      expect(item).not.toHaveProperty('body');
      expect(item).not.toHaveProperty('data');
    }

    // Verify response text does not contain the file content
    expect(JSON.stringify(listRes.body)).not.toContain(secretCode);
  });

  it('4. no file given gives 400', async () => {
    const res = await request(app).post('/api/projects');
    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toContain('MISSING_FILE');
  });

  it('5. non-ZIP gives 400', async () => {
    const filePath = path.join(TEST_DIR, 'fake.zip');
    fs.writeFileSync(filePath, 'Plain text file pretending to be a zip archive');

    const res = await request(app).post('/api/projects').attach('file', filePath);
    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toContain('ZIP_INVALID');

    // Verify temp file cleaned up
    const tmpFiles = fs.readdirSync(config.tempStoragePath);
    expect(tmpFiles.filter((f) => f.endsWith('.tmp')).length).toBe(0);
  });

  it('6. upload above limit gives 413', async () => {
    // Set very small limit: 200 bytes
    setUploadLimits({ maxZipSizeBytes: 200 });

    const zipPath = path.join(TEST_DIR, 'large.zip');
    // Create zip that is larger than 200 bytes using uncompressible random bytes
    await createYazlZip(
      [{ name: 'large.bin', content: crypto.randomBytes(4096) }],
      zipPath
    );
    expect(fs.statSync(zipPath).size).toBeGreaterThan(200);

    const res = await request(app).post('/api/projects').attach('file', zipPath);
    expect(res.status).toBe(413);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toContain('FILE_TOO_LARGE');

    // Verify temp file cleaned up
    const tmpFiles = fs.readdirSync(config.tempStoragePath);
    expect(tmpFiles.filter((f) => f.endsWith('.tmp')).length).toBe(0);
  });

  it('7. zip-slip gives 422 and nothing written outside storage', async () => {
    const zipPath = path.join(TEST_DIR, 'slip.zip');
    const outsideTarget = path.join(TEST_DIR, 'pwned.txt');

    const rawBuffer = createRawZipBuffer([
      {
        name: '../../pwned.txt',
        data: 'malicious payload',
      },
    ]);
    fs.writeFileSync(zipPath, rawBuffer);

    const res = await request(app).post('/api/projects').attach('file', zipPath);
    expect(res.status).toBe(422);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toContain('ZIP_UNSAFE_PATH');

    // Verify nothing written outside storage
    expect(fs.existsSync(outsideTarget)).toBe(false);

    // Verify no project saved in DB
    const projectCount = (db.prepare('SELECT count(*) as c FROM projects').get() as { c: number }).c;
    expect(projectCount).toBe(0);

    // Verify storage/tmp has no leftover .tmp files
    const tmpFiles = fs.readdirSync(config.tempStoragePath);
    expect(tmpFiles.filter((f) => f.endsWith('.tmp')).length).toBe(0);
  });

  it('8. zip-bomb gives 422', async () => {
    const zipPath = path.join(TEST_DIR, 'bomb.zip');

    // 1.5 MB uncompressed from ~1.5 KB deflated -> ratio ~1000:1 (exceeds 1 MB threshold)
    const bombData = Buffer.alloc(Math.floor(1.5 * 1024 * 1024), 0);
    const bombDeflated = zlib.deflateRawSync(bombData);

    const bombZipBuffer = createRawZipBuffer([
      {
        name: 'bomb_1_5mb.txt',
        data: bombData,
        compressedData: bombDeflated,
        compressionMethod: 8,
        compressedSize: bombDeflated.length,
        uncompressedSize: bombData.length,
      },
    ]);
    fs.writeFileSync(zipPath, bombZipBuffer);

    // Set max ratio to 10:1
    setUploadLimits({ maxCompressionRatio: 10 });

    const res = await request(app).post('/api/projects').attach('file', zipPath);
    expect(res.status).toBe(422);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toContain('ZIP_BOMB');

    // Verify no DB rows created
    const projectCount = (db.prepare('SELECT count(*) as c FROM projects').get() as { c: number }).c;
    expect(projectCount).toBe(0);
  });

  it('9. .env secret values never appear on disk or in any response', async () => {
    const zipPath = path.join(TEST_DIR, 'with-secrets.zip');
    const secretPassword = 'SUPER_SECRET_DB_PASSWORD_12345';
    const secretToken = 'SECRET_API_TOKEN_XYZ';
    const secretComment = '# Sensitive admin credentials';

    const envContent = [
      secretComment,
      `DATABASE_PASSWORD=${secretPassword}`,
      `API_TOKEN="${secretToken}"`,
      'PORT=8080',
    ].join('\n');

    await createYazlZip(
      [
        { name: '.env', content: envContent },
        { name: 'src/server.ts', content: 'console.log("running");' },
      ],
      zipPath
    );

    // 1. Upload
    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    expect(uploadRes.status).toBe(201);
    const projectId = uploadRes.body.data.id;

    // Check response body does not contain secret values
    expect(JSON.stringify(uploadRes.body)).not.toContain(secretPassword);
    expect(JSON.stringify(uploadRes.body)).not.toContain(secretToken);
    expect(JSON.stringify(uploadRes.body)).not.toContain(secretComment);

    // 2. List files
    const listRes = await request(app).get(`/api/projects/${projectId}/files`);
    expect(listRes.status).toBe(200);
    expect(JSON.stringify(listRes.body)).not.toContain(secretPassword);
    expect(JSON.stringify(listRes.body)).not.toContain(secretToken);

    const envItem = listRes.body.data.items.find((i: any) => i.path === '.env');
    expect(envItem).toBeDefined();
    expect(envItem.sensitive).toBe(true);

    // 3. Inspect physical file on disk
    const diskEnvPath = path.join(config.storagePath, projectId, 'files', '.env');
    expect(fs.existsSync(diskEnvPath)).toBe(true);
    const diskContent = fs.readFileSync(diskEnvPath, 'utf-8');

    // Secrets and comments must NOT exist on disk
    expect(diskContent).not.toContain(secretPassword);
    expect(diskContent).not.toContain(secretToken);
    expect(diskContent).not.toContain(secretComment);

    // Only KEY= lines remain
    expect(diskContent).toContain('DATABASE_PASSWORD=');
    expect(diskContent).toContain('API_TOKEN=');
    expect(diskContent).toContain('PORT=');
  });

  it('10. a failed upload leaves no project rows, no project folder and no leftover files in storage/tmp', async () => {
    const initialProjects = (db.prepare('SELECT count(*) as c FROM projects').get() as { c: number }).c;
    expect(initialProjects).toBe(0);

    // Test a failure: corrupt zip
    const badZip = path.join(TEST_DIR, 'corrupt.zip');
    fs.writeFileSync(badZip, Buffer.from('corrupted zip bytes'));

    const res = await request(app).post('/api/projects').attach('file', badZip);
    expect(res.status).toBe(400);

    // Check DB has no rows
    const afterProjects = (db.prepare('SELECT count(*) as c FROM projects').get() as { c: number }).c;
    expect(afterProjects).toBe(0);

    // Check storage/tmp has no leftover .tmp files or extract_* folders
    if (fs.existsSync(config.tempStoragePath)) {
      const leftover = fs.readdirSync(config.tempStoragePath);
      expect(leftover.filter((f) => f.endsWith('.tmp') || f.startsWith('extract_')).length).toBe(0);
    }
  });

  it('11. deleting a project removes its files rows and its storage folder', async () => {
    const zipPath = path.join(TEST_DIR, 'delete-me.zip');
    await createYazlZip(
      [
        { name: 'main.ts', content: 'console.log(1);' },
        { name: 'lib.ts', content: 'console.log(2);' },
      ],
      zipPath
    );

    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    expect(uploadRes.status).toBe(201);
    const projectId = uploadRes.body.data.id;

    // Verify DB project_files rows exist
    const filesCountBefore = (
      db.prepare('SELECT count(*) as c FROM project_files WHERE project_id = ?').get(projectId) as { c: number }
    ).c;
    expect(filesCountBefore).toBe(2);

    // Verify storage folder exists
    const projectStorageDir = path.join(config.storagePath, projectId);
    expect(fs.existsSync(projectStorageDir)).toBe(true);

    // Call DELETE API
    const deleteRes = await request(app).delete(`/api/projects/${projectId}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.deleted).toBe(true);

    // Verify project deleted from projects table
    const projectInDb = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    expect(projectInDb).toBeUndefined();

    // Verify cascade deleted project_files rows
    const filesCountAfter = (
      db.prepare('SELECT count(*) as c FROM project_files WHERE project_id = ?').get(projectId) as { c: number }
    ).c;
    expect(filesCountAfter).toBe(0);

    // Verify storage folder was removed
    expect(fs.existsSync(projectStorageDir)).toBe(false);
  });

  it('12. concurrent uploads beyond limit of 2 respond 429', async () => {
    const zipPath = path.join(TEST_DIR, 'concurrency.zip');
    await createYazlZip([{ name: 'file.txt', content: 'data' }], zipPath);

    const { setActiveUploads, resetActiveUploads } = await import('../src/routes/projects.js');

    // Simulate 2 uploads already in progress
    setActiveUploads(2);

    const res = await request(app).post('/api/projects').attach('file', zipPath);
    expect(res.status).toBe(429);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toContain('TOO_MANY_UPLOADS');

    // Reset back and verify upload proceeds
    resetActiveUploads();
    const resAllowed = await request(app).post('/api/projects').attach('file', zipPath);
    expect(resAllowed.status).toBe(201);
  });
});
