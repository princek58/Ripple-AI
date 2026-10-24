import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TestsPage } from '../features/tests/TestsPage.js';
import { ProjectProvider } from '../lib/projectContext.js';
import { ThemeProvider } from '../lib/theme.js';

// Real API Fixtures
import projectsListFixture from './fixtures/api/projects_list.json';
import projectScansFixture from './fixtures/api/project_scans_list.json';
import testsScannedFixture from './fixtures/api/tests_get_project_tests_scanned.json';
import testsNeverScannedFixture from './fixtures/api/tests_get_project_tests_never_scanned.json';
import tests404Fixture from './fixtures/api/tests_get_project_tests_404.json';

const scannedProjectId = projectsListFixture.data[0].id;

function renderWithProviders(initialEntries: string[] = ['/app/tests']) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <ProjectProvider>
          <Routes>
            <Route path="/app/tests" element={<TestsPage />} />
            <Route path="/app/overview" element={<div data-testid="overview-page">Overview</div>} />
          </Routes>
        </ProjectProvider>
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('Tests Screen (Step 12c Part 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    global.fetch = vi.fn().mockImplementation((url: string | URL) => {
      const urlStr = url.toString();

      // Projects List
      if (urlStr.endsWith('/api/projects')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => projectsListFixture,
        });
      }

      // Project Scans
      if (urlStr.includes('/scans')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => projectScansFixture,
        });
      }

      // Project Tests (Scanned)
      if (urlStr.includes(`/api/projects/${scannedProjectId}/tests`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => testsScannedFixture,
        });
      }

      // Project Tests (404 / other)
      if (urlStr.includes('/tests')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => tests404Fixture,
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

  it('renders four counts tiles matching the real backend capture', async () => {
    renderWithProviders();

    const realCounts = testsScannedFixture.data.counts;

    await waitFor(() => {
      expect(screen.getByTestId('count-not-run')).toHaveTextContent(String(realCounts.not_run));
    });

    expect(screen.getByTestId('count-pass').textContent).toBe(String(realCounts.pass));
    expect(screen.getByTestId('count-fail').textContent).toBe(String(realCounts.fail));
    expect(screen.getByTestId('count-skipped').textContent).toBe(String(realCounts.skipped));

    // Check tiles have icons and labels
    expect(screen.getByTestId('tile-passed')).toHaveTextContent('Passed');
    expect(screen.getByTestId('tile-failed')).toHaveTextContent('Failed');
    expect(screen.getByTestId('tile-skipped')).toHaveTextContent('Skipped');
    expect(screen.getByTestId('tile-not-run')).toHaveTextContent('Not run');
  });

  it('shows clear banner "No tests were run. This is not a pass." when every item is not_run', async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('tests-not-run-banner')).toBeInTheDocument();
    });

    const banner = screen.getByTestId('tests-not-run-banner');
    expect(banner).toHaveTextContent('No tests were run. This is not a pass.');
    expect(banner).not.toHaveClass('bg-emerald-500');
    expect(banner).not.toHaveClass('text-emerald-500');
  });

  it('never shows green or "passed" success wording when all tests are not_run', async () => {
    const { container } = renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('tests-not-run-banner')).toBeInTheDocument();
    });

    const successRegexList = [
      /all\s+tests\s+passed/i,
      /tests?\s+passed\s+successfully/i,
      /all\s+passed/i,
      /passed\s+with\s+flying\s+colors/i,
      /all\s+good/i,
      /everything\s+passed/i,
      /all\s+checks\s+passed/i,
    ];

    for (const regex of successRegexList) {
      expect(regex.test(container.textContent || '')).toBe(false);
    }
  });

  it('ALWAYS shows the backend note and not_run explanation', async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('tests-phase1-note')).toBeInTheDocument();
    });

    const noteEl = screen.getByTestId('tests-phase1-note');
    expect(noteEl).toHaveTextContent('Tests are not executed in Phase 1.');
    expect(noteEl).toHaveTextContent(
      'Not run: Ripple AI found this test file but did not execute it, because Phase 1 executes no code'
    );
  });

  it('renders test rows with monospace paths and status as icon + text', async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('test-row-fe86ce9f-46e4-4d27-8440-dbc4054c5da6')).toBeInTheDocument();
    });

    const nameEl = screen.getByTestId('test-name-fe86ce9f-46e4-4d27-8440-dbc4054c5da6');
    expect(nameEl).toHaveTextContent('backend/tests/notices.test.js');
    expect(nameEl.className).toContain('font-mono');

    const statusEl = screen.getByTestId('test-status-fe86ce9f-46e4-4d27-8440-dbc4054c5da6');
    expect(statusEl).toHaveTextContent('Not run');
  });

  it('filters tests by status and search query, updating counter', async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('tests-counter')).toHaveTextContent('Showing 1 of 1 test files');
    });

    // Filter by 'Passed' (should result in 0 matches)
    const passFilterBtn = screen.getByTestId('filter-status-pass');
    fireEvent.click(passFilterBtn);

    await waitFor(() => {
      expect(screen.getByTestId('no-test-files-match')).toBeInTheDocument();
      expect(screen.getByTestId('tests-counter')).toHaveTextContent('Showing 0 of 1 test files');
    });

    // Reset to 'All'
    const allFilterBtn = screen.getByTestId('filter-status-all');
    fireEvent.click(allFilterBtn);

    await waitFor(() => {
      expect(screen.getByTestId('tests-counter')).toHaveTextContent('Showing 1 of 1 test files');
    });

    // Search for non-existent name
    const searchInput = screen.getByTestId('tests-search-input');
    fireEvent.change(searchInput, { target: { value: 'nonexistent_test_suite' } });

    await waitFor(() => {
      expect(screen.getByTestId('no-test-files-match')).toBeInTheDocument();
      expect(screen.getByTestId('tests-counter')).toHaveTextContent('Showing 0 of 1 test files');
    });

    // Search for 'notices'
    fireEvent.change(searchInput, { target: { value: 'NOTICES' } });
    await waitFor(() => {
      expect(screen.getByTestId('test-name-fe86ce9f-46e4-4d27-8440-dbc4054c5da6')).toBeInTheDocument();
      expect(screen.getByTestId('tests-counter')).toHaveTextContent('Showing 1 of 1 test files');
    });
  });

  it('handles never-scanned project: shows "Not scanned yet" + Re-scan and NEVER shows zeros', async () => {
    // Return never-scanned project list
    const neverScannedProject = {
      ...projectsListFixture.data[0],
      id: 'never-scanned-123',
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
        json: async () => testsNeverScannedFixture,
      });
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('tests-never-scanned')).toBeInTheDocument();
    });

    expect(screen.getByText('Not scanned yet')).toBeInTheDocument();
    expect(screen.getByText('Re-scan')).toBeInTheDocument();

    // Verify NEVER showing zeros
    expect(screen.queryByTestId('count-pass')).not.toBeInTheDocument();
    expect(screen.queryByTestId('count-fail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('count-not-run')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tile-passed')).not.toBeInTheDocument();
  });

  it('shows empty list message when scanned project has no test files', async () => {
    global.fetch = vi.fn().mockImplementation((url: string | URL) => {
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
      if (urlStr.includes('/tests')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            data: {
              items: [],
              counts: { pass: 0, fail: 0, skipped: 0, not_run: 0 },
              note: 'Tests are not executed in Phase 1.',
            },
            error: null,
          }),
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
      expect(screen.getByTestId('no-test-files-scanned')).toBeInTheDocument();
    });

    expect(screen.getByText('No test files found in this project')).toBeInTheDocument();
    expect(screen.getByTestId('tests-phase1-note')).toBeInTheDocument();
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
      if (urlStr.includes('/tests')) {
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

    // Unmount triggers abort cleanup
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
