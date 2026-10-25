import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execSync } from 'node:child_process';
import { chromium, type Browser, type Page } from '@playwright/test';

const ROOT_DIR = 'C:\\RippleAI';
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const SAMPLES_REAL_DIR = path.join(ROOT_DIR, 'samples', 'real');
const REPORT_PATH = path.join(ROOT_DIR, 'docs', 'R1_REHEARSAL.md');
const SCREENSHOTS_DIR = path.join(FRONTEND_DIR, 'qa-screenshots', 'r1');
const RUNTIME_TRACK_FILE = path.join(os.tmpdir(), 'ripple_r1_runtime.json');

interface ProjectRunResult {
  zipName: string;
  projectName: string;
  projectId: string | null;
  uploadStatus: number;
  uploadDurationMs: number;
  uploadError?: string;
  scanStatus: number;
  scanDurationMs: number;
  scanError?: string;
  fileCount: number;
  filesSkippedNotes: string;
  languages: Record<string, number> | string[];
  nodesCount: number;
  edgesCount: number;
  unresolvedEdgesCount: number;
  l1ModulesCount: number;
  l1ClusteredCount: number;
  l1ResponseTimeMs: number;
  findingsTotal: number;
  findingsByRule: Record<string, number>;
  findingsBySeverity: Record<string, number>;
  findingsByConfidence: Record<string, number>;
  allFindings: any[];
  mostFindingsModuleId: string | null;
  mostFindingsModuleLabel: string | null;
  screenMetrics?: {
    overviewErrors: string[];
    graphL1TimeMs: number;
    graphL1NodesShown: number;
    graphL1NodesTotal: number;
    graphL1ClustersVisible: boolean;
    graphL1Errors: string[];
    graphL2TimeMs: number;
    graphL2Errors: string[];
    investigationsErrors: string[];
  };
}

interface RuntimeState {
  backendPid: number;
  frontendPid: number;
  tempDir: string;
  dataMtimeBefore: string;
  storageMtimeBefore: string;
  results: ProjectRunResult[];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUrl(url: string, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(300);
  }
  throw new Error(`Timeout waiting for ${url}`);
}

function saveRuntimeState(state: RuntimeState) {
  fs.writeFileSync(RUNTIME_TRACK_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function loadRuntimeState(): RuntimeState | null {
  if (fs.existsSync(RUNTIME_TRACK_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(RUNTIME_TRACK_FILE, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

export async function startServers(): Promise<RuntimeState> {
  const existing = loadRuntimeState();
  if (existing) {
    // Check if still responding
    try {
      const h = await fetch('http://localhost:4100/api/health');
      if (h.ok) {
        console.log('[rehearsal] Using existing running servers at ports 4100 / 3100');
        return existing;
      }
    } catch {}
  }

  console.log('[rehearsal] Initializing isolated QA environment...');
  const dataMtimeBefore = fs.statSync(path.join(BACKEND_DIR, 'data')).mtime.toISOString();
  const storageMtimeBefore = fs.statSync(path.join(BACKEND_DIR, 'storage')).mtime.toISOString();

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ripple_qa_r1_'));
  fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'storage', 'tmp'), { recursive: true });

  const tsxCli = path.join(ROOT_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const viteCli = path.join(ROOT_DIR, 'node_modules', 'vite', 'bin', 'vite.js');

  console.log('[rehearsal] Spawning QA backend on port 4100...');
  const backendProc = spawn(process.execPath, [tsxCli, 'src/server.ts'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      PORT: '4100',
      DB_PATH: path.join(tempDir, 'data', 'qa.db'),
      STORAGE_PATH: path.join(tempDir, 'storage'),
      TEMP_STORAGE_PATH: path.join(tempDir, 'storage', 'tmp'),
      CORS_ORIGIN: 'http://localhost:3100',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProc.stdout.on('data', (d) => process.stdout.write(`[backend:4100] ${d}`));
  backendProc.stderr.on('data', (d) => process.stderr.write(`[backend:4100 err] ${d}`));

  await waitUrl('http://localhost:4100/api/health');
  console.log('[rehearsal] Backend healthy on port 4100.');

  console.log('[rehearsal] Spawning QA frontend on port 3100...');
  const frontendProc = spawn(process.execPath, [viteCli, '--config', 'e2e/qa.vite.config.ts'], {
    cwd: FRONTEND_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  frontendProc.stdout.on('data', (d) => process.stdout.write(`[frontend:3100] ${d}`));
  frontendProc.stderr.on('data', (d) => process.stderr.write(`[frontend:3100 err] ${d}`));

  await waitUrl('http://localhost:3100');
  console.log('[rehearsal] Frontend ready on port 3100.');

  const state: RuntimeState = {
    backendPid: backendProc.pid!,
    frontendPid: frontendProc.pid!,
    tempDir,
    dataMtimeBefore,
    storageMtimeBefore,
    results: [],
  };
  saveRuntimeState(state);
  return state;
}

export async function stopServers() {
  const state = loadRuntimeState();
  if (!state) {
    console.log('[rehearsal] No active runtime state found to stop.');
    return;
  }

  console.log(`[rehearsal] Stopping processes: frontend PID ${state.frontendPid}, backend PID ${state.backendPid}...`);
  if (state.frontendPid) {
    try {
      execSync(`taskkill /pid ${state.frontendPid} /T /F`, { stdio: 'ignore' });
    } catch {}
  }
  if (state.backendPid) {
    try {
      execSync(`taskkill /pid ${state.backendPid} /T /F`, { stdio: 'ignore' });
    } catch {}
  }

  if (state.tempDir && fs.existsSync(state.tempDir)) {
    console.log(`[rehearsal] Removing temp directory ${state.tempDir}...`);
    try {
      fs.rmSync(state.tempDir, { recursive: true, force: true });
    } catch (err: any) {
      console.warn('[rehearsal] Temp cleanup notice:', err.message);
    }
  }

  if (fs.existsSync(RUNTIME_TRACK_FILE)) {
    try {
      fs.unlinkSync(RUNTIME_TRACK_FILE);
    } catch {}
  }

  await sleep(1000);
  try {
    const netstatOutput = execSync('netstat -ano', { encoding: 'utf8' });
    const lines = netstatOutput.split(/\r?\n/);
    const p3100 = lines.some((l) => l.includes(':3100') && l.includes('LISTENING'));
    const p4100 = lines.some((l) => l.includes(':4100') && l.includes('LISTENING'));
    console.log(`[rehearsal] Port 3100 free: ${!p3100}, Port 4100 free: ${!p4100}`);
  } catch {}
}

export async function rehearseApi(): Promise<ProjectRunResult[]> {
  const state = await startServers();
  const zipFiles = fs
    .readdirSync(SAMPLES_REAL_DIR)
    .filter((f) => f.endsWith('.zip'))
    .sort();

  console.log(`[rehearsal] Found ${zipFiles.length} real project archives in samples/real:`, zipFiles);
  const results: ProjectRunResult[] = [];

  for (const zipName of zipFiles) {
    console.log(`\n============================================================`);
    console.log(`[rehearsal] Processing ${zipName}...`);
    console.log(`============================================================`);

    const zipPath = path.join(SAMPLES_REAL_DIR, zipName);
    const projectName = zipName.replace(/\.zip$/, '');

    const runResult: ProjectRunResult = {
      zipName,
      projectName,
      projectId: null,
      uploadStatus: 0,
      uploadDurationMs: 0,
      scanStatus: 0,
      scanDurationMs: 0,
      fileCount: 0,
      filesSkippedNotes: 'None',
      languages: {},
      nodesCount: 0,
      edgesCount: 0,
      unresolvedEdgesCount: 0,
      l1ModulesCount: 0,
      l1ClusteredCount: 0,
      l1ResponseTimeMs: 0,
      findingsTotal: 0,
      findingsByRule: {},
      findingsBySeverity: {},
      findingsByConfidence: {},
      allFindings: [],
      mostFindingsModuleId: null,
      mostFindingsModuleLabel: null,
    };

    // 1. Upload ZIP
    console.log(`[rehearsal] Uploading ${zipName}...`);
    const uploadStart = Date.now();
    try {
      const fileBytes = fs.readFileSync(zipPath);
      const blob = new Blob([fileBytes], { type: 'application/zip' });
      const form = new FormData();
      form.append('name', projectName);
      form.append('file', blob, zipName);

      const uploadRes = await fetch('http://localhost:3100/api/projects', {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(180000), // 3 min cap
      });

      runResult.uploadDurationMs = Date.now() - uploadStart;
      runResult.uploadStatus = uploadRes.status;

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        console.error(`[rehearsal] Upload failed with status ${uploadRes.status}:`, errText);
        runResult.uploadError = `HTTP ${uploadRes.status}: ${errText.slice(0, 200)}`;
        results.push(runResult);
        continue;
      }

      const uploadJson = await uploadRes.json();
      const project = uploadJson.data;
      runResult.projectId = project.id;
      runResult.fileCount = project.file_count || 0;
      runResult.languages = project.languages || {};
      console.log(`[rehearsal] Upload OK in ${runResult.uploadDurationMs}ms. Project ID: ${project.id}, files: ${project.file_count}`);
    } catch (err: any) {
      runResult.uploadDurationMs = Date.now() - uploadStart;
      runResult.uploadStatus = 500;
      runResult.uploadError = err.message;
      console.error(`[rehearsal] Upload exception:`, err.message);
      results.push(runResult);
      continue;
    }

    const projectId = runResult.projectId!;

    // 2. Scan Project
    console.log(`[rehearsal] Scanning project ${projectId}...`);
    const scanStart = Date.now();
    try {
      const scanRes = await fetch(`http://localhost:3100/api/projects/${projectId}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(180000), // 3 min cap
      });

      runResult.scanDurationMs = Date.now() - scanStart;
      runResult.scanStatus = scanRes.status;

      if (!scanRes.ok) {
        const errText = await scanRes.text();
        console.error(`[rehearsal] Scan failed with status ${scanRes.status}:`, errText);
        runResult.scanError = `HTTP ${scanRes.status}: ${errText.slice(0, 200)}`;
        results.push(runResult);
        continue;
      }

      const scanJson = await scanRes.json();
      console.log(`[rehearsal] Scan finished in ${runResult.scanDurationMs}ms.`);
    } catch (err: any) {
      runResult.scanDurationMs = Date.now() - scanStart;
      runResult.scanStatus = 500;
      runResult.scanError = err.message;
      console.error(`[rehearsal] Scan exception:`, err.message);
      results.push(runResult);
      continue;
    }

    // 3. Scans & Notes (skipped files)
    try {
      const scansRes = await fetch(`http://localhost:3100/api/projects/${projectId}/scans`);
      if (scansRes.ok) {
        const scansJson = await scansRes.json();
        const scans = scansJson.data || [];
        const notesList: string[] = [];
        for (const s of scans) {
          if (s.notes) notesList.push(s.notes);
        }
        if (notesList.length > 0) {
          runResult.filesSkippedNotes = notesList.join(' | ');
        }
      }
    } catch {}

    // 4. Summary
    try {
      const summaryRes = await fetch(`http://localhost:3100/api/projects/${projectId}/summary`);
      if (summaryRes.ok) {
        const summaryJson = await summaryRes.json();
        const s = summaryJson.data;
        if (s?.counts) {
          runResult.nodesCount = s.counts.nodes || 0;
          runResult.edgesCount = s.counts.edges || 0;
          runResult.unresolvedEdgesCount = s.counts.unresolvedEdges || 0;
        }
        if (s?.affectedModules && s.affectedModules.length > 0) {
          // Module with highest finding count
          const sorted = [...s.affectedModules].sort((a: any, b: any) => (b.findingCount || 0) - (a.findingCount || 0));
          runResult.mostFindingsModuleId = sorted[0].moduleId;
          runResult.mostFindingsModuleLabel = sorted[0].label;
        }
      }
    } catch {}

    // 5. Level 1 Graph
    console.log(`[rehearsal] Fetching Level 1 graph...`);
    const l1Start = Date.now();
    try {
      const l1Res = await fetch(`http://localhost:3100/api/projects/${projectId}/graph?level=1`);
      runResult.l1ResponseTimeMs = Date.now() - l1Start;
      if (l1Res.ok) {
        const l1Json = await l1Res.json();
        const g = l1Json.data;
        const nodes = g?.nodes || [];
        const moduleNodes = nodes.filter((n: any) => n.type === 'module');
        runResult.l1ModulesCount = moduleNodes.length;

        const clusters = g?.clusters || [];
        runResult.l1ClusteredCount = clusters.reduce((acc: number, c: any) => acc + (c.count || 0), 0);

        if (!runResult.mostFindingsModuleId && moduleNodes.length > 0) {
          runResult.mostFindingsModuleId = moduleNodes[0].id;
          runResult.mostFindingsModuleLabel = moduleNodes[0].label;
        }
      }
    } catch {}

    // 6. Findings (all pages)
    console.log(`[rehearsal] Fetching all findings...`);
    let page = 1;
    const pageSize = 50;
    let hasMore = true;
    const allFindings: any[] = [];

    while (hasMore) {
      try {
        const findingsRes = await fetch(
          `http://localhost:3100/api/projects/${projectId}/findings?page=${page}&pageSize=${pageSize}`
        );
        if (!findingsRes.ok) break;

        const findingsJson = await findingsRes.json();
        const items = findingsJson.data?.items || [];
        const total = findingsJson.data?.total || 0;
        allFindings.push(...items);

        if (allFindings.length >= total || items.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } catch {
        break;
      }
    }

    runResult.findingsTotal = allFindings.length;
    runResult.allFindings = allFindings;

    for (const f of allFindings) {
      const r = f.rule_id || 'unknown';
      const sev = f.severity || 'unknown';
      const conf = f.confidence || 'unknown';

      runResult.findingsByRule[r] = (runResult.findingsByRule[r] || 0) + 1;
      runResult.findingsBySeverity[sev] = (runResult.findingsBySeverity[sev] || 0) + 1;
      runResult.findingsByConfidence[conf] = (runResult.findingsByConfidence[conf] || 0) + 1;
    }

    console.log(
      `[rehearsal] ${projectName}: findings=${runResult.findingsTotal}, modules=${runResult.l1ModulesCount}, nodes=${runResult.nodesCount}, edges=${runResult.edgesCount}`
    );
    results.push(runResult);
  }

  state.results = results;
  saveRuntimeState(state);

  // Write Part 1 report
  generatePart1Report(results);
  return results;
}

export function generatePart1Report(results: ProjectRunResult[]) {
  let md = `# Ripple AI — Step R1 Rehearsal Report\n\n`;
  md += `Rehearsal performed on ${new Date().toISOString().split('T')[0]} using isolated QA setup (backend port 4100, frontend port 3100).\n\n`;
  md += `## Part 1: Automated Pipeline & Metrics per Project\n\n`;

  for (const r of results) {
    md += `### Project: \`${r.projectName}\`\n\n`;
    md += `- **Archive**: \`${r.zipName}\`\n`;
    md += `- **Upload**: HTTP ${r.uploadStatus} in ${r.uploadDurationMs} ms ${r.uploadError ? `(Error: ${r.uploadError})` : ''}\n`;
    md += `- **Scan**: HTTP ${r.scanStatus} in ${r.scanDurationMs} ms ${r.scanError ? `(Error: ${r.scanError})` : ''}\n`;
    md += `- **File Count**: ${r.fileCount}\n`;
    md += `- **Files Skipped Notes**: ${r.filesSkippedNotes}\n`;

    const langStr = Array.isArray(r.languages)
      ? r.languages.join(', ')
      : Object.entries(r.languages)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ') || 'N/A';
    md += `- **Languages**: ${langStr}\n`;
    md += `- **Graph Architecture**:\n`;
    md += `  - Total Nodes: ${r.nodesCount}\n`;
    md += `  - Total Edges: ${r.edgesCount}\n`;
    md += `  - Unresolved Edges: ${r.unresolvedEdgesCount}\n`;
    md += `  - Level 1 Modules Count: ${r.l1ModulesCount}\n`;
    md += `  - Level 1 Clustered Count: ${r.l1ClusteredCount}\n`;
    md += `  - Level 1 Graph Response Time: ${r.l1ResponseTimeMs} ms\n`;

    md += `- **Findings Summary (Total: ${r.findingsTotal})**:\n`;
    md += `  - **By Rule**:\n`;
    if (Object.keys(r.findingsByRule).length === 0) {
      md += `    - None\n`;
    } else {
      for (const [rule, count] of Object.entries(r.findingsByRule)) {
        md += `    - \`${rule}\`: ${count}\n`;
      }
    }

    md += `  - **By Severity**:\n`;
    if (Object.keys(r.findingsBySeverity).length === 0) {
      md += `    - None\n`;
    } else {
      for (const [sev, count] of Object.entries(r.findingsBySeverity)) {
        md += `    - \`${sev}\`: ${count}\n`;
      }
    }

    md += `  - **By Confidence**:\n`;
    if (Object.keys(r.findingsByConfidence).length === 0) {
      md += `    - None\n`;
    } else {
      for (const [conf, count] of Object.entries(r.findingsByConfidence)) {
        md += `    - \`${conf}\`: ${count}\n`;
      }
    }
    md += `\n---\n\n`;
  }

  fs.writeFileSync(REPORT_PATH, md, 'utf8');
  console.log(`[rehearsal] Part 1 report written to ${REPORT_PATH}`);
}

export async function captureScreenshots(): Promise<void> {
  const state = loadRuntimeState();
  if (!state || !state.results || state.results.length === 0) {
    console.error('[rehearsal] No runtime state or results found for capturing screenshots.');
    return;
  }

  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  console.log(`[rehearsal] Launching Playwright Edge to capture screenshots in ${SCREENSHOTS_DIR}...`);

  const browser: Browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  });

  for (const r of state.results) {
    if (!r.projectId || r.scanStatus !== 200) {
      console.log(`[rehearsal] Skipping screens for ${r.projectName} (project not scanned successfully)`);
      continue;
    }

    console.log(`\n[rehearsal] Capturing screens for ${r.projectName} (${r.projectId})...`);
    r.screenMetrics = {
      overviewErrors: [],
      graphL1TimeMs: 0,
      graphL1NodesShown: 0,
      graphL1NodesTotal: 0,
      graphL1ClustersVisible: false,
      graphL1Errors: [],
      graphL2TimeMs: 0,
      graphL2Errors: [],
      investigationsErrors: [],
    };

    const page: Page = await context.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    // Preset active project
    await page.goto('http://localhost:3100');
    await page.evaluate((id) => {
      localStorage.setItem('ripple_selected_project_id', id);
    }, r.projectId);

    // 1. Overview
    try {
      consoleErrors.length = 0;
      pageErrors.length = 0;
      await page.goto('http://localhost:3100/app/overview', { waitUntil: 'networkidle' });
      await sleep(1500);
      const overviewShotPath = path.join(SCREENSHOTS_DIR, `${r.projectName}__overview.png`);
      await page.screenshot({ path: overviewShotPath });
      r.screenMetrics.overviewErrors = [...consoleErrors, ...pageErrors];
      console.log(`[rehearsal] Overview screenshot saved: ${overviewShotPath}`);
    } catch (err: any) {
      console.error(`[rehearsal] Failed to capture Overview for ${r.projectName}:`, err.message);
    }

    // 2. Graph Level 1
    try {
      consoleErrors.length = 0;
      pageErrors.length = 0;
      const gStart = Date.now();
      await page.goto('http://localhost:3100/app/graph', { waitUntil: 'domcontentloaded' });
      try {
        await page.waitForSelector('.react-flow__node', { timeout: 15000 });
        r.screenMetrics.graphL1TimeMs = Date.now() - gStart;
      } catch {
        r.screenMetrics.graphL1TimeMs = Date.now() - gStart;
      }
      await sleep(1500);

      // Check nodes count shown in counter or DOM
      try {
        const counterText = await page.textContent('[data-testid="shown-counter"]');
        if (counterText) {
          const match = counterText.match(/Showing\s+(\d+)\s+of\s+(\d+)/i);
          if (match) {
            r.screenMetrics.graphL1NodesShown = parseInt(match[1], 10);
            r.screenMetrics.graphL1NodesTotal = parseInt(match[2], 10);
          }
        }
      } catch {}

      const clusterEls = await page.$$('.react-flow__node-cluster');
      r.screenMetrics.graphL1ClustersVisible = clusterEls.length > 0;

      const graphL1ShotPath = path.join(SCREENSHOTS_DIR, `${r.projectName}__graph_l1.png`);
      await page.screenshot({ path: graphL1ShotPath });
      r.screenMetrics.graphL1Errors = [...consoleErrors, ...pageErrors];
      console.log(`[rehearsal] Graph L1 screenshot saved: ${graphL1ShotPath} (rendered in ${r.screenMetrics.graphL1TimeMs}ms)`);
    } catch (err: any) {
      console.error(`[rehearsal] Failed to capture Graph L1 for ${r.projectName}:`, err.message);
    }

    // 3. Graph Level 2 (module with most findings)
    if (r.mostFindingsModuleId) {
      try {
        consoleErrors.length = 0;
        pageErrors.length = 0;
        const g2Start = Date.now();
        await page.goto(`http://localhost:3100/app/graph?level=2&focus=${r.mostFindingsModuleId}`, {
          waitUntil: 'domcontentloaded',
        });
        try {
          await page.waitForSelector('.react-flow__node', { timeout: 15000 });
          r.screenMetrics.graphL2TimeMs = Date.now() - g2Start;
        } catch {
          r.screenMetrics.graphL2TimeMs = Date.now() - g2Start;
        }
        await sleep(1500);
        const graphL2ShotPath = path.join(SCREENSHOTS_DIR, `${r.projectName}__graph_l2.png`);
        await page.screenshot({ path: graphL2ShotPath });
        r.screenMetrics.graphL2Errors = [...consoleErrors, ...pageErrors];
        console.log(`[rehearsal] Graph L2 screenshot saved: ${graphL2ShotPath}`);
      } catch (err: any) {
        console.error(`[rehearsal] Failed to capture Graph L2 for ${r.projectName}:`, err.message);
      }
    }

    // 4. Investigations
    try {
      consoleErrors.length = 0;
      pageErrors.length = 0;
      await page.goto('http://localhost:3100/app/investigations', { waitUntil: 'networkidle' });
      await sleep(1500);
      const invShotPath = path.join(SCREENSHOTS_DIR, `${r.projectName}__investigations.png`);
      await page.screenshot({ path: invShotPath });
      r.screenMetrics.investigationsErrors = [...consoleErrors, ...pageErrors];
      console.log(`[rehearsal] Investigations screenshot saved: ${invShotPath}`);
    } catch (err: any) {
      console.error(`[rehearsal] Failed to capture Investigations for ${r.projectName}:`, err.message);
    }

    await page.close();
  }

  await browser.close();
  saveRuntimeState(state);
}

// CLI dispatcher
const action = process.argv[2] || 'part1';

if (action === 'part1') {
  rehearseApi()
    .then(() => {
      console.log('[rehearsal] Part 1 completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[rehearsal] Part 1 fatal error:', err);
      process.exit(1);
    });
} else if (action === 'part3') {
  captureScreenshots()
    .then(() => {
      console.log('[rehearsal] Part 3 screenshots completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[rehearsal] Part 3 fatal error:', err);
      process.exit(1);
    });
} else if (action === 'stop') {
  stopServers()
    .then(() => {
      console.log('[rehearsal] Servers stopped.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[rehearsal] Stop error:', err);
      process.exit(1);
    });
}
