import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ProjectProvider, useProjects } from '../lib/projectContext.js';
import { GraphPage } from '../features/graph/GraphPage.js';
import { api, ApiClientError } from '../lib/api.js';
import type {
  Project,
  GraphResponseData,
  NodeDetailsData,
} from '../../../shared/types.js';

// Real captured fixtures
import projectsListFixture from './fixtures/api/projects_list.json';
import graphLevel1Fixture from './fixtures/api/graph_level1.json';
import graphLevel2FeesFixture from './fixtures/api/graph_level2_fees.json';
import graphLevel3NoticesD1Fixture from './fixtures/api/graph_level3_notices_d1.json';
import graphClusteredL1Fixture from './fixtures/api/graph_clustered_l1.json';
import nodeDetailsFeesFixture from './fixtures/api/node_details_fees.json';

const capturedProjects: Project[] = projectsListFixture.data;
const graphLevel1: GraphResponseData = graphLevel1Fixture.data as unknown as GraphResponseData;
const graphLevel2Fees: GraphResponseData = graphLevel2FeesFixture.data as unknown as GraphResponseData;
const graphLevel3NoticesD1: GraphResponseData = graphLevel3NoticesD1Fixture.data as unknown as GraphResponseData;
const graphClusteredL1: GraphResponseData = graphClusteredL1Fixture.data as unknown as GraphResponseData;
const nodeDetailsFees: NodeDetailsData = nodeDetailsFeesFixture.data as unknown as NodeDetailsData;

// Helper component to observe current URL in tests
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="test-location">{location.pathname + location.search}</div>;
}

// Helper component to trigger project switch inside ProjectProvider
function SwitchProjectButton({ targetId }: { targetId: string }) {
  const { setSelectedProjectId } = useProjects();
  return (
    <button data-testid="switch-proj-btn" onClick={() => setSelectedProjectId(targetId)}>
      Switch
    </button>
  );
}

describe('GraphPage Component & URL States (Step 11a-2 Part B)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders Level 1 graph by default when no focus parameter is present', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
    vi.spyOn(api, 'getGraph').mockResolvedValue(graphLevel1);

    render(
      <MemoryRouter initialEntries={['/app/graph']}>
        <ProjectProvider>
          <GraphPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Dependency Graph')).toBeInTheDocument();
      expect(screen.getByText('Level 1')).toBeInTheDocument();
      expect(screen.getByTestId('shown-counter')).toHaveTextContent('Showing 6 of 6 nodes');
    });

    // Check accessible text alternative details
    expect(screen.getByTestId('graph-text-alternative')).toBeInTheDocument();
    expect(screen.getByText('Graph as a text list')).toBeInTheDocument();
    expect(screen.getByText('For screen readers and keyboard users. Lists every node and edge shown above.')).toBeInTheDocument();
  });

  it('resolves focus without level: module resolves to level 2 and file resolves to level 3', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
    vi.spyOn(api, 'getGraph').mockResolvedValue(graphLevel2Fees);

    // 1. Module focus -> level 2
    const moduleDetails: NodeDetailsData = {
      ...nodeDetailsFees,
      node: {
        ...nodeDetailsFees.node,
        type: 'module',
      },
    };
    const getNodeDetailsSpy = vi.spyOn(api, 'getNodeDetails').mockResolvedValue(moduleDetails);

    const { unmount } = render(
      <MemoryRouter initialEntries={['/app/graph?focus=mod-fees-123']}>
        <ProjectProvider>
          <LocationDisplay />
          <GraphPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(
      () => {
        expect(getNodeDetailsSpy).toHaveBeenCalledWith(
          capturedProjects[0].id,
          'mod-fees-123',
          expect.any(AbortSignal)
        );
        expect(screen.getByTestId('test-location')).toHaveTextContent('level=2');
      },
      { timeout: 6000 }
    );

    unmount();

    // 2. File focus -> level 3 & depth=1
    const fileDetails: NodeDetailsData = {
      ...nodeDetailsFees,
      node: {
        ...nodeDetailsFees.node,
        type: 'backend',
      },
    };
    vi.spyOn(api, 'getNodeDetails').mockResolvedValue(fileDetails);
    vi.spyOn(api, 'getGraph').mockResolvedValue(graphLevel3NoticesD1);

    render(
      <MemoryRouter initialEntries={['/app/graph?focus=file-fees-456']}>
        <ProjectProvider>
          <LocationDisplay />
          <GraphPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(
      () => {
        expect(screen.getByTestId('test-location')).toHaveTextContent('level=3');
        expect(screen.getByTestId('test-location')).toHaveTextContent('depth=1');
      },
      { timeout: 6000 }
    );
  });

  it('shows 404 message and back button when focus node is not found', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
    vi.spyOn(api, 'getGraph').mockRejectedValue(
      new ApiClientError('Node not found', 404, 'NOT_FOUND')
    );

    render(
      <MemoryRouter initialEntries={['/app/graph?focus=non-existent-id&level=2']}>
        <ProjectProvider>
          <LocationDisplay />
          <GraphPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('node-404-state')).toBeInTheDocument();
      expect(screen.getByText('This node is not in the selected project')).toBeInTheDocument();
    });

    const backBtn = screen.getByTestId('back-to-level1-btn');
    expect(backBtn).toBeInTheDocument();
    expect(backBtn).toHaveTextContent('Back to Level 1');

    // Click back to Level 1
    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(screen.getByTestId('test-location')).toHaveTextContent('/app/graph');
      expect(screen.queryByTestId('node-404-state')).not.toBeInTheDocument();
    });
  });

  it('shows empty state when no projects exist', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/app/graph']}>
        <ProjectProvider>
          <GraphPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Upload your first project')).toBeInTheDocument();
    });

    expect(screen.getByTestId('upload-first-project-graph-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('shown-counter')).not.toBeInTheDocument();
  });

  it('shows "Not scanned yet" state with Re-scan button when project has never been scanned', async () => {
    const neverScannedProject: Project = {
      id: 'never-scanned-proj-1',
      name: 'unscanned-repo',
      created_at: '2026-10-23T10:00:00Z',
      size_bytes: 5000,
      file_count: 10,
      languages: ['JavaScript'],
      last_scan_at: null,
    };

    vi.spyOn(api, 'getProjects').mockResolvedValue([neverScannedProject]);
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
      expect(screen.getByText('Not scanned yet')).toBeInTheDocument();
      expect(screen.getByTestId('rescan-graph-btn')).toBeInTheDocument();
    });

    // Never scanned project does not load empty graph
    expect(getGraphSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('shown-counter')).not.toBeInTheDocument();
  });

  it('displays counter numbers from clustered capture (+3 clustered)', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
    vi.spyOn(api, 'getGraph').mockResolvedValue(graphClusteredL1);

    render(
      <MemoryRouter initialEntries={['/app/graph']}>
        <ProjectProvider>
          <GraphPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('shown-counter')).toHaveTextContent('Showing 3 of 6 nodes');
      expect(screen.getByTestId('clustered-count')).toHaveTextContent('(+3 clustered)');
    });
  });

  it('aborts in-flight request and ignores stale response when switching project', async () => {
    const proj1 = capturedProjects[0];
    const proj2: Project = {
      id: 'p2-second-project',
      name: 'second-project',
      created_at: '2026-10-23T11:00:00Z',
      size_bytes: 8000,
      file_count: 20,
      languages: ['TypeScript'],
      last_scan_at: '2026-10-23T11:05:00Z',
    };

    vi.spyOn(api, 'getProjects').mockResolvedValue([proj1, proj2]);

    let resolveProj1Graph!: (data: GraphResponseData) => void;
    let proj1Signal: AbortSignal | undefined;

    const getGraphSpy = vi.spyOn(api, 'getGraph').mockImplementation((projectId, _q, signal) => {
      if (projectId === proj1.id) {
        proj1Signal = signal;
        return new Promise((resolve) => {
          resolveProj1Graph = resolve;
        });
      }
      return Promise.resolve(graphLevel1);
    });

    render(
      <MemoryRouter initialEntries={['/app/graph?focus=some-focus-node&level=2']}>
        <ProjectProvider>
          <LocationDisplay />
          <SwitchProjectButton targetId={proj2.id} />
          <GraphPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(getGraphSpy).toHaveBeenCalledWith(proj1.id, expect.anything(), expect.anything());
    });

    // Simulate switching project via SwitchProjectButton
    fireEvent.click(screen.getByTestId('switch-proj-btn'));

    // Wait for project 2 to be selected and in-flight proj1 signal to be aborted
    await waitFor(() => {
      expect(proj1Signal?.aborted).toBe(true);
      expect(screen.getByTestId('test-location')).toHaveTextContent('/app/graph');
    });

    // If proj1 graph resolves late, it should be ignored
    resolveProj1Graph(graphLevel2Fees);

    // URL is reset to level 1 and active graph is for project 2
    expect(screen.getByTestId('test-location').textContent).toBe('/app/graph');
  });

  it('text alternative lists all nodes and edges in semantic details element', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
    vi.spyOn(api, 'getGraph').mockResolvedValue(graphLevel1);

    render(
      <MemoryRouter initialEntries={['/app/graph']}>
        <ProjectProvider>
          <GraphPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('graph-text-alternative')).toBeInTheDocument();
      expect(screen.getByText('Visible Nodes (6)')).toBeInTheDocument();
    });

    const textAlt = screen.getByTestId('graph-text-alternative');

    // Lists all nodes
    expect(textAlt).toHaveTextContent('fees');
    expect(textAlt).toHaveTextContent('login');
    expect(textAlt).toHaveTextContent('marks');
    expect(textAlt).toHaveTextContent('notices');
    expect(textAlt).toHaveTextContent('shared');

    // Lists edges
    expect(textAlt).toHaveTextContent('Graph Edges (4)');
    expect(textAlt).toHaveTextContent('imports');
  });
});
