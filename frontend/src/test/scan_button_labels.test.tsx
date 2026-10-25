import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectProvider } from '../lib/projectContext.js';
import { ProjectCard } from '../features/projects/ProjectCard.js';
import { OverviewPage } from '../features/overview/OverviewPage.js';
import { GraphPage } from '../features/graph/GraphPage.js';
import { InvestigationsPage } from '../features/investigations/InvestigationsPage.js';
import { FixesPage } from '../features/fixes/FixesPage.js';
import { TestsPage } from '../features/tests/TestsPage.js';
import { ReportsPage } from '../features/reports/ReportsPage.js';
import { api } from '../lib/api.js';
import type { Project, ProjectSummary } from '../../../shared/types.js';

const unscannedProject: Project = {
  id: 'proj-unscanned-1',
  name: 'Unscanned Project',
  created_at: '2026-10-25T10:00:00Z',
  size_bytes: 4096,
  file_count: 10,
  languages: ['TypeScript'],
  last_scan_at: null,
};

const scannedProject: Project = {
  id: 'proj-scanned-1',
  name: 'Scanned Project',
  created_at: '2026-10-25T08:00:00Z',
  size_bytes: 8192,
  file_count: 20,
  languages: ['TypeScript'],
  last_scan_at: '2026-10-25T09:30:00Z',
};

const unscannedSummary: ProjectSummary = {
  lastScan: null,
  counts: { nodes: 0, edges: 0, unresolvedEdges: 0, files: 10 },
  kpi: {
    openFindings: 0,
    criticalPlusHigh: 0,
    fixesPendingApproval: 0,
    verifiedFixes: 0,
  },
  bySeverity: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
  byVerification: { not_tested: 0, reproduced: 0, fix_proposed: 0, fix_verified: 0 },
  byConfidence: { confirmed: 0, likely: 0, hypothesis: 0 },
  affectedModules: [],
};

const scannedSummary: ProjectSummary = {
  lastScan: {
    finished_at: '2026-10-25T09:30:00Z',
    status: 'completed',
  },
  counts: { nodes: 20, edges: 25, unresolvedEdges: 1, files: 20 },
  kpi: {
    openFindings: 3,
    criticalPlusHigh: 1,
    fixesPendingApproval: 0,
    verifiedFixes: 0,
  },
  bySeverity: { critical: 0, high: 1, medium: 2, low: 0, unknown: 0 },
  byVerification: { not_tested: 3, reproduced: 0, fix_proposed: 0, fix_verified: 0 },
  byConfidence: { confirmed: 2, likely: 1, hypothesis: 0 },
  affectedModules: [],
};

describe('Scan button label per state (Step 14 Part 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ProjectCard per scan state', () => {
    it('shows "Scan now" when project is never-scanned', () => {
      render(
        <ProjectCard
          project={unscannedProject}
          summaryState={{ data: unscannedSummary, loading: false, error: false }}
          onOpen={vi.fn()}
          onRescan={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      const btn = screen.getByTestId(`rescan-button-${unscannedProject.id}`);
      expect(btn).toHaveTextContent('Scan now');
      expect(btn).toHaveAttribute('aria-label', `Scan ${unscannedProject.name} now`);
    });

    it('shows "Re-scan" when project already has a scan', () => {
      render(
        <ProjectCard
          project={scannedProject}
          summaryState={{ data: scannedSummary, loading: false, error: false }}
          onOpen={vi.fn()}
          onRescan={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      const btn = screen.getByTestId(`rescan-button-${scannedProject.id}`);
      expect(btn).toHaveTextContent('Re-scan');
      expect(btn).toHaveAttribute('aria-label', `Re-scan ${scannedProject.name}`);
    });
  });

  describe('Overview screen call-to-action vs header re-scan', () => {
    it('shows "Scan now" on the Overview CTA card for never-scanned project', async () => {
      localStorage.setItem('ripple_selected_project_id', unscannedProject.id);
      vi.spyOn(api, 'getProjects').mockResolvedValue([unscannedProject]);
      vi.spyOn(api, 'getSummary').mockResolvedValue(unscannedSummary);
      vi.spyOn(api, 'getGraph').mockResolvedValue({
        nodes: [],
        edges: [],
        clusters: [],
        shown: 0,
        total: 0,
        level: 1,
        focus: null,
      });

      render(
        <MemoryRouter initialEntries={['/app/overview']}>
          <ProjectProvider>
            <OverviewPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('never-scanned-card')).toBeInTheDocument();
      });

      const ctaBtn = screen.getByTestId('never-scanned-rescan-button');
      expect(ctaBtn).toHaveTextContent('Scan now');
    });

    it('shows "Re-scan" in the Overview header for already-scanned project', async () => {
      localStorage.setItem('ripple_selected_project_id', scannedProject.id);
      vi.spyOn(api, 'getProjects').mockResolvedValue([scannedProject]);
      vi.spyOn(api, 'getSummary').mockResolvedValue(scannedSummary);
      vi.spyOn(api, 'getGraph').mockResolvedValue({
        nodes: [],
        edges: [],
        clusters: [],
        shown: 0,
        total: 0,
        level: 1,
        focus: null,
      });

      render(
        <MemoryRouter initialEntries={['/app/overview']}>
          <ProjectProvider>
            <OverviewPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('rescan-overview-button')).toBeInTheDocument();
      });

      const headerBtn = screen.getByTestId('rescan-overview-button');
      expect(headerBtn).toHaveTextContent('Re-scan');
    });
  });

  describe('Screens never-scanned states show "Scan now"', () => {
    it('GraphPage shows "Scan now" in never-scanned state', async () => {
      localStorage.setItem('ripple_selected_project_id', unscannedProject.id);
      vi.spyOn(api, 'getProjects').mockResolvedValue([unscannedProject]);
      vi.spyOn(api, 'getSummary').mockResolvedValue(unscannedSummary);
      vi.spyOn(api, 'getGraph').mockResolvedValue({
        nodes: [],
        edges: [],
        clusters: [],
        shown: 0,
        total: 0,
        level: 1,
        focus: null,
      });

      render(
        <MemoryRouter initialEntries={['/app/graph']}>
          <ProjectProvider>
            <GraphPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('never-scanned-graph-state')).toBeInTheDocument();
      });

      expect(screen.getByTestId('rescan-graph-btn')).toHaveTextContent('Scan now');
    });

    it('InvestigationsPage shows "Scan now" in never-scanned state', async () => {
      localStorage.setItem('ripple_selected_project_id', unscannedProject.id);
      vi.spyOn(api, 'getProjects').mockResolvedValue([unscannedProject]);
      vi.spyOn(api, 'getSummary').mockResolvedValue(unscannedSummary);

      render(
        <MemoryRouter initialEntries={['/app/investigations']}>
          <ProjectProvider>
            <InvestigationsPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('never-scanned-state')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /Scan now/i })).toBeInTheDocument();
    });

    it('FixesPage shows "Scan now" in never-scanned state', async () => {
      localStorage.setItem('ripple_selected_project_id', unscannedProject.id);
      vi.spyOn(api, 'getProjects').mockResolvedValue([unscannedProject]);
      vi.spyOn(api, 'getSummary').mockResolvedValue(unscannedSummary);

      render(
        <MemoryRouter initialEntries={['/app/fixes']}>
          <ProjectProvider>
            <FixesPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Not scanned yet')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /Scan now/i })).toBeInTheDocument();
    });

    it('TestsPage shows "Scan now" in never-scanned state', async () => {
      localStorage.setItem('ripple_selected_project_id', unscannedProject.id);
      vi.spyOn(api, 'getProjects').mockResolvedValue([unscannedProject]);
      vi.spyOn(api, 'getSummary').mockResolvedValue(unscannedSummary);

      render(
        <MemoryRouter initialEntries={['/app/tests']}>
          <ProjectProvider>
            <TestsPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('tests-never-scanned')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /Scan now/i })).toBeInTheDocument();
    });

    it('ReportsPage shows "Scan now" in never-scanned state', async () => {
      localStorage.setItem('ripple_selected_project_id', unscannedProject.id);
      vi.spyOn(api, 'getProjects').mockResolvedValue([unscannedProject]);
      vi.spyOn(api, 'getSummary').mockResolvedValue(unscannedSummary);

      render(
        <MemoryRouter initialEntries={['/app/reports']}>
          <ProjectProvider>
            <ReportsPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('reports-never-scanned')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /Scan now/i })).toBeInTheDocument();
    });
  });
});
