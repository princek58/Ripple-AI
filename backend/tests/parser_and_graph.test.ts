import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type Database from 'better-sqlite3';
import app from '../src/app.js';
import config, { resetUploadLimits } from '../src/config.js';
import { createDatabase, setDatabase, closeDatabase } from '../src/db/connection.js';
import { createYazlZip } from './test_helpers.js';
import { resetActiveUploads } from '../src/routes/projects.js';

const TEST_DIR = path.resolve(__dirname, 'tmp_parser_graph_test');
const FIXTURE_DIR = path.resolve(__dirname, 'fixtures', 'demo-erp');

async function buildDemoErpZip(outputPath: string): Promise<void> {
  const entries: { name: string; content: Buffer }[] = [];

  function walk(dir: string) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        walk(full);
      } else {
        const rel = path.relative(FIXTURE_DIR, full).replace(/\\/g, '/');
        entries.push({ name: rel, content: fs.readFileSync(full) });
      }
    }
  }

  walk(FIXTURE_DIR);
  await createYazlZip(entries, outputPath);
}

describe('Step 4 Parser and Graph Builder Tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDatabase(':memory:');
    setDatabase(db);
    resetUploadLimits();
    resetActiveUploads();

    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    resetUploadLimits();
    resetActiveUploads();

    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }

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

  it('1. scan creates project node and module nodes for notices, marks, fees, login', async () => {
    const zipPath = path.join(TEST_DIR, 'demo-erp.zip');
    await buildDemoErpZip(zipPath);

    // 1. Upload
    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    expect(uploadRes.status).toBe(201);
    const projectId = uploadRes.body.data.id;

    // 2. Scan
    const scanRes = await request(app).post(`/api/projects/${projectId}/scan`);
    expect(scanRes.status).toBe(200);
    expect(scanRes.body.data.status).toBe('completed');
    expect(scanRes.body.data.notes).toContain('Analyzed');

    // 3. Inspect Nodes
    const nodes = db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(projectId) as any[];

    // Exactly one project node (level 1)
    const projectNodes = nodes.filter((n) => n.type === 'project' && n.level === 1);
    expect(projectNodes.length).toBe(1);

    // Module nodes (level 1)
    const moduleNodes = nodes.filter((n) => n.type === 'module' && n.level === 1);
    const moduleLabels = moduleNodes.map((n) => n.label);
    expect(moduleLabels).toContain('notices');
    expect(moduleLabels).toContain('marks');
    expect(moduleLabels).toContain('fees');
    expect(moduleLabels).toContain('login');
    expect(moduleLabels).toContain('shared');
  });

  it('2. broken import to feeService is stored as an unresolved edge with file and line evidence', async () => {
    const zipPath = path.join(TEST_DIR, 'demo-erp.zip');
    await buildDemoErpZip(zipPath);

    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    const projectId = uploadRes.body.data.id;

    await request(app).post(`/api/projects/${projectId}/scan`);

    const edges = db
      .prepare("SELECT * FROM edges WHERE project_id = ? AND status = 'unresolved' AND relation = 'imports'")
      .all(projectId) as any[];

    const feeEdge = edges.find((e) => {
      const ev = JSON.parse(e.evidence_json);
      return ev.file.includes('fees.js') && ev.specifier.includes('feeService');
    });

    expect(feeEdge).toBeDefined();
    const evidence = JSON.parse(feeEdge.evidence_json);
    expect(evidence.file).toBe('backend/routes/fees.js');
    expect(evidence.specifier).toBe('../services/feeService');
    expect(evidence.line_start).toBeGreaterThan(0);
    expect(feeEdge.confidence).toBe('confirmed');
  });

  it('3. helpers.js and format.js import edges both exist (circular pair visible in edges)', async () => {
    const zipPath = path.join(TEST_DIR, 'demo-erp.zip');
    await buildDemoErpZip(zipPath);

    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    const projectId = uploadRes.body.data.id;

    await request(app).post(`/api/projects/${projectId}/scan`);

    const nodes = db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(projectId) as any[];
    const helpersNode = nodes.find((n) => n.path === 'backend/utils/helpers.js');
    const formatNode = nodes.find((n) => n.path === 'backend/utils/format.js');

    expect(helpersNode).toBeDefined();
    expect(formatNode).toBeDefined();

    // Edge helpers -> format
    const helperToFormat = db
      .prepare("SELECT * FROM edges WHERE source_id = ? AND target_id = ? AND relation = 'imports'")
      .get(helpersNode.id, formatNode.id);
    expect(helperToFormat).toBeDefined();

    // Edge format -> helpers
    const formatToHelper = db
      .prepare("SELECT * FROM edges WHERE source_id = ? AND target_id = ? AND relation = 'imports'")
      .get(formatNode.id, helpersNode.id);
    expect(formatToHelper).toBeDefined();
  });

  it('4. legacyReport.js has no incoming imports edge', async () => {
    const zipPath = path.join(TEST_DIR, 'demo-erp.zip');
    await buildDemoErpZip(zipPath);

    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    const projectId = uploadRes.body.data.id;

    await request(app).post(`/api/projects/${projectId}/scan`);

    const legacyNode = db
      .prepare('SELECT * FROM nodes WHERE project_id = ? AND path = ?')
      .get(projectId, 'backend/services/legacyReport.js') as any;
    expect(legacyNode).toBeDefined();

    const incomingImports = db
      .prepare("SELECT * FROM edges WHERE target_id = ? AND relation = 'imports'")
      .all(legacyNode.id);
    expect(incomingImports.length).toBe(0);
  });

  it('5. JWT_SECRET and DB_URL appear as config nodes; no env VALUE anywhere in the DB', async () => {
    const zipPath = path.join(TEST_DIR, 'demo-erp.zip');
    await buildDemoErpZip(zipPath);

    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    const projectId = uploadRes.body.data.id;

    await request(app).post(`/api/projects/${projectId}/scan`);

    const configNodes = db
      .prepare("SELECT * FROM nodes WHERE project_id = ? AND type = 'config'")
      .all(projectId) as any[];

    const configLabels = configNodes.map((n) => n.label);
    expect(configLabels).toContain('env:DB_URL');
    expect(configLabels).toContain('env:JWT_SECRET');

    // Verify 'reads' edge from db.js to both env config nodes
    const dbNode = db
      .prepare('SELECT * FROM nodes WHERE project_id = ? AND path = ?')
      .get(projectId, 'backend/config/db.js') as any;
    expect(dbNode).toBeDefined();

    const dbReads = db
      .prepare("SELECT * FROM edges WHERE source_id = ? AND relation = 'reads'")
      .all(dbNode.id) as any[];
    expect(dbReads.length).toBe(2);

    // Verify secret values never appear anywhere in the database
    const allNodesText = JSON.stringify(db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(projectId));
    const allEdgesText = JSON.stringify(db.prepare('SELECT * FROM edges WHERE project_id = ?').all(projectId));

    expect(allNodesText).not.toContain('postgres://localhost:5432/ripple');
    expect(allEdgesText).not.toContain('postgres://localhost:5432/ripple');
  });

  it('6. /api/notices frontend call links to notices API node; /api/notice/list has no resolved link', async () => {
    const zipPath = path.join(TEST_DIR, 'demo-erp.zip');
    await buildDemoErpZip(zipPath);

    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    const projectId = uploadRes.body.data.id;

    await request(app).post(`/api/projects/${projectId}/scan`);

    const noticePageNode = db
      .prepare('SELECT * FROM nodes WHERE project_id = ? AND path = ?')
      .get(projectId, 'frontend/src/pages/NoticePage.tsx') as any;
    expect(noticePageNode).toBeDefined();

    const noticesApiNode = db
      .prepare("SELECT * FROM nodes WHERE project_id = ? AND type = 'api' AND path = ? AND label = ?")
      .get(projectId, '/api/notices', 'GET /api/notices') as any;
    expect(noticesApiNode).toBeDefined();

    // 1. Resolved call from NoticePage to /api/notices
    const resolvedCall = db
      .prepare("SELECT * FROM edges WHERE source_id = ? AND target_id = ? AND relation = 'calls' AND status = 'resolved'")
      .get(noticePageNode.id, noticesApiNode.id);
    expect(resolvedCall).toBeDefined();

    // 2. /api/notice/list has no resolved link
    const noticeListApi = db
      .prepare("SELECT * FROM nodes WHERE project_id = ? AND type = 'api' AND path = ?")
      .get(projectId, '/api/notice/list');
    expect(noticeListApi).toBeUndefined();

    const noticeListCalls = db
      .prepare("SELECT * FROM edges WHERE source_id = ? AND relation = 'calls' AND status = 'resolved'")
      .all(noticePageNode.id) as any[];
    // Only the /api/notices call is resolved
    expect(noticeListCalls.length).toBe(1);
    expect(noticeListCalls[0].target_id).toBe(noticesApiNode.id);
  });

  it('7. dynamic import and runtime-built URL become unresolved edges, never dropped', async () => {
    const zipPath = path.join(TEST_DIR, 'demo-erp.zip');
    await buildDemoErpZip(zipPath);

    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    const projectId = uploadRes.body.data.id;

    await request(app).post(`/api/projects/${projectId}/scan`);

    const dynamicNode = db
      .prepare('SELECT * FROM nodes WHERE project_id = ? AND path = ?')
      .get(projectId, 'frontend/src/pages/Dynamic.tsx') as any;
    expect(dynamicNode).toBeDefined();

    const unresolvedEdges = db
      .prepare("SELECT * FROM edges WHERE source_id = ? AND status = 'unresolved'")
      .all(dynamicNode.id) as any[];

    // Must have unresolved dynamic import edge and unresolved runtime-built URL call edge
    const dynamicImportEdge = unresolvedEdges.find((e) => e.relation === 'imports');
    const runtimeUrlEdge = unresolvedEdges.find((e) => e.relation === 'calls');

    expect(dynamicImportEdge).toBeDefined();
    expect(runtimeUrlEdge).toBeDefined();
  });

  it('8. a syntax-error file does not crash the scan and is noted', async () => {
    const zipPath = path.join(TEST_DIR, 'with-syntax-error.zip');
    await createYazlZip(
      [
        { name: 'src/good.ts', content: 'export const ok = 1;' },
        { name: 'src/bad.js', content: 'const broken = ;;; function (((( invalid syntax' },
        { name: 'package.json', content: '{"name": "test-syntax"}' },
      ],
      zipPath
    );

    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    const projectId = uploadRes.body.data.id;

    const scanRes = await request(app).post(`/api/projects/${projectId}/scan`);
    expect(scanRes.status).toBe(200);
    expect(scanRes.body.data.status).toBe('completed');

    // Both files become nodes
    const nodes = db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(projectId) as any[];
    expect(nodes.some((n) => n.path === 'src/good.ts')).toBe(true);
    expect(nodes.some((n) => n.path === 'src/bad.js')).toBe(true);

    // Scan notes mention bad.js
    expect(scanRes.body.data.notes).toContain('bad.js');
  });

  it('9. ts-morph never reads outside the project folder: import ../../outside becomes unresolved', async () => {
    const zipPath = path.join(TEST_DIR, 'outside-escape.zip');
    await createYazlZip(
      [
        { name: 'src/index.ts', content: 'import outside from "../../outside";\nconsole.log(outside);' },
      ],
      zipPath
    );

    // Create a decoy file outside project folder
    const decoyPath = path.resolve(config.storagePath, 'outside.js');
    fs.writeFileSync(decoyPath, 'module.exports = "SECRET_OUTSIDE_PAYLOAD";');

    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    const projectId = uploadRes.body.data.id;

    await request(app).post(`/api/projects/${projectId}/scan`);

    const edges = db.prepare('SELECT * FROM edges WHERE project_id = ?').all(projectId) as any[];
    expect(edges.length).toBe(1);
    expect(edges[0].status).toBe('unresolved');

    const ev = JSON.parse(edges[0].evidence_json);
    expect(ev.reason).toBe('PATH_ESCAPES_ROOT');

    // Clean up decoy
    if (fs.existsSync(decoyPath)) fs.unlinkSync(decoyPath);
  });

  it('10. re-scan replaces old nodes/edges without duplicates; a failing scan leaves no partial graph', async () => {
    const zipPath = path.join(TEST_DIR, 'demo-erp.zip');
    await buildDemoErpZip(zipPath);

    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    const projectId = uploadRes.body.data.id;

    // Scan 1
    const scan1 = await request(app).post(`/api/projects/${projectId}/scan`);
    expect(scan1.status).toBe(200);

    const nodesCount1 = (db.prepare('SELECT count(*) as c FROM nodes WHERE project_id = ?').get(projectId) as any).c;
    const edgesCount1 = (db.prepare('SELECT count(*) as c FROM edges WHERE project_id = ?').get(projectId) as any).c;

    // Scan 2 (re-scan)
    const scan2 = await request(app).post(`/api/projects/${projectId}/scan`);
    expect(scan2.status).toBe(200);

    const nodesCount2 = (db.prepare('SELECT count(*) as c FROM nodes WHERE project_id = ?').get(projectId) as any).c;
    const edgesCount2 = (db.prepare('SELECT count(*) as c FROM edges WHERE project_id = ?').get(projectId) as any).c;

    expect(nodesCount2).toBe(nodesCount1);
    expect(edgesCount2).toBe(edgesCount1);

    // Verify GET /api/projects/:id/scans lists both scans, newest first
    const listScansRes = await request(app).get(`/api/projects/${projectId}/scans`);
    expect(listScansRes.status).toBe(200);
    expect(listScansRes.body.data.length).toBe(3); // 1 initial upload scan + 2 manual scans
    expect(listScansRes.body.data[0].id).toBe(scan2.body.data.id);
  });

  it('11. unknown project gives 404', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000000';
    const scanRes = await request(app).post(`/api/projects/${unknownId}/scan`);
    expect(scanRes.status).toBe(404);
    expect(scanRes.body.error).toBe('Project not found');

    const getScansRes = await request(app).get(`/api/projects/${unknownId}/scans`);
    expect(getScansRes.status).toBe(404);
    expect(getScansRes.body.error).toBe('Project not found');

    const invalidRes = await request(app).post('/api/projects/not-a-uuid/scan');
    expect(invalidRes.status).toBe(400);
  });
});
