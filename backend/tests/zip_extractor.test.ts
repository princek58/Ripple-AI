import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import yazl from 'yazl';
import { extractZip } from '../src/analysis/zip/extractor.js';
import { ZipError } from '../src/analysis/zip/types.js';

const TEST_TMP_DIR = path.resolve(__dirname, 'tmp_zip_tests');

interface RawZipEntry {
  name: string;
  data: Buffer | string;
  compressedData?: Buffer;
  compressionMethod?: number; // 0 = stored, 8 = deflated
  crc?: number;
  compressedSize?: number;
  uncompressedSize?: number;
  externalFileAttributes?: number;
}

/**
 * Helper to construct handcrafted ZIP buffers for edge cases
 * (e.g. zip slip, lying headers, symlinks, duplicate entries).
 */
function createRawZipBuffer(entries: RawZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const cdParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf-8');
    const rawData = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || '', 'utf-8');

    let bodyBuf = rawData;
    let method = entry.compressionMethod ?? 0;

    if (entry.compressedData) {
      bodyBuf = entry.compressedData;
      method = entry.compressionMethod ?? 8;
    }

    const crc = entry.crc !== undefined ? entry.crc : zlib.crc32(rawData);
    const compSize = entry.compressedSize !== undefined ? entry.compressedSize : bodyBuf.length;
    const uncompSize = entry.uncompressedSize !== undefined ? entry.uncompressedSize : rawData.length;
    const extAttrs = entry.externalFileAttributes !== undefined ? entry.externalFileAttributes : 0;

    // Local file header (30 bytes + name + body)
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // signature
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0, 6); // general purpose bit flag
    lh.writeUInt16LE(method, 8); // compression method
    lh.writeUInt16LE(0, 10); // last mod time
    lh.writeUInt16LE(0, 12); // last mod date
    lh.writeUInt32LE(crc, 14); // crc-32
    lh.writeUInt32LE(compSize, 18); // compressed size
    lh.writeUInt32LE(uncompSize, 22); // uncompressed size
    lh.writeUInt16LE(nameBuf.length, 26); // file name length
    lh.writeUInt16LE(0, 28); // extra field length

    localParts.push(lh, nameBuf, bodyBuf);

    // Central directory header (46 bytes + name)
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // signature
    cd.writeUInt16LE(0x031e, 4); // version made by: Unix (0x03)
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // general purpose bit flag
    cd.writeUInt16LE(method, 10); // compression method
    cd.writeUInt16LE(0, 12); // last mod time
    cd.writeUInt16LE(0, 14); // last mod date
    cd.writeUInt32LE(crc, 16); // crc-32
    cd.writeUInt32LE(compSize, 20); // compressed size
    cd.writeUInt32LE(uncompSize, 24); // uncompressed size
    cd.writeUInt16LE(nameBuf.length, 28); // file name length
    cd.writeUInt16LE(0, 30); // extra field length
    cd.writeUInt16LE(0, 32); // comment length
    cd.writeUInt16LE(0, 34); // disk number start
    cd.writeUInt16LE(0, 36); // internal file attributes
    cd.writeUInt32LE(extAttrs, 38); // external file attributes (symlink mode in upper 16 bits)
    cd.writeUInt32LE(offset, 42); // relative offset of local header

    cdParts.push(cd, nameBuf);
    offset += lh.length + nameBuf.length + bodyBuf.length;
  }

  const cdBuffer = Buffer.concat(cdParts);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // number of this disk
  eocd.writeUInt16LE(0, 6); // number of the disk with start of central directory
  eocd.writeUInt16LE(entries.length, 8); // total number of entries in central directory on this disk
  eocd.writeUInt16LE(entries.length, 10); // total number of entries in central directory
  eocd.writeUInt32LE(cdBuffer.length, 12); // size of the central directory
  eocd.writeUInt32LE(offset, 16); // offset of start of central directory
  eocd.writeUInt16LE(0, 20); // ZIP file comment length

  return Buffer.concat([...localParts, cdBuffer, eocd]);
}

/**
 * Helper to build a standard ZIP file with yazl.
 */
function createYazlZip(
  entries: { name: string; content: string | Buffer }[],
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const zipfile = new yazl.ZipFile();
    for (const entry of entries) {
      const buf = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, 'utf-8');
      zipfile.addBuffer(buf, entry.name);
    }
    zipfile.end();

    const outStream = fs.createWriteStream(outputPath);
    zipfile.outputStream.pipe(outStream);
    outStream.on('finish', () => resolve());
    outStream.on('error', reject);
  });
}

describe('Safe ZIP Extraction Engine', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_TMP_DIR)) {
      fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_TMP_DIR)) {
      fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true });
    }
  });

  it('1. valid small ZIP extracts and lists files (stripping single top-level directory)', async () => {
    const zipPath = path.join(TEST_TMP_DIR, 'valid.zip');
    const destDir = path.join(TEST_TMP_DIR, 'extracted_valid');

    await createYazlZip(
      [
        { name: 'my-project/src/index.ts', content: 'console.log("hello");' },
        { name: 'my-project/package.json', content: '{"name": "test"}' },
        { name: 'my-project/README.md', content: '# Readme' },
      ],
      zipPath
    );

    const result = await extractZip(zipPath, destDir);

    expect(result.extractedCount).toBe(3);
    expect(result.skippedCount).toBe(0);

    const paths = result.files.map((f) => f.path);
    // Single top-level directory 'my-project/' must be stripped
    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('package.json');
    expect(paths).toContain('README.md');

    // Verify files physically exist on disk
    expect(fs.existsSync(path.join(destDir, 'src/index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(destDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(destDir, 'README.md'))).toBe(true);

    const indexFile = result.files.find((f) => f.path === 'src/index.ts');
    expect(indexFile?.language).toBe('TypeScript');
    expect(indexFile?.sensitive).toBe(false);
  });

  it('2. node_modules is skipped', async () => {
    const zipPath = path.join(TEST_TMP_DIR, 'with_modules.zip');
    const destDir = path.join(TEST_TMP_DIR, 'extracted_modules');

    await createYazlZip(
      [
        { name: 'src/main.ts', content: 'export const x = 1;' },
        { name: 'node_modules/express/index.js', content: 'module.exports = {};' },
        { name: '.git/config', content: '[core]' },
      ],
      zipPath
    );

    const result = await extractZip(zipPath, destDir);

    expect(result.extractedCount).toBe(1);
    expect(result.skippedCount).toBe(2);

    expect(result.files.map((f) => f.path)).toEqual(['src/main.ts']);
    expect(fs.existsSync(path.join(destDir, 'src/main.ts'))).toBe(true);
    expect(fs.existsSync(path.join(destDir, 'node_modules'))).toBe(false);
    expect(fs.existsSync(path.join(destDir, '.git'))).toBe(false);

    expect(result.skipped.some((s) => s.path.includes('node_modules'))).toBe(true);
  });

  it('3. zip-slip entry is rejected and nothing is written outside destDir', async () => {
    const zipPath = path.join(TEST_TMP_DIR, 'slip.zip');
    const destDir = path.join(TEST_TMP_DIR, 'extracted_slip');
    const escapeTarget = path.join(TEST_TMP_DIR, 'escaped.txt');

    const zipBuffer = createRawZipBuffer([
      { name: '../escaped.txt', data: 'malicious payload' },
      { name: 'safe.txt', data: 'safe content' },
    ]);
    fs.writeFileSync(zipPath, zipBuffer);

    let error: unknown;
    try {
      await extractZip(zipPath, destDir);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ZipError);
    expect((error as ZipError).code).toBe('ZIP_UNSAFE_PATH');
    expect(fs.existsSync(escapeTarget)).toBe(false);
    expect(fs.existsSync(destDir)).toBe(false);
  });

  it('4. too many files is rejected', async () => {
    const zipPath = path.join(TEST_TMP_DIR, 'many_files.zip');
    const destDir = path.join(TEST_TMP_DIR, 'extracted_many');

    await createYazlZip(
      [
        { name: 'file1.txt', content: '1' },
        { name: 'file2.txt', content: '2' },
        { name: 'file3.txt', content: '3' },
        { name: 'file4.txt', content: '4' },
      ],
      zipPath
    );

    // Limit to max 3 files
    let error: unknown;
    try {
      await extractZip(zipPath, destDir, { maxFilesCount: 3 });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ZipError);
    expect((error as ZipError).code).toBe('ZIP_TOO_MANY_FILES');
    expect(fs.existsSync(destDir)).toBe(false);
  });

  it('5. zip-bomb-style ratio is rejected for files >= 1MB, but legit 500 KB compressible file is accepted', async () => {
    // Part A: Legit highly compressible 500 KB file (500 KB zeros deflates to ~500 bytes, ratio ~1000:1)
    // Because it is < 1 MB, ratio check is not triggered and file is accepted.
    const legitZipPath = path.join(TEST_TMP_DIR, 'legit_compressible.zip');
    const legitDestDir = path.join(TEST_TMP_DIR, 'extracted_legit');

    const legitData = Buffer.alloc(500 * 1024, 0);
    const legitDeflated = zlib.deflateRawSync(legitData);

    const legitZipBuffer = createRawZipBuffer([
      {
        name: 'zeros_500kb.txt',
        data: legitData,
        compressedData: legitDeflated,
        compressionMethod: 8,
        compressedSize: legitDeflated.length,
        uncompressedSize: legitData.length,
      },
    ]);
    fs.writeFileSync(legitZipPath, legitZipBuffer);

    const legitResult = await extractZip(legitZipPath, legitDestDir, { maxCompressionRatio: 10 });
    expect(legitResult.extractedCount).toBe(1);
    expect(fs.existsSync(path.join(legitDestDir, 'zeros_500kb.txt'))).toBe(true);
    expect(fs.statSync(path.join(legitDestDir, 'zeros_500kb.txt')).size).toBe(500 * 1024);

    // Part B: Real bomb (1.5 MB uncompressed from ~1.5 KB deflated, ratio ~1000:1, exceeding 1 MB threshold)
    const bombZipPath = path.join(TEST_TMP_DIR, 'real_bomb.zip');
    const bombDestDir = path.join(TEST_TMP_DIR, 'extracted_bomb');

    const bombData = Buffer.alloc(Math.floor(1.5 * 1024 * 1024), 0);
    const bombDeflated = zlib.deflateRawSync(bombData);

    const bombZipBuffer = createRawZipBuffer([
      {
        name: 'bomb_1_5mb.txt',
        data: bombData,
        compressedData: bombDeflated,
        compressionMethod: 8,
        compressedSize: bombDeflated.length,
        uncompressedSize: bombData.length,
      },
    ]);
    fs.writeFileSync(bombZipPath, bombZipBuffer);

    let error: unknown;
    try {
      await extractZip(bombZipPath, bombDestDir, { maxCompressionRatio: 10 });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ZipError);
    expect((error as ZipError).code).toBe('ZIP_BOMB');
    expect(fs.existsSync(bombDestDir)).toBe(false);
  });

  it('6. a ZIP whose header lies about size is stopped by the real byte counter', async () => {
    const zipPath = path.join(TEST_TMP_DIR, 'lying_header.zip');
    const destDir = path.join(TEST_TMP_DIR, 'extracted_lying');

    // Actual decompressed data is 10,000 bytes, but header claims only 10 bytes
    const realData = Buffer.alloc(10000, 'A');
    const deflatedData = zlib.deflateRawSync(realData);

    const zipBuffer = createRawZipBuffer([
      {
        name: 'lying.txt',
        data: realData,
        compressedData: deflatedData,
        compressionMethod: 8, // deflated
        compressedSize: deflatedData.length,
        uncompressedSize: 10, // lie in header: claims to be 10 bytes
      },
    ]);
    fs.writeFileSync(zipPath, zipBuffer);

    // Limit single file to 5000 bytes
    let error: unknown;
    try {
      await extractZip(zipPath, destDir, { maxSingleFileSizeBytes: 5000 });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ZipError);
    expect((error as ZipError).code).toBe('ZIP_TOO_LARGE');
    expect(fs.existsSync(destDir)).toBe(false);
  });

  it('7. .env values never appear on disk', async () => {
    const zipPath = path.join(TEST_TMP_DIR, 'env_secrets.zip');
    const destDir = path.join(TEST_TMP_DIR, 'extracted_env');

    const envContent = [
      '# App configuration',
      'PORT=5000',
      'DATABASE_URL=postgres://admin:SUPER_SECRET_PASSWORD@localhost:5432/db',
      'API_KEY="secret-token-12345"',
      'export JWT_SECRET=do_not_leak_this',
      'EMPTY_KEY=',
    ].join('\n');

    await createYazlZip(
      [
        { name: '.env', content: envContent },
        { name: '.env.local', content: 'LOCAL_SECRET=local_pass' },
        { name: 'src/app.ts', content: 'console.log("safe");' },
      ],
      zipPath
    );

    const result = await extractZip(zipPath, destDir);

    expect(result.extractedCount).toBe(3);

    // Read the extracted .env on disk
    const extractedEnv = fs.readFileSync(path.join(destDir, '.env'), 'utf-8');
    expect(extractedEnv).not.toContain('SUPER_SECRET_PASSWORD');
    expect(extractedEnv).not.toContain('secret-token-12345');
    expect(extractedEnv).not.toContain('do_not_leak_this');
    expect(extractedEnv).not.toContain('local_pass');

    // Values should be stripped to KEY= lines only; comments must be dropped
    expect(extractedEnv).toContain('PORT=');
    expect(extractedEnv).toContain('DATABASE_URL=');
    expect(extractedEnv).toContain('API_KEY=');
    expect(extractedEnv).toContain('JWT_SECRET=');
    expect(extractedEnv).toContain('EMPTY_KEY=');
    expect(extractedEnv).not.toContain('# App configuration');

    const envFileResult = result.files.find((f) => f.path === '.env');
    expect(envFileResult?.sensitive).toBe(true);

    const appFileResult = result.files.find((f) => f.path === 'src/app.ts');
    expect(appFileResult?.sensitive).toBe(false);
  });

  it('8. a failed extraction leaves no leftover folder', async () => {
    const zipPath = path.join(TEST_TMP_DIR, 'corrupt.zip');
    const destDir = path.join(TEST_TMP_DIR, 'should_be_cleaned_up');

    // Write invalid/corrupt data
    fs.writeFileSync(zipPath, Buffer.from('not a zip file at all'));

    let error: unknown;
    try {
      await extractZip(zipPath, destDir);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ZipError);
    expect(fs.existsSync(destDir)).toBe(false);
  });

  it('9. duplicate and case-colliding paths are rejected', async () => {
    const zipPath = path.join(TEST_TMP_DIR, 'collision.zip');
    const destDir = path.join(TEST_TMP_DIR, 'extracted_collision');

    // One entry with 'README.md' and another with 'readme.md'
    const zipBuffer = createRawZipBuffer([
      { name: 'README.md', data: 'Uppercase' },
      { name: 'readme.md', data: 'Lowercase' },
    ]);
    fs.writeFileSync(zipPath, zipBuffer);

    let error: unknown;
    try {
      await extractZip(zipPath, destDir);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ZipError);
    expect((error as ZipError).code).toBe('ZIP_UNSAFE_PATH');
    expect(fs.existsSync(destDir)).toBe(false);
  });

  it('10. a symlink entry is rejected', async () => {
    const zipPath = path.join(TEST_TMP_DIR, 'symlink.zip');
    const destDir = path.join(TEST_TMP_DIR, 'extracted_symlink');

    // Unix symlink mode is 0o120000 (S_IFLNK) in the upper 16 bits of external attributes
    const symlinkAttributes = (0o120777 << 16) >>> 0;
    const zipBuffer = createRawZipBuffer([
      {
        name: 'link_to_etc_passwd',
        data: '/etc/passwd',
        externalFileAttributes: symlinkAttributes,
      },
    ]);
    fs.writeFileSync(zipPath, zipBuffer);

    let error: unknown;
    try {
      await extractZip(zipPath, destDir);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ZipError);
    expect((error as ZipError).code).toBe('ZIP_UNSAFE_PATH');
    expect(fs.existsSync(destDir)).toBe(false);
  });
});
