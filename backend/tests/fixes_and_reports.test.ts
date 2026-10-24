import crypto from 'node:crypto';
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

const TEST_DIR = path.resolve(__dirname, 'tmp_fixes_reports_test');
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

function computeDirectoryHash(dir: string): string {
  if (!fs.existsSync(dir)) return '';
  const hash = crypto.createHash('sha256');

  function walk(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        hash.update(path.relative(dir, full).replace(/\\/g, '/'));
        hash.update(fs.readFileSync(full));
      }
    }
  }

  walk(dir);
  return hash.digest('hex');
}

describe('Step 7 Fixes, Tests, Reports and Cleanups', () => {
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

  it('1. languages is an array in list, get and create responses', async () => {
    const zipPath = path.join(TEST_DIR, 'demo-erp.zip');
    await buildDemoErpZip(zipPath);

    // Create (POST /api/projects)
    const createRes = await request(app).post('/api/projects').attach('file', zipPath);
    expect(createRes.status).toBe(201);
    expect(Array.isArray(createRes.body.data.languages)).toBe(true);
    expect(createRes.body.data.languages).toContain('JavaScript');
    expect(createRes.body.data.languages).toContain('TypeScript (TSX)');

    const projectId = createRes.body.data.id;

    // Get (GET /api/projects/:id)
    const getRes = await request(app).get(`/api/projects/${projectId}`);
    expect(getRes.status).toBe(200);
    expect(Array.isArray(getRes.body.data.languages)).toBe(true);
    expect(getRes.body.data.languages).toContain('JavaScript');
    expect(getRes.body.data.languages).toContain('TypeScript (TSX)');

    // List (GET /api/projects)
    const listRes = await request(app).get('/api/projects');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    const proj = listRes.body.data.find((p: any) => p.id === projectId);
    expect(proj).toBeDefined();
    expect(Array.isArray(proj.languages)).toBe(true);
    expect(proj.languages).toContain('JavaScript');
  });

  it('2. rescan creates a not_run test_runs row for backend/tests/notices.test.js and no duplicates', async () => {
    const { projectId } = await uploadAndScanFixture();

    // First scan check
    const testsRes1 = await request(app).get(`/api/projects/${projectId}/tests`);
    expect(testsRes1.status).toBe(200);
    expect(testsRes1.body.data.items).toHaveLength(1);
    expect(testsRes1.body.data.items[0].name).toBe('backend/tests/notices.test.js');
    expect(testsRes1.body.data.items[0].status).toBe('not_run');
    expect(testsRes1.body.data.counts.not_run).toBe(1);

    // Rescan
    const scanRes2 = await request(app).post(`/api/projects/${projectId}/scan`);
    expect(scanRes2.status).toBe(200);

    // Check again: must still be exactly 1 row, no duplicates
    const testsRes2 = await request(app).get(`/api/projects/${projectId}/tests`);
    expect(testsRes2.status).toBe(200);
    expect(testsRes2.body.data.items).toHaveLength(1);
    expect(testsRes2.body.data.items[0].name).toBe('backend/tests/notices.test.js');
    expect(testsRes2.body.data.items[0].status).toBe('not_run');
    expect(testsRes2.body.data.counts.not_run).toBe(1);
  });

  it('3. env_undeclared fix adds JWT_SECRET= to .env.example in the diff, contains no value, and the original file on disk is unchanged', async () => {
    const { projectId } = await uploadAndScanFixture();

    const findingsRes = await request(app).get(`/api/projects/${projectId}/findings?rule_id=env_undeclared`);
    expect(findingsRes.status).toBe(200);
    const jwtFinding = findingsRes.body.data.items.find((f: any) => f.title.includes('JWT_SECRET'));
    expect(jwtFinding).toBeDefined();

    const originalDiskPath = path.join(config.storagePath, projectId, 'files', '.env.example');
    const originalContent = fs.readFileSync(originalDiskPath, 'utf-8');

    // Create fix
    const fixRes = await request(app).post(`/api/findings/${jwtFinding.id}/fixes`);
    expect(fixRes.status).toBe(201);
    const fix = fixRes.body.data;
    expect(fix.finding_id).toBe(jwtFinding.id);
    expect(fix.status).toBe('proposed');
    expect(Array.isArray(fix.files)).toBe(true);
    expect(fix.files).toEqual(['.env.example']);
    expect(fix.files_json).toBeUndefined();
    expect(fix.diff_text).toContain('JWT_SECRET=');
    expect(fix.diff_text).toContain('--- a/.env.example');
    expect(fix.diff_text).toContain('+++ b/.env.example');
    expect(fix.diff_text).toContain('Suggested change, not applied, not tested');

    // Crucial safety checks: contains no value, and file on disk is completely unchanged
    expect(fix.diff_text).not.toContain('super-secret');
    expect(fix.diff_text).not.toContain('123456');
    const currentDiskContent = fs.readFileSync(originalDiskPath, 'utf-8');
    expect(currentDiskContent).toBe(originalContent);
  });

  it('4. api_unmatched_call fix proposes changing /api/notice/list to /api/notices; the diff has at most the changed line plus 2 lines of context', async () => {
    const { projectId } = await uploadAndScanFixture();

    const findingsRes = await request(app).get(`/api/projects/${projectId}/findings?rule_id=api_unmatched_call`);
    expect(findingsRes.status).toBe(200);
    const unmatchedFinding = findingsRes.body.data.items.find((f: any) => f.title.includes('/api/notice/list'));
    expect(unmatchedFinding).toBeDefined();

    const fixRes = await request(app).post(`/api/findings/${unmatchedFinding.id}/fixes`);
    expect(fixRes.status).toBe(201);
    const fix = fixRes.body.data;
    expect(fix.diff_text).toContain('-    fetch(\'/api/notice/list\')');
    expect(fix.diff_text).toContain('+    fetch(\'/api/notices\')');

    // Check context lines: at most 2 context lines in the hunk
    const diffLines = fix.diff_text.split('\n');
    const hunkHeader = diffLines.find((l: string) => l.startsWith('@@'));
    expect(hunkHeader).toBeDefined();

    const contextLines = diffLines.filter((l: string) => l.startsWith(' '));
    expect(contextLines.length).toBeLessThanOrEqual(2);
  });

  it('5. broken_import for feeService returns NO_AUTOMATIC_FIX (no file with that name exists)', async () => {
    const { projectId } = await uploadAndScanFixture();

    const findingsRes = await request(app).get(`/api/projects/${projectId}/findings?rule_id=broken_import`);
    expect(findingsRes.status).toBe(200);
    const feeFinding = findingsRes.body.data.items.find((f: any) => f.title.includes('feeService'));
    expect(feeFinding).toBeDefined();

    const fixRes = await request(app).post(`/api/findings/${feeFinding.id}/fixes`);
    expect(fixRes.status).toBe(422);
    expect(fixRes.body.error).toContain('NO_AUTOMATIC_FIX');
  });

  it('6. circular_dependency and secret_pattern findings return 422 NO_AUTOMATIC_FIX', async () => {
    const { projectId, scanId } = await uploadAndScanFixture();

    // Circular dependency
    const circFindingsRes = await request(app).get(`/api/projects/${projectId}/findings?rule_id=circular_dependency`);
    expect(circFindingsRes.status).toBe(200);
    const circFinding = circFindingsRes.body.data.items[0];
    expect(circFinding).toBeDefined();

    const circFixRes = await request(app).post(`/api/findings/${circFinding.id}/fixes`);
    expect(circFixRes.status).toBe(422);
    expect(circFixRes.body.error).toContain('NO_AUTOMATIC_FIX');

    // Secret pattern
    const fakeFindingId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO findings (id, project_id, scan_id, rule_id, title, summary, severity, confidence, verification, created_at)
      VALUES (?, ?, ?, 'secret_pattern', 'Detected secret', 'A secret was found', 'high', 'likely', 'not_tested', ?)
    `).run(fakeFindingId, projectId, scanId, new Date().toISOString());

    const secretFixRes = await request(app).post(`/api/findings/${fakeFindingId}/fixes`);
    expect(secretFixRes.status).toBe(422);
    expect(secretFixRes.body.error).toContain('NO_AUTOMATIC_FIX');
  });

  it('7. a second fix request returns the same fix; finding verification is fix_proposed', async () => {
    const { projectId } = await uploadAndScanFixture();

    const findingsRes = await request(app).get(`/api/projects/${projectId}/findings?rule_id=env_undeclared`);
    const jwtFinding = findingsRes.body.data.items.find((f: any) => f.title.includes('JWT_SECRET'));
    expect(jwtFinding.verification).toBe('not_tested');

    // First fix request
    const fixRes1 = await request(app).post(`/api/findings/${jwtFinding.id}/fixes`);
    expect(fixRes1.status).toBe(201);
    const fix1 = fixRes1.body.data;

    // Check finding verification updated to fix_proposed
    const findingAfter = await request(app).get(`/api/findings/${jwtFinding.id}`);
    expect(findingAfter.body.data.verification).toBe('fix_proposed');

    // Second fix request returns existing proposed fix with 200
    const fixRes2 = await request(app).post(`/api/findings/${jwtFinding.id}/fixes`);
    expect(fixRes2.status).toBe(200);
    expect(fixRes2.body.data.id).toBe(fix1.id);
  });

  it('8. approve writes the patch under patches/ and leaves backend/storage/<id>/files/ byte-for-byte identical (compare hashes before and after)', async () => {
    const { projectId } = await uploadAndScanFixture();

    const findingsRes = await request(app).get(`/api/projects/${projectId}/findings?rule_id=env_undeclared`);
    const jwtFinding = findingsRes.body.data.items.find((f: any) => f.title.includes('JWT_SECRET'));

    const fixRes = await request(app).post(`/api/findings/${jwtFinding.id}/fixes`);
    const fix = fixRes.body.data;

    const filesDir = path.join(config.storagePath, projectId, 'files');
    const hashBefore = computeDirectoryHash(filesDir);

    // Approve the fix
    const approveRes = await request(app).post(`/api/fixes/${fix.id}/approve`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('approved');
    expect(approveRes.body.data.patch_path).toBe(`patches/${fix.id}.patch`);
    expect(approveRes.body.data.patchPath).toBeUndefined();
    expect(approveRes.body.data.files_json).toBeUndefined();
    expect(Array.isArray(approveRes.body.data.files)).toBe(true);

    // Verify .patch file exists and contains diff
    const patchDiskPath = path.join(config.storagePath, projectId, 'patches', `${fix.id}.patch`);
    expect(fs.existsSync(patchDiskPath)).toBe(true);
    const patchContent = fs.readFileSync(patchDiskPath, 'utf-8');
    expect(patchContent).toBe(fix.diff_text);

    // Verify files/ folder is 100% byte-for-byte identical
    const hashAfter = computeDirectoryHash(filesDir);
    expect(hashAfter).toBe(hashBefore);

    // Finding verification stays fix_proposed
    const findingAfterApprove = await request(app).get(`/api/findings/${jwtFinding.id}`);
    expect(findingAfterApprove.body.data.verification).toBe('fix_proposed');
  });

  it('9. reject returns verification to not_tested; double approve gives 409', async () => {
    const { projectId } = await uploadAndScanFixture();

    const findingsRes = await request(app).get(`/api/projects/${projectId}/findings?rule_id=env_undeclared`);
    const jwtFinding = findingsRes.body.data.items.find((f: any) => f.title.includes('JWT_SECRET'));

    const fixRes = await request(app).post(`/api/findings/${jwtFinding.id}/fixes`);
    const fix = fixRes.body.data;

    // Reject the fix
    const rejectRes = await request(app).post(`/api/fixes/${fix.id}/reject`);
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('rejected');

    // Finding verification reverts to not_tested
    const findingAfterReject = await request(app).get(`/api/findings/${jwtFinding.id}`);
    expect(findingAfterReject.body.data.verification).toBe('not_tested');

    // Double reject returns 409
    const rejectAgain = await request(app).post(`/api/fixes/${fix.id}/reject`);
    expect(rejectAgain.status).toBe(409);

    // Create a new fix for the finding and test double approve
    const newFixRes = await request(app).post(`/api/findings/${jwtFinding.id}/fixes`);
    expect(newFixRes.status).toBe(201);
    const newFix = newFixRes.body.data;

    const approve1 = await request(app).post(`/api/fixes/${newFix.id}/approve`);
    expect(approve1.status).toBe(200);

    const approve2 = await request(app).post(`/api/fixes/${newFix.id}/approve`);
    expect(approve2.status).toBe(409);
  });

  it('10. no response or patch contains an env value', async () => {
    const { projectId } = await uploadAndScanFixture();

    const findingsRes = await request(app).get(`/api/projects/${projectId}/findings?rule_id=env_undeclared`);
    const jwtFinding = findingsRes.body.data.items.find((f: any) => f.title.includes('JWT_SECRET'));

    const fixRes = await request(app).post(`/api/findings/${jwtFinding.id}/fixes`);
    const fix = fixRes.body.data;

    await request(app).post(`/api/fixes/${fix.id}/approve`);

    const patchPath = path.join(config.storagePath, projectId, 'patches', `${fix.id}.patch`);
    const patchContent = fs.readFileSync(patchPath, 'utf-8');

    // Real secrets / values must never appear anywhere
    expect(patchContent).not.toContain('postgres://');
    expect(patchContent).not.toContain('my-super-secret');
    expect(patchContent).not.toContain('123456');

    // All fix responses
    const allFixesRes = await request(app).get(`/api/projects/${projectId}/fixes`);
    const allFixesStr = JSON.stringify(allFixesRes.body);
    expect(allFixesStr).not.toContain('postgres://');
    for (const item of allFixesRes.body.data.items) {
      expect(item.files_json).toBeUndefined();
      expect(Array.isArray(item.files)).toBe(true);
      expect(item.finding_title).toBeDefined();
      expect(item.finding_severity).toBeDefined();
      expect(item.findingTitle).toBeUndefined();
      expect(item.findingSeverity).toBeUndefined();
    }
  });

  it('11. tests endpoint shows not_run counts and the note', async () => {
    const { projectId } = await uploadAndScanFixture();

    const res = await request(app).get(`/api/projects/${projectId}/tests`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      items: [
        {
          id: expect.any(String),
          name: 'backend/tests/notices.test.js',
          status: 'not_run',
        },
      ],
      counts: {
        pass: 0,
        fail: 0,
        skipped: 0,
        not_run: 1,
      },
      note: 'Tests are not executed in Phase 1.',
    });
  });

  it('12. report Markdown contains the sections, the counts add up with the summary endpoint, and "What was not checked" is present; ?format=md returns text/markdown', async () => {
    const { projectId } = await uploadAndScanFixture();

    // Summary endpoint
    const summaryRes = await request(app).get(`/api/projects/${projectId}/summary`);
    expect(summaryRes.status).toBe(200);
    const summary = summaryRes.body.data;

    // Generate report
    const createReportRes = await request(app).post(`/api/projects/${projectId}/reports`);
    expect(createReportRes.status).toBe(201);
    const report = createReportRes.body.data;
    expect(report.id).toMatch(/^[0-9a-f-]{36}$/);

    const md = report.markdown;
    expect(md).toContain('## Summary');
    expect(md).toContain('## Findings by Severity');
    expect(md).toContain('## Verification Coverage');
    expect(md).toContain('## Findings Table');
    expect(md).toContain('## Evidence List');
    expect(md).toContain('## Fixes and Status');
    expect(md).toContain('## What was not checked');
    expect(md.toLowerCase()).not.toContain('health score'); // No single health score anywhere

    // Check counts consistency with summary
    expect(md).toContain(`- **Graph Nodes**: ${summary.counts.nodes}`);
    expect(md).toContain(`- **Total Findings**: ${summary.kpi.openFindings}`);

    // GET /api/reports/:id as JSON
    const getReportRes = await request(app).get(`/api/reports/${report.id}`);
    expect(getReportRes.status).toBe(200);
    expect(getReportRes.body.data.id).toBe(report.id);

    // GET /api/reports/:id?format=md as raw Markdown
    const getRawMdRes = await request(app).get(`/api/reports/${report.id}?format=md`);
    expect(getRawMdRes.status).toBe(200);
    expect(getRawMdRes.headers['content-type']).toContain('text/markdown');
    expect(getRawMdRes.text).toBe(md);

    // GET /api/projects/:id/reports lists reports newest first (paginated, items omit markdown)
    const listReportsRes = await request(app).get(`/api/projects/${projectId}/reports`);
    expect(listReportsRes.status).toBe(200);
    expect(listReportsRes.body.data.items).toHaveLength(1);
    expect(listReportsRes.body.data.total).toBe(1);
    expect(listReportsRes.body.data.page).toBe(1);
    expect(listReportsRes.body.data.pageSize).toBe(25);
    expect(listReportsRes.body.data.items[0].id).toBe(report.id);
    expect(listReportsRes.body.data.items[0].markdown).toBeUndefined();
  });

  it('13. cross-project access gives 404', async () => {
    const { projectId: projA } = await uploadAndScanFixture();

    const fakeProjId = crypto.randomUUID();

    // Access non-existent project fixes
    const fixesRes = await request(app).get(`/api/projects/${fakeProjId}/fixes`);
    expect(fixesRes.status).toBe(404);

    // Access non-existent project reports
    const reportsRes = await request(app).get(`/api/projects/${fakeProjId}/reports`);
    expect(reportsRes.status).toBe(404);

    // Access non-existent project tests
    const testsRes = await request(app).get(`/api/projects/${fakeProjId}/tests`);
    expect(testsRes.status).toBe(404);

    // Access non-existent report
    const fakeReportId = crypto.randomUUID();
    const singleReportRes = await request(app).get(`/api/reports/${fakeReportId}`);
    expect(singleReportRes.status).toBe(404);

    // Access non-existent fix
    const fakeFixId = crypto.randomUUID();
    const approveFakeRes = await request(app).post(`/api/fixes/${fakeFixId}/approve`);
    expect(approveFakeRes.status).toBe(404);
  });

  it('14. deleting a project removes fixes, test_runs, reports and the patches folder', async () => {
    const { projectId } = await uploadAndScanFixture();

    // Create a fix and approve it (creates .patch file in storage)
    const findingsRes = await request(app).get(`/api/projects/${projectId}/findings?rule_id=env_undeclared`);
    const jwtFinding = findingsRes.body.data.items[0];
    const fixRes = await request(app).post(`/api/findings/${jwtFinding.id}/fixes`);
    const fix = fixRes.body.data;
    await request(app).post(`/api/fixes/${fix.id}/approve`);

    // Create a report
    await request(app).post(`/api/projects/${projectId}/reports`);

    const patchesDir = path.join(config.storagePath, projectId, 'patches');
    expect(fs.existsSync(patchesDir)).toBe(true);

    // Verify DB records exist before delete
    expect(db.prepare('SELECT COUNT(*) as count FROM fixes').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT COUNT(*) as count FROM test_runs WHERE project_id = ?').get(projectId)).toEqual({ count: 1 });
    expect(db.prepare('SELECT COUNT(*) as count FROM reports WHERE project_id = ?').get(projectId)).toEqual({ count: 1 });

    // Delete project
    const delRes = await request(app).delete(`/api/projects/${projectId}`);
    expect(delRes.status).toBe(200);

    // Verify DB cascade deleted everything
    expect(db.prepare('SELECT COUNT(*) as count FROM fixes').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) as count FROM test_runs WHERE project_id = ?').get(projectId)).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) as count FROM reports WHERE project_id = ?').get(projectId)).toEqual({ count: 0 });

    // Verify entire project storage (files AND patches) was cleaned up
    const projectStorageDir = path.join(config.storagePath, projectId);
    expect(fs.existsSync(projectStorageDir)).toBe(false);
  });

  it('15. Dynamic.tsx in demo-erp fixture is now flagged as isolated_file (hypothesis)', async () => {
    const { projectId } = await uploadAndScanFixture();

    const res = await request(app).get(`/api/projects/${projectId}/findings?rule_id=isolated_file`);
    expect(res.status).toBe(200);
    const items = res.body.data.items;

    const dynamicFinding = items.find((f: any) => f.title.includes('Dynamic.tsx'));
    expect(dynamicFinding).toBeDefined();
    expect(dynamicFinding.severity).toBe('low');
    expect(dynamicFinding.confidence).toBe('hypothesis');
    expect(dynamicFinding.not_confirmed).toBeTruthy();
  });

  it('16. GET /api/projects/:id/fixes items contain only snake_case finding fields (no camelCase duplicates)', async () => {
    const { projectId } = await uploadAndScanFixture();

    const findingsRes = await request(app).get(`/api/projects/${projectId}/findings?rule_id=env_undeclared`);
    const jwtFinding = findingsRes.body.data.items[0];
    await request(app).post(`/api/findings/${jwtFinding.id}/fixes`);

    const res = await request(app).get(`/api/projects/${projectId}/fixes`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);

    for (const item of res.body.data.items) {
      expect(item).toHaveProperty('finding_title');
      expect(item).toHaveProperty('finding_severity');
      expect(item).not.toHaveProperty('findingTitle');
      expect(item).not.toHaveProperty('findingSeverity');
    }
  });

  it('17. POST /api/projects/:id/reports on unscanned project fails with 409 SCAN_REQUIRED; scanned project with 0 findings produces report', async () => {
    // 1. Unscanned project (uploaded but never scanned)
    const zipPathNever = path.join(TEST_DIR, 'unscanned-report-test.zip');
    await createYazlZip([{ name: 'server.js', content: 'console.log("unscanned");' }], zipPathNever);
    const uploadRes = await request(app).post('/api/projects').attach('file', zipPathNever);
    expect(uploadRes.status).toBe(201);
    const unscannedId = uploadRes.body.data.id;

    const reportUnscannedRes = await request(app).post(`/api/projects/${unscannedId}/reports`);
    expect(reportUnscannedRes.status).toBe(409);
    expect(reportUnscannedRes.body).toEqual({
      data: null,
      error: 'Scan the project first [SCAN_REQUIRED]',
    });

    // 2. Scanned project with 0 findings
    const zipPathClean = path.join(TEST_DIR, 'clean-project.zip');
    await createYazlZip([{ name: 'src/main.js', content: 'const a = 1;\nconsole.log(a);\n' }], zipPathClean);
    const uploadCleanRes = await request(app).post('/api/projects').attach('file', zipPathClean);
    expect(uploadCleanRes.status).toBe(201);
    const cleanId = uploadCleanRes.body.data.id;

    const scanCleanRes = await request(app).post(`/api/projects/${cleanId}/scan`);
    expect(scanCleanRes.status).toBe(200);

    const findingsCleanRes = await request(app).get(`/api/projects/${cleanId}/findings`);
    expect(findingsCleanRes.status).toBe(200);
    expect(findingsCleanRes.body.data.items).toHaveLength(0);

    const reportCleanRes = await request(app).post(`/api/projects/${cleanId}/reports`);
    expect(reportCleanRes.status).toBe(201);
    expect(reportCleanRes.body.data.markdown).toContain('## Summary');
    expect(reportCleanRes.body.data.markdown).toContain('No findings detected');
    expect(reportCleanRes.body.data.markdown).toContain('## What was not checked');
  });

  it('18. GET /api/projects/:id/reports pagination (page, pageSize, total), items omit markdown, bad query values give 400', async () => {
    const { projectId } = await uploadAndScanFixture();

    // Create 3 reports
    const rep1 = (await request(app).post(`/api/projects/${projectId}/reports`)).body.data;
    const rep2 = (await request(app).post(`/api/projects/${projectId}/reports`)).body.data;
    const rep3 = (await request(app).post(`/api/projects/${projectId}/reports`)).body.data;

    // Page 1, pageSize 2 -> should return 2 newest reports
    const page1Res = await request(app).get(`/api/projects/${projectId}/reports?page=1&pageSize=2`);
    expect(page1Res.status).toBe(200);
    expect(page1Res.body.data.total).toBe(3);
    expect(page1Res.body.data.page).toBe(1);
    expect(page1Res.body.data.pageSize).toBe(2);
    expect(page1Res.body.data.items).toHaveLength(2);
    expect(page1Res.body.data.items[0].id).toBe(rep3.id);
    expect(page1Res.body.data.items[1].id).toBe(rep2.id);
    expect(page1Res.body.data.items[0].markdown).toBeUndefined();
    expect(page1Res.body.data.items[1].markdown).toBeUndefined();

    // Page 2, pageSize 2 -> should return 1 remaining report
    const page2Res = await request(app).get(`/api/projects/${projectId}/reports?page=2&pageSize=2`);
    expect(page2Res.status).toBe(200);
    expect(page2Res.body.data.total).toBe(3);
    expect(page2Res.body.data.page).toBe(2);
    expect(page2Res.body.data.pageSize).toBe(2);
    expect(page2Res.body.data.items).toHaveLength(1);
    expect(page2Res.body.data.items[0].id).toBe(rep1.id);
    expect(page2Res.body.data.items[0].markdown).toBeUndefined();

    // Bad query values return 400
    const badPage = await request(app).get(`/api/projects/${projectId}/reports?page=0`);
    expect(badPage.status).toBe(400);

    const badPageNegative = await request(app).get(`/api/projects/${projectId}/reports?page=-1`);
    expect(badPageNegative.status).toBe(400);

    const badPageSizeZero = await request(app).get(`/api/projects/${projectId}/reports?pageSize=0`);
    expect(badPageSizeZero.status).toBe(400);

    const badPageSizeHigh = await request(app).get(`/api/projects/${projectId}/reports?pageSize=101`);
    expect(badPageSizeHigh.status).toBe(400);

    const badPageString = await request(app).get(`/api/projects/${projectId}/reports?page=invalid`);
    expect(badPageString.status).toBe(400);
  });
});
