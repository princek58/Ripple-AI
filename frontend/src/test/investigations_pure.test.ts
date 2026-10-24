import { describe, it, expect } from 'vitest';
import {
  parseInvestigationsUrl,
  buildInvestigationsUrl,
  buildFindingsQuery,
  formatEvidence,
  ruleLabel,
  KNOWN_RULES,
} from '../features/investigations/investigationsUrl.js';

// Real captures
import findingBrokenImport from './fixtures/api/finding_detail_broken_import.json';
import findingCircular from './fixtures/api/finding_detail_circular_dependency.json';
import findingEnv from './fixtures/api/finding_detail_env_undeclared.json';
import findingApi from './fixtures/api/finding_detail_api_unmatched_call.json';
import findingIsolated from './fixtures/api/finding_detail_isolated_file.json';

describe('Investigations Pure Functions', () => {
  describe('parseInvestigationsUrl & buildInvestigationsUrl', () => {
    it('parses valid query parameters', () => {
      const search =
        '?finding=f-123&severity=high&confidence=confirmed&verification=not_tested&rule_id=broken_import&q=fees&page=3';
      const state = parseInvestigationsUrl(search);

      expect(state).toEqual({
        findingId: 'f-123',
        severity: 'high',
        confidence: 'confirmed',
        verification: 'not_tested',
        rule_id: 'broken_import',
        q: 'fees',
        page: 3,
      });
    });

    it('drops invalid enum values for severity, confidence, verification', () => {
      const search =
        '?finding=f-123&severity=info&confidence=guaranteed&verification=unverified&page=-5';
      const state = parseInvestigationsUrl(search);

      expect(state.severity).toBeUndefined();
      expect(state.confidence).toBeUndefined();
      expect(state.verification).toBeUndefined();
      expect(state.page).toBe(1); // minimum 1
    });

    it('enforces page minimum 1 and handles NaN page', () => {
      expect(parseInvestigationsUrl('?page=0').page).toBe(1);
      expect(parseInvestigationsUrl('?page=-10').page).toBe(1);
      expect(parseInvestigationsUrl('?page=abc').page).toBe(1);
      expect(parseInvestigationsUrl('').page).toBe(1);
    });

    it('round-trips state with buildInvestigationsUrl', () => {
      const original = {
        findingId: 'f-abc-456',
        severity: 'critical' as const,
        confidence: 'likely' as const,
        verification: 'fix_proposed' as const,
        rule_id: 'env_undeclared',
        q: 'JWT',
        page: 2,
      };

      const url = buildInvestigationsUrl(original);
      const parsed = parseInvestigationsUrl(url);

      expect(parsed).toEqual(original);
    });

    it('omits page parameter from URL when page is 1', () => {
      const url = buildInvestigationsUrl({
        findingId: 'f-1',
        page: 1,
      });
      expect(url).toBe('?finding=f-1');
      expect(url).not.toContain('page=');
    });

    it('returns empty string when no filters or finding are set', () => {
      expect(buildInvestigationsUrl({ page: 1 })).toBe('');
    });
  });

  describe('buildFindingsQuery', () => {
    it('creates query object for api client with default pageSize 25', () => {
      const query = buildFindingsQuery({
        findingId: 'f-1',
        severity: 'high',
        confidence: 'confirmed',
        verification: 'not_tested',
        rule_id: 'broken_import',
        q: 'feeService',
        page: 2,
      });

      expect(query).toEqual({
        severity: 'high',
        confidence: 'confirmed',
        verification: 'not_tested',
        rule_id: 'broken_import',
        q: 'feeService',
        page: 2,
        pageSize: 25,
      });
    });

    it('handles minimal state and ensures page is at least 1', () => {
      const query = buildFindingsQuery({ page: 0 });
      expect(query).toEqual({ page: 1, pageSize: 25 });
    });
  });

  describe('formatEvidence', () => {
    it('formats evidence from real broken_import capture', () => {
      const ev = findingBrokenImport.data.evidence[0];
      expect(formatEvidence(ev)).toBe('backend/routes/fees.js:2');
    });

    it('formats evidence from real circular_dependency capture', () => {
      const ev1 = findingCircular.data.evidence[0];
      const ev2 = findingCircular.data.evidence[1];
      expect(formatEvidence(ev1)).toBe('backend/utils/format.js:1');
      expect(formatEvidence(ev2)).toBe('backend/utils/helpers.js:1');
    });

    it('formats evidence from real env_undeclared capture', () => {
      const ev = findingEnv.data.evidence[0];
      expect(formatEvidence(ev)).toBe('backend/config/db.js:2');
    });

    it('formats evidence from real api_unmatched_call capture', () => {
      const ev = findingApi.data.evidence[0];
      expect(formatEvidence(ev)).toBe('frontend/src/pages/NoticePage.tsx:13');
    });

    it('formats evidence from real isolated_file capture', () => {
      const ev = findingIsolated.data.evidence[0];
      expect(formatEvidence(ev)).toBe('frontend/src/components/MarksTable.tsx:1');
    });

    it('formats line ranges when line_start != line_end', () => {
      expect(
        formatEvidence({ file: 'src/App.tsx', line_start: 10, line_end: 25 })
      ).toBe('src/App.tsx:10-25');
    });

    it('formats evidence with single line when line_start equals line_end', () => {
      expect(formatEvidence({ file: 'src/secret.js', line_start: 42, line_end: 42 })).toBe(
        'src/secret.js:42'
      );
    });

    it('formats file only when no line numbers exist', () => {
      expect(formatEvidence({ file: 'README.md' })).toBe('README.md');
    });

    it('formats line only when file is missing', () => {
      expect(formatEvidence({ line_start: 15, line_end: 20 })).toBe('line 15-20');
      expect(formatEvidence({ line_start: 15 })).toBe('line 15');
    });

    it('returns empty string when evidence is empty or null', () => {
      expect(formatEvidence(null as any)).toBe('');
      expect(formatEvidence({})).toBe('');
    });
  });

  describe('ruleLabel', () => {
    it('returns plain labels for all six known rules', () => {
      expect(ruleLabel('circular_dependency')).toBe('Circular dependency');
      expect(ruleLabel('broken_import')).toBe('Broken import');
      expect(ruleLabel('isolated_file')).toBe('Isolated file');
      expect(ruleLabel('env_undeclared')).toBe(
        'Undeclared environment variable'
      );
      expect(ruleLabel('api_unmatched_call')).toBe('Unmatched API call');
      expect(ruleLabel('secret_pattern')).toBe('Secret pattern');
    });

    it('verifies KNOWN_RULES has exactly 6 rules', () => {
      expect(Object.keys(KNOWN_RULES)).toHaveLength(6);
    });

    it('falls back to raw rule id for unknown rules', () => {
      expect(ruleLabel('custom_check_xyz')).toBe('custom_check_xyz');
      expect(ruleLabel('')).toBe('');
    });
  });
});
