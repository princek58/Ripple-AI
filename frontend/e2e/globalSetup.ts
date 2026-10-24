import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { seedQaBackend } from './seedHelper.js';

async function waitUrl(url: string, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

export default async function globalSetup() {
  const rootDir = 'C:\\RippleAI';
  const backendDir = path.join(rootDir, 'backend');
  const frontendDir = path.join(rootDir, 'frontend');

  console.log('\n============================================================');
  console.log('[globalSetup] Step 13a QA Environment Initialization');
  console.log('============================================================');

  // 1. Record baseline mtimes
  const dataMtimeBefore = fs.statSync(path.join(backendDir, 'data')).mtime.toISOString();
  const storageMtimeBefore = fs.statSync(path.join(backendDir, 'storage')).mtime.toISOString();
  console.log(`[globalSetup] Baseline backend/data mtime:    ${dataMtimeBefore}`);
  console.log(`[globalSetup] Baseline backend/storage mtime: ${storageMtimeBefore}`);

  // 2. Create isolated temp dir
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ripple_qa_run_'));
  fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'storage', 'tmp'), { recursive: true });
  console.log(`[globalSetup] Created isolated temp directory: ${tempDir}`);

  const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const viteCli = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');

  // 3. Spawn QA backend on port 4100
  console.log('[globalSetup] Starting QA backend on port 4100...');
  const backendProc = spawn(
    process.execPath,
    [tsxCli, 'src/server.ts'],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        PORT: '4100',
        DB_PATH: path.join(tempDir, 'data', 'qa.db'),
        STORAGE_PATH: path.join(tempDir, 'storage'),
        TEMP_STORAGE_PATH: path.join(tempDir, 'storage', 'tmp'),
        CORS_ORIGIN: 'http://localhost:3100',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  backendProc.stdout.on('data', (d) => process.stdout.write(`[backend:4100] ${d}`));
  backendProc.stderr.on('data', (d) => process.stderr.write(`[backend:4100 err] ${d}`));

  await waitUrl('http://localhost:4100/api/health');
  console.log('[globalSetup] Backend on port 4100 is healthy.');

  // 4. Spawn QA frontend on port 3100
  console.log('[globalSetup] Starting QA frontend on port 3100 via e2e/qa.vite.config.ts...');
  const frontendProc = spawn(
    process.execPath,
    [viteCli, '--config', 'e2e/qa.vite.config.ts'],
    {
      cwd: frontendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  frontendProc.stdout.on('data', (d) => process.stdout.write(`[frontend:3100] ${d}`));
  frontendProc.stderr.on('data', (d) => process.stderr.write(`[frontend:3100 err] ${d}`));

  await waitUrl('http://localhost:3100');
  console.log('[globalSetup] Frontend on port 3100 is ready.');

  // Save runtime info early so teardown can clean up even on subsequent errors
  const runtimeInfo = {
    backendPid: backendProc.pid,
    frontendPid: frontendProc.pid,
    tempDir,
    dataMtimeBefore,
    storageMtimeBefore,
  };
  fs.writeFileSync(path.join(frontendDir, 'e2e', '.qa-runtime.json'), JSON.stringify(runtimeInfo, null, 2));

  // 5. PROXY ISOLATION PROOF
  console.log('\n------------------------------------------------------------');
  console.log('[globalSetup] EXECUTING PROXY ISOLATION PROOF');
  console.log('------------------------------------------------------------');
  const markerName = 'marker_proof_' + Date.now();
  const zipBytes = fs.readFileSync(path.join(rootDir, 'samples', 'demo-erp-sample.zip'));
  const blob = new Blob([zipBytes], { type: 'application/zip' });
  const form = new FormData();
  form.append('name', markerName);
  form.append('file', blob, 'marker.zip');

  const uploadRes = await fetch('http://localhost:3100/api/projects', {
    method: 'POST',
    body: form,
  });

  if (!uploadRes.ok) {
    throw new Error(`Proxy proof upload failed with status ${uploadRes.status}: ${await uploadRes.text()}`);
  }

  const uploadJson = await uploadRes.json();
  const markerId = uploadJson.data.id;

  // Check port 4100
  const res4100 = await fetch('http://localhost:4100/api/projects');
  const json4100 = await res4100.json();
  const foundOn4100 = (json4100.data || []).some((p: any) => p.id === markerId);

  // Check port 4000
  let foundOn4000 = false;
  let realBackendRunning = false;
  try {
    const res4000 = await fetch('http://localhost:4000/api/projects');
    const json4000 = await res4000.json();
    foundOn4000 = (json4000.data || []).some((p: any) => p.id === markerId);
    realBackendRunning = true;
  } catch {
    console.log('[globalSetup] Real backend is not responding on port 4000.');
  }

  // Check mtimes
  const dataMtimeNow = fs.statSync(path.join(backendDir, 'data')).mtime.toISOString();
  const storageMtimeNow = fs.statSync(path.join(backendDir, 'storage')).mtime.toISOString();
  const dataMtimeUnchanged = dataMtimeNow === dataMtimeBefore;
  const storageMtimeUnchanged = storageMtimeNow === storageMtimeBefore;

  console.log(`[globalSetup] Marker project ID:             ${markerId}`);
  console.log(`[globalSetup] Found in QA backend (port 4100): ${foundOn4100}`);
  if (realBackendRunning) {
    console.log(`[globalSetup] Found in real backend (port 4000): ${foundOn4000}`);
  }
  console.log(`[globalSetup] backend/data mtime unchanged:    ${dataMtimeUnchanged} (${dataMtimeNow})`);
  console.log(`[globalSetup] backend/storage mtime unchanged: ${storageMtimeUnchanged} (${storageMtimeNow})`);

  const proofPassed = foundOn4100 && !foundOn4000 && dataMtimeUnchanged;
  if (!proofPassed) {
    console.error('[globalSetup] CRITICAL: Proxy isolation proof FAILED! Terminating.');
    if (backendProc.pid) spawn('taskkill', ['/pid', String(backendProc.pid), '/T', '/F']);
    if (frontendProc.pid) spawn('taskkill', ['/pid', String(frontendProc.pid), '/T', '/F']);
    throw new Error('PROXY ISOLATION PROOF FAILED: frontend proxy is not correctly routing to isolated backend port 4100');
  }

  console.log('[globalSetup] PROOF CONFIRMED: Frontend proxy successfully routes to isolated QA backend at port 4100.');
  console.log('------------------------------------------------------------\n');

  // 6. Seed QA backend
  console.log('[globalSetup] Seeding QA backend...');
  const seedData = await seedQaBackend('http://localhost:4100');
  console.log('[globalSetup] Seeding complete:', seedData);

  // 7. Save seed info for tests
  fs.writeFileSync(path.join(frontendDir, 'e2e', '.seed-info.json'), JSON.stringify(seedData, null, 2));
  console.log('[globalSetup] QA environment setup finished successfully.\n');
}
