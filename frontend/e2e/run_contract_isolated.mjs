import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

// Minimal valid zip buffer
function createRawZipBuffer(entries) {
  const localParts = [];
  const cdParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf-8');
    const rawData = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || '', 'utf-8');
    const bodyBuf = rawData;
    const method = 0;

    let crc = 0;
    const crcTable = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crcTable[i] = c;
    }
    let c = 0xffffffff;
    for (let i = 0; i < rawData.length; i++) {
      c = crcTable[(c ^ rawData[i]) & 0xff] ^ (c >>> 8);
    }
    crc = (c ^ 0xffffffff) >>> 0;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(bodyBuf.length, 18);
    lh.writeUInt32LE(rawData.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);

    localParts.push(lh, nameBuf, bodyBuf);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(0x031e, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(bodyBuf.length, 20);
    cd.writeUInt32LE(rawData.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);

    cdParts.push(cd, nameBuf);
    offset += lh.length + nameBuf.length + bodyBuf.length;
  }

  const cdBuffer = Buffer.concat(cdParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, cdBuffer, eocd]);
}

const validZip = createRawZipBuffer([
  { name: 'package.json', data: JSON.stringify({ name: 'hello-world' }) },
  { name: 'index.js', data: 'console.log("hello");\n' }
]);

async function main() {
  console.log('[contract-runner] Starting mock server on 127.0.0.1...');
  const mockServer = http.createServer((req, res) => {
    const url = req.url || '';
    if (url === '/octocat/Hello-World/zip/HEAD') {
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': validZip.length.toString(),
      });
      res.end(validZip);
    } else if (url === '/octocat/Missing-Repo/zip/HEAD') {
      res.writeHead(404);
      res.end('Not Found');
    } else if (url === '/octocat/Huge-Repo/zip/HEAD') {
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': '100000000',
      });
      res.end(validZip);
    } else if (url === '/octocat/Blocked-Redirect/zip/HEAD') {
      res.writeHead(302, { Location: 'http://untrusted-external-domain.com/evil.zip' });
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const mockPort = mockServer.address().port;
  const mockBaseUrl = `http://127.0.0.1:${mockPort}`;
  console.log(`[contract-runner] Mock server listening on ${mockBaseUrl}`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ripple_qa_contract_'));
  fs.mkdirSync(path.join(tempDir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'storage', 'tmp'), { recursive: true });

  console.log(`[contract-runner] Starting isolated backend on port 4100...`);
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
        GITHUB_CODELOAD_BASE: mockBaseUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

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
  console.log('[contract-runner] Backend ready on port 4100.');

  try {
    console.log('[contract-runner] Running contract test with RIPPLE_CONTRACT=1 TEST_BACKEND_PORT=4100...');
    const testResult = await new Promise((resolve, reject) => {
      const vitestProc = spawn(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['vitest', 'run', 'src/test/projects.test.tsx', '-t', 'import-github response keys and error body shapes'],
        {
          cwd: path.resolve(rootDir, 'frontend'),
          env: {
            ...process.env,
            RIPPLE_CONTRACT: '1',
            TEST_BACKEND_PORT: '4100',
          },
          stdio: 'inherit',
          shell: true,
        }
      );
      vitestProc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`vitest exited with code ${code}`));
      });
    });
    console.log('[contract-runner] Contract tests PASSED successfully!');
  } finally {
    console.log('[contract-runner] Stopping backend and mock server...');
    backendProc.kill();
    await new Promise((r) => setTimeout(r, 500));
    mockServer.closeAllConnections?.();
    await new Promise((r) => mockServer.close(r));
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('[contract-runner] Cleanup complete.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
