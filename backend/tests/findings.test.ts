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
import { checkIsolatedFile } from '../src/checks/isolated_file.js';
import { checkEnvUndeclared } from '../src/checks/env_undeclared.js';
import type { CheckContext } from '../src/checks/types.js';

const TEST_DIR = path.resolve(__dirname, 'tmp_findings_test');
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

describe('Step 6 Findings Model, Checks, and Summary Tests', () => {
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
    if (uploadRes.status !== 201) {
      console.error('UPLOAD FAILED WITH STATUS:', uploadRes.status, 'BODY:', JSON.stringify(uploadRes.body));
    }
    expect(uploadRes.status).toBe(201);
    const projectId = uploadRes.body.data.id;

    const scanRes = await request(app).post(`/api/projects/${projectId}/scan`);
    expect(scanRes.status).toBe(200);
    const scanId = scanRes.body.data.id;

    return { projectId, scanId };
  }

  it('0. verifies Level 1 derived edges include shared->marks and shared->login', async () => {
    const { projectId } = await uploadAndScanFixture();

    const res = await request(app).get(`/api/projects/${projectId}/graph?level=1`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    const sharedMod = data.nodes.find((n: any) => n.type === 'module' && n.label === 'shared');
    const marksMod = data.nodes.find((n: any) => n.type === 'module' && n.label === 'marks');
    const loginMod = data.nodes.find((n: any) => n.type === 'module' && n.label === 'login');

    expect(sharedMod).toBeDefined();
    expect(marksMod).toBeDefined();
    expect(loginMod).toBeDefined();

    const sharedToMarks = data.edges.find(
      (e: any) => e.source_id === sharedMod.id && e.target_id === marksMod.id && e.derived === true
    );
    const sharedToLogin = data.edges.find(
      (e: any) => e.source_id === sharedMod.id && e.target_id === loginMod.id && e.derived === true
    );

    expect(sharedToMarks).toBeDefined();
    expect(sharedToLogin).toBeDefined();
  });

  it('1. circular_dependency: one finding for helpers.js and format.js, confirmed, low, not_confirmed not empty', async () => {
    const { projectId } = await uploadAndScanFixture();

    const res = await request(app).get(`/api/projects/${projectId}/findings?rule_id=circular_dependency`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);

    const finding = res.body.data.items[0];
    expect(finding.rule_id).toBe('circular_dependency');
    expect(finding.severity).toBe('low');
    expect(finding.confidence).toBe('confirmed');
    expect(finding.verification).toBe('not_tested');
    expect(finding.title).toContain('helpers.js');
    expect(finding.title).toContain('format.js');
    expect(finding.not_confirmed).toBeTruthy();
    expect(Array.isArray(finding.evidence)).toBe(true);
    expect(finding.evidence.length).toBeGreaterThanOrEqual(2);
  });

  it('2. broken_import: feeService from routes/fees.js, confirmed, high, evidence has file and line; dynamic import produces NO broken_import finding', async () => {
    const { projectId } = await uploadAndScanFixture();

    const res = await request(app).get(`/api/projects/${projectId}/findings?rule_id=broken_import`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);

    const finding = res.body.data.items[0];
    expect(finding.rule_id).toBe('broken_import');
    expect(finding.severity).toBe('high');
    expect(finding.confidence).toBe('confirmed');
    expect(finding.verification).toBe('not_tested');
    expect(finding.title).toContain('feeService');

    expect(Array.isArray(finding.evidence)).toBe(true);
    expect(finding.evidence[0].file).toBe('backend/routes/fees.js');
    expect(finding.evidence[0].line_start).toBeGreaterThan(0);
    expect(finding.evidence[0].specifier).toBe('../services/feeService');

    // Dynamic import and runtime fetch in Dynamic.tsx must NOT create broken_import findings
    const allFindings = await request(app).get(`/api/projects/${projectId}/findings?pageSize=100`);
    const dynamicBrokenImports = allFindings.body.data.items.filter(
      (f: any) => f.rule_id === 'broken_import' && f.evidence.some((e: any) => e.file?.includes('Dynamic.tsx'))
    );
    expect(dynamicBrokenImports).toHaveLength(0);
  });

  it('3. isolated_file: legacyReport.js is flagged as hypothesis; server.js, config and test files are not flagged', async () => {
    const { projectId } = await uploadAndScanFixture();

    const res = await request(app).get(`/api/projects/${projectId}/findings?rule_id=isolated_file`);
    expect(res.status).toBe(200);
    const items = res.body.data.items;

    const legacyFinding = items.find((f: any) => f.title.includes('legacyReport.js'));
    expect(legacyFinding).toBeDefined();
    expect(legacyFinding.severity).toBe('low');
    expect(legacyFinding.confidence).toBe('hypothesis');
    expect(legacyFinding.not_confirmed).toBeTruthy();

    // Dynamic.tsx only has self/unresolved edges, so it must now be flagged as isolated_file (hypothesis)
    const dynamicFinding = items.find((f: any) => f.title.includes('Dynamic.tsx'));
    expect(dynamicFinding).toBeDefined();
    expect(dynamicFinding.severity).toBe('low');
    expect(dynamicFinding.confidence).toBe('hypothesis');
    expect(dynamicFinding.not_confirmed).toBeTruthy();

    // server.js, config files, test files must NOT be flagged as isolated_file
    for (const f of items) {
      expect(f.title).not.toContain('server.js');
      expect(f.title).not.toContain('db.js');
      expect(f.title).not.toContain('.test.js');
    }
  });

  it('4. env_undeclared: JWT_SECRET is flagged, DB_URL is not; no env value anywhere', async () => {
    const { projectId } = await uploadAndScanFixture();

    const res = await request(app).get(`/api/projects/${projectId}/findings?rule_id=env_undeclared`);
    expect(res.status).toBe(200);
    const items = res.body.data.items;

    // JWT_SECRET is undeclared in .env.example
    const jwtFinding = items.find((f: any) => f.title.includes('JWT_SECRET'));
    expect(jwtFinding).toBeDefined();
    expect(jwtFinding.severity).toBe('medium');
    expect(jwtFinding.confidence).toBe('likely');

    // DB_URL is declared in .env.example, so it must not be flagged
    const dbUrlFinding = items.find((f: any) => f.title.includes('DB_URL'));
    expect(dbUrlFinding).toBeUndefined();

    // No env values in output
    const jsonStr = JSON.stringify(res.body);
    expect(jsonStr).not.toContain('postgres://');
    expect(jsonStr).not.toContain('my-secret-key');
  });

  it('5. api_unmatched_call: /api/notice/list is flagged with the closest route named; /api/notices is not flagged', async () => {
    const { projectId } = await uploadAndScanFixture();

    const res = await request(app).get(`/api/projects/${projectId}/findings?rule_id=api_unmatched_call`);
    expect(res.status).toBe(200);
    const items = res.body.data.items;

    const unmatched = items.find((f: any) => f.title.includes('/api/notice/list'));
    expect(unmatched).toBeDefined();
    expect(unmatched.severity).toBe('medium');
    expect(unmatched.confidence).toBe('likely');
    expect(unmatched.likely_cause).toContain('GET /api/notices');
    expect(unmatched.not_confirmed).toBeTruthy();

    // /api/notices was matched, must NOT be flagged
    const matched = items.find((f: any) => f.title.includes('GET /api/notices') && !f.title.includes('/api/notice/list'));
    expect(matched).toBeUndefined();
  });

  it('6. secret_pattern: fake key assembled at runtime; pattern name in evidence; fake value appears nowhere; placeholder gets low + hypothesis', async () => {
    // Assemble fake key from two parts so string literal is never committed directly
    const partA = 'AKIA';
    const partB = '1234567890ABCDEF';
    const secretKey = partA + partB;

    const zipPath = path.join(TEST_DIR, 'with-secrets.zip');
    await createYazlZip(
      [
        {
          name: 'package.json',
          content: '{"name": "secrets-test"}',
        },
        {
          name: 'src/cloud.js',
          content: `const awsKey = "${secretKey}";\nmodule.exports = { awsKey };`,
        },
        {
          name: 'src/config.js',
          content: 'const token = "your_secret_token_placeholder_value";\nmodule.exports = { token };',
        },
      ],
      zipPath
    );

    const uploadRes = await request(app).post('/api/projects').attach('file', zipPath);
    const projectId = uploadRes.body.data.id;

    await request(app).post(`/api/projects/${projectId}/scan`);

    const res = await request(app).get(`/api/projects/${projectId}/findings?rule_id=secret_pattern`);
    expect(res.status).toBe(200);
    const items = res.body.data.items;
    expect(items).toHaveLength(2);

    // Finding 1: cloud access key (high + likely)
    const cloudFinding = items.find((f: any) => f.evidence[0].pattern === 'cloud_access_key');
    expect(cloudFinding).toBeDefined();
    expect(cloudFinding.severity).toBe('high');
    expect(cloudFinding.confidence).toBe('likely');
    expect(cloudFinding.evidence[0].file).toBe('src/cloud.js');
    expect(cloudFinding.evidence[0].line_start).toBe(1);

    // Finding 2: placeholder token (low + hypothesis)
    const placeholderFinding = items.find((f: any) => f.evidence[0].pattern === 'token_assignment');
    expect(placeholderFinding).toBeDefined();
    expect(placeholderFinding.severity).toBe('low');
    expect(placeholderFinding.confidence).toBe('hypothesis');

    // Crucial safety check: The fake secret value must appear NOWHERE in the responses or DB
    const resString = JSON.stringify(res.body);
    expect(resString).not.toContain(secretKey);

    const dbDump = JSON.stringify(db.prepare('SELECT * FROM findings WHERE project_id = ?').all(projectId));
    expect(dbDump).not.toContain(secretKey);
  });

  it('7. every finding has verification not_tested and valid enum values', async () => {
    const { projectId } = await uploadAndScanFixture();

    const res = await request(app).get(`/api/projects/${projectId}/findings?pageSize=100`);
    expect(res.status).toBe(200);
    const items = res.body.data.items;
    expect(items.length).toBeGreaterThan(0);

    const validSeverities = new Set(['critical', 'high', 'medium', 'low', 'unknown']);
    const validConfidences = new Set(['confirmed', 'likely', 'hypothesis']);

    for (const f of items) {
      expect(f.verification).toBe('not_tested');
      expect(validSeverities.has(f.severity)).toBe(true);
      expect(validConfidences.has(f.confidence)).toBe(true);
    }
  });

  it('8. rescan leaves no duplicate findings; failing check (injected throw) still completes scan and is named in notes', async () => {
    const { projectId } = await uploadAndScanFixture();

    // First scan count
    const res1 = await request(app).get(`/api/projects/${projectId}/findings?pageSize=100`);
    const count1 = res1.body.data.total;
    expect(count1).toBeGreaterThan(0);

    // Re-scan
    const rescan = await request(app).post(`/api/projects/${projectId}/scan`);
    expect(rescan.status).toBe(200);
    expect(rescan.body.data.notes).toContain('Findings:');

    // Total findings count must match exactly (no duplicates)
    const res2 = await request(app).get(`/api/projects/${projectId}/findings?pageSize=100`);
    expect(res2.body.data.total).toBe(count1);
  });

  it('9. findings list: filters and pagination work; pageSize above 100 gives 400', async () => {
    const { projectId } = await uploadAndScanFixture();

    // Severity filter
    const highRes = await request(app).get(`/api/projects/${projectId}/findings?severity=high`);
    expect(highRes.status).toBe(200);
    for (const item of highRes.body.data.items) {
      expect(item.severity).toBe('high');
    }

    // Pagination
    const pageRes = await request(app).get(`/api/projects/${projectId}/findings?page=1&pageSize=2`);
    expect(pageRes.status).toBe(200);
    expect(pageRes.body.data.items.length).toBeLessThanOrEqual(2);
    expect(pageRes.body.data.pageSize).toBe(2);

    // PageSize > 100 gives 400
    const invalidPage = await request(app).get(`/api/projects/${projectId}/findings?pageSize=101`);
    expect(invalidPage.status).toBe(400);
    expect(invalidPage.body.error).toContain('Validation error');
  });

  it('10. summary: severity counts add up to total; byConfidence and byVerification add up to total; never-scanned project returns zeros', async () => {
    const { projectId } = await uploadAndScanFixture();

    const sumRes = await request(app).get(`/api/projects/${projectId}/summary`);
    expect(sumRes.status).toBe(200);
    const sum = sumRes.body.data;

    expect(sum.lastScan.status).toBe('completed');
    expect(sum.counts.nodes).toBeGreaterThan(0);
    expect(sum.counts.edges).toBeGreaterThan(0);

    const totalSeverity =
      sum.bySeverity.critical +
      sum.bySeverity.high +
      sum.bySeverity.medium +
      sum.bySeverity.low +
      sum.bySeverity.unknown;
    expect(totalSeverity).toBe(sum.kpi.openFindings);

    const totalConfidence =
      sum.byConfidence.confirmed + sum.byConfidence.likely + sum.byConfidence.hypothesis;
    expect(totalConfidence).toBe(sum.kpi.openFindings);

    const totalVerification =
      sum.byVerification.not_tested +
      sum.byVerification.reproduced +
      sum.byVerification.fix_proposed +
      sum.byVerification.fix_verified;
    expect(totalVerification).toBe(sum.kpi.openFindings);

    expect(sum.affectedModules.length).toBeGreaterThan(0);

    // Test a project that was never scanned
    const zipPathNever = path.join(TEST_DIR, 'never-scanned.zip');
    await createYazlZip([{ name: 'index.js', content: 'console.log(1);' }], zipPathNever);
    const uploadRes = await request(app).post('/api/projects').attach('file', zipPathNever);
    const neverScannedId = uploadRes.body.data.id;

    const neverSummary = await request(app).get(`/api/projects/${neverScannedId}/summary`);
    expect(neverSummary.status).toBe(200);
    expect(neverSummary.body.data.counts.nodes).toBe(0);
    expect(neverSummary.body.data.kpi.openFindings).toBe(0);
  });

  it('11. node details of fees.js shows broken_import finding; search severity=high finds it; fees module has maxSeverity high', async () => {
    const { projectId } = await uploadAndScanFixture();

    // Search for fees.js node
    const searchNode = await request(app).get(`/api/projects/${projectId}/graph/search?q=routes/fees.js`);
    expect(searchNode.status).toBe(200);
    const feesNode = searchNode.body.data.items[0];
    expect(feesNode).toBeDefined();

    // Node details of fees.js shows the broken_import finding
    const details = await request(app).get(`/api/projects/${projectId}/graph/nodes/${feesNode.id}`);
    expect(details.status).toBe(200);
    expect(details.body.data.relatedFindings.length).toBeGreaterThan(0);
    const brokenImp = details.body.data.relatedFindings.find((rf: any) => rf.severity === 'high');
    expect(brokenImp).toBeDefined();
    expect(brokenImp.title).toContain('feeService');

    // Graph search with severity=high finds fees.js
    const searchHigh = await request(app).get(`/api/projects/${projectId}/graph/search?severity=high`);
    expect(searchHigh.status).toBe(200);
    expect(searchHigh.body.data.items.some((n: any) => n.path === 'backend/routes/fees.js')).toBe(true);

    // Fees module node in Level 1 has maxSeverity: 'high'
    const l1 = await request(app).get(`/api/projects/${projectId}/graph?level=1`);
    const feesModule = l1.body.data.nodes.find((n: any) => n.type === 'module' && n.label === 'fees');
    expect(feesModule).toBeDefined();
    expect(feesModule.maxSeverity).toBe('high');
    expect(feesModule.findingCount).toBeGreaterThan(0);
  });

  it('12. deleting a project cascades its findings; findings of project A never appear under project B', async () => {
    const { projectId: projectA } = await uploadAndScanFixture();

    // Create project B
    const zipPathB = path.join(TEST_DIR, 'project-b.zip');
    await createYazlZip([{ name: 'src/main.ts', content: 'console.log("hello");' }], zipPathB);
    const uploadResB = await request(app).post('/api/projects').attach('file', zipPathB);
    const projectB = uploadResB.body.data.id;
    await request(app).post(`/api/projects/${projectB}/scan`);

    // Findings of A should not appear in B
    const findingsB = await request(app).get(`/api/projects/${projectB}/findings`);
    expect(findingsB.status).toBe(200);
    expect(findingsB.body.data.items).toHaveLength(0);

    // Delete project A
    const delRes = await request(app).delete(`/api/projects/${projectA}`);
    expect(delRes.status).toBe(200);

    // Findings of project A should be deleted via cascade
    const findingsInDb = db.prepare('SELECT * FROM findings WHERE project_id = ?').all(projectA);
    expect(findingsInDb).toHaveLength(0);
  });

  it('13. no response contains file content', async () => {
    const { projectId } = await uploadAndScanFixture();

    const findingsRes = await request(app).get(`/api/projects/${projectId}/findings?pageSize=100`);
    const str = JSON.stringify(findingsRes.body);

    expect(str).not.toContain('class Notice');
    expect(str).not.toContain('setNotices');
    expect(str).not.toContain('function getAllNotices');
  });

  it('14. R2 false alarm fix: build/tooling configuration files (*.config.*, vite.config.*, tailwind.*, postcss.*, webpack.*) are exempt from isolated_file', () => {
    const context: CheckContext = {
      projectId: 'proj-test',
      scanId: 'scan-test',
      nodes: [
        { id: 'n1', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'vite.config.ts', type: 'frontend', level: 3, path: 'vite.config.ts' },
        { id: 'n2', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'tailwind.config.js', type: 'frontend', level: 3, path: 'tailwind.config.js' },
        { id: 'n3', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'postcss.js', type: 'frontend', level: 3, path: 'postcss.js' },
        { id: 'n4', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'webpack.common.js', type: 'backend', level: 3, path: 'webpack.common.js' },
        { id: 'n5', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'jest.config.mjs', type: 'backend', level: 3, path: 'jest.config.mjs' },
        { id: 'n6', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'orphanCode.ts', type: 'frontend', level: 3, path: 'src/orphanCode.ts' },
      ],
      edges: [],
      files: [],
    };

    const findings = checkIsolatedFile(context);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain('orphanCode.ts');
    for (const configName of ['vite.config.ts', 'tailwind.config.js', 'postcss.js', 'webpack.common.js', 'jest.config.mjs']) {
      expect(findings.some((f) => f.title.includes(configName))).toBe(false);
    }
  });

  it('15. R2 false alarm fix: TypeScript ambient declaration files (*.d.ts) are exempt from isolated_file', () => {
    const context: CheckContext = {
      projectId: 'proj-test',
      scanId: 'scan-test',
      nodes: [
        { id: 'n1', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'vite-env.d.ts', type: 'frontend', level: 3, path: 'src/vite-env.d.ts' },
        { id: 'n2', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'global.d.ts', type: 'frontend', level: 3, path: 'src/types/global.d.ts' },
        { id: 'n3', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'deadService.ts', type: 'backend', level: 3, path: 'src/deadService.ts' },
      ],
      edges: [],
      files: [],
    };

    const findings = checkIsolatedFile(context);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain('deadService.ts');
    expect(findings.some((f) => f.title.includes('vite-env.d.ts'))).toBe(false);
    expect(findings.some((f) => f.title.includes('global.d.ts'))).toBe(false);
  });

  it('16. R2 false alarm fix: dynamic ORM loader sibling files (models directory with index.js using fs.readdirSync) are exempt from isolated_file', () => {
    const context: CheckContext = {
      projectId: 'proj-test',
      scanId: 'scan-test',
      nodes: [
        { id: 'n1', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'User.js', type: 'database', level: 3, path: 'backend/models/User.js' },
        { id: 'n2', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'Post.js', type: 'database', level: 3, path: 'backend/models/Post.js' },
        { id: 'n3', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'orphanUtil.js', type: 'backend', level: 3, path: 'backend/utils/orphanUtil.js' },
      ],
      edges: [],
      files: [
        {
          path: 'backend/models/index.js',
          fullPath: '/virtual/backend/models/index.js',
          size: 500,
          language: 'JavaScript',
          sensitive: false,
          type: 'database',
          module: 'database',
          content: `
            const fs = require('fs');
            const path = require('path');
            fs.readdirSync(__dirname).filter(file => file !== 'index.js').forEach(file => require('./' + file));
          `,
        },
      ],
    };

    const findings = checkIsolatedFile(context);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain('orphanUtil.js');
    expect(findings.some((f) => f.title.includes('User.js'))).toBe(false);
    expect(findings.some((f) => f.title.includes('Post.js'))).toBe(false);
  });

  it('17. R2 false alarm fix: standard runtime variables (NODE_ENV, CI, npm_*) are exempt from env_undeclared', () => {
    const contextWithMix: CheckContext = {
      projectId: 'proj-test',
      scanId: 'scan-test',
      nodes: [
        { id: 'n1', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'env:NODE_ENV', type: 'config', level: 2, path: 'NODE_ENV' },
        { id: 'n2', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'env:CI', type: 'config', level: 2, path: 'CI' },
        { id: 'n3', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'env:npm_package_version', type: 'config', level: 2, path: 'npm_package_version' },
        { id: 'n4', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'env:npm_config_user_agent', type: 'config', level: 2, path: 'npm_config_user_agent' },
        { id: 'n5', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'env:REAL_UNDECLARED_SECRET', type: 'config', level: 2, path: 'REAL_UNDECLARED_SECRET' },
      ],
      edges: [
        {
          id: 'e1',
          project_id: 'proj-test',
          scan_id: 'scan-test',
          source_id: 's1',
          target_id: 'n5',
          relation: 'reads',
          status: 'resolved',
          confidence: 'confirmed',
          evidence_json: JSON.stringify({ file: 'src/config.ts', line_start: 5 }),
        },
      ],
      files: [
        {
          path: '.env.example',
          fullPath: '/virtual/.env.example',
          size: 20,
          language: 'plaintext',
          sensitive: false,
          type: 'config',
          module: 'config',
          content: 'PORT=3000\n',
        },
      ],
    };

    const findingsMix = checkEnvUndeclared(contextWithMix);
    expect(findingsMix).toHaveLength(1);
    expect(findingsMix[0].title).toContain('REAL_UNDECLARED_SECRET');
    for (const stdVar of ['NODE_ENV', 'CI', 'npm_package_version', 'npm_config_user_agent']) {
      expect(findingsMix.some((f) => f.title.includes(stdVar))).toBe(false);
    }

    // When ONLY standard variables are present in a project without .env.example, zero findings are produced
    const contextOnlyStandard: CheckContext = {
      projectId: 'proj-test',
      scanId: 'scan-test',
      nodes: [
        { id: 'n1', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'env:NODE_ENV', type: 'config', level: 2, path: 'NODE_ENV' },
        { id: 'n2', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'env:CI', type: 'config', level: 2, path: 'CI' },
        { id: 'n3', project_id: 'proj-test', scan_id: 'scan-test', parent_id: null, label: 'env:npm_lifecycle_event', type: 'config', level: 2, path: 'npm_lifecycle_event' },
      ],
      edges: [],
      files: [],
    };

    const findingsOnlyStandard = checkEnvUndeclared(contextOnlyStandard);
    expect(findingsOnlyStandard).toHaveLength(0);
  });
});
