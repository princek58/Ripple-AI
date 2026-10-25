import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  parseGithubUrl,
  downloadGithubZip,
  GithubError,
  type ParsedGithubUrl,
} from '../src/analysis/github/index.js';
import { ZipError } from '../src/analysis/zip/types.js';

describe('GitHub Core — URL Parsing and Download (Step G1 Part 1)', () => {
  describe('parseGithubUrl', () => {
    // Accepted cases
    it('accepts standard https://github.com/owner/repo', () => {
      const res = parseGithubUrl('https://github.com/facebook/react');
      expect(res).toEqual({ owner: 'facebook', repo: 'react', ref: 'HEAD' });
    });

    it('accepts optional trailing slash', () => {
      const res = parseGithubUrl('https://github.com/facebook/react/');
      expect(res).toEqual({ owner: 'facebook', repo: 'react', ref: 'HEAD' });
    });

    it('accepts optional .git suffix', () => {
      const res = parseGithubUrl('https://github.com/facebook/react.git');
      expect(res).toEqual({ owner: 'facebook', repo: 'react', ref: 'HEAD' });
    });

    it('accepts optional .git suffix with trailing slash', () => {
      const res = parseGithubUrl('https://github.com/facebook/react.git/');
      expect(res).toEqual({ owner: 'facebook', repo: 'react', ref: 'HEAD' });
    });

    it('accepts /tree/<branch> with simple branch name', () => {
      const res = parseGithubUrl('https://github.com/facebook/react/tree/main');
      expect(res).toEqual({ owner: 'facebook', repo: 'react', ref: 'main' });
    });

    it('accepts /tree/<branch> with nested branch name', () => {
      const res = parseGithubUrl('https://github.com/facebook/react/tree/feature/new-hooks');
      expect(res).toEqual({ owner: 'facebook', repo: 'react', ref: 'feature/new-hooks' });
    });

    it('accepts /tree/<branch> with dots, underscores, dashes, and numbers in branch', () => {
      const res = parseGithubUrl('https://github.com/facebook/react/tree/v18.2.0-rc_1');
      expect(res).toEqual({ owner: 'facebook', repo: 'react', ref: 'v18.2.0-rc_1' });
    });

    it('accepts /tree/<branch> with trailing slash', () => {
      const res = parseGithubUrl('https://github.com/facebook/react/tree/main/');
      expect(res).toEqual({ owner: 'facebook', repo: 'react', ref: 'main' });
    });

    it('accepts .git suffix combined with /tree/<branch>', () => {
      const res = parseGithubUrl('https://github.com/facebook/react.git/tree/dev');
      expect(res).toEqual({ owner: 'facebook', repo: 'react', ref: 'dev' });
    });

    it('accepts dots, dashes, and underscores in owner and repo names', () => {
      const res = parseGithubUrl('https://github.com/my-org.2_0/app_backend-v1.0');
      expect(res).toEqual({ owner: 'my-org.2_0', repo: 'app_backend-v1.0', ref: 'HEAD' });
    });

    // Rejected cases (at least 25 varieties)
    const rejectedCases: Array<{ name: string; url: any }> = [
      { name: 'non-string input (number)', url: 12345 },
      { name: 'empty string', url: '' },
      { name: 'url exceeding 300 characters', url: 'https://github.com/owner/' + 'a'.repeat(300) },
      { name: 'http scheme', url: 'http://github.com/owner/repo' },
      { name: 'file scheme', url: 'file:///github.com/owner/repo' },
      { name: 'ssh scheme', url: 'ssh://git@github.com/owner/repo' },
      { name: 'git@ ssh format', url: 'git@github.com:owner/repo.git' },
      { name: 'subdomain (api.github.com)', url: 'https://api.github.com/owner/repo' },
      { name: 'subdomain (raw.githubusercontent.com)', url: 'https://raw.githubusercontent.com/owner/repo' },
      { name: 'subdomain (gist.github.com)', url: 'https://gist.github.com/owner/repo' },
      { name: 'lookalike host (github.com.evil.com)', url: 'https://github.com.evil.com/owner/repo' },
      { name: 'other host (gitlab.com)', url: 'https://gitlab.com/owner/repo' },
      { name: 'URL with userinfo (user:pass)', url: 'https://user:pass@github.com/owner/repo' },
      { name: 'URL with userinfo (user only)', url: 'https://user@github.com/owner/repo' },
      { name: 'URL with explicit port (:443)', url: 'https://github.com:443/owner/repo' },
      { name: 'URL with custom port (:8080)', url: 'https://github.com:8080/owner/repo' },
      { name: 'URL with query string', url: 'https://github.com/owner/repo?branch=main' },
      { name: 'URL with fragment/hash', url: 'https://github.com/owner/repo#readme' },
      { name: 'extra path segment (/blob)', url: 'https://github.com/owner/repo/blob/main/index.js' },
      { name: 'extra path segment (/pull)', url: 'https://github.com/owner/repo/pull/42' },
      { name: 'extra path segment (/issues)', url: 'https://github.com/owner/repo/issues' },
      { name: 'encoded slash (%2F in path)', url: 'https://github.com/owner%2Frepo' },
      { name: 'encoded slash (%2f in branch)', url: 'https://github.com/owner/repo/tree/feat%2fbranch' },
      { name: 'backslash in path', url: 'https://github.com/owner\\repo' },
      { name: 'control character (newline \\n)', url: 'https://github.com/owner/repo\n' },
      { name: 'control character (carriage return \\r)', url: 'https://github.com/owner/repo\r' },
      { name: 'control character (null byte \\0)', url: 'https://github.com/owner/repo\0' },
      { name: 'leading/trailing whitespace', url: '  https://github.com/owner/repo  ' },
      { name: 'owner is dot (.)', url: 'https://github.com/./repo' },
      { name: 'owner is double dot (..)', url: 'https://github.com/../repo' },
      { name: 'repo is dot (.)', url: 'https://github.com/owner/.' },
      { name: 'repo is double dot (..)', url: 'https://github.com/owner/..' },
      { name: 'repo is just .git', url: 'https://github.com/owner/.git' },
      { name: 'branch is double dot (..)', url: 'https://github.com/owner/repo/tree/..' },
      { name: 'branch containing double dot (..)', url: 'https://github.com/owner/repo/tree/feature/../main' },
      { name: 'branch containing double dot inline (foo..bar)', url: 'https://github.com/owner/repo/tree/foo..bar' },
      { name: 'branch is empty (/tree/)', url: 'https://github.com/owner/repo/tree/' },
      { name: 'branch is empty (/tree)', url: 'https://github.com/owner/repo/tree' },
      { name: 'missing repository (owner only)', url: 'https://github.com/owner' },
      { name: 'empty repository path (root only)', url: 'https://github.com/' },
    ];

    for (const { name, url } of rejectedCases) {
      it(`rejects ${name}`, () => {
        try {
          parseGithubUrl(url);
          expect.unreachable(`Expected parseGithubUrl to throw for ${name}`);
        } catch (err: any) {
          expect(err).toBeInstanceOf(GithubError);
          expect(err.code).toBe('GITHUB_URL_INVALID');
        }
      });
    }
  });

  describe('downloadGithubZip with local mock server', () => {
    let server: http.Server;
    let serverPort: number;
    let serverBaseUrl: string;
    let requestHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
    let testTempDir: string;
    let testDestFile: string;

    // Standard minimal valid ZIP buffer (22-byte empty ZIP with PK\x05\x06)
    const validZipBuffer = Buffer.from([
      0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        if (requestHandler) {
          requestHandler(req, res);
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as any;
          serverPort = addr.port;
          serverBaseUrl = `http://127.0.0.1:${serverPort}`;
          resolve();
        });
      });
    });

    afterAll(async () => {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    beforeEach(() => {
      testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ripple_gh_test_'));
      testDestFile = path.join(testTempDir, 'downloaded.zip');
    });

    afterEach(() => {
      if (fs.existsSync(testTempDir)) {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      }
    });

    it('successfully downloads a valid zip file and checks PK signature', async () => {
      let requestedPath = '';
      let receivedUserAgent = '';

      requestHandler = (req, res) => {
        requestedPath = req.url || '';
        receivedUserAgent = req.headers['user-agent'] || '';
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': validZipBuffer.length.toString(),
        });
        res.end(validZipBuffer);
      };

      const parsed: ParsedGithubUrl = { owner: 'octocat', repo: 'Hello-World', ref: 'HEAD' };
      const result = await downloadGithubZip(parsed, testDestFile, {
        codeloadBase: serverBaseUrl,
      });

      expect(requestedPath).toBe('/octocat/Hello-World/zip/HEAD');
      expect(receivedUserAgent).toBe('RippleAI');
      expect(result.bytesWritten).toBe(validZipBuffer.length);
      expect(fs.existsSync(testDestFile)).toBe(true);

      const saved = fs.readFileSync(testDestFile);
      expect(saved.equals(validZipBuffer)).toBe(true);
      expect(saved[0]).toBe(0x50);
      expect(saved[1]).toBe(0x4b);
    });

    it('redirect to the allowed host works (within 3 redirects)', async () => {
      let step = 0;
      requestHandler = (req, res) => {
        if (req.url === '/octocat/Hello-World/zip/HEAD') {
          step++;
          res.writeHead(302, { Location: `${serverBaseUrl}/step2` });
          res.end();
        } else if (req.url === '/step2') {
          step++;
          res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Length': validZipBuffer.length.toString(),
          });
          res.end(validZipBuffer);
        } else {
          res.writeHead(404);
          res.end();
        }
      };

      const parsed: ParsedGithubUrl = { owner: 'octocat', repo: 'Hello-World', ref: 'HEAD' };
      const result = await downloadGithubZip(parsed, testDestFile, {
        codeloadBase: serverBaseUrl,
      });

      expect(step).toBe(2);
      expect(result.bytesWritten).toBe(validZipBuffer.length);
      expect(fs.existsSync(testDestFile)).toBe(true);
    });

    it('redirect to another host is blocked (GITHUB_REDIRECT_BLOCKED)', async () => {
      requestHandler = (_req, res) => {
        res.writeHead(302, { Location: 'http://malicious.evil.com/fake.zip' });
        res.end();
      };

      const parsed: ParsedGithubUrl = { owner: 'octocat', repo: 'Hello-World', ref: 'HEAD' };
      await expect(
        downloadGithubZip(parsed, testDestFile, { codeloadBase: serverBaseUrl })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'GITHUB_REDIRECT_BLOCKED',
        })
      );

      expect(fs.existsSync(testDestFile)).toBe(false);
    });

    it('more than 3 redirects is blocked (GITHUB_REDIRECT_BLOCKED)', async () => {
      requestHandler = (req, res) => {
        const url = req.url || '';
        if (url === '/octocat/Hello-World/zip/HEAD') {
          res.writeHead(302, { Location: `${serverBaseUrl}/redir1` });
          res.end();
        } else if (url === '/redir1') {
          res.writeHead(302, { Location: `${serverBaseUrl}/redir2` });
          res.end();
        } else if (url === '/redir2') {
          res.writeHead(302, { Location: `${serverBaseUrl}/redir3` });
          res.end();
        } else if (url === '/redir3') {
          res.writeHead(302, { Location: `${serverBaseUrl}/redir4` });
          res.end();
        } else {
          res.writeHead(200, { 'Content-Length': validZipBuffer.length.toString() });
          res.end(validZipBuffer);
        }
      };

      const parsed: ParsedGithubUrl = { owner: 'octocat', repo: 'Hello-World', ref: 'HEAD' };
      await expect(
        downloadGithubZip(parsed, testDestFile, { codeloadBase: serverBaseUrl })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'GITHUB_REDIRECT_BLOCKED',
        })
      );

      expect(fs.existsSync(testDestFile)).toBe(false);
    });

    it('HTTP 404 maps to GITHUB_REPO_NOT_FOUND with clear message', async () => {
      requestHandler = (_req, res) => {
        res.writeHead(404);
        res.end('Not Found');
      };

      const parsed: ParsedGithubUrl = { owner: 'octocat', repo: 'Missing-Repo', ref: 'HEAD' };
      try {
        await downloadGithubZip(parsed, testDestFile, { codeloadBase: serverBaseUrl });
        expect.unreachable('Expected 404 to throw GITHUB_REPO_NOT_FOUND');
      } catch (err: any) {
        expect(err).toBeInstanceOf(GithubError);
        expect(err.code).toBe('GITHUB_REPO_NOT_FOUND');
        expect(err.message).toContain('does not exist or is private');
        expect(err.message).toContain('only public repositories are supported');
      }

      expect(fs.existsSync(testDestFile)).toBe(false);
    });

    it('HTTP 429 maps to GITHUB_UNAVAILABLE', async () => {
      requestHandler = (_req, res) => {
        res.writeHead(429);
        res.end('Too Many Requests');
      };

      const parsed: ParsedGithubUrl = { owner: 'octocat', repo: 'Hello-World', ref: 'HEAD' };
      await expect(
        downloadGithubZip(parsed, testDestFile, { codeloadBase: serverBaseUrl })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'GITHUB_UNAVAILABLE',
        })
      );

      expect(fs.existsSync(testDestFile)).toBe(false);
    });

    it('HTTP 500 maps to GITHUB_UNAVAILABLE', async () => {
      requestHandler = (_req, res) => {
        res.writeHead(500);
        res.end('Internal Server Error');
      };

      const parsed: ParsedGithubUrl = { owner: 'octocat', repo: 'Hello-World', ref: 'HEAD' };
      await expect(
        downloadGithubZip(parsed, testDestFile, { codeloadBase: serverBaseUrl })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'GITHUB_UNAVAILABLE',
        })
      );

      expect(fs.existsSync(testDestFile)).toBe(false);
    });

    it('endless body without Content-Length stops at the limit and leaves no file', async () => {
      requestHandler = (req, res) => {
        // Chunked encoding without Content-Length
        res.writeHead(200, { 'Content-Type': 'application/zip' });
        // Send initial PK bytes
        res.write(Buffer.from([0x50, 0x4b]));

        // Continuous stream of bytes until socket destroyed
        const interval = setInterval(() => {
          try {
            res.write(Buffer.alloc(1024, 0x41));
          } catch {
            clearInterval(interval);
          }
        }, 10);

        const cleanup = () => clearInterval(interval);
        res.on('close', cleanup);
        res.on('error', cleanup);
        req.on('close', cleanup);
      };

      const parsed: ParsedGithubUrl = { owner: 'octocat', repo: 'Huge-Repo', ref: 'HEAD' };
      // Test limit of 2000 bytes
      await expect(
        downloadGithubZip(parsed, testDestFile, {
          codeloadBase: serverBaseUrl,
          maxBytes: 2000,
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'GITHUB_REPO_TOO_LARGE',
        })
      );

      expect(fs.existsSync(testDestFile)).toBe(false);
    });

    it('wrong Content-Length header exceeding limit is rejected immediately', async () => {
      let bodySent = false;
      requestHandler = (_req, res) => {
        res.writeHead(200, {
          'Content-Length': '100000000', // 100MB
          'Content-Type': 'application/zip',
        });
        bodySent = true;
        res.end(validZipBuffer);
      };

      const parsed: ParsedGithubUrl = { owner: 'octocat', repo: 'Hello-World', ref: 'HEAD' };
      await expect(
        downloadGithubZip(parsed, testDestFile, {
          codeloadBase: serverBaseUrl,
          maxBytes: 1000,
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'GITHUB_REPO_TOO_LARGE',
        })
      );

      expect(fs.existsSync(testDestFile)).toBe(false);
    });

    it('wrong Content-Length where server truncates stream rejects with GITHUB_UNREACHABLE', async () => {
      requestHandler = (_req, res) => {
        // Declares 500 bytes but only sends 50 bytes and closes connection abruptly
        res.writeHead(200, {
          'Content-Length': '500',
          'Content-Type': 'application/zip',
          'Connection': 'close',
        });
        const truncatedBuf = Buffer.concat([
          Buffer.from([0x50, 0x4b]),
          Buffer.alloc(48, 0x00),
        ]);
        res.write(truncatedBuf);
        res.destroy();
      };

      const parsed: ParsedGithubUrl = { owner: 'octocat', repo: 'Hello-World', ref: 'HEAD' };
      await expect(
        downloadGithubZip(parsed, testDestFile, {
          codeloadBase: serverBaseUrl,
          timeoutMs: 1000,
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'GITHUB_UNREACHABLE',
        })
      );

      expect(fs.existsSync(testDestFile)).toBe(false);
    });

    it('timeout stops download and leaves no file', async () => {
      requestHandler = (_req, _res) => {
        // Deliberately hold request without sending response
      };

      const parsed: ParsedGithubUrl = { owner: 'octocat', repo: 'Hello-World', ref: 'HEAD' };
      await expect(
        downloadGithubZip(parsed, testDestFile, {
          codeloadBase: serverBaseUrl,
          timeoutMs: 150,
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'GITHUB_UNREACHABLE',
        })
      );

      expect(fs.existsSync(testDestFile)).toBe(false);
    });

    it('non-PK body is rejected with ZIP_INVALID and leaves no file', async () => {
      requestHandler = (_req, res) => {
        res.writeHead(200, {
          'Content-Type': 'text/html',
        });
        res.end('<!DOCTYPE html><html><body>Error</body></html>');
      };

      const parsed: ParsedGithubUrl = { owner: 'octocat', repo: 'Hello-World', ref: 'HEAD' };
      try {
        await downloadGithubZip(parsed, testDestFile, {
          codeloadBase: serverBaseUrl,
        });
        expect.unreachable('Expected non-PK body to throw ZIP_INVALID');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ZipError);
        expect(err.code).toBe('ZIP_INVALID');
      }

      expect(fs.existsSync(testDestFile)).toBe(false);
    });
  });
});
