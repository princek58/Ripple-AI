import { describe, it, expect } from 'vitest';
import {
  parseUnifiedDiff,
  maskEnvValues,
  parseFixesUrl,
  buildFixesUrl,
  statusLabel,
  buildPatchFileName,
} from '../features/fixes/fixesPure.js';

// Real captures from Part 0
import envFixFixture from './fixtures/api/fixes_post_env_create.json';
import apiFixFixture from './fixtures/api/fixes_post_api_create.json';

describe('Fixes Pure Functions (Step 12b Part 1)', () => {
  describe('1. parseUnifiedDiff', () => {
    it('parses real env_undeclared fix capture with header and hunks', () => {
      const parsed = parseUnifiedDiff(envFixFixture.data.diff_text);

      expect(parsed.header).toEqual(['# Suggested change, not applied, not tested']);
      expect(parsed.hunks).toHaveLength(1);
      expect(parsed.truncated).toBeUndefined();

      const hunk = parsed.hunks[0];
      expect(hunk.oldStart).toBe(1);
      expect(hunk.newStart).toBe(1);

      // Lines in hunk:
      //  DB_URL= (context)
      // +JWT_SECRET= (add)
      expect(hunk.lines).toHaveLength(2);
      expect(hunk.lines[0]).toEqual({
        kind: 'context',
        text: 'DB_URL=',
        oldNo: 1,
        newNo: 1,
      });
      expect(hunk.lines[1]).toEqual({
        kind: 'add',
        text: 'JWT_SECRET=',
        newNo: 2,
      });
    });

    it('parses real api_unmatched_call fix capture with del and add lines', () => {
      const parsed = parseUnifiedDiff(apiFixFixture.data.diff_text);

      expect(parsed.header).toEqual(['# Suggested change, not applied, not tested']);
      expect(parsed.hunks).toHaveLength(1);

      const hunk = parsed.hunks[0];
      expect(hunk.oldStart).toBe(12);
      expect(hunk.newStart).toBe(12);

      // Verify line kinds and line numbers
      const kinds = hunk.lines.map((l) => l.kind);
      expect(kinds).toEqual(['context', 'del', 'add', 'context']);

      const delLine = hunk.lines.find((l) => l.kind === 'del');
      const addLine = hunk.lines.find((l) => l.kind === 'add');

      expect(delLine).toEqual({
        kind: 'del',
        text: "    fetch('/api/notice/list')",
        oldNo: 13,
      });
      expect(addLine).toEqual({
        kind: 'add',
        text: "    fetch('/api/notices')",
        newNo: 13,
      });
    });

    it('handles malformed diff input gracefully without throwing and returns lines as meta', () => {
      const malformedText = 'This is not a real diff\nSome random log output\nAnother broken line';
      const parsed = parseUnifiedDiff(malformedText);

      expect(parsed.header).toEqual([]);
      expect(parsed.hunks).toHaveLength(1);
      expect(parsed.hunks[0].lines).toHaveLength(3);
      expect(parsed.hunks[0].lines[0].kind).toBe('meta');
      expect(parsed.hunks[0].lines[0].text).toBe('This is not a real diff');
    });

    it('handles empty string or non-string input gracefully', () => {
      expect(parseUnifiedDiff('')).toEqual({ header: [], hunks: [] });
      expect(parseUnifiedDiff(null as unknown as string)).toEqual({ header: [], hunks: [] });
    });

    it('caps at 2000 lines with truncated: true flag', () => {
      const largeDiffLines: string[] = ['# Header'];
      largeDiffLines.push('@@ -1,1 +1,2500 @@');
      for (let i = 0; i < 2500; i++) {
        largeDiffLines.push(`+line content ${i}`);
      }
      const largeDiff = largeDiffLines.join('\n');

      const parsed = parseUnifiedDiff(largeDiff);
      expect(parsed.truncated).toBe(true);

      let totalLines = 0;
      parsed.hunks.forEach((h) => {
        totalLines += h.lines.length;
      });
      // Header (1) + hunk header (not stored in hunk.lines) + lines capped at 2000 total raw lines
      expect(totalLines + parsed.header.length).toBeLessThanOrEqual(2000);
    });
  });

  describe('2. maskEnvValues', () => {
    it('masks values in .env.example when a value is present', () => {
      expect(maskEnvValues('.env.example', 'PORT=3000')).toBe('PORT=***');
      expect(maskEnvValues('backend/.env.example', '+JWT_SECRET=supersecret123')).toBe(
        '+JWT_SECRET=***'
      );
    });

    it('does NOT mask when the value is empty', () => {
      expect(maskEnvValues('.env.example', 'PORT=')).toBe('PORT=');
      expect(maskEnvValues('.env.example', '+JWT_SECRET=')).toBe('+JWT_SECRET=');
      expect(maskEnvValues('.env', 'DB_PASSWORD=')).toBe('DB_PASSWORD=');
    });

    it('masks files whose basename starts with .env.', () => {
      expect(maskEnvValues('/path/to/.env.production', 'API_KEY=prodkey')).toBe('API_KEY=***');
      expect(maskEnvValues('config/.env.local', 'DEBUG=true')).toBe('DEBUG=***');
    });

    it('does NOT mask files that are not .env files even if they contain key=value', () => {
      expect(maskEnvValues('frontend/src/pages/NoticePage.tsx', 'const x = "secret"')).toBe(
        'const x = "secret"'
      );
      expect(maskEnvValues('server.js', 'PORT=4000')).toBe('PORT=4000');
      expect(maskEnvValues('environment.ts', 'FOO=bar')).toBe('FOO=bar');
    });

    it('leaves comment lines and lines without = in env files unchanged', () => {
      expect(maskEnvValues('.env.example', '# This is a comment')).toBe('# This is a comment');
      expect(maskEnvValues('.env.example', '')).toBe('');
    });
  });

  describe('3. parseFixesUrl, buildFixesUrl and statusLabel', () => {
    it('parses valid query parameters', () => {
      const state = parseFixesUrl('?fix=fix-123&finding=find-456&status=approved&page=2');
      expect(state).toEqual({
        fix: 'fix-123',
        finding: 'find-456',
        status: 'approved',
        page: 2,
      });
    });

    it('drops invalid status and enforces page minimum 1', () => {
      const state = parseFixesUrl('?status=pending&page=-5');
      expect(state.status).toBeUndefined();
      expect(state.page).toBe(1);

      const stateNaN = parseFixesUrl('?status=closed&page=abc');
      expect(stateNaN.status).toBeUndefined();
      expect(stateNaN.page).toBe(1);
    });

    it('round-trips state with buildFixesUrl', () => {
      const original = {
        fix: 'fix-1',
        finding: 'find-1',
        status: 'proposed' as const,
        page: 3,
      };
      const qs = buildFixesUrl(original);
      expect(qs).toBe('?fix=fix-1&finding=find-1&status=proposed&page=3');

      const parsed = parseFixesUrl(qs);
      expect(parsed).toEqual(original);
    });

    it('omits page parameter when page is 1 and omits undefined fields', () => {
      expect(buildFixesUrl({ page: 1 })).toBe('');
      expect(buildFixesUrl({ status: 'rejected', page: 1 })).toBe('?status=rejected');
      expect(buildFixesUrl({})).toBe('');
    });

    it('statusLabel returns exact required labels and descriptions', () => {
      expect(statusLabel('proposed')).toEqual({
        label: 'Proposed',
        description: 'Suggested, waiting for your decision',
      });
      expect(statusLabel('approved')).toEqual({
        label: 'Approved',
        description: 'Approved: patch saved, not applied to your project',
      });
      expect(statusLabel('rejected')).toEqual({
        label: 'Rejected',
        description: 'Rejected',
      });
    });
  });

  describe('4. buildPatchFileName', () => {
    it('builds patch file name with rule_id and first 8 chars of id', () => {
      const name = buildPatchFileName({
        id: 'bb7967f8-ae5c-4851-bb06-26c3aef13a1f',
        rule_id: 'env_undeclared',
      });
      expect(name).toBe('env-undeclared-bb7967f8.patch');
      // Verifies only letters, digits, dash and dot
      expect(/^[a-zA-Z0-9.-]+$/.test(name)).toBe(true);
    });

    it('falls back to "fix" when rule_id is absent', () => {
      const name = buildPatchFileName({
        id: '5c2f3c5a-488f-485c-b913-09a6c4691829',
      });
      expect(name).toBe('fix-5c2f3c5a.patch');
      expect(/^[a-zA-Z0-9.-]+$/.test(name)).toBe(true);
    });

    it('sanitizes special characters in rule_id to only letters, digits, dash and dot', () => {
      const name = buildPatchFileName({
        id: '12345678-abcd',
        rule_id: 'custom_rule/with:special!chars',
      });
      expect(name).toBe('custom-rule-with-special-chars-12345678.patch');
      expect(/^[a-zA-Z0-9.-]+$/.test(name)).toBe(true);
    });
  });
});
