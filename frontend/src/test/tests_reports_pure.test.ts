import { describe, it, expect } from 'vitest';
import {
  parseInlines,
  parseReportMarkdown,
  extractReportSummary,
  buildReportFileName,
} from '../features/reports/reportsPure.js';
import {
  parseTestsUrl,
  buildTestsUrl,
  filterTests,
  testStatusLabel,
  countsTotal,
} from '../features/tests/testsPure.js';
import { TestRunItem } from '../features/tests/testsTypes.js';

// Real captures from Part 0
import reportDetailFixture from './fixtures/api/reports_get_report_detail.json';
import testsScannedFixture from './fixtures/api/tests_get_project_tests_scanned.json';

describe('Reports & Tests Pure Functions (Step 12c Part 1)', () => {
  describe('1. parseReportMarkdown', () => {
    it('parses real backend report markdown capture into blocks with correct structure', () => {
      const md = reportDetailFixture.data.markdown;
      const parsed = parseReportMarkdown(md);

      expect(parsed.truncated).toBe(false);
      expect(parsed.blocks.length).toBeGreaterThan(0);

      // Level 1 heading
      const h1 = parsed.blocks.find((b) => b.type === 'heading' && b.level === 1);
      expect(h1).toBeDefined();
      if (h1 && h1.type === 'heading') {
        expect(h1.text).toContain('Ripple AI Analysis Report');
      }

      // Level 2 headings
      const h2s = parsed.blocks.filter((b) => b.type === 'heading' && b.level === 2);
      expect(h2s.length).toBeGreaterThanOrEqual(6);
      const h2Texts = h2s.map((h) => (h.type === 'heading' ? h.text : ''));
      expect(h2Texts).toContain('Summary');
      expect(h2Texts).toContain('Findings Table');
      expect(h2Texts).toContain('What was not checked');

      // Table block
      const table = parsed.blocks.find((b) => b.type === 'table');
      expect(table).toBeDefined();
      if (table && table.type === 'table') {
        expect(table.headers).toEqual([
          'Title',
          'Rule',
          'Severity',
          'Confidence',
          'Verification',
          'File:Line',
        ]);
        expect(table.rows.length).toBe(9); // 9 findings in demo-erp
        expect(table.rows[0][1]).toBe('circular_dependency');
        expect(table.rows[1][1]).toBe('broken_import');
      }

      // List block
      const lists = parsed.blocks.filter((b) => b.type === 'list');
      expect(lists.length).toBeGreaterThan(0);

      // Paragraph block
      const paragraphs = parsed.blocks.filter((b) => b.type === 'paragraph');
      expect(paragraphs.length).toBeGreaterThan(0);
    });

    it('inlines: parses **bold** and `code`, keeping HTML-looking text plain and harmless', () => {
      const inlines = parseInlines(
        'Here is **important** notice with `<script>alert(1)</script>` and <img src=x onerror=alert(1)>'
      );

      expect(inlines).toEqual([
        { type: 'text', value: 'Here is ' },
        { type: 'bold', value: 'important' },
        { type: 'text', value: ' notice with ' },
        { type: 'code', value: '<script>alert(1)</script>' },
        { type: 'text', value: ' and <img src=x onerror=alert(1)>' },
      ]);
      // Verify raw HTML tags are NOT turned into HTML elements or HTML strings
      const rawTextTokens = inlines.filter((t) => t.type === 'text');
      expect(rawTextTokens.some((t) => t.value.includes('<img src=x'))).toBe(true);
    });

    it('handles hand-made edge cases: malformed table without separator or irregular columns', () => {
      const malformed = `
| Col1 | Col2 |
No separator line here
| Just a line with pipes | another |
`;
      const parsed = parseReportMarkdown(malformed);
      expect(() => parseReportMarkdown(malformed)).not.toThrow();
      expect(parsed.blocks.length).toBeGreaterThan(0);
      // Because there is no separator row, it does not treat it as a valid table and doesn't crash
      expect(parsed.blocks.some((b) => b.type === 'table')).toBe(false);
    });

    it('handles table with varying cell counts gracefully', () => {
      const irregularTable = `
| H1 | H2 | H3 |
| --- | --- | --- |
| Row 1 Col 1 | Row 1 Col 2 |
| Row 2 Col 1 | Row 2 Col 2 | Row 2 Col 3 | Row 2 Col 4 |
`;
      const parsed = parseReportMarkdown(irregularTable);
      const table = parsed.blocks.find((b) => b.type === 'table');
      expect(table).toBeDefined();
      if (table && table.type === 'table') {
        expect(table.headers).toEqual(['H1', 'H2', 'H3']);
        expect(table.rows).toHaveLength(2);
        expect(table.rows[0]).toEqual(['Row 1 Col 1', 'Row 1 Col 2']);
        expect(table.rows[1]).toEqual(['Row 2 Col 1', 'Row 2 Col 2', 'Row 2 Col 3', 'Row 2 Col 4']);
      }
    });

    it('caps huge input at 5000 lines with truncated: true', () => {
      const lines: string[] = [];
      for (let i = 0; i < 5500; i++) {
        lines.push(`Line ${i}: some analysis text`);
      }
      const parsed = parseReportMarkdown(lines.join('\n'));
      expect(parsed.truncated).toBe(true);
    });

    it('handles empty string and non-string inputs safely without throwing', () => {
      const parsedEmpty = parseReportMarkdown('');
      expect(parsedEmpty.blocks).toEqual([]);
      expect(parsedEmpty.truncated).toBe(false);

      const parsedNull = parseReportMarkdown(null as any);
      expect(parsedNull.blocks).toEqual([]);
      expect(parsedNull.truncated).toBe(false);
    });
  });

  describe('2. extractReportSummary', () => {
    it('returns level 2 section titles and hasNotChecked: true for real capture', () => {
      const parsed = parseReportMarkdown(reportDetailFixture.data.markdown);
      const summary = extractReportSummary(parsed);

      expect(summary.hasNotChecked).toBe(true);
      expect(summary.sectionTitles).toEqual([
        'Summary',
        'Findings by Severity',
        'Verification Coverage',
        'Findings Table',
        'Evidence List',
        'Fixes and Status',
        'What was not checked',
      ]);
    });

    it('returns hasNotChecked: false when report lacks "What was not checked" section', () => {
      const customMd = `
# Analysis Report
## Summary
All good.
## Findings Table
| A | B |
| --- | --- |
| 1 | 2 |
`;
      const parsed = parseReportMarkdown(customMd);
      const summary = extractReportSummary(parsed);

      expect(summary.hasNotChecked).toBe(false);
      expect(summary.sectionTitles).toEqual(['Summary', 'Findings Table']);
    });
  });

  describe('3. buildReportFileName', () => {
    it('builds filename using sanitized project name and yyyy-mm-dd', () => {
      const filename = buildReportFileName({
        project_name: 'demo_erp_12c',
        created_at: '2026-10-24T07:10:24.474Z',
      });
      expect(filename).toBe('ripple-report-demo-erp-12c-2026-10-24.md');
      // Must only contain letters, digits, dash, dot
      expect(/^[a-zA-Z0-9.-]+$/.test(filename)).toBe(true);
    });

    it('sanitizes special characters and spaces to single dashes', () => {
      const filename = buildReportFileName({
        project_name: 'My Special Project! #1 (Internal)',
        created_at: '2026-03-15T12:00:00Z',
      });
      expect(filename).toBe('ripple-report-My-Special-Project-1-Internal-2026-03-15.md');
      expect(/^[a-zA-Z0-9.-]+$/.test(filename)).toBe(true);
    });

    it('extracts project name from markdown title when project_name is missing', () => {
      const filename = buildReportFileName({
        markdown: '# Ripple AI Analysis Report: demo-core\n## Summary',
        created_at: '2026-10-24T00:00:00Z',
      });
      expect(filename).toBe('ripple-report-demo-core-2026-10-24.md');
    });

    it('falls back to ripple-report.md when report is empty or unsanitizable', () => {
      expect(buildReportFileName(null)).toBe('ripple-report.md');
      expect(buildReportFileName({})).toBe('ripple-report.md');
      expect(buildReportFileName({ project_name: '!!!@@@###' })).toBe('ripple-report.md');
    });
  });

  describe('4. Tests screen helpers', () => {
    const mockItems: TestRunItem[] = [
      { id: '1', name: 'backend/tests/auth.test.js', status: 'not_run' },
      { id: '2', name: 'backend/tests/billing.test.js', status: 'pass' },
      { id: '3', name: 'backend/tests/orders.test.js', status: 'fail' },
      { id: '4', name: 'backend/tests/reports.test.js', status: 'skipped' },
    ];

    describe('parseTestsUrl & buildTestsUrl', () => {
      it('parses valid status and q', () => {
        const parsed = parseTestsUrl('?status=not_run&q=auth');
        expect(parsed).toEqual({ status: 'not_run', q: 'auth' });
      });

      it('ignores invalid status values and empty query strings', () => {
        const parsed = parseTestsUrl('?status=invalid_status&q=   ');
        expect(parsed).toEqual({ status: undefined, q: undefined });
      });

      it('builds query url correctly with both status and q', () => {
        const url = buildTestsUrl({ status: 'pass', q: 'billing' });
        expect(url).toBe('?status=pass&q=billing');
      });

      it('builds empty string when both status and q are absent or empty', () => {
        expect(buildTestsUrl({})).toBe('');
        expect(buildTestsUrl({ status: 'invalid' as any, q: '  ' })).toBe('');
      });
    });

    describe('filterTests', () => {
      it('filters tests by status', () => {
        const result = filterTests(mockItems, 'not_run');
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('backend/tests/auth.test.js');
      });

      it('filters tests case-insensitively by query', () => {
        const result = filterTests(mockItems, undefined, 'BILLING');
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('backend/tests/billing.test.js');
      });

      it('combines status and query filter', () => {
        const result = filterTests(mockItems, 'fail', 'orders');
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('backend/tests/orders.test.js');

        const noMatch = filterTests(mockItems, 'pass', 'orders');
        expect(noMatch).toHaveLength(0);
      });

      it('returns all items when status and q are undefined', () => {
        expect(filterTests(mockItems)).toEqual(mockItems);
      });
    });

    describe('testStatusLabel', () => {
      it('returns exact Phase 1 explanation for not_run', () => {
        const info = testStatusLabel('not_run');
        expect(info.label).toBe('Not run');
        expect(info.description).toBe(
          'Not run: Ripple AI found this test file but did not execute it, because Phase 1 executes no code'
        );
      });

      it('returns short descriptions for pass, fail, skipped', () => {
        expect(testStatusLabel('pass').label).toBe('Passed');
        expect(testStatusLabel('fail').label).toBe('Failed');
        expect(testStatusLabel('skipped').label).toBe('Skipped');
      });
    });

    describe('countsTotal', () => {
      it('calculates total test counts from real capture', () => {
        const realCounts = testsScannedFixture.data.counts;
        expect(countsTotal(realCounts)).toBe(1);
      });

      it('sums counts and handles null/undefined safely', () => {
        expect(countsTotal({ pass: 5, fail: 2, skipped: 1, not_run: 10 })).toBe(18);
        expect(countsTotal(null)).toBe(0);
        expect(countsTotal(undefined)).toBe(0);
        expect(countsTotal({ pass: 3 })).toBe(3);
      });
    });
  });
});
