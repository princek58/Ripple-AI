import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';
import { ReportsPage } from '../features/reports/ReportsPage.js';
import { ReportPreview } from '../features/reports/ReportPreview.js';
import { ProjectProvider } from '../lib/projectContext.js';
import { ThemeProvider } from '../lib/theme.js';

// Real API Fixtures
import projectsListFixture from './fixtures/api/projects_list.json';
import projectScansFixture from './fixtures/api/project_scans_list.json';
import reportsListFixture from './fixtures/api/reports_get_project_reports_list.json';
import reportDetailFixture from './fixtures/api/reports_get_report_detail.json';
import reports404Fixture from './fixtures/api/reports_get_report_404.json';
import reports400Fixture from './fixtures/api/reports_get_report_400.json';
import testsScannedFixture from './fixtures/api/tests_get_project_tests_scanned.json';
import { compareKeySets } from './contract_helpers.js';

const realFetch = globalThis.fetch;

const scannedProjectId = projectsListFixture.data[0].id;
const realReportId = reportDetailFixture.data.id;

function renderWithProviders(initialEntries: string[] = ['/app/reports']) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <ProjectProvider>
          <Routes>
            <Route path="/app/reports" element={<ReportsPage />} />
            <Route path="/app/overview" element={<div data-testid="overview-page">Overview</div>} />
          </Routes>
        </ProjectProvider>
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('Reports Screen (Step 12c Part 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    global.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const urlStr = url.toString();
      const method = init?.method || 'GET';

      // 1. Projects List
      if (urlStr.endsWith('/api/projects')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => projectsListFixture,
        });
      }

      // 2. Project Scans
      if (urlStr.includes('/scans')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => projectScansFixture,
        });
      }

      // 3. POST Generate Report
      if (method === 'POST' && urlStr.includes(`/api/projects/${scannedProjectId}/reports`)) {
        const newReport = {
          ...reportDetailFixture.data,
          id: 'new-generated-report-uuid',
          created_at: new Date().toISOString(),
        };
        return Promise.resolve({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: newReport, error: null }),
        });
      }

      // 4. GET Project Reports List
      if (method === 'GET' && urlStr.includes(`/api/projects/${scannedProjectId}/reports`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => reportsListFixture,
        });
      }

      // 5. GET Single Report
      if (urlStr.includes(`/api/reports/${realReportId}`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => reportDetailFixture,
        });
      }

      // 6. 404 Report
      if (urlStr.includes('/api/reports/')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => reports404Fixture,
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: {}, error: null }),
      });
    });
  });

  it('preview shows the real headings and the findings table rows matching capture', async () => {
    renderWithProviders([`/app/reports?report=${realReportId}`]);

    await waitFor(() => {
      expect(screen.getByTestId('report-preview')).toBeInTheDocument();
    });

    // Level 1 heading
    const h1 = screen.getByTestId('report-heading-1');
    expect(h1).toHaveTextContent('Ripple AI Analysis Report');

    // Level 2 headings
    expect(screen.getByTestId('report-heading-2-summary')).toHaveTextContent('Summary');
    expect(screen.getByTestId('report-heading-2-findings-table')).toHaveTextContent('Findings Table');
    expect(screen.getByTestId('report-heading-2-what-was-not-checked')).toHaveTextContent('What was not checked');

    // Findings table rows (9 findings in real capture)
    const tableRows = screen.getAllByTestId('report-table-row');
    expect(tableRows.length).toBe(9);
    expect(tableRows[0]).toHaveTextContent('circular_dependency');
    expect(tableRows[1]).toHaveTextContent('broken_import');
  });

  it('contents list matches headings in table of contents', async () => {
    renderWithProviders([`/app/reports?report=${realReportId}`]);

    await waitFor(() => {
      expect(screen.getByTestId('report-toc')).toBeInTheDocument();
    });

    expect(screen.getByTestId('toc-item-summary')).toHaveTextContent('Summary');
    expect(screen.getByTestId('toc-item-findings-table')).toHaveTextContent('Findings Table');
    expect(screen.getByTestId('toc-item-what-was-not-checked')).toHaveTextContent('What was not checked');
  });

  it('markdown with <img src=x onerror=alert(1)> and <script> renders as text and creates no element', () => {
    const maliciousReport = {
      id: 'malicious-report-id',
      project_id: scannedProjectId,
      created_at: '2026-10-24T00:00:00Z',
      markdown: '# Security Test\n\nDangerous payload: <img src=x onerror=alert(1)> and `<script>alert(1)</script>`',
    };

    const { container } = render(
      <ThemeProvider>
        <ReportPreview report={maliciousReport} />
      </ThemeProvider>
    );

    // Text is rendered literally as plain text
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.textContent).toContain('<script>alert(1)</script>');

    // NO img or script DOM elements are created
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('hasNotChecked warning appears for a hand-made report without that section and not for the real one', () => {
    // 1. Real report has "What was not checked"
    const { unmount } = render(
      <ThemeProvider>
        <ReportPreview report={reportDetailFixture.data} />
      </ThemeProvider>
    );
    expect(screen.queryByTestId('report-warning-not-checked')).toBeNull();
    unmount();

    // 2. Report without that section
    const reportWithout = {
      id: 'no-check-report',
      project_id: scannedProjectId,
      created_at: '2026-10-24T00:00:00Z',
      markdown: '# Analysis\n## Summary\nAll good.\n## Findings Table\n| A | B |\n| --- | --- |\n| 1 | 2 |',
    };
    render(
      <ThemeProvider>
        <ReportPreview report={reportWithout} />
      </ThemeProvider>
    );
    const warning = screen.getByTestId('report-warning-not-checked');
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent("This report has no 'What was not checked' section");
  });

  it('Generate calls POST exactly once on a double click and selects the new report', async () => {
    let postCallCount = 0;

    global.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const urlStr = url.toString();
      const method = init?.method || 'GET';

      if (urlStr.endsWith('/api/projects')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => projectsListFixture,
        });
      }
      if (urlStr.includes('/scans')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => projectScansFixture,
        });
      }
      if (method === 'POST' && urlStr.includes('/reports')) {
        postCallCount++;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              status: 201,
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({
                data: {
                  id: 'double-click-new-report',
                  project_id: scannedProjectId,
                  created_at: new Date().toISOString(),
                  markdown: '# New Generated Report\n## Summary\nDone.',
                },
                error: null,
              }),
            });
          }, 30);
        });
      }
      if (method === 'GET' && urlStr.includes('/reports')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => reportsListFixture,
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: {}, error: null }),
      });
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('generate-report-button')).toBeInTheDocument();
    });

    const generateBtn = screen.getByTestId('generate-report-button');
    // Double click rapidly
    fireEvent.click(generateBtn);
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText('New Generated Report')).toBeInTheDocument();
    });

    // Verify it called POST exactly once
    expect(postCallCount).toBe(1);
  });

  it('a 404 report id shows the friendly "This report is not in the selected project" with a back button', async () => {
    renderWithProviders(['/app/reports?report=00000000-0000-0000-0000-000000000000']);

    await waitFor(() => {
      expect(screen.getByTestId('report-404-container')).toBeInTheDocument();
    });

    expect(screen.getByText('This report is not in the selected project')).toBeInTheDocument();

    const backBtn = screen.getByTestId('back-to-reports-button');
    fireEvent.click(backBtn);

    // After clicking back, error container disappears and default report is displayed
    await waitFor(() => {
      expect(screen.queryByTestId('report-404-container')).toBeNull();
    });
  });

  it('lists past reports newest first with the "Latest" label on the first', async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('latest-report-badge')).toBeInTheDocument();
    });

    expect(screen.getByTestId('latest-report-badge')).toHaveTextContent('Latest');

    // First item in reports list has the Latest label
    const firstReportId = reportsListFixture.data[0].id;
    const firstReportItem = screen.getByTestId(`report-item-${firstReportId}`);
    expect(firstReportItem).toContainElement(screen.getByTestId('latest-report-badge'));
  });

  it('Download uses the Markdown text and buildReportFileName (spy on URL.createObjectURL)', async () => {
    if (typeof URL.createObjectURL === 'undefined') {
      URL.createObjectURL = () => '';
    }
    if (typeof URL.revokeObjectURL === 'undefined') {
      URL.revokeObjectURL = () => {};
    }
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    renderWithProviders([`/app/reports?report=${realReportId}`]);

    await waitFor(() => {
      expect(screen.getByTestId('download-markdown-button')).toBeInTheDocument();
    });

    const downloadBtn = screen.getByTestId('download-markdown-button');
    fireEvent.click(downloadBtn);

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURLSpy.mock.calls[0][0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toContain('text/markdown');

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('Copy uses clipboard with feedback', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    renderWithProviders([`/app/reports?report=${realReportId}`]);

    await waitFor(() => {
      expect(screen.getByTestId('copy-markdown-button')).toBeInTheDocument();
    });

    const copyBtn = screen.getByTestId('copy-markdown-button');
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(reportDetailFixture.data.markdown);
      expect(screen.getByText('Copied to clipboard!')).toBeInTheDocument();
    });
  });

  it('Print calls window.print once', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    renderWithProviders([`/app/reports?report=${realReportId}`]);

    await waitFor(() => {
      expect(screen.getByTestId('print-report-button')).toBeInTheDocument();
    });

    const printBtn = screen.getByTestId('print-report-button');
    fireEvent.click(printBtn);

    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it('verifies print stylesheet exists with required hidden-in-print selectors and avoid-break rules', () => {
    // Assert on CSS text file as required:
    // "the print stylesheet exists and the hidden-in-print selectors are present (assert on the CSS text file, and say honestly that real print output is not unit-testable)"
    const cssPath = path.resolve(__dirname, '../styles/print.css');
    expect(fs.existsSync(cssPath)).toBe(true);

    const cssText = fs.readFileSync(cssPath, 'utf-8');

    expect(cssText).toContain('@media print');
    expect(cssText).toContain('[data-testid="top-navigation"]');
    expect(cssText).toContain('[data-testid="project-switcher"]');
    expect(cssText).toContain('[data-testid="reports-toolbar"]');
    expect(cssText).toContain('[data-testid="reports-list-panel"]');
    expect(cssText).toContain('break-inside: avoid');
    expect(cssText).toContain('.print-only');
    expect(cssText).not.toMatch(/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/); // no hex colors
  });

  it('handles never-scanned project: shows "Not scanned yet" + Re-scan', async () => {
    const neverScannedProject = {
      ...projectsListFixture.data[0],
      id: 'never-scanned-proj',
      last_scan_at: null,
      last_scan_id: null,
    };

    global.fetch = vi.fn().mockImplementation((url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr.endsWith('/api/projects')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: [neverScannedProject], error: null }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: [], error: null }),
      });
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('reports-never-scanned')).toBeInTheDocument();
    });

    expect(screen.getByText('Not scanned yet')).toBeInTheDocument();
    expect(screen.getByText('Re-scan')).toBeInTheDocument();
  });

  it('aborts request on project switch and ignores late response', async () => {
    let capturedSignal: AbortSignal | null | undefined;

    global.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.endsWith('/api/projects')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => projectsListFixture,
        });
      }
      if (urlStr.includes('/scans')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => projectScansFixture,
        });
      }
      if (urlStr.includes('/reports')) {
        capturedSignal = init?.signal;
        return new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
          } else {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: {}, error: null }),
      });
    });

    const { unmount } = renderWithProviders();

    await waitFor(() => {
      expect(capturedSignal).toBeDefined();
    });

    expect(capturedSignal?.aborted).toBe(false);

    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  describe('Extended Contract Test (RIPPLE_CONTRACT=1)', () => {
    const shouldRunContract = process.env.RIPPLE_CONTRACT === '1';

    it('proves contract comparison detects extra and missing keys on test and report objects', () => {
      const sample = JSON.parse(JSON.stringify(testsScannedFixture.data));
      const mutated = JSON.parse(JSON.stringify(sample));
      mutated.unexpectedExtra = 'extra';
      delete mutated.note;

      const diff = compareKeySets(mutated, sample);
      expect(diff.matching).toBe(false);
      expect(diff.differences.some((d) => d.includes('unexpectedExtra'))).toBe(true);
      expect(diff.differences.some((d) => d.includes('note'))).toBe(true);

      const restored = compareKeySets(sample, sample);
      expect(restored.matching).toBe(true);
      expect(restored.differences).toHaveLength(0);
    });

    it.runIf(shouldRunContract)(
      'contract test: verifies live backend tests response, report object, reports list item and 404/400 bodies match captures',
      async () => {
        // Fetch projects to get target projectId
        const liveProjectsRes = await realFetch('http://localhost:4000/api/projects');
        let targetProjectId = scannedProjectId;
        if (liveProjectsRes.ok) {
          const liveProjectsJson = (await liveProjectsRes.json()) as any;
          if (liveProjectsJson.data && liveProjectsJson.data.length > 0) {
            const matched =
              liveProjectsJson.data.find(
                (p: any) => p.id === '04a16442-a011-4076-8d00-1f67c25b69a2'
              ) ||
              liveProjectsJson.data.find(
                (p: any) => p.id === scannedProjectId
              ) ||
              liveProjectsJson.data.find((p: any) => p.last_scan_at) ||
              liveProjectsJson.data[0];
            targetProjectId = matched.id;
          }
        }

        // 1. Tests response key sets
        const liveTestsRes = await realFetch(`http://localhost:4000/api/projects/${targetProjectId}/tests`);
        expect(liveTestsRes.ok).toBe(true);
        const liveTestsJson = await liveTestsRes.json();
        const testsCmp = compareKeySets(liveTestsJson, testsScannedFixture);
        expect(testsCmp.matching).toBe(true);

        // 2. Reports list key sets and report item
        const liveReportsRes = await realFetch(`http://localhost:4000/api/projects/${targetProjectId}/reports`);
        expect(liveReportsRes.ok).toBe(true);
        const liveReportsJson = (await liveReportsRes.json()) as any;
        const reportsListCmp = compareKeySets(liveReportsJson, reportsListFixture);
        expect(reportsListCmp.matching).toBe(true);

        // 3. Single report detail object key sets
        if (liveReportsJson.data && liveReportsJson.data.length > 0) {
          const firstReportId = liveReportsJson.data[0].id;
          const liveReportDetailRes = await realFetch(`http://localhost:4000/api/reports/${firstReportId}`);
          expect(liveReportDetailRes.ok).toBe(true);
          const liveReportDetailJson = await liveReportDetailRes.json();
          const detailCmp = compareKeySets(liveReportDetailJson, reportDetailFixture);
          expect(detailCmp.matching).toBe(true);
        }

        // 4. 404 bodies key sets
        const live404Res = await realFetch('http://localhost:4000/api/reports/00000000-0000-0000-0000-000000000000');
        expect(live404Res.status).toBe(404);
        const live404Json = await live404Res.json();
        const cmp404 = compareKeySets(live404Json, reports404Fixture);
        expect(cmp404.matching).toBe(true);

        // 5. 400 bodies key sets
        const live400Res = await realFetch('http://localhost:4000/api/reports/invalid-uuid');
        expect(live400Res.status).toBe(400);
        const live400Json = await live400Res.json();
        const cmp400 = compareKeySets(live400Json, reports400Fixture);
        expect(cmp400.matching).toBe(true);
      }
    );
  });
});
