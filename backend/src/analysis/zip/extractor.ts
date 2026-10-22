import fs from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';
import config, { type UploadLimits } from '../../config.js';
import { ZipError, type ExtractResult, type ExtractedFile, type SkippedItem } from './types.js';
import { isEnvFile, sanitizeEnvContent, detectLanguage } from './sanitizer.js';

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '__pycache__',
  'venv',
]);

function validateZipEntryPath(fileName: string): void {
  // 1. Null byte injection
  if (fileName.includes('\0')) {
    throw new ZipError('ZIP_UNSAFE_PATH', 'Path contains null bytes');
  }

  // 2. Backslash tricks (ZIP spec requires forward slash '/')
  if (fileName.includes('\\')) {
    throw new ZipError('ZIP_UNSAFE_PATH', 'Path contains backslashes');
  }

  // 3. Absolute paths (POSIX)
  if (fileName.startsWith('/')) {
    throw new ZipError('ZIP_UNSAFE_PATH', 'Absolute paths are not allowed in ZIP');
  }

  // 4. Windows drive letters (e.g. C: or d:)
  if (/^[a-zA-Z]:/.test(fileName)) {
    throw new ZipError('ZIP_UNSAFE_PATH', 'Windows drive letters are not allowed in ZIP');
  }

  // 5. Path traversal (..)
  const segments = fileName.split('/');
  for (const seg of segments) {
    if (seg === '..') {
      throw new ZipError('ZIP_UNSAFE_PATH', 'Path traversal (..) is not allowed');
    }
  }
}

function isSymlink(entry: yauzl.Entry): boolean {
  // In Unix zip entries, file mode is in the upper 16 bits of externalFileAttributes
  const unixMode = (entry.externalFileAttributes >> 16) & 0o170000;
  return unixMode === 0o120000;
}

function determineTopLevelStripPrefix(entries: yauzl.Entry[]): string {
  const nonDirEntries = entries.filter((e) => !e.fileName.endsWith('/'));
  if (nonDirEntries.length === 0) {
    return '';
  }

  const topSegments = new Set<string>();
  for (const entry of nonDirEntries) {
    const parts = entry.fileName.split('/');
    if (parts.length > 1) {
      topSegments.add(parts[0]);
    } else {
      // Entry is at the root level, so no single top-level folder exists
      return '';
    }
  }

  if (topSegments.size === 1) {
    return Array.from(topSegments)[0] + '/';
  }

  return '';
}

export async function extractZip(
  zipPath: string,
  destDir: string,
  customLimits?: Partial<UploadLimits>
): Promise<ExtractResult> {
  const limits: UploadLimits = {
    ...config.upload,
    ...customLimits,
  };

  if (!fs.existsSync(zipPath)) {
    throw new ZipError('ZIP_INVALID', 'ZIP file does not exist');
  }

  const stat = fs.statSync(zipPath);
  if (stat.size === 0) {
    throw new ZipError('ZIP_INVALID', 'ZIP file is empty');
  }

  // Check file size against maxZipSizeBytes
  if (stat.size > limits.maxZipSizeBytes) {
    throw new ZipError(
      'ZIP_TOO_LARGE',
      `ZIP file size (${stat.size} bytes) exceeds maximum limit (${limits.maxZipSizeBytes} bytes)`
    );
  }

  let zipfile: yauzl.ZipFile | null = null;

  try {
    // Open ZIP file with yauzl
    zipfile = await new Promise<yauzl.ZipFile>((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zf) => {
        if (err || !zf) {
          const msg = err ? err.message : 'Failed to open ZIP';
          if (
            msg.includes('relative path') ||
            msg.includes('fileName') ||
            msg.includes('..') ||
            msg.includes('path')
          ) {
            return reject(new ZipError('ZIP_UNSAFE_PATH', msg));
          }
          return reject(new ZipError('ZIP_INVALID', msg));
        }
        resolve(zf);
      });
    });

    // PASS 1: Read and validate all entries before extraction
    const entries: yauzl.Entry[] = [];
    const seenLowerPaths = new Set<string>();

    await new Promise<void>((resolve, reject) => {
      zipfile!.on('entry', (entry: yauzl.Entry) => {
        try {
          entries.push(entry);

          // 1. Entry count check
          if (entries.length > limits.maxFilesCount) {
            return reject(
              new ZipError(
                'ZIP_TOO_MANY_FILES',
                `ZIP contains too many files (exceeded ${limits.maxFilesCount})`
              )
            );
          }

          // 2. Validate path safety
          validateZipEntryPath(entry.fileName);

          // 3. Reject symlinks
          if (isSymlink(entry)) {
            return reject(
              new ZipError('ZIP_UNSAFE_PATH', `Symlink entry rejected: ${entry.fileName}`)
            );
          }

          // 4. Reject duplicate or case-colliding paths (for non-directory entries)
          if (!entry.fileName.endsWith('/')) {
            const lower = entry.fileName.toLowerCase();
            if (seenLowerPaths.has(lower)) {
              return reject(
                new ZipError(
                  'ZIP_UNSAFE_PATH',
                  `Duplicate or case-colliding path detected: ${entry.fileName}`
                )
              );
            }
            seenLowerPaths.add(lower);
          }

          zipfile!.readEntry();
        } catch (validationErr) {
          reject(validationErr);
        }
      });

      zipfile!.on('end', () => resolve());
      zipfile!.on('error', (err) => {
        const msg = err ? err.message : 'ZIP read error';
        if (
          msg.includes('relative path') ||
          msg.includes('fileName') ||
          msg.includes('..') ||
          msg.includes('path')
        ) {
          return reject(new ZipError('ZIP_UNSAFE_PATH', msg));
        }
        reject(new ZipError('ZIP_INVALID', msg));
      });

      // Start reading entries
      zipfile!.readEntry();
    });

    // PASS 2: Extraction
    const stripPrefix = determineTopLevelStripPrefix(entries);

    // Prepare clean destination directory
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    fs.mkdirSync(destDir, { recursive: true });
    const resolvedDestDir = path.resolve(destDir);

    const extractedFiles: ExtractedFile[] = [];
    const skippedItems: SkippedItem[] = [];
    let totalRealBytes = 0;

    for (const entry of entries) {
      if (entry.fileName.endsWith('/')) {
        continue;
      }

      let relPath = entry.fileName;
      if (stripPrefix && relPath.startsWith(stripPrefix)) {
        relPath = relPath.slice(stripPrefix.length);
      }

      if (!relPath) {
        continue;
      }

      // Check if file is inside an ignored directory
      const segments = relPath.split('/');
      const isIgnored = segments.some((seg) => IGNORED_DIRECTORIES.has(seg));
      if (isIgnored) {
        skippedItems.push({ path: relPath, reason: 'IGNORED_DIRECTORY' });
        continue;
      }

      // Check declared uncompressed size against per-file limit
      if (entry.uncompressedSize > limits.maxSingleFileSizeBytes) {
        skippedItems.push({
          path: relPath,
          reason: `FILE_TOO_LARGE (${entry.uncompressedSize} > ${limits.maxSingleFileSizeBytes})`,
        });
        continue;
      }

      // Check destination path safety with path.resolve
      const targetPath = path.resolve(destDir, relPath);
      if (!targetPath.startsWith(resolvedDestDir + path.sep)) {
        throw new ZipError(
          'ZIP_UNSAFE_PATH',
          `Path escapes destination directory: ${relPath}`
        );
      }

      // Ensure target directory exists
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });

      // Stream the entry and count REAL uncompressed bytes
      await new Promise<void>((resolve, reject) => {
        // Set validateEntrySizes: false to allow our real-byte counter to handle lying headers
        (zipfile as any).openReadStream(entry, { validateEntrySizes: false }, (err: Error | null, readStream: any) => {
          if (err || !readStream) {
            return reject(
              new ZipError(
                'ZIP_INVALID',
                err ? err.message : `Failed to read stream for ${relPath}`
              )
            );
          }

          let fileRealBytes = 0;
          let aborted = false;

          const abortWithError = (zipErr: ZipError) => {
            if (aborted) return;
            aborted = true;
            readStream.destroy();
            reject(zipErr);
          };

          readStream.on('data', (chunk: Buffer) => {
            if (aborted) return;
            fileRealBytes += chunk.length;
            totalRealBytes += chunk.length;

            // 1. Real single-file size check (prevents lying headers)
            if (fileRealBytes > limits.maxSingleFileSizeBytes) {
              return abortWithError(
                new ZipError(
                  'ZIP_TOO_LARGE',
                  `Streamed file ${relPath} exceeded single file limit (${limits.maxSingleFileSizeBytes} bytes)`
                )
              );
            }

            // 2. Real total uncompressed size check
            if (totalRealBytes > limits.maxUncompressedSizeBytes) {
              return abortWithError(
                new ZipError(
                  'ZIP_TOO_LARGE',
                  `Total uncompressed bytes exceeded limit (${limits.maxUncompressedSizeBytes} bytes)`
                )
              );
            }

            // 3. Real compression ratio check (zip bomb)
            // Apply only after at least 1 MB has been decompressed for this entry
            // to avoid rejecting small, legit, highly-compressible files.
            const MIN_BYTES_FOR_RATIO_CHECK = 1024 * 1024; // 1 MB
            if (entry.compressedSize > 0 && fileRealBytes >= MIN_BYTES_FOR_RATIO_CHECK) {
              const ratio = fileRealBytes / entry.compressedSize;
              if (ratio > limits.maxCompressionRatio) {
                return abortWithError(
                  new ZipError(
                    'ZIP_BOMB',
                    `Zip bomb ratio exceeded for ${relPath}: ${ratio.toFixed(1)}:1 > ${limits.maxCompressionRatio}:1`
                  )
                );
              }
            }
          });

          const isSensitive = isEnvFile(relPath);

          if (isSensitive) {
            // Buffer sensitive env file in memory for sanitization
            const chunks: Buffer[] = [];
            readStream.on('data', (chunk: Buffer) => {
              if (!aborted) chunks.push(chunk);
            });

            readStream.on('error', (streamErr: Error) => {
              const msg = streamErr ? streamErr.message : 'Stream read error';
              if (msg.includes('too many bytes') || msg.includes('size mismatch')) {
                abortWithError(new ZipError('ZIP_TOO_LARGE', msg));
              } else {
                abortWithError(new ZipError('ZIP_INVALID', msg));
              }
            });

            readStream.on('end', () => {
              if (aborted) return;
              try {
                const rawContent = Buffer.concat(chunks).toString('utf-8');
                const sanitized = sanitizeEnvContent(rawContent);
                fs.writeFileSync(targetPath, sanitized, 'utf-8');
                const writtenSize = Buffer.byteLength(sanitized, 'utf-8');

                extractedFiles.push({
                  path: relPath,
                  size: writtenSize,
                  language: 'Environment',
                  sensitive: true,
                });
                resolve();
              } catch (writeErr) {
                reject(writeErr);
              }
            });
          } else {
            // Pipe directly to target file stream
            const writeStream = fs.createWriteStream(targetPath);

            readStream.on('error', (streamErr: Error) => {
              writeStream.destroy();
              const msg = streamErr ? streamErr.message : 'Stream read error';
              if (msg.includes('too many bytes') || msg.includes('size mismatch')) {
                abortWithError(new ZipError('ZIP_TOO_LARGE', msg));
              } else {
                abortWithError(new ZipError('ZIP_INVALID', msg));
              }
            });

            writeStream.on('error', (writeErr: Error) => {
              abortWithError(
                new ZipError('ZIP_INVALID', writeErr ? writeErr.message : 'Stream write error')
              );
            });

            writeStream.on('finish', () => {
              if (aborted) return;
              extractedFiles.push({
                path: relPath,
                size: fileRealBytes,
                language: detectLanguage(relPath),
                sensitive: false,
              });
              resolve();
            });

            readStream.pipe(writeStream);
          }
        });
      });
    }

    return {
      files: extractedFiles,
      skipped: skippedItems,
      totalEntries: entries.length,
      extractedCount: extractedFiles.length,
      skippedCount: skippedItems.length,
      totalBytes: totalRealBytes,
    };
  } catch (err) {
    // On any failure, delete partial extraction and leave nothing behind
    if (fs.existsSync(destDir)) {
      try {
        fs.rmSync(destDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup error if directory is already gone
      }
    }

    if (err instanceof ZipError) {
      throw err;
    }

    throw new ZipError('ZIP_INVALID', err instanceof Error ? err.message : 'ZIP extraction failed');
  } finally {
    if (zipfile) {
      try {
        zipfile.close();
      } catch {
        // Zipfile already closed
      }
    }
  }
}
