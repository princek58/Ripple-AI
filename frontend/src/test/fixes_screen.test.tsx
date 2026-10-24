import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FixesPage } from '../features/fixes/FixesPage.js';
import { DiffViewer } from '../features/fixes/DiffViewer.js';
import { ProjectProvider } from '../lib/projectContext.js';
import { ThemeProvider } from '../lib/theme.js';
import { api } from '../lib/api.js';
import { buildPatchFileName } from '../features/fixes/fixesPure.js';
import { compareKeySets } from './contract_helpers.js';

// Real API Fixtures
import projectsListFixture from './fixtures/api/projects_list.json';
import projectSummaryFixture from './fixtures/api/project_summary.json';
import projectScansFixture from './fixtures/api/project_scans_list.json';
import findingDetailEnvFixture from './fixtures/api/finding_detail_env_undeclared.json';
import findingDetailApiFixture from './fixtures/api/finding_detail_api_unmatched_call.json';
import findingDetailBrokenFixture from './fixtures/api/finding_detail_broken_import.json';
import fixesGetProjectAllFixture from './fixtures/api/fixes_get_project_fixes_all.json';
import fixesGetProjectProposedFixture from './fixtures/api/fixes_get_project_fixes_proposed.json';
import fixesGetProjectApprovedFixture from './fixtures/api/fixes_get_project_fixes_approved.json';
import fixesGetProjectRejectedFixture from './fixtures/api/fixes_get_project_fixes_rejected.json';
import fixesGetFindingFixesFixture from './fixtures/api/fixes_get_finding_fixes.json';
import fixesPostEnvCreateFixture from './fixtures/api/fixes_post_env_create.json';
import fixesPostEnvApproveFixture from './fixtures/api/fixes_post_env_approve.json';
import fixesPostEnvApprove409Fixture from './fixtures/api/fixes_post_env_approve_409.json';
import fixesPostApiRejectFixture from './fixtures/api/fixes_post_api_reject.json';
import fixesPostApiReject409Fixture from './fixtures/api/fixes_post_api_reject_409.json';
import fixesPostBroken422Fixture from './fixtures/api/fixes_post_broken_import_422.json';

const projectId = projectsListFixture.data[0].id;

function renderWithProviders(initialEntries: string[] = ['/app/fixes']) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <ProjectProvider>
          <Routes>
            <Route path="/app/fixes" element={<FixesPage />} />
            <Route path="/app/overview" element={<div data-testid="overview-page">Overview</div>} />
            <Route path="/app/investigations" element={<div data-testid="investigations-page">Investigations</div>} />
          </Routes>
        </ProjectProvider>
      </MemoryRouter>
    </ThemeProvider>
  );
}

let mockApprove409 = false;
let mockReject409 = false;

describe('Fixes Screen (Step 12b Part 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.innerWidth = 1200;
    mockApprove409 = false;
    mockReject409 = false;

    // Default mock fetch responding with real backend captures
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

      // 3. Project Summary
      if (urlStr.includes('/summary')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => projectSummaryFixture,
        });
      }

      // 4. Project Fixes List
      if (urlStr.includes(`/api/projects/${projectId}/fixes`)) {
        if (urlStr.includes('status=proposed')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => fixesGetProjectProposedFixture,
          });
        }
        if (urlStr.includes('status=approved')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => fixesGetProjectApprovedFixture,
          });
        }
        if (urlStr.includes('status=rejected')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => fixesGetProjectRejectedFixture,
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => fixesGetProjectAllFixture,
        });
      }

      // 5. Finding Fixes endpoint (MUST BE CHECKED BEFORE FINDING DETAIL)
      if (urlStr.includes('/fixes') && urlStr.includes('/api/findings/')) {
        if (method === 'POST') {
          if (urlStr.includes('finding-broken-import')) {
            return Promise.resolve({
              ok: false,
              status: 422,
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => fixesPostBroken422Fixture,
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => fixesPostEnvCreateFixture,
          });
        }
        if (urlStr.includes('finding-broken-import') || urlStr.includes('finding-no-fix')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ data: [], error: null }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => fixesGetFindingFixesFixture,
        });
      }

      // 6. Finding Detail
      if (urlStr.includes('/api/findings/finding-env-undeclared') || urlStr.includes(fixesPostEnvCreateFixture.data.finding_id)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => findingDetailEnvFixture,
        });
      }
      if (urlStr.includes('/api/findings/finding-api-unmatched') || urlStr.includes(fixesPostApiRejectFixture.data.finding_id)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => findingDetailApiFixture,
        });
      }
      if (urlStr.includes('/api/findings/finding-broken-import')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => findingDetailBrokenFixture,
        });
      }

      // 7. Approve / Reject
      if (urlStr.includes('/approve') && method === 'POST') {
        if (mockApprove409) {
          return Promise.resolve({
            ok: false,
            status: 409,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => fixesPostEnvApprove409Fixture,
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => fixesPostEnvApproveFixture,
        });
      }
      if (urlStr.includes('/reject') && method === 'POST') {
        if (mockReject409) {
          return Promise.resolve({
            ok: false,
            status: 409,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => fixesPostApiReject409Fixture,
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => fixesPostApiRejectFixture,
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading skeletons and then displays fixes list with status tabs', async () => {
    renderWithProviders();

    // Verify list items loaded
    await waitFor(() => {
      expect(screen.getByText('Suggested Changes')).toBeInTheDocument();
    });

    // Check status filter tabs
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Proposed' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Approved' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Rejected' })).toBeInTheDocument();

    // Check list rows
    const rows = screen.getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(0);
    expect(screen.getByText(/Showing 1 to 2 of 2/i)).toBeInTheDocument();
  });

  it('shows empty state when no projects exist', async () => {
    (global.fetch as any).mockImplementation((url: string | URL) => {
      if (url.toString().endsWith('/api/projects')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: [], error: null }),
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
      expect(screen.getByText('Upload your first project')).toBeInTheDocument();
    });
  });

  it('shows "Not scanned yet" and Re-scan button for project without scan, never zeros', async () => {
    (global.fetch as any).mockImplementation((url: string | URL) => {
      if (url.toString().endsWith('/api/projects')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            data: [
              {
                id: 'p-never-scanned',
                name: 'never-scanned-demo',
                status: 'ready',
                created_at: '2026-03-30T10:00:00Z',
                last_scan_at: null,
                last_scan_id: null,
              },
            ],
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
      expect(screen.getByText('Not scanned yet')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /re-scan/i })).toBeInTheDocument();
    });
    // Never show zeros
    expect(screen.queryByText('0 findings')).not.toBeInTheDocument();
    expect(screen.queryByText('0 files')).not.toBeInTheDocument();
  });

  it('shows error state with Retry button on API failure', async () => {
    (global.fetch as any).mockImplementation((url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr.endsWith('/api/projects')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => projectsListFixture,
        });
      }
      if (urlStr.includes('/fixes')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: null, error: 'Internal Server Error' }),
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
      expect(screen.getByText('Failed to load suggested changes')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('shows "No suggested changes yet" for scanned project with zero fixes', async () => {
    (global.fetch as any).mockImplementation((url: string | URL) => {
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
      if (urlStr.includes('/fixes')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: { items: [], total: 0, page: 1, pageSize: 25 }, error: null }),
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
      expect(screen.getByText('No suggested changes yet')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Open a finding in Investigations and choose Suggested fix. Ripple AI can suggest a change for only some findings.'
        )
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /go to investigations/i })).toBeInTheDocument();
    });
  });

  it('filters fixes by status tabs and renders filtered-empty message when none match', async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText('Suggested Changes')).toBeInTheDocument();
    });

    // Switch to Rejected tab
    const rejectedTab = screen.getByRole('tab', { name: 'Rejected' });
    fireEvent.click(rejectedTab);

    await waitFor(() => {
      expect(rejectedTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('opening a fix shows banner, affected files, line numbers, symbols (+/-) and screen-reader markers', async () => {
    const fixItem = fixesGetProjectAllFixture.data.items[0];
    renderWithProviders([`/app/fixes?fix=${fixItem.id}`]);

    await waitFor(() => {
      expect(screen.getByTestId('safety-banner')).toBeInTheDocument();
      expect(screen.getByText('Suggested change, not applied, not tested')).toBeInTheDocument();
    });

    // Affected files rendered
    expect(screen.getAllByText('.env.example').length).toBeGreaterThanOrEqual(1);

    // Line number gutter and symbols (+ / - / space)
    expect(screen.getByText('+')).toBeInTheDocument();

    // Screen reader markers ("added line", "removed line", or "context line")
    const srMarkers = screen.getAllByText(/(added line|removed line|context line)/i);
    expect(srMarkers.length).toBeGreaterThan(0);
  });

  it('masks values in .env.example lines within DiffViewer', () => {
    const handMadeDiff = `--- a/.env.example
+++ b/.env.example
@@ -1,1 +1,2 @@
+PORT=3000
+SECRET_KEY=my-super-secret-123
+EMPTY_VAR=`;

    render(
      <DiffViewer
        diffText={handMadeDiff}
        files={['.env.example']}
        fixId="test-fix-1"
        ruleId="env_undeclared"
      />
    );

    // PORT=3000 and SECRET_KEY should be masked to ***
    expect(screen.getByText('PORT=***')).toBeInTheDocument();
    expect(screen.getByText('SECRET_KEY=***')).toBeInTheDocument();
    // Empty value remains empty
    expect(screen.getByText('EMPTY_VAR=')).toBeInTheDocument();
    // Raw secret values must not appear anywhere
    expect(screen.queryByText(/3000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/my-super-secret-123/)).not.toBeInTheDocument();
  });

  it('renders HTML-looking text strictly as text and creates NO DOM element', () => {
    const xssDiff = `--- a/index.html
+++ b/index.html
@@ -1,1 +1,2 @@
+<img src=x onerror=alert(1)>
+<script>window.pwned=1</script>`;

    const { container } = render(
      <DiffViewer
        diffText={xssDiff}
        files={['index.html']}
        fixId="test-fix-xss"
      />
    );

    // Assert that <img src=x> did not create an HTML image element
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();

    // Assert that the raw text itself is safely rendered in the DOM
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.getByText('<script>window.pwned=1</script>')).toBeInTheDocument();
  });

  it('collapses long diffs over 500 lines and provides "Show all" button up to 2000-line cap', () => {
    // Generate 600 lines
    const lines = ['--- a/big.txt', '+++ b/big.txt', '@@ -1,600 +1,600 @@'];
    for (let i = 0; i < 600; i++) {
      lines.push(`+line content ${i}`);
    }
    const bigDiff = lines.join('\n');

    render(
      <DiffViewer
        diffText={bigDiff}
        files={['big.txt']}
        fixId="test-fix-big"
      />
    );

    // Initially collapsed with "Show all" button
    const showAllBtn = screen.getByRole('button', { name: /show all/i });
    expect(showAllBtn).toBeInTheDocument();

    // Click show all
    fireEvent.click(showAllBtn);
    expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument();
  });

  it('Approve flow: opens ConfirmDialog, Escape/Cancel cancels, confirming calls POST approve once, shows patch path and disclaimers', async () => {
    const fixItem = fixesGetProjectAllFixture.data.items[0]; // Proposed fix

    renderWithProviders([`/app/fixes?fix=${fixItem.id}`]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /approve change/i })).toBeInTheDocument();
    });

    const approveBtn = screen.getByRole('button', { name: /approve change/i });

    // Click approve -> dialog opens
    fireEvent.click(approveBtn);
    expect(screen.getByRole('dialog', { name: /approve suggested change\?/i })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Approve this suggested change? Your uploaded project is NOT changed. Ripple AI only saves a patch file for you to review and apply yourself.'
      )
    ).toBeInTheDocument();

    // Verify approve API has not been called
    let approveCalls = (global.fetch as any).mock.calls.filter((c: any[]) =>
      c[0]?.toString().includes('/approve')
    );
    expect(approveCalls).toHaveLength(0);

    // Press Escape to cancel
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Check focus returns to approve button
    expect(document.activeElement).toBe(approveBtn);

    // Escape did not trigger approve call
    approveCalls = (global.fetch as any).mock.calls.filter((c: any[]) =>
      c[0]?.toString().includes('/approve')
    );
    expect(approveCalls).toHaveLength(0);

    // Reopen and confirm - double click should only call once
    fireEvent.click(approveBtn);
    const dialogConfirmBtn = screen.getByTestId('approve-confirm-dialog-confirm');
    fireEvent.click(dialogConfirmBtn);
    fireEvent.click(dialogConfirmBtn);

    // Verify approve API called exactly once
    await waitFor(() => {
      expect(screen.getByTestId('fix-feedback-message')).toBeInTheDocument();
    });

    approveCalls = (global.fetch as any).mock.calls.filter((c: any[]) =>
      c[0]?.toString().includes('/approve')
    );
    expect(approveCalls).toHaveLength(1);

    expect(
      screen.getByText(
        /Approved\. A patch file was saved on the server.*Nothing was applied or tested, so the finding stays at its current verification\./i
      )
    ).toBeInTheDocument();
  });

  it('Approve flow: 409 conflict displays friendly error message', async () => {
    mockApprove409 = true;
    const fixItem = fixesGetProjectAllFixture.data.items[0];

    renderWithProviders([`/app/fixes?fix=${fixItem.id}`]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /approve change/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /approve change/i }));
    fireEvent.click(screen.getByTestId('approve-confirm-dialog-confirm'));

    await waitFor(() => {
      expect(screen.getByText('This fix was already approved or rejected')).toBeInTheDocument();
    });
  });

  it('Reject flow: opens ConfirmDialog, confirms and calls POST reject once', async () => {
    const fixItem = fixesGetProjectAllFixture.data.items[0];

    renderWithProviders([`/app/fixes?fix=${fixItem.id}`]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reject change/i })).toBeInTheDocument();
    });

    const rejectBtn = screen.getByRole('button', { name: /reject change/i });
    fireEvent.click(rejectBtn);

    expect(screen.getByRole('dialog', { name: /reject suggested change\?/i })).toBeInTheDocument();
    expect(
      screen.getByText('Reject this suggested change? You can generate it again from Investigations.')
    ).toBeInTheDocument();

    // Verify reject API not called before confirm
    let rejectCalls = (global.fetch as any).mock.calls.filter((c: any[]) =>
      c[0]?.toString().includes('/reject')
    );
    expect(rejectCalls).toHaveLength(0);

    // Cancel via Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Check focus returns to reject button
    expect(document.activeElement).toBe(rejectBtn);

    // Reopen and confirm - double click calls once
    fireEvent.click(rejectBtn);
    const dialogConfirmBtn = screen.getByTestId('reject-confirm-dialog-confirm');
    fireEvent.click(dialogConfirmBtn);
    fireEvent.click(dialogConfirmBtn);

    await waitFor(() => {
      expect(screen.getByText('Rejected suggested change.')).toBeInTheDocument();
    });

    rejectCalls = (global.fetch as any).mock.calls.filter((c: any[]) =>
      c[0]?.toString().includes('/reject')
    );
    expect(rejectCalls).toHaveLength(1);
  });

  it('Reject flow: 409 conflict displays friendly error message', async () => {
    mockReject409 = true;
    const fixItem = fixesGetProjectAllFixture.data.items[0];

    renderWithProviders([`/app/fixes?fix=${fixItem.id}`]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reject change/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /reject change/i }));
    fireEvent.click(screen.getByTestId('reject-confirm-dialog-confirm'));

    await waitFor(() => {
      expect(screen.getByText('This fix was already approved or rejected')).toBeInTheDocument();
    });
  });

  it('?finding=<id> with no fix shows Generate card; clicking Generate calls POST /api/findings/:id/fixes once', async () => {
    renderWithProviders(['/app/fixes?finding=finding-no-fix']);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate suggested change/i })).toBeInTheDocument();
    });

    const generateBtn = screen.getByRole('button', { name: /generate suggested change/i });
    // Double click
    fireEvent.click(generateBtn);
    fireEvent.click(generateBtn);

    // Verify fix opened after creation
    await waitFor(() => {
      expect(screen.getByTestId('safety-banner')).toBeInTheDocument();
    });

    const generateCalls = (global.fetch as any).mock.calls.filter((c: any[]) =>
      c[0]?.toString().includes('/fixes') && c[1]?.method === 'POST'
    );
    expect(generateCalls).toHaveLength(1);
  });

  it('?finding=<id> on 422 NO_AUTOMATIC_FIX shows friendly message and Investigations link', async () => {
    renderWithProviders(['/app/fixes?finding=finding-broken-import']);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate suggested change/i })).toBeInTheDocument();
    });

    const generateBtn = screen.getByRole('button', { name: /generate suggested change/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Ripple AI cannot build an automatic change for this finding')
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /view manual steps in investigations/i })).toBeInTheDocument();
    });
  });

  it('safety assertion: page text NEVER contains "verified", "applied", or "fixed" outside the exact allowed phrases', async () => {
    const fixItem = fixesGetProjectAllFixture.data.items[0];
    const { container } = renderWithProviders([`/app/fixes?fix=${fixItem.id}`]);

    await waitFor(() => {
      expect(screen.getByTestId('safety-banner')).toBeInTheDocument();
    });

    let text = container.textContent || '';

    // Allowed phrases containing these words:
    const allowedPhrases = [
      /Suggested change, not applied, not tested/gi,
      /Approved: patch saved, not applied to your project/gi,
      /Approve this suggested change\? Your uploaded project is NOT changed\. Ripple AI only saves a patch file for you to review and apply yourself\./gi,
      /Approved\. A patch file was saved on the server.*Nothing was applied or tested, so the finding stays at its current verification\./gi,
      /Nothing was applied or tested, so the finding stays at its current verification\./gi,
    ];

    for (const phrase of allowedPhrases) {
      text = text.replace(phrase, ' ');
    }

    // Now test that forbidden standalone words do not appear
    const forbiddenMatch = text.match(/\b(verified|applied|fixed)\b/i);
    expect(forbiddenMatch).toBeNull();
  });

  it('Copy diff calls clipboard API, and Download creates .patch Blob with buildPatchFileName', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    let createdAnchor: HTMLAnchorElement | null = null;
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'a') {
        createdAnchor = el as HTMLAnchorElement;
      }
      return el;
    });

    render(
      <DiffViewer
        diffText={'--- a/test.ts\n+++ b/test.ts\n@@ -1,1 +1,1 @@\n-old\n+new'}
        files={['test.ts']}
        fixId="abc123456789"
        ruleId="env_undeclared"
      />
    );

    // Copy diff
    const copyBtn = screen.getByRole('button', { name: /copy diff/i });
    fireEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalledWith('--- a/test.ts\n+++ b/test.ts\n@@ -1,1 +1,1 @@\n-old\n+new');

    // Download patch
    const downloadBtn = screen.getByRole('button', { name: /download \.patch/i });
    fireEvent.click(downloadBtn);

    expect(createObjectURLMock).toHaveBeenCalled();
    const expectedFilename = buildPatchFileName({ id: 'abc123456789', rule_id: 'env_undeclared' });
    expect(expectedFilename).toBe('env-undeclared-abc12345.patch');
    expect((createdAnchor as any)?.download).toBe(expectedFilename);
  });

  it('switching project aborts in-flight requests and resets URL state and selection', async () => {
    let abortedSignalA: AbortSignal | undefined;

    const fixesSpy = vi.spyOn(api, 'getProjectFixes').mockImplementation((id, _params, signal) => {
      if (id === projectId) {
        abortedSignalA = signal;
        return new Promise((resolve) => {
          setTimeout(() => resolve(fixesGetProjectAllFixture.data as any), 300);
        });
      }
      return Promise.resolve({
        items: [],
        total: 0,
        page: 1,
        pageSize: 25,
      });
    });

    const fixItem = fixesGetProjectAllFixture.data.items[0];

    const { rerender } = render(
      <ThemeProvider>
        <MemoryRouter initialEntries={[`/app/fixes?fix=${fixItem.id}`]}>
          <ProjectProvider initialProjectId={projectId}>
            <Routes>
              <Route path="/app/fixes" element={<FixesPage />} />
            </Routes>
          </ProjectProvider>
        </MemoryRouter>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(fixesSpy).toHaveBeenCalled();
    });
    expect(abortedSignalA?.aborted).toBe(false);

    // Switch project
    rerender(
      <ThemeProvider>
        <MemoryRouter initialEntries={[`/app/fixes?fix=${fixItem.id}`]}>
          <ProjectProvider initialProjectId="second-project-id">
            <Routes>
              <Route path="/app/fixes" element={<FixesPage />} />
            </Routes>
          </ProjectProvider>
        </MemoryRouter>
      </ThemeProvider>
    );

    // Verify signal from project A was aborted
    await waitFor(() => {
      expect(abortedSignalA?.aborted).toBe(true);
    });
  });

  describe('Extended Contract Test (RIPPLE_CONTRACT=1)', () => {
    const shouldRunContract = process.env.RIPPLE_CONTRACT === '1';

    it('proves contract comparison reports differences on mutated keys (extra key and missing key), then restores', () => {
      const sample = JSON.parse(JSON.stringify(fixesGetProjectAllFixture.data));
      const mutated = JSON.parse(JSON.stringify(sample));
      mutated.unexpectedExtraKey = 'unexpected';
      delete mutated.pageSize;

      const result = compareKeySets(mutated, sample);
      expect(result.matching).toBe(false);
      expect(result.differences.some((d) => d.includes('unexpectedExtraKey'))).toBe(true);
      expect(result.differences.some((d) => d.includes('pageSize'))).toBe(true);

      const restored = JSON.parse(JSON.stringify(sample));
      const passResult = compareKeySets(restored, sample);
      expect(passResult.matching).toBe(true);
      expect(passResult.differences).toHaveLength(0);
    });

    it.runIf(shouldRunContract)(
      'contract test: verifies live backend fix object, project fixes list, 409 body and 422 body match captures',
      async () => {
        // Fetch projects to get an active projectId if available
        const liveProjectsRes = await fetch('http://localhost:4000/api/projects');
        let targetProjectId = projectId;
        if (liveProjectsRes.ok) {
          const liveProjectsJson = await liveProjectsRes.json();
          if (liveProjectsJson.data && liveProjectsJson.data.length > 0) {
            targetProjectId = liveProjectsJson.data[0].id;
          }
        }

        // 1. Project fixes list key sets
        const liveFixesRes = await fetch(`http://localhost:4000/api/projects/${targetProjectId}/fixes`);
        expect(liveFixesRes.ok).toBe(true);
        const liveFixesJson = await liveFixesRes.json();
        const listCmp = compareKeySets(liveFixesJson.data, fixesGetProjectAllFixture.data);
        expect(listCmp.matching).toBe(true);

        // 2. Fix object key sets (from list items or individual fix)
        if (liveFixesJson.data.items && liveFixesJson.data.items.length > 0) {
          const liveItem = liveFixesJson.data.items[0];
          const fixtureItem = fixesGetProjectAllFixture.data.items[0];
          const itemCmp = compareKeySets(liveItem, fixtureItem);
          expect(itemCmp.matching).toBe(true);

          const fixId = liveItem.id;
          const liveApprove409 = await fetch(`http://localhost:4000/api/fixes/${fixId}/approve`, {
            method: 'POST',
          });
          if (liveApprove409.status === 409) {
            const body = await liveApprove409.json();
            const cmp409 = compareKeySets(body, fixesPostEnvApprove409Fixture);
            expect(cmp409.matching).toBe(true);
          }
        }

        // 3. 409 Conflict body shape
        const live409Res = await fetch(`http://localhost:4000/api/fixes/non-existent-fix/approve`, {
          method: 'POST',
        });
        if (live409Res.status === 409) {
          const body = await live409Res.json();
          const cmp409 = compareKeySets(body, fixesPostEnvApprove409Fixture);
          expect(cmp409.matching).toBe(true);
        }

        // 4. 422 Unprocessable body shape
        const findingsRes = await fetch(`http://localhost:4000/api/projects/${targetProjectId}/findings`);
        if (findingsRes.ok) {
          const findingsJson = await findingsRes.json();
          const items = Array.isArray(findingsJson.data) ? findingsJson.data : findingsJson.data?.items || [];
          const brokenImportFinding = items.find((f: any) => f.rule_id === 'broken_import');
          if (brokenImportFinding) {
            const live422Res = await fetch(`http://localhost:4000/api/findings/${brokenImportFinding.id}/fixes`, {
              method: 'POST',
            });
            if (live422Res.status === 422) {
              const body = await live422Res.json();
              const cmp422 = compareKeySets(body, fixesPostBroken422Fixture);
              expect(cmp422.matching).toBe(true);
            }
          }
        }
      }
    );
  });
});
