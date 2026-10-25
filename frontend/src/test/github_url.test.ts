import { describe, it, expect } from 'vitest';
import {
  parseGithubUrl,
  validateGithubUrl,
  GithubUrlError,
} from '../lib/githubUrl.js';

describe('GitHub URL Parser & Validator (pure client-side)', () => {
  describe('Accepted URL cases', () => {
    it('accepts standard https://github.com/owner/repo', () => {
      const res = parseGithubUrl('https://github.com/facebook/react');
      expect(res).toEqual({ owner: 'facebook', repo: 'react', ref: 'HEAD' });
      expect(validateGithubUrl('https://github.com/facebook/react')).toEqual({
        valid: true,
        parsed: { owner: 'facebook', repo: 'react', ref: 'HEAD' },
        error: null,
      });
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
  });

  describe('Rejected URL cases (at least 25 varieties)', () => {
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
          expect(err).toBeInstanceOf(GithubUrlError);
          expect(err.code).toBe('GITHUB_URL_INVALID');
        }

        const validRes = validateGithubUrl(url);
        expect(validRes.valid).toBe(false);
        expect(validRes.parsed).toBeNull();
        expect(typeof validRes.error).toBe('string');
      });
    }
  });
});
