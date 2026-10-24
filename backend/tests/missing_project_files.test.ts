import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import app from '../src/app.js';
import config from '../src/config.js';
import { createDatabase, setDatabase, closeDatabase, getDatabase } from '../src/db/connection.js';
import { ProjectsRepository } from '../src/db/projectsRepository.js';

describe('Missing Project Files Handling (Step 13c Part 3)', () => {
  let db: any;
  const testProjectId = crypto.randomUUID();
  const testFindingId = crypto.randomUUID();

  beforeEach(() => {
    db = createDatabase(':memory:');
    setDatabase(db);

    const now = new Date().toISOString();
    const scanId = crypto.randomUUID();
    const projectsRepo = new ProjectsRepository(db);

    // Create project in DB without creating the files folder on disk
    projectsRepo.createWithScanAndFiles({
      project: {
        id: testProjectId,
        name: 'test-missing-files-project',
        size_bytes: 1024,
        file_count: 2,
        languages: JSON.stringify(['TypeScript']),
        created_at: now,
        last_scan_at: now,
      },
      scan: {
        id: scanId,
        started_at: now,
        finished_at: now,
        status: 'completed',
        files_total: 2,
        files_skipped: 0,
        notes: null,
      },
      files: [
        {
          id: crypto.randomUUID(),
          path: 'src/index.ts',
          size: 512,
          language: 'TypeScript',
          sensitive: 0,
        },
      ],
    });

    // Create finding associated with the project and scan
    db.prepare(`
      INSERT INTO findings (
        id, project_id, scan_id, rule_id, title, summary, severity, confidence, verification,
        evidence_json, node_ids_json, likely_cause, not_confirmed, created_at
      ) VALUES (
        ?, ?, ?, 'broken_import', 'Broken relative import in test', 'Cannot resolve ./missing',
        'high', 'confirmed', 'not_tested', ?, '[]', 'File moved', null, ?
      )
    `).run(
      testFindingId,
      testProjectId,
      scanId,
      JSON.stringify([{ file: 'src/index.ts', line_start: 1, specifier: './missing' }]),
      now
    );

    // Explicitly guarantee the project files folder does NOT exist on disk in isolated storage
    const projectFilesDir = path.resolve(config.storagePath, testProjectId, 'files');
    if (fs.existsSync(projectFilesDir)) {
      fs.rmSync(projectFilesDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    closeDatabase();
  });

  it('1. POST /api/projects/:id/scan returns 409 with PROJECT_FILES_MISSING when project storage folder is missing', async () => {
    const res = await request(app).post(`/api/projects/${testProjectId}/scan`);
    expect(res.status).toBe(409);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBe('Project files are missing. Upload the ZIP again [PROJECT_FILES_MISSING]');
  });

  it('2. GET /api/projects/:id/files returns 409 with PROJECT_FILES_MISSING when project storage folder is missing', async () => {
    const res = await request(app).get(`/api/projects/${testProjectId}/files`);
    expect(res.status).toBe(409);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBe('Project files are missing. Upload the ZIP again [PROJECT_FILES_MISSING]');
  });

  it('3. POST /api/findings/:id/fixes returns 409 with PROJECT_FILES_MISSING when project storage folder is missing', async () => {
    const res = await request(app).post(`/api/findings/${testFindingId}/fixes`);
    expect(res.status).toBe(409);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBe('Project files are missing. Upload the ZIP again [PROJECT_FILES_MISSING]');
  });
});
