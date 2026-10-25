import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type Database from 'better-sqlite3';
import app from '../src/app.js';
import config, { resetUploadLimits } from '../src/config.js';
import { createDatabase, setDatabase, closeDatabase } from '../src/db/connection.js';
import { createYazlZip } from './test_helpers.js';
import { resetActiveUploads } from '../src/routes/projects.js';
import { computeImpact } from '../src/analysis/impact/index.js';

const TEST_DIR = path.resolve(__dirname, 'tmp_impact_test');
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

/**
 * Independent test oracle:
 * Tiny brute-force fixed-point loop over the edges, written purely in this test file
 * without sharing any code with computeImpact.
 */
function independentTestOracle(
  edges: Array<{ source_id: string; target_id: string; relation: string; status: string }>,
  startId: string,
  maxDepth = 10
): Map<string, { distance: number; certainty: 'proven' | 'possible' }> {
  const isDependent = (e: { source_id: string; target_id: string; relation: string; status: string }, currentId: string) => {
    if (e.status === 'unresolved') return null;
    if (e.relation === 'serves' || e.relation === 'configures') {
      return e.source_id === currentId ? e.target_id : null;
    }
    return e.target_id === currentId ? e.source_id : null;
  };

  const visited = new Map<string, { distance: number; certainty: 'proven' | 'possible' }>();
  let currentLayer = new Map<string, 'proven' | 'possible'>([[startId, 'proven']]);

  for (let d = 1; d <= maxDepth; d++) {
    const nextLayer = new Map<string, 'proven' | 'possible'>();

    for (const [u, cert] of currentLayer.entries()) {
      for (const e of edges) {
        const v = isDependent(e, u);
        if (v && v !== startId && !visited.has(v)) {
          const stepCert = cert === 'possible' || e.status === 'possible' ? 'possible' : 'proven';
          const existing = nextLayer.get(v);
          if (!existing || (existing === 'possible' && stepCert === 'proven')) {
            nextLayer.set(v, stepCert);
          }
        }
      }
    }

    for (const [v, cert] of nextLayer.entries()) {
      visited.set(v, { distance: d, certainty: cert });
    }

    currentLayer = nextLayer;
    if (currentLayer.size === 0) break;
  }

  return visited;
}

describe('Change Impact Analysis (Feature A)', () => {
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
        const full = path.join(config.storagePath, entry);
        try {
          fs.rmSync(full, { recursive: true, force: true });
        } catch {}
      }
    }
  });

  async function uploadAndScanFixture(): Promise<{ projectId: string; scanId: string }> {
    const zipPath = path.join(TEST_DIR, 'demo-erp.zip');
    await buildDemoErpZip(zipPath);

    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    expect(uploadRes.status).toBe(201);
    const projectId = uploadRes.body.data.id;

    const scanRes = await request(app).post(`/api/projects/${projectId}/scan`);
    expect(scanRes.status).toBe(200);
    const scanId = scanRes.body.data.id;

    return { projectId, scanId };
  }

  it('1. noticeService.js impact matches independent oracle and finds expected dependent nodes', async () => {
    const { projectId } = await uploadAndScanFixture();

    const nodes = db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(projectId) as any[];
    const edges = db.prepare('SELECT * FROM edges WHERE project_id = ?').all(projectId) as any[];

    const noticeServiceNode = nodes.find((n) => n.label === 'noticeService.js');
    expect(noticeServiceNode).toBeDefined();

    const oracle = independentTestOracle(edges, noticeServiceNode.id);

    const res = await request(app).get(`/api/projects/${projectId}/impact?node=${noticeServiceNode.id}`);
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    const data = res.body.data;

    expect(data.start.id).toBe(noticeServiceNode.id);
    expect(data.start.label).toBe('noticeService.js');
    expect(data.start.module).toBe('notices');

    // Compare with independent oracle
    const apiAffectedIds = data.affected.map((a: any) => a.id).sort();
    const oracleIds = Array.from(oracle.keys()).sort();
    expect(apiAffectedIds).toEqual(oracleIds);

    for (const item of data.affected) {
      const oracleEntry = oracle.get(item.id);
      expect(oracleEntry).toBeDefined();
      expect(item.distance).toBe(oracleEntry!.distance);
      expect(item.certainty).toBe(oracleEntry!.certainty);
    }

    // Verify expected specific nodes are found
    const labels = data.affected.map((a: any) => a.label);
    expect(labels).toContain('notices.js');
    expect(labels).toContain('server.js');
    expect(labels).toContain('GET /api/notices');
    expect(labels).toContain('POST /api/notices');
    expect(labels).toContain('NoticePage.tsx');
    expect(labels).toContain('notices.test.js');

    // Print the real set and compare with expectation
    const realSetSummary = data.affected.map(
      (a: any) => `${a.label} (${a.type}, dist=${a.distance}, cert=${a.certainty}, via=${a.via.relation})`
    );
    console.log('[Test 1 Output] Real affected set for noticeService.js:', realSetSummary);

    // Tests to review candidate check
    expect(data.tests_to_review.length).toBe(1);
    expect(data.tests_to_review[0].label).toBe('notices.test.js');
    expect(data.tests_to_review[0].note).toContain('no code was run');
  });

  it('2. helpers.js circular dependency terminates and includes format.js', async () => {
    const { projectId } = await uploadAndScanFixture();

    const nodes = db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(projectId) as any[];
    const edges = db.prepare('SELECT * FROM edges WHERE project_id = ?').all(projectId) as any[];

    const helpersNode = nodes.find((n) => n.label === 'helpers.js');
    expect(helpersNode).toBeDefined();

    const oracle = independentTestOracle(edges, helpersNode.id);

    const res = await request(app).get(`/api/projects/${projectId}/impact?node=${helpersNode.id}`);
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    const data = res.body.data;

    const apiAffectedIds = data.affected.map((a: any) => a.id).sort();
    const oracleIds = Array.from(oracle.keys()).sort();
    expect(apiAffectedIds).toEqual(oracleIds);

    const labels = data.affected.map((a: any) => a.label);
    expect(labels).toContain('format.js');
    expect(labels).not.toContain('helpers.js'); // start node never in own result
  });

  it('3. legacyReport.js has zero affected dependents and notes no other file depends on it', async () => {
    const { projectId } = await uploadAndScanFixture();

    const nodes = db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(projectId) as any[];
    const legacyReportNode = nodes.find((n) => n.label === 'legacyReport.js');
    expect(legacyReportNode).toBeDefined();

    const res = await request(app).get(`/api/projects/${projectId}/impact?node=${legacyReportNode.id}`);
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    const data = res.body.data;

    expect(data.affected.length).toBe(0);
    expect(data.counts.files).toBe(0);
    expect(data.notes).toContain('No other file depends on this file');
  });

  it('4. API node impact finds the frontend caller NoticePage.tsx', async () => {
    const { projectId } = await uploadAndScanFixture();

    const nodes = db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(projectId) as any[];
    const apiNode = nodes.find((n) => n.label === 'GET /api/notices' && n.type === 'api');
    expect(apiNode).toBeDefined();

    const res = await request(app).get(`/api/projects/${projectId}/impact?node=${apiNode.id}`);
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    const data = res.body.data;

    const labels = data.affected.map((a: any) => a.label);
    expect(labels).toContain('NoticePage.tsx');
  });

  it('5. config node env:JWT_SECRET impact finds the reader db.js', async () => {
    const { projectId } = await uploadAndScanFixture();

    const nodes = db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(projectId) as any[];
    const configNode = nodes.find((n) => n.label === 'env:JWT_SECRET' || n.path === 'JWT_SECRET');
    expect(configNode).toBeDefined();

    const res = await request(app).get(`/api/projects/${projectId}/impact?node=${configNode.id}`);
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    const data = res.body.data;

    const labels = data.affected.map((a: any) => a.label);
    expect(labels).toContain('db.js');
  });

  it('6. hand-made graph: possible edge yields certainty possible and unresolved raises unresolved_nearby', () => {
    const graph = {
      nodes: [
        { id: 'start-1', label: 'start.js', type: 'backend', path: 'src/start.js' },
        { id: 'node-possible', label: 'possible.js', type: 'frontend', path: 'src/possible.js' },
        { id: 'node-resolved', label: 'resolved.js', type: 'backend', path: 'src/resolved.js' },
      ],
      edges: [
        {
          id: 'edge-1',
          source_id: 'node-possible',
          target_id: 'start-1',
          relation: 'calls',
          status: 'possible',
        },
        {
          id: 'edge-2',
          source_id: 'node-resolved',
          target_id: 'start-1',
          relation: 'imports',
          status: 'resolved',
        },
        {
          id: 'edge-unresolved',
          source_id: 'start-1',
          target_id: 'start-1',
          relation: 'imports',
          status: 'unresolved',
        },
      ],
    };

    const impact = computeImpact(graph, 'start-1');

    expect(impact.affected.length).toBe(2);
    const possibleItem = impact.affected.find((a) => a.id === 'node-possible');
    const resolvedItem = impact.affected.find((a) => a.id === 'node-resolved');

    expect(possibleItem).toBeDefined();
    expect(possibleItem!.certainty).toBe('possible');

    expect(resolvedItem).toBeDefined();
    expect(resolvedItem!.certainty).toBe('proven');

    expect(impact.unresolved_nearby).toBe(1);
    expect(impact.notes.some((n) => n.includes('unresolved reference(s)'))).toBe(true);
  });

  it('7. hand-made graph: depth limit cuts long chain and maxNodes sets truncated true', () => {
    const nodes = [
      { id: 'chain-0', label: '0.js', type: 'backend', path: 'src/0.js' },
      { id: 'chain-1', label: '1.js', type: 'backend', path: 'src/1.js' },
      { id: 'chain-2', label: '2.js', type: 'backend', path: 'src/2.js' },
      { id: 'chain-3', label: '3.js', type: 'backend', path: 'src/3.js' },
      { id: 'chain-4', label: '4.js', type: 'backend', path: 'src/4.js' },
    ];

    const edges = [
      { id: 'e1', source_id: 'chain-1', target_id: 'chain-0', relation: 'imports', status: 'resolved' },
      { id: 'e2', source_id: 'chain-2', target_id: 'chain-1', relation: 'imports', status: 'resolved' },
      { id: 'e3', source_id: 'chain-3', target_id: 'chain-2', relation: 'imports', status: 'resolved' },
      { id: 'e4', source_id: 'chain-4', target_id: 'chain-3', relation: 'imports', status: 'resolved' },
    ];

    // Depth = 2 cuts chain-3 and chain-4
    const depthImpact = computeImpact({ nodes, edges }, 'chain-0', { depth: 2 });
    expect(depthImpact.affected.length).toBe(2);
    expect(depthImpact.affected.map((a) => a.id)).toEqual(['chain-1', 'chain-2']);

    // maxNodes = 1 sets truncated: true
    const truncImpact = computeImpact({ nodes, edges }, 'chain-0', { maxNodes: 1 });
    expect(truncImpact.affected.length).toBe(1);
    expect(truncImpact.truncated).toBe(true);
    expect(truncImpact.notes.some((n) => n.includes('truncated'))).toBe(true);
  });

  it('8. synthetic graph of 5000 nodes finishes in under 2 seconds', () => {
    const nodeCount = 5000;
    const syntheticNodes: any[] = [{ id: 'root', label: 'root.js', type: 'backend', path: 'src/root.js' }];
    const syntheticEdges: any[] = [];

    // Half star, half chain
    for (let i = 1; i < nodeCount; i++) {
      syntheticNodes.push({ id: `n-${i}`, label: `${i}.js`, type: i % 2 === 0 ? 'backend' : 'frontend', path: `src/${i}.js` });
      if (i < 2500) {
        syntheticEdges.push({ id: `e-${i}`, source_id: `n-${i}`, target_id: 'root', relation: 'imports', status: 'resolved' });
      } else {
        syntheticEdges.push({ id: `e-${i}`, source_id: `n-${i}`, target_id: `n-${i - 1}`, relation: 'imports', status: 'resolved' });
      }
    }

    const t0 = performance.now();
    const res = computeImpact({ nodes: syntheticNodes, edges: syntheticEdges }, 'root', { maxNodes: 500 });
    const elapsed = performance.now() - t0;

    console.log(`[Performance Note] Synthetic 5000-node graph traversal completed in ${elapsed.toFixed(2)} ms`);
    expect(elapsed).toBeLessThan(2000); // Generous bound, not a benchmark
    expect(res.affected.length).toBe(500);
    expect(res.truncated).toBe(true);
  });

  it('9. error responses: module node 400, unknown node 404, foreign project node 404, never-scanned 409, bad query 400', async () => {
    const { projectId } = await uploadAndScanFixture();

    const nodes = db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(projectId) as any[];
    const moduleNode = nodes.find((n) => n.type === 'module');
    expect(moduleNode).toBeDefined();

    // Module node -> 400 IMPACT_NODE_UNSUPPORTED
    const modRes = await request(app).get(`/api/projects/${projectId}/impact?node=${moduleNode.id}`);
    expect(modRes.status).toBe(400);
    expect(modRes.body.error).toContain('IMPACT_NODE_UNSUPPORTED');

    // Unknown node -> 404
    const unknownNodeId = crypto.randomUUID();
    const unknownNodeRes = await request(app).get(`/api/projects/${projectId}/impact?node=${unknownNodeId}`);
    expect(unknownNodeRes.status).toBe(404);

    // Unknown project -> 404
    const unknownProjId = crypto.randomUUID();
    const unknownProjRes = await request(app).get(`/api/projects/${unknownProjId}/impact?node=${nodes[0].id}`);
    expect(unknownProjRes.status).toBe(404);

    // Foreign project node -> 404
    const foreignZipPath = path.join(TEST_DIR, 'foreign.zip');
    await buildDemoErpZip(foreignZipPath);
    const foreignUpload = await request(app).post('/api/projects').attach('file', foreignZipPath);
    const foreignProjectId = foreignUpload.body.data.id;
    await request(app).post(`/api/projects/${foreignProjectId}/scan`);

    const foreignNodeRes = await request(app).get(`/api/projects/${projectId}/impact?node=${moduleNode.id}`);
    expect(foreignNodeRes.status).toBe(400); // module node check

    const foreignFileNode = db.prepare('SELECT * FROM nodes WHERE project_id = ? AND type != ?').get(foreignProjectId, 'module') as any;
    const foreignMismatchRes = await request(app).get(`/api/projects/${projectId}/impact?node=${foreignFileNode.id}`);
    expect(foreignMismatchRes.status).toBe(404);

    // Never-scanned project -> 409 SCAN_REQUIRED
    const unscannedUpload = await request(app).post('/api/projects').attach('file', foreignZipPath);
    const unscannedProjId = unscannedUpload.body.data.id;
    const neverScannedRes = await request(app).get(`/api/projects/${unscannedProjId}/impact?node=${unknownNodeId}`);
    expect(neverScannedRes.status).toBe(409);
    expect(neverScannedRes.body.error).toContain('SCAN_REQUIRED');

    // Bad query: non-uuid node
    const badQueryRes1 = await request(app).get(`/api/projects/${projectId}/impact?node=not-a-uuid`);
    expect(badQueryRes1.status).toBe(400);

    // Bad query: depth > 10
    const badQueryRes2 = await request(app).get(`/api/projects/${projectId}/impact?node=${nodes[0].id}&depth=15`);
    expect(badQueryRes2.status).toBe(400);
  });

  it('10. response contains zero file contents and zero environment values', async () => {
    const { projectId } = await uploadAndScanFixture();

    const nodes = db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(projectId) as any[];
    const noticeNode = nodes.find((n) => n.label === 'notices.js');
    expect(noticeNode).toBeDefined();

    const res = await request(app).get(`/api/projects/${projectId}/impact?node=${noticeNode.id}`);
    expect(res.status).toBe(200);

    const bodyStr = JSON.stringify(res.body);
    // Must never leak env values or file content
    expect(bodyStr).not.toContain('supersecretjwtvalue');
    expect(bodyStr).not.toContain('file_content');
    expect(bodyStr).not.toContain('raw_code');
  });
});
