import fs from 'node:fs';
import path from 'node:path';
import config from '../../config.js';
import { ZipError } from '../zip/types.js';
import { GithubError, type DownloadGithubZipOptions, type ParsedGithubUrl } from './types.js';

export async function downloadGithubZip(
  parsed: ParsedGithubUrl,
  destFile: string,
  options?: DownloadGithubZipOptions
): Promise<{ bytesWritten: number }> {
  const codeloadBase = options?.codeloadBase ?? config.githubCodeloadBase;
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const maxBytes = options?.maxBytes ?? config.upload.maxZipSizeBytes;

  const ref = parsed.ref || 'HEAD';
  let currentUrl = `${codeloadBase.replace(/\/+$/, '')}/${parsed.owner}/${parsed.repo}/zip/${ref}`;

  let configuredBaseUrl: URL;
  try {
    configuredBaseUrl = new URL(codeloadBase);
  } catch {
    throw new GithubError('GITHUB_UNREACHABLE', 'Configured GitHub base URL is invalid');
  }

  const configuredBaseHost = configuredBaseUrl.host.toLowerCase();
  const configuredBaseHostname = configuredBaseUrl.hostname.toLowerCase();

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error('TIMEOUT'));
  }, timeoutMs);

  let redirectCount = 0;
  const MAX_REDIRECTS = 3;
  let fileStream: fs.WriteStream | null = null;

  try {
    let response: Response | null = null;

    while (true) {
      let res: Response;
      try {
        res = await fetch(currentUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'RippleAI',
            'Accept': 'application/zip, application/octet-stream, */*',
          },
          redirect: 'manual',
          signal: controller.signal,
        });
      } catch (fetchErr: any) {
        if (controller.signal.aborted) {
          throw new GithubError('GITHUB_UNREACHABLE', 'Download from GitHub timed out');
        }
        throw new GithubError(
          'GITHUB_UNREACHABLE',
          `Failed to connect to GitHub: ${fetchErr?.message || 'Network error'}`
        );
      }

      // Handle Redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          throw new GithubError('GITHUB_REDIRECT_BLOCKED', 'Too many redirects (maximum 3 allowed)');
        }

        const location = res.headers.get('location');
        if (!location) {
          throw new GithubError('GITHUB_UNREACHABLE', 'Redirect response missing Location header');
        }

        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          throw new GithubError('GITHUB_REDIRECT_BLOCKED', 'Invalid redirect Location header');
        }

        if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
          throw new GithubError(
            'GITHUB_REDIRECT_BLOCKED',
            `Unsupported redirect protocol "${nextUrl.protocol}"`
          );
        }

        const targetHost = nextUrl.host.toLowerCase();
        const targetHostname = nextUrl.hostname.toLowerCase();

        const isAllowed =
          targetHost === configuredBaseHost ||
          targetHostname === configuredBaseHostname ||
          targetHostname === 'github.com' ||
          targetHostname === 'codeload.github.com';

        if (!isAllowed) {
          throw new GithubError(
            'GITHUB_REDIRECT_BLOCKED',
            `Redirect to untrusted host "${nextUrl.host}" is blocked`
          );
        }

        currentUrl = nextUrl.toString();
        continue;
      }

      // Check HTTP error statuses
      if (res.status === 404 || res.status === 403) {
        throw new GithubError(
          'GITHUB_REPO_NOT_FOUND',
          'Repository does not exist or is private (only public repositories are supported)'
        );
      }

      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        throw new GithubError(
          'GITHUB_UNAVAILABLE',
          `GitHub service is temporarily unavailable or rate limited (HTTP ${res.status})`
        );
      }

      if (res.status !== 200) {
        throw new GithubError('GITHUB_UNREACHABLE', `GitHub request failed with HTTP ${res.status}`);
      }

      response = res;
      break;
    }

    if (!response || !response.body) {
      throw new GithubError('GITHUB_UNREACHABLE', 'No response body received from GitHub');
    }

    // Check Content-Length header if provided
    const contentLengthHeader = response.headers.get('content-length');
    let expectedLength: number | null = null;
    if (contentLengthHeader !== null) {
      const parsedLen = parseInt(contentLengthHeader, 10);
      if (!isNaN(parsedLen) && parsedLen >= 0) {
        expectedLength = parsedLen;
        if (expectedLength > maxBytes) {
          throw new GithubError(
            'GITHUB_REPO_TOO_LARGE',
            `Repository ZIP exceeds maximum allowed size of ${maxBytes} bytes`
          );
        }
      }
    }

    // Ensure destination directory exists
    const destDir = path.dirname(destFile);
    fs.mkdirSync(destDir, { recursive: true });

    fileStream = fs.createWriteStream(destFile);
    fileStream.on('error', () => {});
    let bytesWritten = 0;
    let headerBuffer = Buffer.alloc(0);
    let pkChecked = false;

    const reader = response.body.getReader();

    while (true) {
      let chunkResult: { done: boolean; value?: Uint8Array };
      try {
        chunkResult = await reader.read();
      } catch (readErr: any) {
        if (controller.signal.aborted) {
          throw new GithubError('GITHUB_UNREACHABLE', 'Download from GitHub timed out');
        }
        throw new GithubError(
          'GITHUB_UNREACHABLE',
          `Error reading stream from GitHub: ${readErr?.message || 'Stream interrupted'}`
        );
      }

      if (chunkResult.done) {
        break;
      }

      const value = chunkResult.value;
      if (value && value.length > 0) {
        const chunk = Buffer.from(value);
        bytesWritten += chunk.length;

        // Check if stream exceeds max size
        if (bytesWritten > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new GithubError(
            'GITHUB_REPO_TOO_LARGE',
            `Repository ZIP exceeds maximum allowed size of ${maxBytes} bytes`
          );
        }

        // Check first 2 bytes are PK (0x50, 0x4B)
        if (!pkChecked) {
          headerBuffer = Buffer.concat([headerBuffer, chunk]);
          if (headerBuffer.length >= 2) {
            if (headerBuffer[0] !== 0x50 || headerBuffer[1] !== 0x4b) {
              await reader.cancel().catch(() => {});
              throw new ZipError(
                'ZIP_INVALID',
                'Downloaded repository is not a valid ZIP archive (missing PK signature)'
              );
            }
            pkChecked = true;
          }
        }

        // Write chunk to destination file
        const canWrite = fileStream.write(chunk);
        if (!canWrite) {
          await new Promise<void>((resolve, reject) => {
            fileStream!.once('drain', resolve);
            fileStream!.once('error', reject);
          });
        }
      }
    }

    // Close and flush destination file
    await new Promise<void>((resolve, reject) => {
      fileStream!.end((err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    fileStream = null;

    // Validate minimum size and PK signature check was reached
    if (bytesWritten < 2 || !pkChecked) {
      throw new ZipError(
        'ZIP_INVALID',
        'Downloaded repository is not a valid ZIP archive (missing PK signature)'
      );
    }

    // Verify Content-Length did not lie (if Content-Length was provided)
    if (expectedLength !== null && bytesWritten !== expectedLength) {
      throw new GithubError(
        'GITHUB_UNREACHABLE',
        `Download size mismatch: Content-Length specified ${expectedLength} bytes but received ${bytesWritten} bytes`
      );
    }

    return { bytesWritten };
  } catch (err: any) {
    if (fileStream) {
      await new Promise<void>((resolve) => {
        if ((fileStream as any).closed) return resolve();
        fileStream!.once('close', () => resolve());
        fileStream!.destroy();
      });
      fileStream = null;
    }

    if (fs.existsSync(destFile)) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          fs.unlinkSync(destFile);
          break;
        } catch (e: any) {
          if (attempt < 4 && (e.code === 'EBUSY' || e.code === 'EPERM')) {
            const start = Date.now();
            while (Date.now() - start < 20) {}
          }
        }
      }
    }

    if (controller.signal.aborted) {
      throw new GithubError('GITHUB_UNREACHABLE', 'Download from GitHub timed out');
    }

    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
