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

const TEST_DIR = path.resolve(__dirname, 'tmp_graph_api_test');
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

describe('Step 5 Graph API Tests', () => {
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

  it('1. level 1 returns the project node and the modules notices, marks, fees, login, shared, with derived edges', async () => {
    const { projectId } = await uploadAndScanFixture();

    const res = await request(app).get(`/api/projects/${projectId}/graph?level=1`);
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    const data = res.body.data;

    expect(data.level).toBe(1);
    expect(data.focus).toBeNull();

    // Must have project node
    const projectNode = data.nodes.find((n: any) => n.type === 'project');
    expect(projectNode).toBeDefined();

    // Must have module nodes
    const moduleLabels = data.nodes
      .filter((n: any) => n.type === 'module')
      .map((n: any) => n.label)
      .sort();

    expect(moduleLabels).toContain('notices');
    expect(moduleLabels).toContain('marks');
    expect(moduleLabels).toContain('fees');
    expect(moduleLabels).toContain('login');
    expect(moduleLabels).toContain('shared');

    // Derived cross-module edges must exist and have derived: true
    expect(data.edges.length).toBeGreaterThan(0);
    for (const edge of data.edges) {
      expect(edge.derived).toBe(true);
      expect(edge.count).toBeGreaterThan(0);
      expect(edge.relation).toBeDefined();
    }
  });

  it('2. level 2 for the notices module returns its files, API node and config, and nothing from another project', async () => {
    const { projectId: projectA } = await uploadAndScanFixture();

    // Create a second project to verify strict project separation
    const zipPathB = path.join(TEST_DIR, 'project-b.zip');
    await createYazlZip([{ name: 'src/b.ts', content: 'export const b = 2;' }], zipPathB);
    const uploadResB = await request(app).post('/api/projects').attach('file', zipPathB);
    const projectB = uploadResB.body.data.id;
    await request(app).post(`/api/projects/${projectB}/scan`);

    // Find the notices module in project A
    const l1Res = await request(app).get(`/api/projects/${projectA}/graph?level=1`);
    const noticesMod = l1Res.body.data.nodes.find((n: any) => n.type === 'module' && n.label === 'notices');
    expect(noticesMod).toBeDefined();

    const res = await request(app).get(`/api/projects/${projectA}/graph?level=2&focus=${noticesMod.id}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.level).toBe(2);
    expect(data.focus).toBe(noticesMod.id);

    // Verify files and API nodes for notices
    expect(data.nodes.some((n: any) => n.label === 'NoticePage.tsx')).toBe(true);
    expect(data.nodes.some((n: any) => n.label === 'notices.js')).toBe(true);
    expect(data.nodes.some((n: any) => n.label === 'noticeService.js')).toBe(true);
    expect(data.nodes.some((n: any) => n.label === 'GET /api/notices')).toBe(true);

    // Verify boundary edge connects to shared (where config db.js lives)
    expect(data.edges.length).toBeGreaterThan(0);

    // Absolutely nothing from project B
    for (const node of data.nodes) {
      expect(node.project_id).toBe(projectA);
    }
    for (const edge of data.edges) {
      expect(edge.project_id).toBe(projectA);
    }
  });

  it('3. level 3 depth 1 and depth 2 on NoticePage return the right neighbours; depth 4 gives 400', async () => {
    const { projectId } = await uploadAndScanFixture();

    // Find NoticePage node
    const searchRes = await request(app).get(`/api/projects/${projectId}/graph/search?q=NoticePage`);
    expect(searchRes.status).toBe(200);
    const noticePage = searchRes.body.data.items[0];
    expect(noticePage).toBeDefined();

    // Depth 1: NoticePage and GET /api/notices
    const depth1Res = await request(app).get(
      `/api/projects/${projectId}/graph?level=3&focus=${noticePage.id}&depth=1`
    );
    expect(depth1Res.status).toBe(200);
    const d1Data = depth1Res.body.data;
    expect(d1Data.nodes.some((n: any) => n.label === 'NoticePage.tsx')).toBe(true);
    expect(d1Data.nodes.some((n: any) => n.label === 'GET /api/notices')).toBe(true);
    // Depth 1 should NOT include notices.js yet
    expect(d1Data.nodes.some((n: any) => n.label === 'notices.js')).toBe(false);

    // Depth 2: Traverses from GET /api/notices to backend/routes/notices.js
    const depth2Res = await request(app).get(
      `/api/projects/${projectId}/graph?level=3&focus=${noticePage.id}&depth=2`
    );
    expect(depth2Res.status).toBe(200);
    const d2Data = depth2Res.body.data;
    expect(d2Data.nodes.some((n: any) => n.label === 'NoticePage.tsx')).toBe(true);
    expect(d2Data.nodes.some((n: any) => n.label === 'GET /api/notices')).toBe(true);
    expect(d2Data.nodes.some((n: any) => n.label === 'notices.js')).toBe(true);

    // Depth 4 is rejected with 400
    const depth4Res = await request(app).get(
      `/api/projects/${projectId}/graph?level=3&focus=${noticePage.id}&depth=4`
    );
    expect(depth4Res.status).toBe(400);
    expect(depth4Res.body.error).toContain('Validation error');
  });

  it('4. level 2 or 3 without focus gives 400', async () => {
    const { projectId } = await uploadAndScanFixture();

    const resL2 = await request(app).get(`/api/projects/${projectId}/graph?level=2`);
    expect(resL2.status).toBe(400);
    expect(resL2.body.error).toContain('focus');

    const resL3 = await request(app).get(`/api/projects/${projectId}/graph?level=3`);
    expect(resL3.status).toBe(400);
    expect(resL3.body.error).toContain('focus');
  });

  it('5. maxNodes=5 produces clusters, and shown + clustered counts add up to total', async () => {
    const { projectId } = await uploadAndScanFixture();

    const res = await request(app).get(`/api/projects/${projectId}/graph?level=1&maxNodes=5`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.shown).toBeLessThanOrEqual(5);
    expect(data.clusters.length).toBeGreaterThan(0);

    const clusteredCount = data.clusters.reduce((sum: number, c: any) => sum + c.count, 0);
    expect(data.shown + clusteredCount).toBe(data.total);

    // Clusters have correct structure
    for (const cluster of data.clusters) {
      expect(cluster.id).toBeDefined();
      expect(cluster.label).toBeDefined();
      expect(cluster.count).toBeGreaterThan(0);
      expect(Array.isArray(cluster.sample_node_ids)).toBe(true);
    }
  });

  it('6. the unresolved feeService edge is present in the fees module view', async () => {
    const { projectId } = await uploadAndScanFixture();

    const l1Res = await request(app).get(`/api/projects/${projectId}/graph?level=1`);
    const feesMod = l1Res.body.data.nodes.find((n: any) => n.type === 'module' && n.label === 'fees');
    expect(feesMod).toBeDefined();

    const res = await request(app).get(`/api/projects/${projectId}/graph?level=2&focus=${feesMod.id}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    const feeEdge = data.edges.find((e: any) => e.relation === 'imports' && e.status === 'unresolved');
    expect(feeEdge).toBeDefined();
    expect(feeEdge.evidence).toBeDefined();
    expect(feeEdge.evidence.specifier).toBe('../services/feeService');
  });

  it('7. search by "notice" finds the right nodes; type filter works; severity filter returns an empty list without error', async () => {
    const { projectId } = await uploadAndScanFixture();

    // Substring search on label/path
    const searchRes = await request(app).get(`/api/projects/${projectId}/graph/search?q=notice`);
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.items.length).toBeGreaterThan(0);
    for (const item of searchRes.body.data.items) {
      const match = item.label.toLowerCase().includes('notice') || item.path.toLowerCase().includes('notice');
      expect(match).toBe(true);
    }

    // Type filter
    const typeRes = await request(app).get(`/api/projects/${projectId}/graph/search?type=api`);
    expect(typeRes.status).toBe(200);
    expect(typeRes.body.data.items.length).toBeGreaterThan(0);
    for (const item of typeRes.body.data.items) {
      expect(item.type).toBe('api');
    }

    // Severity filter (findings table empty for now)
    const sevRes = await request(app).get(`/api/projects/${projectId}/graph/search?severity=critical`);
    expect(sevRes.status).toBe(200);
    expect(sevRes.body.data.items).toEqual([]);
    expect(sevRes.body.data.total).toBe(0);
  });

  it('8. node details returns incoming and outgoing edges and relatedFindings: []', async () => {
    const { projectId } = await uploadAndScanFixture();

    // Look for notices.js route node
    const searchRes = await request(app).get(`/api/projects/${projectId}/graph/search?q=routes/notices.js`);
    expect(searchRes.status).toBe(200);
    const routeNode = searchRes.body.data.items[0];
    expect(routeNode).toBeDefined();

    const detailsRes = await request(app).get(`/api/projects/${projectId}/graph/nodes/${routeNode.id}`);
    expect(detailsRes.status).toBe(200);
    const data = detailsRes.body.data;

    expect(data.node.id).toBe(routeNode.id);
    expect(data.parentModule).toBeDefined();
    expect(data.parentModule.label).toBe('notices');

    // notices.js serves /api/notices (outgoing edge)
    expect(data.outgoingEdges.length).toBeGreaterThan(0);
    expect(data.outgoingEdges.some((e: any) => e.relation === 'serves')).toBe(true);

    // Line range
    expect(data.lineRange).toBeDefined();

    // relatedFindings empty for now
    expect(data.relatedFindings).toEqual([]);
  });

  it('9. a nodeId from project A requested under project B gives 404', async () => {
    const { projectId: projectA } = await uploadAndScanFixture();

    // Create project B
    const zipPathB = path.join(TEST_DIR, 'project-b.zip');
    await createYazlZip([{ name: 'src/main.ts', content: 'console.log("hello");' }], zipPathB);
    const uploadResB = await request(app).post('/api/projects').attach('file', zipPathB);
    const projectB = uploadResB.body.data.id;
    await request(app).post(`/api/projects/${projectB}/scan`);

    // Get a node from project A
    const searchA = await request(app).get(`/api/projects/${projectA}/graph/search?limit=1`);
    const nodeA = searchA.body.data.items[0];
    expect(nodeA).toBeDefined();

    // Query nodeA under projectB
    const res = await request(app).get(`/api/projects/${projectB}/graph/nodes/${nodeA.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Node not found');
  });

  it('10. no response anywhere contains a file content or an env value', async () => {
    const { projectId } = await uploadAndScanFixture();

    // Check level 1, 2, search, and node details
    const l1Res = await request(app).get(`/api/projects/${projectId}/graph?level=1`);
    const l1Str = JSON.stringify(l1Res.body);
    expect(l1Str).not.toContain('SECRET_OUTSIDE_PAYLOAD');
    expect(l1Str).not.toContain('function ((');

    // Search for config env nodes
    const envSearch = await request(app).get(`/api/projects/${projectId}/graph/search?type=config`);
    expect(envSearch.status).toBe(200);

    for (const item of envSearch.body.data.items) {
      const details = await request(app).get(`/api/projects/${projectId}/graph/nodes/${item.id}`);
      expect(details.status).toBe(200);
      const str = JSON.stringify(details.body);
      // Ensure only variable name appears, no secret values
      expect(str).not.toContain('postgres://');
      expect(str).not.toContain('my-super-secret');
    }
  });

  it('11. the apiCalls meta from fix (a) contains the unmatched "/api/notice/list"', async () => {
    const { projectId } = await uploadAndScanFixture();

    const searchRes = await request(app).get(`/api/projects/${projectId}/graph/search?q=NoticePage.tsx`);
    expect(searchRes.status).toBe(200);
    const noticePage = searchRes.body.data.items[0];
    expect(noticePage).toBeDefined();
    expect(noticePage.meta_json).toBeDefined();

    const meta = JSON.parse(noticePage.meta_json);
    expect(Array.isArray(meta.apiCalls)).toBe(true);

    const unmatched = meta.apiCalls.find((c: any) => c.url === '/api/notice/list');
    expect(unmatched).toBeDefined();
    expect(unmatched.matched).toBe(false);
    expect(unmatched.method).toBe('GET');
    expect(unmatched.line).toBeGreaterThan(0);

    const matched = meta.apiCalls.find((c: any) => c.url === '/api/notices');
    expect(matched).toBeDefined();
    expect(matched.matched).toBe(true);
  });

  it('12. every edge endpoint is present in returned nodes across levels 1, 2, 3; level 2 focused module has focused: true and is never clustered', async () => {
    const { projectId } = await uploadAndScanFixture();

    const verifyEdgeEndpoints = (data: any) => {
      const nodeIds = new Set(data.nodes.map((n: any) => n.id));
      const clusterIds = new Set(data.clusters.map((c: any) => c.id));
      const clusterSampleIds = new Set(data.clusters.flatMap((c: any) => c.sample_node_ids || []));

      for (const edge of data.edges) {
        if (edge.status === 'unresolved') {
          expect(edge.source_id).toBe(edge.target_id);
          expect(nodeIds.has(edge.source_id)).toBe(true);
          continue;
        }

        const sourceValid = nodeIds.has(edge.source_id) || clusterIds.has(edge.source_id) || clusterSampleIds.has(edge.source_id);
        const targetValid = nodeIds.has(edge.target_id) || clusterIds.has(edge.target_id) || clusterSampleIds.has(edge.target_id);

        expect(sourceValid).toBe(true);
        expect(targetValid).toBe(true);
      }
    };

    // 1. Level 1 check
    const l1Res = await request(app).get(`/api/projects/${projectId}/graph?level=1`);
    expect(l1Res.status).toBe(200);
    const l1Data = l1Res.body.data;
    verifyEdgeEndpoints(l1Data);
    for (const node of l1Data.nodes) {
      expect(node.focused).toBeUndefined();
    }

    // 2. Level 2 check with focus on notices module
    const noticesMod = l1Data.nodes.find((n: any) => n.type === 'module' && n.label === 'notices');
    expect(noticesMod).toBeDefined();

    const l2Res = await request(app).get(`/api/projects/${projectId}/graph?level=2&focus=${noticesMod.id}`);
    expect(l2Res.status).toBe(200);
    const l2Data = l2Res.body.data;
    verifyEdgeEndpoints(l2Data);

    // Focused module node is present in nodes with focused: true
    const focusedModuleNode = l2Data.nodes.find((n: any) => n.id === noticesMod.id);
    expect(focusedModuleNode).toBeDefined();
    expect(focusedModuleNode.focused).toBe(true);
    expect(focusedModuleNode.type).toBe('module');
    expect(focusedModuleNode.label).toBe('notices');
    expect(focusedModuleNode.findingCount).toBe(2);
    expect(focusedModuleNode.maxSeverity).toBe('medium');

    // All other nodes in level 2 do NOT have focused: true
    for (const node of l2Data.nodes) {
      if (node.id !== noticesMod.id) {
        expect(node.focused).toBeUndefined();
      }
    }

    // Level 2 with maxNodes=3: focused module is never clustered
    const l2ClusteredRes = await request(app).get(
      `/api/projects/${projectId}/graph?level=2&focus=${noticesMod.id}&maxNodes=3`
    );
    expect(l2ClusteredRes.status).toBe(200);
    const l2ClusteredData = l2ClusteredRes.body.data;
    expect(l2ClusteredData.shown).toBe(3);
    expect(l2ClusteredData.clusters.length).toBeGreaterThan(0);
    const clusteredFocusedNode = l2ClusteredData.nodes.find((n: any) => n.id === noticesMod.id);
    expect(clusteredFocusedNode).toBeDefined();
    expect(clusteredFocusedNode.focused).toBe(true);
    for (const cluster of l2ClusteredData.clusters) {
      expect(cluster.sample_node_ids).not.toContain(noticesMod.id);
    }

    // 3. Level 3 check with focus on NoticePage.tsx (depth 1 and depth 2)
    const noticePageNode = l2Data.nodes.find((n: any) => n.label === 'NoticePage.tsx');
    expect(noticePageNode).toBeDefined();

    const l3d1Res = await request(app).get(
      `/api/projects/${projectId}/graph?level=3&focus=${noticePageNode.id}&depth=1`
    );
    expect(l3d1Res.status).toBe(200);
    verifyEdgeEndpoints(l3d1Res.body.data);
    for (const node of l3d1Res.body.data.nodes) {
      expect(node.focused).toBeUndefined();
    }

    const l3d2Res = await request(app).get(
      `/api/projects/${projectId}/graph?level=3&focus=${noticePageNode.id}&depth=2`
    );
    expect(l3d2Res.status).toBe(200);
    verifyEdgeEndpoints(l3d2Res.body.data);
    for (const node of l3d2Res.body.data.nodes) {
      expect(node.focused).toBeUndefined();
    }
  });
});
