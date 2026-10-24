import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectCard } from '../features/projects/ProjectCard.js';
import { OverviewPage } from '../features/overview/OverviewPage.js';
import { GraphPage } from '../features/graph/GraphPage.js';
import { InvestigationsPage } from '../features/investigations/InvestigationsPage.js';
import { FixesPage } from '../features/fixes/FixesPage.js';
import { TestsPage } from '../features/tests/TestsPage.js';
import { ReportsPage } from '../features/reports/ReportsPage.js';
import { ProjectProvider, STORAGE_KEY } from '../lib/projectContext.js';
import { api } from '../lib/api.js';
import type { Project, ProjectSummary } from '../../../shared/types.js';

import unscannedProjectFixture from './fixtures/api/unscanned_project_get.json';
import unscannedSummaryFixture from './fixtures/api/never_scanned_summary.json';
import projectsListFixture from './fixtures/api/projects_list.json';
import scannedSummaryFixture from './fixtures/api/project_summary.json';

describe('Unified Never-Scanned State across All Screens', () => {
  const unscannedProject: Project = unscannedProjectFixture.data as Project;
  const unscannedSummary: ProjectSummary = unscannedSummaryFixture.data as ProjectSummary;
  const scannedProject: Project = projectsListFixture.data[0] as Project;
  const scannedSummary: ProjectSummary = scannedSummaryFixture.data as ProjectSummary;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Projects Card Screen
  describe('1. Projects Card Screen', () => {
    it('shows "Not scanned yet" in timestamp and findings summary with NO zero badges for unscanned project', () => {
      render(
        <ProjectCard
          project={unscannedProject}
          summaryState={{
            data: unscannedSummary,
            loading: false,
            error: false,
          }}
          onOpen={vi.fn()}
          onRescan={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      // Must show Not scanned yet
      expect(screen.getByText('Last scan: Not scanned yet')).toBeInTheDocument();
      expect(screen.getByTestId('summary-never-scanned')).toBeInTheDocument();

      // Must NOT show zero badges
      expect(screen.queryByTestId('summary-badges')).not.toBeInTheDocument();
      expect(screen.queryByText(/0 critical/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/0 high/i)).not.toBeInTheDocument();

      // Re-scan button must be present
      expect(
        screen.getByTestId(`rescan-button-${unscannedProject.id}`)
      ).toBeInTheDocument();
    });

    it('shows scan date and severity badges for scanned project', () => {
      render(
        <ProjectCard
          project={scannedProject}
          summaryState={{
            data: scannedSummary,
            loading: false,
            error: false,
          }}
          onOpen={vi.fn()}
          onRescan={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(screen.queryByText('Last scan: Not scanned yet')).not.toBeInTheDocument();
      expect(screen.getByTestId('summary-badges')).toBeInTheDocument();
      expect(screen.getByText('1 high')).toBeInTheDocument();
    });
  });

  // 2. Overview Screen
  describe('2. Overview Screen', () => {
    it('shows "Not scanned yet" card + Re-scan button and NO zero KPIs for unscanned project', async () => {
      localStorage.setItem(STORAGE_KEY, unscannedProject.id);
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

      expect(screen.getByTestId('never-scanned-rescan-button')).toBeInTheDocument();
      expect(screen.queryByTestId('kpi-tiles-grid')).not.toBeInTheDocument();
      expect(screen.queryByText('Open findings')).not.toBeInTheDocument();
    });
  });

  // 3. Graph Screen
  describe('3. Graph Screen', () => {
    it('shows "Not scanned yet" card + Re-scan button and NO zeros for unscanned project', async () => {
      const nullScanProj: Project = { ...unscannedProject, last_scan_at: null };
      vi.spyOn(api, 'getProjects').mockResolvedValue([nullScanProj]);
      const getGraphSpy = vi.spyOn(api, 'getGraph');

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

      expect(screen.getByText('Not scanned yet')).toBeInTheDocument();
      expect(screen.getByTestId('rescan-graph-btn')).toBeInTheDocument();
      expect(getGraphSpy).not.toHaveBeenCalled();
      expect(screen.queryByTestId('shown-counter')).not.toBeInTheDocument();
    });
  });

  // 4. Investigations Screen
  describe('4. Investigations Screen', () => {
    it('shows "Not scanned yet" card + Re-scan button and NO zeros for unscanned project', async () => {
      const nullScanProj: Project = { ...unscannedProject, last_scan_at: null };
      vi.spyOn(api, 'getProjects').mockResolvedValue([nullScanProj]);
      const getFindingsSpy = vi.spyOn(api, 'getFindings');

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

      expect(screen.getByText('Not scanned yet')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Re-scan/i })).toBeInTheDocument();
      expect(getFindingsSpy).not.toHaveBeenCalled();
      expect(screen.queryByText(/0 findings/i)).not.toBeInTheDocument();
    });
  });

  // 5. Fixes Screen
  describe('5. Fixes Screen', () => {
    it('shows "Not scanned yet" card + Re-scan button and NO zeros for unscanned project', async () => {
      const nullScanProj: Project = { ...unscannedProject, last_scan_at: null };
      vi.spyOn(api, 'getProjects').mockResolvedValue([nullScanProj]);
      const getFixesSpy = vi.spyOn(api, 'getProjectFixes');

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

      expect(screen.getByRole('button', { name: /Re-scan/i })).toBeInTheDocument();
      expect(getFixesSpy).not.toHaveBeenCalled();
      expect(screen.queryByText(/0 findings/i)).not.toBeInTheDocument();
    });
  });

  // 6. Tests Screen
  describe('6. Tests Screen', () => {
    it('shows "Not scanned yet" card + Re-scan button and NO zeros for unscanned project', async () => {
      const nullScanProj: Project = { ...unscannedProject, last_scan_at: null };
      vi.spyOn(api, 'getProjects').mockResolvedValue([nullScanProj]);
      const getTestsSpy = vi.spyOn(api, 'getTests');

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

      expect(screen.getByText('Not scanned yet')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Re-scan/i })).toBeInTheDocument();
      expect(getTestsSpy).not.toHaveBeenCalled();
      expect(screen.queryByTestId('tile-passed')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tile-failed')).not.toBeInTheDocument();
    });
  });

  // 7. Reports Screen
  describe('7. Reports Screen', () => {
    it('shows "Not scanned yet" + Re-scan button and DISABLES Generate report for unscanned project', async () => {
      localStorage.setItem(STORAGE_KEY, unscannedProject.id);
      vi.spyOn(api, 'getProjects').mockResolvedValue([unscannedProject]);
      vi.spyOn(api, 'getSummary').mockResolvedValue(unscannedSummary);
      vi.spyOn(api, 'getReports').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 25,
      });

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

      expect(screen.getByText('Not scanned yet')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Re-scan/i })).toBeInTheDocument();

      // Generate report button must be disabled for unscanned project
      const generateBtn = screen.getByTestId('generate-report-button');
      expect(generateBtn).toBeDisabled();
    });

    it('enables Generate report button for scanned project', async () => {
      localStorage.setItem(STORAGE_KEY, scannedProject.id);
      vi.spyOn(api, 'getProjects').mockResolvedValue([scannedProject]);
      vi.spyOn(api, 'getSummary').mockResolvedValue(scannedSummary);
      vi.spyOn(api, 'getReports').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 25,
      });

      render(
        <MemoryRouter initialEntries={['/app/reports']}>
          <ProjectProvider>
            <ReportsPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('generate-report-button')).toBeInTheDocument();
      });

      const generateBtn = screen.getByTestId('generate-report-button');
      expect(generateBtn).not.toBeDisabled();
    });
  });
});
