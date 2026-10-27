import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  matchOfflineDataQuestion,
} from '../features/chat/offlineKeywords.js';
import {
  getOfflineDataAnswer,
  formatHowManyFindings,
  formatMostRiskyModule,
  formatWhatToFixFirst,
  OFFLINE_DATA_FOOTER,
} from '../features/chat/offlineDataAnswers.js';
import { api } from '../lib/api.js';
import type {
  ProjectSummary,
  Finding,
  FindingDetailData,
} from '../../../shared/types.js';

// Real captures from frontend/src/test/fixtures/api
import projectSummaryFixture from './fixtures/api/project_summary.json';
import findingsDefaultFixture from './fixtures/api/findings_default.json';
import findingBrokenImportFixture from './fixtures/api/finding_detail_broken_import.json';

describe('Offline Data Answers (K3 Part 2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Keyword matching in English and Hinglish', () => {
    it('matches "how many findings" in English and Hinglish', () => {
      expect(matchOfflineDataQuestion('how many findings')).toBe('HOW_MANY_FINDINGS');
      expect(matchOfflineDataQuestion('HOW MANY FINDINGS in this repo?')).toBe('HOW_MANY_FINDINGS');
      expect(matchOfflineDataQuestion('kitni findings')).toBe('HOW_MANY_FINDINGS');
      expect(matchOfflineDataQuestion('kitni findings hain')).toBe('HOW_MANY_FINDINGS');
      expect(matchOfflineDataQuestion('is project me kitne findings hai?')).toBe('HOW_MANY_FINDINGS');
    });

    it('matches "most risky module" in English and Hinglish', () => {
      expect(matchOfflineDataQuestion('most risky module')).toBe('MOST_RISKY_MODULE');
      expect(matchOfflineDataQuestion('Which is the highest risk module?')).toBe('MOST_RISKY_MODULE');
      expect(matchOfflineDataQuestion('sabse risky module')).toBe('MOST_RISKY_MODULE');
      expect(matchOfflineDataQuestion('kaunsa module risky hai')).toBe('MOST_RISKY_MODULE');
    });

    it('matches "what should I fix first" in English and Hinglish', () => {
      expect(matchOfflineDataQuestion('what should i fix first')).toBe('WHAT_TO_FIX_FIRST');
      expect(matchOfflineDataQuestion('Where should I start?')).toBe('WHAT_TO_FIX_FIRST');
      expect(matchOfflineDataQuestion('pehle kya theek karun')).toBe('WHAT_TO_FIX_FIRST');
      expect(matchOfflineDataQuestion('pehle kya fix karun')).toBe('WHAT_TO_FIX_FIRST');
    });

    it('matches "when was the last scan" in English and Hinglish', () => {
      expect(matchOfflineDataQuestion('when was the last scan')).toBe('LAST_SCAN');
      expect(matchOfflineDataQuestion('last scan time')).toBe('LAST_SCAN');
      expect(matchOfflineDataQuestion('scan kab hua')).toBe('LAST_SCAN');
      expect(matchOfflineDataQuestion('aakhri scan kab hua tha')).toBe('LAST_SCAN');
    });

    it('matches "what is not checked" in English and Hinglish', () => {
      expect(matchOfflineDataQuestion('what is not checked')).toBe('WHAT_IS_NOT_CHECKED');
      expect(matchOfflineDataQuestion('what are the phase 1 limits?')).toBe('WHAT_IS_NOT_CHECKED');
      expect(matchOfflineDataQuestion('kya check nahi hua')).toBe('WHAT_IS_NOT_CHECKED');
      expect(matchOfflineDataQuestion('kya scan nahi hota')).toBe('WHAT_IS_NOT_CHECKED');
    });

    it('matches "explain this finding" on finding screen in English and Hinglish', () => {
      // With isFindingScreen = true
      expect(matchOfflineDataQuestion('explain this finding', true)).toBe('EXPLAIN_FINDING');
      expect(matchOfflineDataQuestion('ye finding samjhao', true)).toBe('EXPLAIN_FINDING');
      expect(matchOfflineDataQuestion('ye finding kya hai', true)).toBe('EXPLAIN_FINDING');

      // Without isFindingScreen = false, general explain matches fallback
      expect(matchOfflineDataQuestion('explain this finding', false)).toBe('EXPLAIN_FINDING');
    });

    it('returns null for unrelated questions', () => {
      expect(matchOfflineDataQuestion('Hello, who are you?')).toBeNull();
      expect(matchOfflineDataQuestion('random test question')).toBeNull();
    });
  });

  describe('2. Real capture answers (English and Hinglish)', () => {
    const summaryData: ProjectSummary = (projectSummaryFixture as any).data;
    const findingsData: Finding[] = (findingsDefaultFixture as any).data.items;

    it('(a) "how many findings" returns severity and rule breakdown with required label', async () => {
      vi.spyOn(api, 'getSummary').mockResolvedValue(summaryData);
      vi.spyOn(api, 'getFindings').mockResolvedValue({
        items: findingsData,
        total: findingsData.length,
        page: 1,
        pageSize: 100,
      });

      // English
      const ansEn = await getOfflineDataAnswer('HOW_MANY_FINDINGS', {
        projectId: 'proj-123',
        isScanned: true,
        lang: 'en',
      });
      expect(ansEn).toContain('Total findings: 9');
      expect(ansEn).toContain('High: 1');
      expect(ansEn).toContain('Medium: 2');
      expect(ansEn).toContain('Low: 6');
      expect(ansEn).toContain('Isolated file: 5');
      expect(ansEn).toContain('Broken import: 1');
      expect(ansEn).toContain(OFFLINE_DATA_FOOTER);

      // Hinglish
      const ansHi = await getOfflineDataAnswer('HOW_MANY_FINDINGS', {
        projectId: 'proj-123',
        isScanned: true,
        lang: 'hi',
      });
      expect(ansHi).toContain('Kul 9 findings mili hain');
      expect(ansHi).toContain('Severity ke hisaab se:');
      expect(ansHi).toContain('Rule ke hisaab se:');
      expect(ansHi).toContain(OFFLINE_DATA_FOOTER);
    });

    it('(b) "most risky module" returns highest max severity then most findings', async () => {
      vi.spyOn(api, 'getSummary').mockResolvedValue(summaryData);

      // In project_summary.json:
      // fees has maxSeverity: high (count: 2)
      // shared has maxSeverity: medium (count: 4)
      // notices has maxSeverity: medium (count: 2)
      // fees must win because high > medium!
      const ansEn = await getOfflineDataAnswer('MOST_RISKY_MODULE', {
        projectId: 'proj-123',
        isScanned: true,
        lang: 'en',
      });
      expect(ansEn).toContain('Most risky module: fees (Max severity: high, Findings: 2)');
      expect(ansEn).toContain(OFFLINE_DATA_FOOTER);

      const ansHi = await getOfflineDataAnswer('MOST_RISKY_MODULE', {
        projectId: 'proj-123',
        isScanned: true,
        lang: 'hi',
      });
      expect(ansHi).toContain('Sabse risky module: fees (Max severity: high, Findings: 2)');
      expect(ansHi).toContain(OFFLINE_DATA_FOOTER);
    });

    it('(c) "what should I fix first" returns top 3 by severity then confidence with file:line and guarantee sentence', async () => {
      vi.spyOn(api, 'getFindings').mockResolvedValue({
        items: findingsData,
        total: findingsData.length,
        page: 1,
        pageSize: 100,
      });

      const ansEn = await getOfflineDataAnswer('WHAT_TO_FIX_FIRST', {
        projectId: 'proj-123',
        isScanned: true,
        lang: 'en',
      });

      // Top finding: Broken import in fees.js (high severity, confirmed confidence)
      expect(ansEn).toContain('Broken import "../services/feeService" in fees.js (backend/routes/fees.js:2)');
      // Required exact sentence
      expect(ansEn).toContain('This order comes from severity and confidence, it is not a guarantee');
      expect(ansEn).toContain(OFFLINE_DATA_FOOTER);

      const ansHi = await getOfflineDataAnswer('WHAT_TO_FIX_FIRST', {
        projectId: 'proj-123',
        isScanned: true,
        lang: 'hi',
      });
      expect(ansHi).toContain('Pehle theek karne ke liye top findings:');
      expect(ansHi).toContain('This order comes from severity and confidence, it is not a guarantee');
      expect(ansHi).toContain(OFFLINE_DATA_FOOTER);
    });

    it('(d) "when was the last scan" returns last scan time and status', async () => {
      vi.spyOn(api, 'getSummary').mockResolvedValue(summaryData);

      const ansEn = await getOfflineDataAnswer('LAST_SCAN', {
        projectId: 'proj-123',
        isScanned: true,
        lang: 'en',
      });
      expect(ansEn).toContain('2026-10-23T09:52:02.855Z');
      expect(ansEn).toContain('status: completed');
      expect(ansEn).toContain(OFFLINE_DATA_FOOTER);

      const ansHi = await getOfflineDataAnswer('LAST_SCAN', {
        projectId: 'proj-123',
        isScanned: true,
        lang: 'hi',
      });
      expect(ansHi).toContain('2026-10-23T09:52:02.855Z');
      expect(ansHi).toContain('status: completed');
      expect(ansHi).toContain(OFFLINE_DATA_FOOTER);
    });

    it('(e) "what is not checked" returns fixed Phase 1 limits', async () => {
      const ansEn = await getOfflineDataAnswer('WHAT_IS_NOT_CHECKED', {
        projectId: 'proj-123',
        isScanned: false, // works even if unscanned
        lang: 'en',
      });
      expect(ansEn).toContain('No code is run');
      expect(ansEn).toContain('Only 6 static checks');
      expect(ansEn).toContain('Only JavaScript and TypeScript');
      expect(ansEn).toContain(OFFLINE_DATA_FOOTER);

      const ansHi = await getOfflineDataAnswer('WHAT_IS_NOT_CHECKED', {
        projectId: 'proj-123',
        isScanned: false,
        lang: 'hi',
      });
      expect(ansHi).toContain('Koi code run ya execute nahi hota');
      expect(ansHi).toContain('Sirf 6 automated checks');
      expect(ansHi).toContain('Sirf JavaScript aur TypeScript');
      expect(ansHi).toContain(OFFLINE_DATA_FOOTER);
    });

    it('(f) "explain this finding" on a finding screen returns rule guidance and evidence file:line', async () => {
      const findingDetail = (findingBrokenImportFixture as any).data as FindingDetailData;
      vi.spyOn(api, 'getFinding').mockResolvedValue(findingDetail);

      const ansEn = await getOfflineDataAnswer('EXPLAIN_FINDING', {
        projectId: 'proj-123',
        isScanned: true,
        lang: 'en',
        screen: 'investigations',
        findingId: findingDetail.id,
        findingDetail,
      });

      expect(ansEn).toContain('backend/routes/fees.js:2');
      expect(ansEn).toContain('A file imports a path that does not exist in the uploaded project');
      expect(ansEn).toContain('Steps to fix:');
      expect(ansEn).toContain('Verify:');
      expect(ansEn).toContain(OFFLINE_DATA_FOOTER);

      const ansHi = await getOfflineDataAnswer('EXPLAIN_FINDING', {
        projectId: 'proj-123',
        isScanned: true,
        lang: 'hi',
        screen: 'investigations',
        findingId: findingDetail.id,
        findingDetail,
      });

      expect(ansHi).toContain('backend/routes/fees.js:2');
      expect(ansHi).toContain('Matlab:');
      expect(ansHi).toContain('Theek karne ke steps:');
      expect(ansHi).toContain(OFFLINE_DATA_FOOTER);
    });
  });

  describe('3. Edge cases: never-scanned, empty findings, ties, fetch failure', () => {
    it('never-scanned project answers "Not scanned yet" and never gives zeros', async () => {
      const ans = await getOfflineDataAnswer('HOW_MANY_FINDINGS', {
        projectId: 'proj-unscanned',
        isScanned: false,
        lang: 'en',
      });

      expect(ans).toContain('Not scanned yet.');
      expect(ans).toContain(OFFLINE_DATA_FOOTER);
      // Must NEVER give zeros like "0 findings" or "0"
      expect(ans).not.toContain('0 findings');
      expect(ans).not.toContain(': 0');
    });

    it('empty findings returns the exact required message', () => {
      const emptySummary: ProjectSummary = {
        lastScan: { finished_at: '2026-10-24T00:00:00Z', status: 'completed' },
        counts: { nodes: 10, edges: 5, unresolvedEdges: 0, files: 4 },
        kpi: { openFindings: 0, criticalPlusHigh: 0, fixesPendingApproval: 0, verifiedFixes: 0 },
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
        byConfidence: { confirmed: 0, likely: 0, hypothesis: 0 },
        byVerification: { not_tested: 0, reproduced: 0, fix_proposed: 0, fix_verified: 0 },
        affectedModules: [],
      };

      const ansCount = formatHowManyFindings(emptySummary, [], 'en');
      expect(ansCount).toContain('No findings from the 6 automated checks. That does not mean no problems.');
      expect(ansCount).toContain(OFFLINE_DATA_FOOTER);

      const ansRisky = formatMostRiskyModule(emptySummary, 'en');
      expect(ansRisky).toContain('No findings from the 6 automated checks. That does not mean no problems.');
      expect(ansRisky).toContain(OFFLINE_DATA_FOOTER);

      const ansFix = formatWhatToFixFirst([], 'en');
      expect(ansFix).toContain('No findings from the 6 automated checks. That does not mean no problems.');
      expect(ansFix).toContain(OFFLINE_DATA_FOOTER);
    });

    it('handles ties in most risky module gracefully', () => {
      const tiedSummary: ProjectSummary = {
        lastScan: { finished_at: '2026-10-24T00:00:00Z', status: 'completed' },
        counts: { nodes: 10, edges: 5, unresolvedEdges: 0, files: 4 },
        kpi: { openFindings: 4, criticalPlusHigh: 2, fixesPendingApproval: 0, verifiedFixes: 0 },
        bySeverity: { critical: 0, high: 2, medium: 2, low: 0, unknown: 0 },
        byConfidence: { confirmed: 2, likely: 2, hypothesis: 0 },
        byVerification: { not_tested: 4, reproduced: 0, fix_proposed: 0, fix_verified: 0 },
        affectedModules: [
          { moduleId: 'm1', label: 'module_alpha', findingCount: 2, maxSeverity: 'high' },
          { moduleId: 'm2', label: 'module_beta', findingCount: 2, maxSeverity: 'high' },
          { moduleId: 'm3', label: 'module_gamma', findingCount: 1, maxSeverity: 'low' },
        ],
      };

      const ansTied = formatMostRiskyModule(tiedSummary, 'en');
      expect(ansTied).toContain('Most risky modules (tied): module_alpha, module_beta');
      expect(ansTied).toContain('Max severity: high, Findings: 2 each');
      expect(ansTied).toContain(OFFLINE_DATA_FOOTER);
    });

    it('handles fetch failure with friendly message and preserves offline label', async () => {
      vi.spyOn(api, 'getSummary').mockRejectedValue(new Error('Network connection failed'));

      const ans = await getOfflineDataAnswer('MOST_RISKY_MODULE', {
        projectId: 'proj-123',
        isScanned: true,
        lang: 'en',
      });

      expect(ans).toContain('Backend is not reachable');
      expect(ans).toContain(OFFLINE_DATA_FOOTER);
    });

    it('aborts fetch without error when signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      vi.spyOn(api, 'getSummary').mockImplementation(() => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      });

      await expect(
        getOfflineDataAnswer('MOST_RISKY_MODULE', {
          projectId: 'proj-123',
          isScanned: true,
          lang: 'en',
          signal: controller.signal,
        })
      ).rejects.toThrow();
    });

    it('security: never includes file contents or env values and produces plain text (no raw HTML tags)', async () => {
      const mockFindingWithHtml: Finding = {
        id: 'f-xss',
        project_id: 'proj-123',
        scan_id: 'scan-1',
        rule_id: 'broken_import',
        title: '<img src=x onerror=alert(1)> in fees.js',
        summary: 'Potential XSS in title',
        severity: 'high',
        confidence: 'confirmed',
        verification: 'not_tested',
        evidence: [{ file: 'backend/<script>evil.js', line_start: 5, line_end: 5 }],
        node_ids: [],
        likely_cause: 'Testing XSS sanitization',
        not_confirmed: 'Testing XSS sanitization',
        created_at: '2026-10-24T00:00:00Z',
      };

      const ans = formatWhatToFixFirst([mockFindingWithHtml], 'en');
      // Plain text output
      expect(ans).toContain('<img src=x onerror=alert(1)> in fees.js');
      expect(ans).toContain('backend/<script>evil.js:5');
      // No evaluated code, no env value leakage
      expect(ans).not.toContain('process.env');
    });
  });
});
