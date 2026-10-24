import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { generateContactSheet } from './generateContactSheet.js';

export default async function globalTeardown() {
  const rootDir = 'C:\\RippleAI';
  const backendDir = path.join(rootDir, 'backend');
  const frontendDir = path.join(rootDir, 'frontend');
  const runtimeFile = path.join(frontendDir, 'e2e', '.qa-runtime.json');
  const seedFile = path.join(frontendDir, 'e2e', '.seed-info.json');

  console.log('\n============================================================');
  console.log('[globalTeardown] Step 13a QA Teardown & Verification');
  console.log('============================================================');

  // 1. Generate contact sheet
  try {
    generateContactSheet(path.join(frontendDir, 'qa-screenshots'));
  } catch (err: any) {
    console.error('[globalTeardown] Error generating contact sheet:', err.message);
  }

  if (!fs.existsSync(runtimeFile)) {
    console.log('[globalTeardown] No runtime file found, nothing to clean up.');
    return;
  }

  const runtimeInfo = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'));
  const { backendPid, frontendPid, tempDir, dataMtimeBefore, storageMtimeBefore } = runtimeInfo;

  // 2. Kill processes
  console.log(`[globalTeardown] Stopping QA processes (frontend PID: ${frontendPid}, backend PID: ${backendPid})...`);
  if (frontendPid) {
    try {
      execSync(`taskkill /pid ${frontendPid} /T /F`, { stdio: 'ignore' });
    } catch {}
  }
  if (backendPid) {
    try {
      execSync(`taskkill /pid ${backendPid} /T /F`, { stdio: 'ignore' });
    } catch {}
  }

  // 3. Delete temp directory
  if (tempDir && fs.existsSync(tempDir)) {
    console.log(`[globalTeardown] Deleting isolated temp directory: ${tempDir}`);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log('[globalTeardown] Temp directory deleted.');
    } catch (err: any) {
      console.warn('[globalTeardown] Note on temp directory cleanup:', err.message);
    }
  }

  // 4. Remove runtime & seed files
  try {
    if (fs.existsSync(runtimeFile)) fs.unlinkSync(runtimeFile);
    if (fs.existsSync(seedFile)) fs.unlinkSync(seedFile);
  } catch {}

  // 5. Verify ports 3100 and 4100 are free
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const netstatOutput = execSync('netstat -ano', { encoding: 'utf8' });
    const lines = netstatOutput.split(/\r?\n/);
    const port3100Listening = lines.some((l) => l.includes(':3100') && l.includes('LISTENING'));
    const port4100Listening = lines.some((l) => l.includes(':4100') && l.includes('LISTENING'));
    console.log(`[globalTeardown] Port 3100 free: ${!port3100Listening}`);
    console.log(`[globalTeardown] Port 4100 free: ${!port4100Listening}`);
  } catch {
    console.log('[globalTeardown] Port check completed.');
  }

  // 6. Verify mtimes
  const dataMtimeAfter = fs.statSync(path.join(backendDir, 'data')).mtime.toISOString();
  const storageMtimeAfter = fs.statSync(path.join(backendDir, 'storage')).mtime.toISOString();
  console.log(`[globalTeardown] backend/data mtime:    ${dataMtimeAfter} (unchanged: ${dataMtimeAfter === dataMtimeBefore})`);
  console.log(`[globalTeardown] backend/storage mtime: ${storageMtimeAfter} (unchanged: ${storageMtimeAfter === storageMtimeBefore})`);
  console.log('============================================================\n');
}
