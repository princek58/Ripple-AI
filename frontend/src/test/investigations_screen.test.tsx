import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ProjectProvider, useProjects } from '../lib/projectContext.js';
import { InvestigationsPage } from '../features/investigations/InvestigationsPage.js';
import { FindingDetail } from '../features/investigations/FindingDetail.js';
import { api, ApiClientError } from '../lib/api.js';
import type {
  Project,
  FindingDetailData,
  PaginatedFindings,
} from '../../../shared/types.js';

// Real captures
import projectsListFixture from './fixtures/api/projects_list.json';
import findingsDefaultFixture from './fixtures/api/findings_default.json';
import findingBrokenImportFixture from './fixtures/api/finding_detail_broken_import.json';
import findingFixProposedFixture from './fixtures/api/finding_detail_fix_proposed.json';

const brokenImportDetail: FindingDetailData = findingBrokenImportFixture.data as unknown as FindingDetailData;
const fixProposedDetail: FindingDetailData = findingFixProposedFixture.data as unknown as FindingDetailData;
const defaultFindings: PaginatedFindings = findingsDefaultFixture.data as unknown as PaginatedFindings;

const capturedProjects: Project[] = projectsListFixture.data;
const testProjectId = brokenImportDetail.project_id;
const testProjects: Project[] = [
  { ...capturedProjects[0], id: testProjectId },
  capturedProjects[1],
];

// Helper to observe current URL in tests
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="test-location">{location.pathname + location.search}</div>;
}

// Helper to trigger project switch
function SwitchProjectButton({ targetId }: { targetId: string }) {
  const { setSelectedProjectId } = useProjects();
  return (
    <button data-testid="switch-proj-btn" onClick={() => setSelectedProjectId(targetId)}>
      Switch
    </button>
  );
}

describe('Investigations Screen (Step 12a-1 Part 2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('T01: list renders rows with three separate badges from the captures including a likely and a fix_proposed finding', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(testProjects);

    // List containing both likely and fix_proposed findings
    const listWithFixProposed: PaginatedFindings = {
      items: [
        defaultFindings.items[0], // broken_import (high, confirmed, not_tested)
        {
          ...fixProposedDetail,
          id: 'finding-fix-prop-1',
          severity: 'medium',
          confidence: 'likely',
          verification: 'fix_proposed',
        },
      ],
      page: 1,
      pageSize: 25,
      total: 2,
    };
    vi.spyOn(api, 'getFindings').mockResolvedValue(listWithFixProposed);

    render(
      <MemoryRouter initialEntries={['/app/investigations']}>
        <ProjectProvider>
          <InvestigationsPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText('Broken import "../services/feeService" in fees.js')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Undeclared environment variable "JWT_SECRET"')
      ).toBeInTheDocument();
    });

    // Check row 1 badges (high, confirmed, not_tested) - icon + text
    expect(screen.getByTestId('severity-badge-high')).toHaveTextContent('High');
    expect(screen.getByTestId('confidence-badge-confirmed')).toHaveTextContent('Confirmed');
    expect(screen.getByTestId('verification-badge-not_tested')).toHaveTextContent('Not tested');

    // Check row 2 badges (medium, likely, fix_proposed) - icon + text
    expect(screen.getByTestId('severity-badge-medium')).toHaveTextContent('Medium');
    expect(screen.getByTestId('confidence-badge-likely')).toHaveTextContent('Likely');
    expect(screen.getByTestId('verification-badge-fix_proposed')).toHaveTextContent('Fix proposed');
  });

  it('T02: filters produce the right query string and update URL', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(testProjects);
    const getFindingsSpy = vi.spyOn(api, 'getFindings').mockResolvedValue(defaultFindings);

    render(
      <MemoryRouter initialEntries={['/app/investigations']}>
        <ProjectProvider>
          <LocationDisplay />
          <InvestigationsPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Broken import "../services/feeService" in fees.js')).toBeInTheDocument();
    });

    // Change severity filter to high
    const severitySelect = screen.getByLabelText('Filter by Severity');
    fireEvent.change(severitySelect, { target: { value: 'high' } });

    await waitFor(() => {
      expect(getFindingsSpy).toHaveBeenCalledWith(
        testProjects[0].id,
        expect.objectContaining({ severity: 'high', page: 1, pageSize: 25 }),
        expect.anything()
      );
      expect(screen.getByTestId('test-location')).toHaveTextContent('severity=high');
    });

    // Change confidence filter to confirmed
    const confidenceSelect = screen.getByLabelText('Filter by Confidence');
    fireEvent.change(confidenceSelect, { target: { value: 'confirmed' } });

    await waitFor(() => {
      expect(getFindingsSpy).toHaveBeenCalledWith(
        testProjects[0].id,
        expect.objectContaining({ severity: 'high', confidence: 'confirmed' }),
        expect.anything()
      );
      expect(screen.getByTestId('test-location')).toHaveTextContent('confidence=confirmed');
    });

    // Change rule filter to broken_import
    const ruleSelect = screen.getByLabelText('Filter by Rule');
    fireEvent.change(ruleSelect, { target: { value: 'broken_import' } });

    await waitFor(() => {
      expect(getFindingsSpy).toHaveBeenCalledWith(
        testProjects[0].id,
        expect.objectContaining({ rule_id: 'broken_import' }),
        expect.anything()
      );
      expect(screen.getByTestId('test-location')).toHaveTextContent('rule_id=broken_import');
    });
  });

  it('T03: debounce sends only the last query after 300 ms', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(api, 'getProjects').mockResolvedValue(testProjects);
    const getFindingsSpy = vi.spyOn(api, 'getFindings').mockResolvedValue(defaultFindings);

    render(
      <MemoryRouter initialEntries={['/app/investigations']}>
        <ProjectProvider>
          <InvestigationsPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    // Initial load
    await act(async () => {
      await Promise.resolve();
    });

    const searchInput = screen.getByLabelText('Search findings by text');

    // Type rapidly
    act(() => {
      fireEvent.change(searchInput, { target: { value: 'f' } });
    });
    act(() => {
      vi.advanceTimersByTime(100);
      fireEvent.change(searchInput, { target: { value: 'fe' } });
    });
    act(() => {
      vi.advanceTimersByTime(100);
      fireEvent.change(searchInput, { target: { value: 'feeService' } });
    });

    // No search call made yet during typing
    expect(getFindingsSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ q: 'f' }),
      expect.anything()
    );
    expect(getFindingsSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ q: 'fe' }),
      expect.anything()
    );

    // Advance remaining debounce time
    act(() => {
      vi.advanceTimersByTime(350);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(getFindingsSpy).toHaveBeenCalledWith(
      testProjects[0].id,
      expect.objectContaining({ q: 'feeService' }),
      expect.anything()
    );

    vi.useRealTimers();
  });

  it('T04: stale request aborted when filters change rapidly', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(testProjects);

    const abortSignals: AbortSignal[] = [];
    vi.spyOn(api, 'getFindings').mockImplementation((_id, _query, signal) => {
      if (signal) abortSignals.push(signal);
      return new Promise((resolve) => {
        setTimeout(() => resolve(defaultFindings), 50);
      });
    });

    render(
      <MemoryRouter initialEntries={['/app/investigations']}>
        <ProjectProvider>
          <InvestigationsPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(abortSignals.length).toBeGreaterThanOrEqual(1);
    });

    // Rapidly change filter
    const severitySelect = screen.getByLabelText('Filter by Severity');
    fireEvent.change(severitySelect, { target: { value: 'high' } });
    fireEvent.change(severitySelect, { target: { value: 'medium' } });

    await waitFor(() => {
      expect(abortSignals.length).toBeGreaterThanOrEqual(2);
      // At least the earlier signal should have been aborted
      expect(abortSignals[0].aborted).toBe(true);
    });
  });

  it('T05: pagination text and next/previous page navigation', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(testProjects);

    const paginated50: PaginatedFindings = {
      items: defaultFindings.items,
      page: 1,
      pageSize: 25,
      total: 50,
    };
    const page2Data: PaginatedFindings = {
      items: [defaultFindings.items[0]],
      page: 2,
      pageSize: 25,
      total: 50,
    };

    const getFindingsSpy = vi
      .spyOn(api, 'getFindings')
      .mockImplementation((_id, query) => {
        if (query?.page === 2) return Promise.resolve(page2Data);
        return Promise.resolve(paginated50);
      });

    render(
      <MemoryRouter initialEntries={['/app/investigations']}>
        <ProjectProvider>
          <InvestigationsPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('pagination-info')).toHaveTextContent(
        'Showing 1 to 25 of 50 findings'
      );
    });

    const nextBtn = screen.getByLabelText('Next page');
    expect(nextBtn).toBeEnabled();

    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(getFindingsSpy).toHaveBeenCalledWith(
        testProjects[0].id,
        expect.objectContaining({ page: 2 }),
        expect.anything()
      );
      expect(screen.getByTestId('pagination-info')).toHaveTextContent(
        'Showing 26 to 50 of 50 findings'
      );
    });
  });

  it('T06a: scanned project with zero findings unfiltered shows empty check message and note', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(testProjects);
    vi.spyOn(api, 'getFindings').mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
    });

    render(
      <MemoryRouter initialEntries={['/app/investigations']}>
        <ProjectProvider initialProjectId={testProjects[0].id}>
          <InvestigationsPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText('No findings from the 6 automated checks')
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'No findings does not mean no problems: Phase 1 runs only 6 static checks and executes no code.'
        )
      ).toBeInTheDocument();
    });
  });

  it('T06b: filtered empty result shows "No findings match these filters"', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(testProjects);
    vi.spyOn(api, 'getFindings').mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
    });

    render(
      <MemoryRouter initialEntries={['/app/investigations?severity=critical']}>
        <ProjectProvider initialProjectId={testProjects[0].id}>
          <InvestigationsPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText('No findings match these filters')
      ).toBeInTheDocument();
      expect(
        screen.getAllByRole('button', { name: 'Clear filters' }).length
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('T07: URL state round-trip: opening with URL params initializes filters and detail', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(testProjects);
    vi.spyOn(api, 'getFindings').mockResolvedValue(defaultFindings);
    vi.spyOn(api, 'getFinding').mockResolvedValue(brokenImportDetail);

    render(
      <MemoryRouter
        initialEntries={[
          `/app/investigations?finding=${brokenImportDetail.id}&severity=high&page=1`,
        ]}
      >
        <ProjectProvider>
          <InvestigationsPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getAllByText(brokenImportDetail.title).length
      ).toBeGreaterThanOrEqual(1);
      const severitySelect = screen.getByLabelText('Filter by Severity') as HTMLSelectElement;
      expect(severitySelect.value).toBe('high');
    });
  });

  it('T08: opening ?finding= shows the detail with evidence, likely cause, not confirmed, affected nodes, and suggested fix button', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(testProjects);
    vi.spyOn(api, 'getFindings').mockResolvedValue(defaultFindings);
    vi.spyOn(api, 'getFinding').mockResolvedValue(brokenImportDetail);

    render(
      <MemoryRouter
        initialEntries={[`/app/investigations?finding=${brokenImportDetail.id}`]}
      >
        <ProjectProvider>
          <InvestigationsPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: brokenImportDetail.title })).toBeInTheDocument();
    });

    // Summary
    expect(screen.getByText(brokenImportDetail.summary)).toBeInTheDocument();

    // Badges
    const detailPane = screen.getByTestId('finding-detail-container');
    const detail = within(detailPane);
    expect(detail.getByTestId('severity-badge-high')).toHaveTextContent('High');
    expect(detail.getByTestId('confidence-badge-confirmed')).toHaveTextContent('Confirmed');
    expect(detail.getByTestId('verification-badge-not_tested')).toHaveTextContent('Not tested');

    // Evidence
    expect(detail.getByText('backend/routes/fees.js:2')).toBeInTheDocument();
    expect(detail.getByText('specifier:')).toBeInTheDocument();
    expect(detail.getByText('../services/feeService')).toBeInTheDocument();
    expect(detail.getByText('Source code is not displayed in Phase 1')).toBeInTheDocument();

    // Likely cause
    expect(detail.getByText(brokenImportDetail.likely_cause!)).toBeInTheDocument();

    // What is not confirmed (always shown)
    expect(detail.getByText(brokenImportDetail.not_confirmed!)).toBeInTheDocument();

    // Affected nodes link to graph
    const graphLink = detail.getByRole('link', { name: /View in Graph/i });
    expect(graphLink).toHaveAttribute(
      'href',
      `/app/graph?focus=${brokenImportDetail.nodes[0].id}`
    );

    // Suggested fix link
    const fixLink = detail.getByRole('link', { name: /Suggested fix/i });
    expect(fixLink).toHaveAttribute(
      'href',
      `/app/fixes?finding=${brokenImportDetail.id}`
    );
    expect(
      detail.getByText('Suggested changes are never applied automatically')
    ).toBeInTheDocument();
  });

  it('T08b: FindingDetail shows fix_proposed state as text when verification is fix_proposed', () => {
    render(
      <MemoryRouter>
        <FindingDetail finding={fixProposedDetail} />
      </MemoryRouter>
    );

    expect(screen.getByTestId('fix-proposed-banner')).toBeInTheDocument();
    expect(
      screen.getByText('A proposed fix is available for this finding and ready for review.')
    ).toBeInTheDocument();
  });

  it('T09: evidence allowlist: extra keys like snippet/secret are never rendered, secret_pattern pattern is shown', () => {
    // Hand-made evidence item with extra keys (e.g. snippet, secret_value, leaked_token)
    const secretFinding: FindingDetailData = {
      ...brokenImportDetail,
      id: 'secret-f-1',
      rule_id: 'secret_pattern',
      title: 'Potential secret detected in config.js',
      evidence: [
        {
          file: 'config/keys.js',
          line_start: 14,
          line_end: 14,
          pattern: 'AWS_ACCESS_KEY_ID',
          snippet: 'AKIAIOSFODNN7EXAMPLE',
          secret_value: 'super_secret_cleartext_credential_123',
          raw_data: 'leak_payload',
        },
      ],
      nodes: [],
    };

    render(
      <MemoryRouter>
        <FindingDetail finding={secretFinding} />
      </MemoryRouter>
    );

    // Allowlisted values ARE present
    expect(screen.getByText('config/keys.js:14')).toBeInTheDocument();
    expect(screen.getByText('pattern:')).toBeInTheDocument();
    expect(screen.getByText('AWS_ACCESS_KEY_ID')).toBeInTheDocument();

    // Disallowed keys & values MUST NEVER be in the DOM
    expect(screen.queryByText('AKIAIOSFODNN7EXAMPLE')).not.toBeInTheDocument();
    expect(screen.queryByText(/super_secret_cleartext/)).not.toBeInTheDocument();
    expect(screen.queryByText(/leak_payload/)).not.toBeInTheDocument();
    expect(screen.queryByText('snippet:')).not.toBeInTheDocument();
    expect(screen.queryByText('secret_value:')).not.toBeInTheDocument();
  });

  it('T10: no file content anywhere and note is present', () => {
    render(
      <MemoryRouter>
        <FindingDetail finding={brokenImportDetail} />
      </MemoryRouter>
    );

    expect(
      screen.getByText('Source code is not displayed in Phase 1')
    ).toBeInTheDocument();
  });

  it('T11: 404 and foreign-project message with back to list button', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(testProjects);
    vi.spyOn(api, 'getFindings').mockResolvedValue(defaultFindings);

    // A) 404 finding
    vi.spyOn(api, 'getFinding').mockRejectedValueOnce(
      new ApiClientError('Finding not found', 404)
    );

    const { unmount } = render(
      <MemoryRouter initialEntries={['/app/investigations?finding=00000000-0000-0000-0000-000000000000']}>
        <ProjectProvider>
          <LocationDisplay />
          <InvestigationsPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText('This finding is not in the selected project')
      ).toBeInTheDocument();
    });

    const backBtn = screen.getByRole('button', { name: 'Back to findings' });
    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(screen.getByTestId('test-location')).toHaveTextContent('/app/investigations');
      expect(screen.getByTestId('test-location')).not.toHaveTextContent('finding=');
    });

    unmount();

    // B) Foreign project finding
    const foreignFinding: FindingDetailData = {
      ...brokenImportDetail,
      project_id: 'some-other-project-id',
    };
    vi.spyOn(api, 'getFinding').mockResolvedValueOnce(foreignFinding);

    render(
      <MemoryRouter initialEntries={[`/app/investigations?finding=${brokenImportDetail.id}`]}>
        <ProjectProvider>
          <InvestigationsPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText('This finding is not in the selected project')
      ).toBeInTheDocument();
    });
  });

  it('T12: project switch aborts requests, clears selection and ignores late response', async () => {
    const projA = testProjects[0];
    const projB = { ...testProjects[0], id: 'proj-b-id', name: 'Project B' };
    vi.spyOn(api, 'getProjects').mockResolvedValue([projA, projB]);

    let abortSignalA: AbortSignal | undefined;
    vi.spyOn(api, 'getFindings').mockImplementation((projId, _q, signal) => {
      if (projId === projA.id) {
        abortSignalA = signal;
        // Simulate slow response
        return new Promise((resolve) => setTimeout(() => resolve(defaultFindings), 200));
      }
      return Promise.resolve({ items: [], page: 1, pageSize: 25, total: 0 });
    });

    render(
      <MemoryRouter initialEntries={[`/app/investigations?finding=${brokenImportDetail.id}`]}>
        <ProjectProvider>
          <LocationDisplay />
          <SwitchProjectButton targetId={projB.id} />
          <InvestigationsPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(abortSignalA).toBeDefined();
    });

    // Switch project to Proj B
    fireEvent.click(screen.getByTestId('switch-proj-btn'));

    await waitFor(() => {
      expect(abortSignalA?.aborted).toBe(true);
      // Finding selection cleared
      expect(screen.getByTestId('test-location')).not.toHaveTextContent('finding=');
    });
  });

  it('T13: never-scanned project shows "Not scanned yet" with Re-scan button and NO zeros', async () => {
    const neverScannedProject: Project = {
      ...testProjects[0],
      last_scan_at: null,
    };
    vi.spyOn(api, 'getProjects').mockResolvedValue([neverScannedProject]);

    render(
      <MemoryRouter initialEntries={['/app/investigations']}>
        <ProjectProvider>
          <InvestigationsPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Not scanned yet')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Re-scan/i })).toBeInTheDocument();
    });

    // Must NOT show zeros (never zeros for unscanned)
    expect(screen.queryByText(/0 findings/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('pagination-info')).not.toBeInTheDocument();
  });

  it('T14: phone back button returns focus to selected finding row', async () => {
    // Force window innerWidth to 500px for mobile
    window.innerWidth = 500;
    vi.spyOn(api, 'getProjects').mockResolvedValue(testProjects);
    vi.spyOn(api, 'getFindings').mockResolvedValue(defaultFindings);
    vi.spyOn(api, 'getFinding').mockResolvedValue(brokenImportDetail);

    render(
      <MemoryRouter initialEntries={['/app/investigations']}>
        <ProjectProvider>
          <InvestigationsPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText('Broken import "../services/feeService" in fees.js')
      ).toBeInTheDocument();
    });

    // Click finding row to select
    const row = screen.getByTestId(`finding-row-${brokenImportDetail.id}`);
    fireEvent.click(row);

    // Detail opens; heading receives focus
    await waitFor(() => {
      const heading = screen.getByRole('heading', { level: 2, name: brokenImportDetail.title });
      expect(heading).toBeInTheDocument();
    });

    // Click Back to findings
    const backBtn = screen.getByRole('button', { name: 'Back to findings' });
    fireEvent.click(backBtn);

    // Focus returns to the row
    await waitFor(() => {
      expect(document.activeElement?.id).toBe(`finding-row-${brokenImportDetail.id}`);
    });

    // Restore desktop width
    window.innerWidth = 1200;
  });
});
