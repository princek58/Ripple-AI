import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type Database from 'better-sqlite3';
import app from '../src/app.js';
import config from '../src/config.js';
import { createDatabase, setDatabase, closeDatabase } from '../src/db/connection.js';

describe('Step 2 Backend Skeleton Tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Each test uses a clean in-memory database
    db = createDatabase(':memory:');
    setDatabase(db);
  });

  afterEach(() => {
    closeDatabase();
  });

  it('migrations create all tables from section 4 of the spec', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);

    const expectedTables = [
      '_migrations',
      'projects',
      'scans',
      'nodes',
      'edges',
      'findings',
      'fixes',
      'test_runs',
      'reports',
    ];

    for (const expected of expectedTables) {
      expect(tableNames).toContain(expected);
    }
  });

  it('CHECK constraints reject an invalid severity and an invalid edge status', () => {
    const projectId = '11111111-1111-1111-1111-111111111111';
    const scanId = '22222222-2222-2222-2222-222222222222';
    const node1Id = '33333333-3333-3333-3333-333333333333';
    const node2Id = '44444444-4444-4444-4444-444444444444';

    // Seed parent project, scan, and nodes
    db.prepare(`
      INSERT INTO projects (id, name, created_at)
      VALUES (?, 'Test Project', '2026-10-22T00:00:00.000Z')
    `).run(projectId);

    db.prepare(`
      INSERT INTO scans (id, project_id, started_at, status)
      VALUES (?, ?, '2026-10-22T00:00:00.000Z', 'completed')
    `).run(scanId, projectId);

    db.prepare(`
      INSERT INTO nodes (id, project_id, scan_id, type, level, label, path)
      VALUES (?, ?, ?, 'frontend', 1, 'App', 'src/App.tsx')
    `).run(node1Id, projectId, scanId);

    db.prepare(`
      INSERT INTO nodes (id, project_id, scan_id, type, level, label, path)
      VALUES (?, ?, ?, 'backend', 1, 'Server', 'src/server.ts')
    `).run(node2Id, projectId, scanId);

    // 1. Invalid severity: 'fatal' is not in ('critical', 'high', 'medium', 'low', 'unknown')
    expect(() => {
      db.prepare(`
        INSERT INTO findings (
          id, project_id, scan_id, rule_id, title, summary,
          severity, confidence, verification, created_at
        )
        VALUES ('f1', ?, ?, 'rule-1', 'Title', 'Summary', 'fatal', 'confirmed', 'not_tested', '2026-10-22T00:00:00.000Z')
      `).run(projectId, scanId);
    }).toThrow(/CHECK constraint failed/);

    // 2. Invalid edge status: 'uncertain' is not in ('resolved', 'possible', 'unresolved')
    expect(() => {
      db.prepare(`
        INSERT INTO edges (
          id, project_id, scan_id, source_id, target_id,
          relation, status, confidence
        )
        VALUES ('e1', ?, ?, ?, ?, 'imports', 'uncertain', 'confirmed')
      `).run(projectId, scanId, node1Id, node2Id);
    }).toThrow(/CHECK constraint failed/);
  });

  it('GET /api/projects returns an empty list', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [],
      error: null,
    });
  });

  it('GET unknown id returns 404 in { data, error } shape', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/api/projects/${unknownId}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      data: null,
      error: 'Project not found',
    });
  });

  it('DELETE removes a project and cascades to its nodes', async () => {
    const projectId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const scanId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const nodeId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    // Insert project, scan, and node
    db.prepare(`
      INSERT INTO projects (id, name, created_at)
      VALUES (?, 'Cascade Test Project', '2026-10-22T00:00:00.000Z')
    `).run(projectId);

    db.prepare(`
      INSERT INTO scans (id, project_id, started_at, status)
      VALUES (?, ?, '2026-10-22T00:00:00.000Z', 'completed')
    `).run(scanId, projectId);

    db.prepare(`
      INSERT INTO nodes (id, project_id, scan_id, type, level, label, path)
      VALUES (?, ?, ?, 'frontend', 1, 'Component', 'src/comp.tsx')
    `).run(nodeId, projectId, scanId);

    // Create a mock storage folder to test storage deletion
    const projectStorageDir = path.join(config.storagePath, projectId);
    fs.mkdirSync(projectStorageDir, { recursive: true });
    fs.writeFileSync(path.join(projectStorageDir, 'sample.txt'), 'test data');
    expect(fs.existsSync(projectStorageDir)).toBe(true);

    // Call DELETE API
    const res = await request(app).delete(`/api/projects/${projectId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { id: projectId, deleted: true },
      error: null,
    });

    // Verify DB cascade: project, scan, and node must all be deleted
    const projectInDb = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    expect(projectInDb).toBeUndefined();

    const scanInDb = db.prepare('SELECT * FROM scans WHERE id = ?').get(scanId);
    expect(scanInDb).toBeUndefined();

    const nodeInDb = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);
    expect(nodeInDb).toBeUndefined();

    // Verify storage folder cleanup
    expect(fs.existsSync(projectStorageDir)).toBe(false);
  });

  it('invalid id format returns 400', async () => {
    const resGet = await request(app).get('/api/projects/not-a-valid-uuid');
    expect(resGet.status).toBe(400);
    expect(resGet.body.data).toBeNull();
    expect(resGet.body.error).toMatch(/Validation error/);

    const resDelete = await request(app).delete('/api/projects/not-a-valid-uuid');
    expect(resDelete.status).toBe(400);
    expect(resDelete.body.data).toBeNull();
    expect(resDelete.body.error).toMatch(/Validation error/);
  });
});
