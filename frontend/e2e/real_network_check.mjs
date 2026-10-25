import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ripple_real_net_'));
  fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'storage', 'tmp'), { recursive: true });

  console.log('[real-net] Starting isolated backend on port 4100 (DEFAULT codeload base URL: https://codeload.github.com)...');
  const backendProc = spawn(
    process.execPath,
    [path.resolve(rootDir, 'backend/dist/server.js')],
    {
      env: {
        ...process.env,
        PORT: '4100',
        NODE_ENV: 'test',
        DB_PATH: path.join(tempDir, 'data', 'ripple.db'),
        STORAGE_PATH: path.join(tempDir, 'storage'),
        TEMP_STORAGE_PATH: path.join(tempDir, 'storage', 'tmp'),
        // No GITHUB_CODELOAD_BASE -> defaults to https://codeload.github.com
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  backendProc.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`));
  backendProc.stderr.on('data', (d) => process.stderr.write(`[backend err] ${d}`));

  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:4100/api/health');
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!ready) {
    throw new Error('Backend failed to start on port 4100');
  }
  console.log('[real-net] Backend ready on port 4100.');

  try {
    const importPayload = JSON.stringify({ url: 'https://github.com/octocat/Hello-World' });
    const startTime = Date.now();

    console.log('[real-net] Running curl POST /api/projects/import-github for https://github.com/octocat/Hello-World...');
    const result = await new Promise((resolve) => {
      execFile(
        'curl.exe',
        [
          '-s',
          '-w',
          '\n%{http_code}',
          '-X',
          'POST',
          'http://127.0.0.1:4100/api/projects/import-github',
          '-H',
          'Content-Type: application/json',
          '-d',
          importPayload,
        ],
        (err, stdout, stderr) => {
          resolve({ err, stdout, stderr });
        }
      );
    });

    const elapsedMs = Date.now() - startTime;
    console.log(`[real-net] Request elapsed time: ${elapsedMs}ms`);

    const outputLines = result.stdout.trim().split('\n');
    const statusCode = outputLines[outputLines.length - 1];
    const bodyText = outputLines.slice(0, outputLines.length - 1).join('\n');

    console.log(`[real-net] HTTP Status: ${statusCode}`);
    console.log(`[real-net] Body: ${bodyText}`);

    let parsedBody;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      console.log('[real-net] Body could not be parsed as JSON');
    }

    if (statusCode === '201' && parsedBody?.data?.id) {
      const project = parsedBody.data;
      console.log('[real-net] Import succeeded!');
      console.log(`[real-net] Project ID: ${project.id}`);
      console.log(`[real-net] Project Name: ${project.name}`);
      console.log(`[real-net] File Count: ${project.file_count}`);
      console.log(`[real-net] Size (bytes): ${project.size_bytes}`);
      console.log(`[real-net] Languages: ${JSON.stringify(project.languages)}`);

      // Now scan it
      console.log(`[real-net] Scanning project ${project.id}...`);
      const scanStartTime = Date.now();
      const scanResult = await new Promise((resolve) => {
        execFile(
          'curl.exe',
          [
            '-s',
            '-w',
            '\n%{http_code}',
            '-X',
            'POST',
            `http://127.0.0.1:4100/api/projects/${project.id}/scan`,
          ],
          (err, stdout, stderr) => {
            resolve({ err, stdout, stderr });
          }
        );
      });
      const scanElapsedMs = Date.now() - scanStartTime;
      const scanLines = scanResult.stdout.trim().split('\n');
      const scanStatus = scanLines[scanLines.length - 1];
      const scanBody = scanLines.slice(0, scanLines.length - 1).join('\n');
      console.log(`[real-net] Scan HTTP Status: ${scanStatus} (${scanElapsedMs}ms)`);
      console.log(`[real-net] Scan Body: ${scanBody}`);
    } else {
      console.log('[real-net] Real-network import FAILED or was BLOCKED');
    }
  } finally {
    console.log('[real-net] Stopping backend...');
    backendProc.kill();
    await new Promise((r) => setTimeout(r, 500));
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('[real-net] Cleanup complete.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
