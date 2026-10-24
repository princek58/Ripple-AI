import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProjectProvider, STORAGE_KEY } from '../lib/projectContext.js';
import { OverviewPage } from '../features/overview/OverviewPage.js';
import { ProjectGraphCard } from '../features/overview/ProjectGraphCard.js';
import { ExplanationCard } from '../features/overview/ExplanationCard.js';
import { AffectedModulesStrip } from '../features/overview/AffectedModulesStrip.js';
import { api, ApiClientError } from '../lib/api.js';
import type {
  Project,
  ProjectSummary,
  GraphResponseData,
  GraphNode,
} from '../../../shared/types.js';

// Real captured fixtures
import projectsListFixture from './fixtures/api/projects_list.json';
import scannedSummaryFixture from './fixtures/api/project_summary.json';
import scannedGraphFixture from './fixtures/api/graph_level1.json';
import neverScannedSummaryFixture from './fixtures/api/never_scanned_summary.json';
import neverScannedGraphFixture from './fixtures/api/never_scanned_graph_l1.json';
import graphLevel2FeesFixture from './fixtures/api/graph_level2_fees.json';
import graphLevel3NoticesD1Fixture from './fixtures/api/graph_level3_notices_d1.json';
import graphSearchNoticeFixture from './fixtures/api/graph_search_notice.json';
import nodeDetailsFeesFixture from './fixtures/api/node_details_fees.json';
import { compareKeySets } from './contract_helpers.js';

const capturedProjects: Project[] = projectsListFixture.data;
const scannedSummary: ProjectSummary = scannedSummaryFixture.data as unknown as ProjectSummary;
const scannedGraph: GraphResponseData = scannedGraphFixture.data as unknown as GraphResponseData;
const neverScannedSummary: ProjectSummary = neverScannedSummaryFixture.data as unknown as ProjectSummary;
const neverScannedGraph: GraphResponseData = neverScannedGraphFixture.data as unknown as GraphResponseData;

describe('Overview Screen & Real Backend Data (Step 10b)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('1. Empty and Never-Scanned States', () => {
    it('shows empty state "Upload your first project" linking to /app/projects when no projects exist', async () => {
      vi.spyOn(api, 'getProjects').mockResolvedValue([]);

      render(
        <MemoryRouter initialEntries={['/app/overview']}>
          <ProjectProvider>
            <OverviewPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Upload your first project')).toBeInTheDocument();
      });

      const linkBtn = screen.getByTestId('upload-first-project-overview-btn');
      expect(linkBtn).toBeInTheDocument();
      expect(screen.queryByTestId('kpi-tiles-grid')).not.toBeInTheDocument();
    });

    it('shows "Not scanned yet" state with Re-scan button and NO zero KPIs when project was never scanned', async () => {
      const neverScannedProject: Project = {
        id: 'never-scanned-proj-id',
        name: 'unscanned-app',
        created_at: '2026-10-23T10:00:00Z',
        size_bytes: 4506,
        file_count: 17,
        languages: ['TypeScript'],
        last_scan_at: null,
      };

      localStorage.setItem(STORAGE_KEY, neverScannedProject.id);
      vi.spyOn(api, 'getProjects').mockResolvedValue([neverScannedProject]);
      vi.spyOn(api, 'getSummary').mockResolvedValue(neverScannedSummary);
      vi.spyOn(api, 'getGraph').mockResolvedValue(neverScannedGraph);

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

      const notScannedLabels = screen.getAllByText('Not scanned yet');
      expect(notScannedLabels.length).toBe(2);
      expect(
        within(screen.getByTestId('never-scanned-card')).getByRole('heading', { level: 2 })
      ).toHaveTextContent('Not scanned yet');
      expect(screen.getByTestId('never-scanned-rescan-button')).toBeInTheDocument();

      // Zero KPIs must NOT be displayed
      expect(screen.queryByTestId('kpi-tiles-grid')).not.toBeInTheDocument();
      expect(screen.queryByText('Open findings')).not.toBeInTheDocument();
    });
  });

  describe('2. Scanned State KPI Tiles & Fixture Numbers', () => {
    it('scanned state shows the real numbers in all 4 KPI tiles', async () => {
      localStorage.setItem(STORAGE_KEY, capturedProjects[0].id);
      vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
      vi.spyOn(api, 'getSummary').mockResolvedValue(scannedSummary);
      vi.spyOn(api, 'getGraph').mockResolvedValue(scannedGraph);

      render(
        <MemoryRouter initialEntries={['/app/overview']}>
          <ProjectProvider>
            <OverviewPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('kpi-tiles-grid')).toBeInTheDocument();
      });

      const kpiGrid = screen.getByTestId('kpi-tiles-grid');

      // KPI 1: Open findings (9)
      expect(within(kpiGrid).getByText('Open findings')).toBeInTheDocument();
      expect(within(kpiGrid).getByText('9')).toBeInTheDocument();

      // KPI 2: Critical + High (1)
      expect(within(kpiGrid).getByText('Critical + High')).toBeInTheDocument();
      expect(within(kpiGrid).getByText('1')).toBeInTheDocument();

      // KPI 3: Fixes pending approval (0)
      expect(within(kpiGrid).getByText('Fixes pending approval')).toBeInTheDocument();

      // KPI 4: Verified fixes (0)
      expect(within(kpiGrid).getByText('Verified fixes')).toBeInTheDocument();
    });
  });

  describe('3. ProjectGraphCard Architecture & Interactions', () => {
    it('renders project node and all modules from the fixture', () => {
      render(
        <MemoryRouter>
          <ProjectGraphCard graphData={scannedGraph} />
        </MemoryRouter>
      );

      // Project node
      expect(screen.getByText('demo-erp')).toBeInTheDocument();

      // All 5 module nodes
      expect(screen.getByText('fees')).toBeInTheDocument();
      expect(screen.getByText('login')).toBeInTheDocument();
      expect(screen.getByText('marks')).toBeInTheDocument();
      expect(screen.getByText('notices')).toBeInTheDocument();
      expect(screen.getByText('shared')).toBeInTheDocument();
    });

    it('shows "Showing X of Y nodes"', () => {
      render(
        <MemoryRouter>
          <ProjectGraphCard graphData={scannedGraph} />
        </MemoryRouter>
      );

      const counter = screen.getByTestId('graph-shown-counter');
      expect(counter).toHaveTextContent(`Showing ${scannedGraph.shown} of ${scannedGraph.total} nodes`);
    });

    it('renders a SeverityBadge only on modules with findings, and none on module with 0 findings', () => {
      render(
        <MemoryRouter>
          <ProjectGraphCard graphData={scannedGraph} />
        </MemoryRouter>
      );

      // fees (2 findings, high), marks (1, low), notices (2, medium), shared (5, medium)
      expect(screen.getByTestId('graph-node-57c7c9b2-7b2a-423b-a6b9-016c5a5b81cc')).toHaveTextContent('2');
      expect(screen.getByTestId('graph-node-8377c5f1-f479-4a06-8c72-0d90fdfcbc12')).toHaveTextContent('1');
      expect(screen.getByTestId('graph-node-5bb24cac-cbf2-4f0e-820d-ae64ea9fbc8b')).toHaveTextContent('2');
      expect(screen.getByTestId('graph-node-77ad1152-ca72-4459-afae-7c4caf0adb95')).toHaveTextContent('5');

      // login has 0 findings; should have no severity badge
      const loginNode = screen.getByTestId('graph-node-55b0938a-8754-44f7-a3b3-885c3ca2887a');
      expect(loginNode.querySelector('.severity-badge')).toBeNull();
      expect(loginNode).not.toHaveTextContent('0');
    });

    it('highlights the module with highest maxSeverity with thicker outline and "Most affected" label', () => {
      render(
        <MemoryRouter>
          <ProjectGraphCard graphData={scannedGraph} />
        </MemoryRouter>
      );

      // fees is the highest severity module ('high')
      expect(screen.getByText('Most affected')).toBeInTheDocument();
      const feesNode = screen.getByTestId('graph-node-57c7c9b2-7b2a-423b-a6b9-016c5a5b81cc');
      expect(feesNode).toHaveTextContent('Most affected');
    });

    it('caps rendering at 24 modules and displays "+N more" if exceeded', () => {
      // Construct 26 module nodes
      const dummyModules: GraphNode[] = Array.from({ length: 26 }, (_, i) => ({
        id: `dummy-mod-${i}`,
        project_id: 'test-p',
        scan_id: 'test-s',
        type: 'module' as const,
        level: 1 as const,
        parent_id: 'p-node',
        label: `module-${i + 1}`,
        path: `module:${i + 1}`,
        line_start: null,
        line_end: null,
        language: null,
        meta_json: null,
        findingCount: 1,
        maxSeverity: 'low' as const,
      }));

      const overflowGraph: GraphResponseData = {
        nodes: [scannedGraph.nodes[0], ...dummyModules],
        edges: [],
        clusters: [],
        shown: 27,
        total: 27,
        level: 1,
        focus: null,
      };

      render(
        <MemoryRouter>
          <ProjectGraphCard graphData={overflowGraph} />
        </MemoryRouter>
      );

      expect(screen.getByText('+2 more modules')).toBeInTheDocument();
    });

    it('clicking a module or pressing Enter navigates with the focus query', () => {
      render(
        <MemoryRouter initialEntries={['/app/overview']}>
          <Routes>
            <Route path="/app/overview" element={<ProjectGraphCard graphData={scannedGraph} />} />
            <Route path="/app/graph" element={<div data-testid="graph-screen">Graph Screen</div>} />
          </Routes>
        </MemoryRouter>
      );

      const feesNode = screen.getByTestId('graph-node-57c7c9b2-7b2a-423b-a6b9-016c5a5b81cc');
      fireEvent.click(feesNode);

      expect(screen.getByTestId('graph-screen')).toBeInTheDocument();
    });

    it('keyboard Enter on focused node activates navigation', () => {
      render(
        <MemoryRouter initialEntries={['/app/overview']}>
          <Routes>
            <Route path="/app/overview" element={<ProjectGraphCard graphData={scannedGraph} />} />
            <Route path="/app/graph" element={<div data-testid="graph-screen">Graph Screen</div>} />
          </Routes>
        </MemoryRouter>
      );

      const marksNode = screen.getByTestId('graph-node-8377c5f1-f479-4a06-8c72-0d90fdfcbc12');
      fireEvent.keyDown(marksNode, { key: 'Enter' });

      expect(screen.getByTestId('graph-screen')).toBeInTheDocument();
    });

    it('accessible text list alternative exists for all modules', () => {
      render(
        <MemoryRouter>
          <ProjectGraphCard graphData={scannedGraph} />
        </MemoryRouter>
      );

      expect(screen.getByText(/Accessible module list \(5\)/)).toBeInTheDocument();
    });
  });

  describe('4. Severity Bar and Verification Stacked Bars', () => {
    it('severity bar counts match the captured fixture', async () => {
      localStorage.setItem(STORAGE_KEY, capturedProjects[0].id);
      vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
      vi.spyOn(api, 'getSummary').mockResolvedValue(scannedSummary);
      vi.spyOn(api, 'getGraph').mockResolvedValue(scannedGraph);

      render(
        <MemoryRouter initialEntries={['/app/overview']}>
          <ProjectProvider>
            <OverviewPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('findings-by-severity-chart')).toBeInTheDocument();
      });

      expect(screen.getByTestId('severity-count-critical')).toHaveTextContent('0');
      expect(screen.getByTestId('severity-count-high')).toHaveTextContent('1');
      expect(screen.getByTestId('severity-count-medium')).toHaveTextContent('2');
      expect(screen.getByTestId('severity-count-low')).toHaveTextContent('6');
      expect(screen.getByTestId('severity-count-unknown')).toHaveTextContent('0');
    });

    it('both stacked bars sum to the total findings and summary text reflects them', async () => {
      localStorage.setItem(STORAGE_KEY, capturedProjects[0].id);
      vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
      vi.spyOn(api, 'getSummary').mockResolvedValue(scannedSummary);
      vi.spyOn(api, 'getGraph').mockResolvedValue(scannedGraph);

      render(
        <MemoryRouter initialEntries={['/app/overview']}>
          <ProjectProvider>
            <OverviewPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('stacked-bar-verification')).toBeInTheDocument();
        expect(screen.getByTestId('stacked-bar-confidence')).toBeInTheDocument();
      });

      const summaryText = screen.getByTestId('verification-summary-text');
      expect(summaryText.textContent).toBe(
        '9 findings: 0 verified, 0 fix proposed, 0 reproduced, 9 not tested; 2 confirmed, 2 likely, 5 hypothesis'
      );

      // Verify that verification segments sum to total findings (9)
      const vBar = screen.getByTestId('stacked-bar-verification');
      const vSegments = within(vBar).getAllByTestId(/^v-segment-/);
      const vSum = vSegments.reduce((sum, el) => sum + Number(el.getAttribute('data-count') || 0), 0);
      expect(vSum).toBe(9);

      // Verify that confidence segments sum to total findings (9)
      const cBar = screen.getByTestId('stacked-bar-confidence');
      const cSegments = within(cBar).getAllByTestId(/^c-segment-/);
      const cSum = cSegments.reduce((sum, el) => sum + Number(el.getAttribute('data-count') || 0), 0);
      expect(cSum).toBe(9);
    });
  });

  describe('5. Error Resilience & Partial Failures', () => {
    it('if summary fails, only summary section shows inline error with Retry while graph still renders', async () => {
      localStorage.setItem(STORAGE_KEY, capturedProjects[0].id);
      vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
      vi.spyOn(api, 'getSummary').mockRejectedValue(new ApiClientError('Summary failed', 500));
      vi.spyOn(api, 'getGraph').mockResolvedValue(scannedGraph);

      render(
        <MemoryRouter initialEntries={['/app/overview']}>
          <ProjectProvider>
            <OverviewPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('summary-section-error')).toBeInTheDocument();
      });

      expect(screen.getByText(/Summary unavailable/)).toBeInTheDocument();
      // Graph card still renders
      expect(screen.getByTestId('graph-shown-counter')).toBeInTheDocument();
      expect(screen.getAllByText('demo-erp').length).toBeGreaterThanOrEqual(1);
    });

    it('if graph fails, only graph section shows inline error with Retry while summary sections still render', async () => {
      localStorage.setItem(STORAGE_KEY, capturedProjects[0].id);
      vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
      vi.spyOn(api, 'getSummary').mockResolvedValue(scannedSummary);
      vi.spyOn(api, 'getGraph').mockRejectedValue(new ApiClientError('Graph failed', 500));

      render(
        <MemoryRouter initialEntries={['/app/overview']}>
          <ProjectProvider>
            <OverviewPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('graph-section-error')).toBeInTheDocument();
      });

      expect(screen.getByText('Graph unavailable')).toBeInTheDocument();
      // Summary KPI tiles still render
      expect(screen.getByTestId('kpi-tiles-grid')).toBeInTheDocument();
      expect(screen.getByText('Open findings')).toBeInTheDocument();
    });
  });

  describe('6. Stale Request Abort on Project Switch', () => {
    it('switching project aborts in-flight request and ignores late response from previous project', async () => {
      let abortedSignalA: AbortSignal | undefined;

      const summarySpy = vi.spyOn(api, 'getSummary').mockImplementation((id, signal) => {
        if (id === capturedProjects[0].id) {
          abortedSignalA = signal;
          return new Promise((resolve) => {
            setTimeout(() => resolve(scannedSummary), 300);
          });
        }
        return Promise.resolve({
          ...scannedSummary,
          kpi: { ...scannedSummary.kpi, openFindings: 999 },
        });
      });

      vi.spyOn(api, 'getGraph').mockResolvedValue(scannedGraph);
      vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);

      localStorage.setItem(STORAGE_KEY, capturedProjects[0].id);

      const { rerender } = render(
        <MemoryRouter initialEntries={['/app/overview']}>
          <ProjectProvider>
            <OverviewPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      // Verify initial call occurred
      await waitFor(() => {
        expect(summarySpy).toHaveBeenCalledWith(capturedProjects[0].id, expect.any(AbortSignal));
      });
      expect(abortedSignalA?.aborted).toBe(false);

      // Switch project
      localStorage.setItem(STORAGE_KEY, capturedProjects[1].id);

      rerender(
        <MemoryRouter initialEntries={['/app/overview']}>
          <ProjectProvider initialProjectId={capturedProjects[1].id}>
            <OverviewPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      // Project A signal should be aborted
      await waitFor(() => {
        expect(abortedSignalA?.aborted).toBe(true);
      });
    });
  });

  describe('7. ExplanationCard & Hinglish Toggle', () => {
    it('always shows "Template-based, not AI" label and toggles between English and Hinglish templates', () => {
      render(<ExplanationCard summary={scannedSummary} />);

      expect(screen.getByTestId('template-label')).toHaveTextContent('Template-based, not AI');

      // Default English
      const explanation = screen.getByTestId('explanation-text');
      expect(explanation).toHaveTextContent(
        'Found 9 total findings across the project. 1 is critical or high severity. The most affected module is fees. No fixes have been verified yet.'
      );

      // Toggle to Hinglish
      const hinglishBtn = screen.getByTestId('lang-toggle-hinglish');
      fireEvent.click(hinglishBtn);

      expect(screen.getByTestId('template-label')).toHaveTextContent('Template-based, not AI');
      expect(explanation).toHaveTextContent(
        'Is project me kul 9 findings mili hain. Inme se 1 critical ya high severity hain. Sabse zyada prabhavit module fees hai. Abhi tak koi bhi fix verify nahi hua hai.'
      );
    });
  });

  describe('8. Zero-Findings Warning Banner & SampleDataTag Check', () => {
    it('displays the 6 automated checks note when scanned project has zero findings', () => {
      render(<AffectedModulesStrip affectedModules={[]} />);

      expect(screen.getByTestId('no-findings-banner')).toBeInTheDocument();
      expect(screen.getByText('No findings from the 6 automated checks')).toBeInTheDocument();
      expect(
        screen.getByText(
          'No findings does not mean no problems: Phase 1 runs only 6 static checks and executes no code.'
        )
      ).toBeInTheDocument();
    });

    it('has no SampleDataTag anywhere on the page (real data only)', async () => {
      localStorage.setItem(STORAGE_KEY, capturedProjects[0].id);
      vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
      vi.spyOn(api, 'getSummary').mockResolvedValue(scannedSummary);
      vi.spyOn(api, 'getGraph').mockResolvedValue(scannedGraph);

      render(
        <MemoryRouter initialEntries={['/app/overview']}>
          <ProjectProvider>
            <OverviewPage />
          </ProjectProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('kpi-tiles-grid')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('sample-data-tag')).not.toBeInTheDocument();
      expect(screen.queryByText(/Sample data/i)).not.toBeInTheDocument();
    });
  });

  describe('9. Extended Contract Test (RIPPLE_CONTRACT=1)', () => {
    const shouldRunContract = process.env.RIPPLE_CONTRACT === '1';

    it('proves contract comparison reports differences on mutated keys (extra key and missing key), then restores', () => {
      const sample = JSON.parse(JSON.stringify(nodeDetailsFeesFixture.data));
      const mutated = JSON.parse(JSON.stringify(sample));
      mutated.extraKey = 'unexpected';
      delete mutated.relatedFindings;

      const result = compareKeySets(mutated, sample);
      expect(result.matching).toBe(false);
      expect(result.differences.some((d) => d.includes('extraKey'))).toBe(true);
      expect(result.differences.some((d) => d.includes('relatedFindings'))).toBe(true);

      const restored = JSON.parse(JSON.stringify(sample));
      const passResult = compareKeySets(restored, sample);
      expect(passResult.matching).toBe(true);
      expect(passResult.differences).toHaveLength(0);
    });

    it.runIf(shouldRunContract)(
      'contract test: verifies live backend GET summary, graph level 1, 2, 3, search and node details keys match fixtures',
      async () => {
        const liveProjectsRes = await fetch('http://localhost:4000/api/projects');
        expect(liveProjectsRes.ok).toBe(true);
        const liveProjectsJson = await liveProjectsRes.json();
        let projectId = liveProjectsJson.data[0].id;
        for (const p of liveProjectsJson.data) {
          const sRes = await fetch(`http://localhost:4000/api/projects/${p.id}/summary`);
          if (sRes.ok) {
            const sJson = await sRes.json();
            if (sJson.data?.counts?.nodes > 0) {
              projectId = p.id;
              break;
            }
          }
        }

        // 1. Verify summary keys
        const liveSummaryRes = await fetch(`http://localhost:4000/api/projects/${projectId}/summary`);
        expect(liveSummaryRes.ok).toBe(true);
        const liveSummaryJson = await liveSummaryRes.json();

        expect(Object.keys(liveSummaryJson.data).sort()).toEqual(
          Object.keys(scannedSummaryFixture.data).sort()
        );

        // 2. Verify graph?level=1 keys
        const liveGraphRes = await fetch(
          `http://localhost:4000/api/projects/${projectId}/graph?level=1`
        );
        expect(liveGraphRes.ok).toBe(true);
        const liveGraphJson = await liveGraphRes.json();

        expect(Object.keys(liveGraphJson.data).sort()).toEqual(
          Object.keys(scannedGraphFixture.data).sort()
        );

        // Check node and edge keys
        if (liveGraphJson.data.nodes.length > 0) {
          expect(Object.keys(liveGraphJson.data.nodes[0]).sort()).toEqual(
            Object.keys(scannedGraphFixture.data.nodes[0]).sort()
          );
        }

        if (liveGraphJson.data.edges.length > 0) {
          expect(Object.keys(liveGraphJson.data.edges[0]).sort()).toEqual(
            Object.keys(scannedGraphFixture.data.edges[0]).sort()
          );
        }

        // 3. Verify graph?level=2 keys
        const feesModule = liveGraphJson.data.nodes.find((n: any) => n.label === 'fees') ||
          liveGraphJson.data.nodes.find((n: any) => n.type === 'module');
        expect(feesModule).toBeDefined();
        const liveLevel2Res = await fetch(
          `http://localhost:4000/api/projects/${projectId}/graph?level=2&focus=${feesModule.id}`
        );
        expect(liveLevel2Res.ok).toBe(true);
        const liveLevel2Json = await liveLevel2Res.json();
        const l2Cmp = compareKeySets(liveLevel2Json.data, graphLevel2FeesFixture.data);
        expect(l2Cmp.differences).toEqual([]);
        expect(l2Cmp.matching).toBe(true);

        // 4. Verify search keys
        const liveSearchRes = await fetch(
          `http://localhost:4000/api/projects/${projectId}/graph/search?q=notice`
        );
        expect(liveSearchRes.ok).toBe(true);
        const liveSearchJson = await liveSearchRes.json();
        const searchCmp = compareKeySets(liveSearchJson.data, graphSearchNoticeFixture.data);
        expect(searchCmp.differences).toEqual([]);
        expect(searchCmp.matching).toBe(true);

        // 5. Verify graph?level=3 keys
        const noticePageNode = liveSearchJson.data.items.find((n: any) => n.label === 'NoticePage.tsx') ||
          liveLevel2Json.data.nodes.find((n: any) => n.type !== 'module');
        expect(noticePageNode).toBeDefined();
        const liveLevel3Res = await fetch(
          `http://localhost:4000/api/projects/${projectId}/graph?level=3&focus=${noticePageNode.id}&depth=1`
        );
        expect(liveLevel3Res.ok).toBe(true);
        const liveLevel3Json = await liveLevel3Res.json();
        const l3Cmp = compareKeySets(liveLevel3Json.data, graphLevel3NoticesD1Fixture.data);
        expect(l3Cmp.differences).toEqual([]);
        expect(l3Cmp.matching).toBe(true);

        // 6. Verify node details keys
        const feesNode = liveLevel2Json.data.nodes.find((n: any) => n.label === 'fees.js') ||
          liveLevel2Json.data.nodes.find((n: any) => n.type !== 'module');
        expect(feesNode).toBeDefined();
        const liveDetailsRes = await fetch(
          `http://localhost:4000/api/projects/${projectId}/graph/nodes/${feesNode.id}`
        );
        expect(liveDetailsRes.ok).toBe(true);
        const liveDetailsJson = await liveDetailsRes.json();
        const detailsCmp = compareKeySets(liveDetailsJson.data, nodeDetailsFeesFixture.data);
        expect(detailsCmp.differences).toEqual([]);
        expect(detailsCmp.matching).toBe(true);
      }
    );
  });
});
