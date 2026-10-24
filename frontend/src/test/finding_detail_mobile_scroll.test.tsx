import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FindingDetail } from '../features/investigations/FindingDetail.js';
import InvestigationsPage from '../features/investigations/InvestigationsPage.js';
import { ProjectProvider } from '../lib/projectContext.js';
import { ThemeProvider } from '../lib/theme.js';
import { api } from '../lib/api.js';
import type { FindingDetailData, Project } from '../../../shared/types.js';

describe('FindingDetail Mobile Clipping & Scroll Fix (Step 13b-1 Fix 3)', () => {
  const mockFinding: FindingDetailData = {
    id: 'f-1',
    project_id: 'p-1',
    scan_id: 's-1',
    rule_id: 'broken_import',
    title: 'Broken relative import in noticeService',
    summary: 'The import ./nonexistent does not resolve to an existing file.',
    severity: 'high',
    confidence: 'confirmed',
    verification: 'reproduced',
    likely_cause: 'File was moved during recent refactor without updating relative import paths.',
    not_confirmed: 'Whether noticeService is invoked in the active production build.',
    created_at: '2026-10-24T18:00:00.000Z',
    evidence: [{ file: 'services/noticeService.ts', line_start: 12, line_end: 14 }],
    node_ids: ['n-1'],
    nodes: [{ id: 'n-1', label: 'noticeService', type: 'backend', path: 'services/noticeService.ts' }],
  };

  const mockProject: Project = {
    id: 'p-1',
    name: 'demo-erp-sample',
    created_at: '2026-10-24T18:00:00.000Z',
    size_bytes: 4600,
    file_count: 12,
    languages: ['JavaScript', 'TypeScript'],
    last_scan_at: '2026-10-24T18:00:00.000Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('FindingDetail article container avoids unconditional h-full and overflow-y-auto, using lg: scoped classes', () => {
    render(
      <MemoryRouter>
        <FindingDetail finding={mockFinding} showBackButton={true} />
      </MemoryRouter>
    );

    const articleEl = screen.getByTestId('finding-detail-container');
    expect(articleEl).toBeInTheDocument();

    // Must have responsive min-h-0 and lg: scoped overflow/height so mobile expands naturally
    expect(articleEl.className).toContain('min-h-0');
    expect(articleEl.className).toContain('lg:h-full');
    expect(articleEl.className).toContain('lg:overflow-y-auto');

    // Must NOT have unconditional rigid h-full or overflow-y-auto that traps mobile scrolling
    expect(articleEl.className).not.toMatch(/(^|\s)h-full(\s|$)/);
    expect(articleEl.className).not.toMatch(/(^|\s)overflow-y-auto(\s|$)/);

    // Must have bottom padding for comfortable scrolling past bottom cards
    expect(articleEl.className).toContain('pb-12');
  });

  it('InvestigationsPage outer wrapper has min-h-[calc(100vh-8rem)] and lg:h-[calc(100vh-8rem)] rather than unconditional fixed height', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue([mockProject]);
    vi.spyOn(api, 'getFindings').mockResolvedValue({
      items: [mockFinding],
      page: 1,
      pageSize: 25,
      total: 1,
    });
    vi.spyOn(api, 'getFinding').mockResolvedValue(mockFinding);

    const { container } = render(
      <MemoryRouter initialEntries={['/app/investigations?finding=f-1']}>
        <ThemeProvider>
          <ProjectProvider>
            <InvestigationsPage />
          </ProjectProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    const detailContainer = await screen.findByTestId('finding-detail-container');
    expect(detailContainer).toBeInTheDocument();

    const outerWrapper = container.firstElementChild as HTMLElement;
    expect(outerWrapper).toBeDefined();

    // Must have min-h and lg: scoped fixed height
    expect(outerWrapper.className).toContain('min-h-[calc(100vh-8rem)]');
    expect(outerWrapper.className).toContain('lg:h-[calc(100vh-8rem)]');
    expect(outerWrapper.className).not.toMatch(/(^|\s)h-\[calc\(100vh-8rem\)\](\s|$)/);

    // Finding detail section container must also use lg:h-full instead of rigid h-full
    const detailSection = screen.getByLabelText('Finding detail');
    expect(detailSection.className).toContain('min-h-0');
    expect(detailSection.className).toContain('lg:h-full');
    expect(detailSection.className).not.toMatch(/(^|\s)h-full(\s|$)/);
  });
});
