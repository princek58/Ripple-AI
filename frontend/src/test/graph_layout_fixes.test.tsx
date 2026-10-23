import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as xyflow from '@xyflow/react';
import { ProjectProvider } from '../lib/projectContext.js';
import { GraphPage } from '../features/graph/GraphPage.js';
import { GraphCanvas } from '../features/graph/GraphCanvas.js';
import { GraphTextAlternative } from '../features/graph/GraphTextAlternative.js';
import { CustomNode } from '../features/graph/CustomNode.js';
import { StubNode } from '../features/graph/StubNode.js';
import { ClusterNode } from '../features/graph/ClusterNode.js';
import { api } from '../lib/api.js';
import * as graphTransform from '../features/graph/graphTransform.js';
import type { Project, GraphResponseData } from '../../../shared/types.js';

// Real captured fixtures
import projectsListFixture from './fixtures/api/projects_list.json';
import graphLevel2FeesFixture from './fixtures/api/graph_level2_fees.json';

const capturedProjects: Project[] = projectsListFixture.data;
const graphLevel2Fees: GraphResponseData = graphLevel2FeesFixture.data as unknown as GraphResponseData;

const mockFitView = vi.fn();

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    useReactFlow: () => ({
      fitView: mockFitView,
    }),
  };
});

describe('Graph screen layout & readability fixes (Step 11c Part B)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFitView.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockFitView.mockClear();
    localStorage.clear();
  });

  it('legend toggle is in toolbar row and outside the React Flow container in the DOM', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
    vi.spyOn(api, 'getGraph').mockResolvedValue(graphLevel2Fees);

    render(
      <MemoryRouter initialEntries={['/app/graph?focus=acd1dd3f-267d-4256-a760-9064b962d4c1&level=2']}>
        <ProjectProvider>
          <GraphPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Interactive architecture dependency graph')).toBeInTheDocument();
    });

    const toggleBtn = screen.getByTestId('toggle-legend-btn');
    const flowContainer = screen.getByLabelText('Interactive architecture dependency graph');

    // Assert legend toggle is completely outside the React Flow canvas DOM tree
    expect(flowContainer.contains(toggleBtn)).toBe(false);

    // Assert toggle is inside header toolbar
    const header = screen.getByRole('banner');
    expect(header.contains(toggleBtn)).toBe(true);
  });

  it('legend content contains shapes with names, severity labels with icons, and three edge styles as text', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);
    vi.spyOn(api, 'getGraph').mockResolvedValue(graphLevel2Fees);

    render(
      <MemoryRouter initialEntries={['/app/graph?focus=acd1dd3f-267d-4256-a760-9064b962d4c1&level=2']}>
        <ProjectProvider>
          <GraphPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('toggle-legend-btn')).toBeInTheDocument();
    });

    const toggleBtn = screen.getByTestId('toggle-legend-btn');
    expect(screen.queryByTestId('graph-legend')).not.toBeInTheDocument();

    // Open legend panel below toolbar
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('graph-legend')).toBeInTheDocument();

    // 1. Shapes with text names
    expect(screen.getByText(/frontend \(rounded rectangle\)/i)).toBeInTheDocument();
    expect(screen.getByText(/module \(circle\)/i)).toBeInTheDocument();
    expect(screen.getByText(/project \(circle\)/i)).toBeInTheDocument();
    expect(screen.getByText('Stub (Unresolved)')).toBeInTheDocument();
    expect(screen.getByText('Cluster (Group)')).toBeInTheDocument();

    // 2. Severities with text + icons (never color alone)
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();

    // 3. Three edge styles as text
    expect(screen.getByText('Resolved (Solid)')).toBeInTheDocument();
    expect(screen.getByText('Possible (Dashed)')).toBeInTheDocument();
    expect(screen.getByText('Unresolved (Dotted with ?)')).toBeInTheDocument();

    // Close panel
    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId('graph-legend')).not.toBeInTheDocument();
  });

  it('focus label: shows "Current module" only on module node, and "Focus node" on other node types', () => {
    // 1. Module node when focused
    const { rerender } = render(
      <xyflow.ReactFlowProvider>
        <CustomNode
          id="node-module-1"
          data={{
            id: 'node-module-1',
            label: 'fees',
            nodeType: 'module',
            isFocused: true,
            findingCount: 1,
            maxSeverity: 'medium',
          }}
          type="customNode"
          selected={false}
          zIndex={0}
          isConnectable={false}
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          draggable={false}
          selectable={true}
          deletable={false}
        />
      </xyflow.ReactFlowProvider>
    );

    const moduleBadge = screen.getByTestId('current-module-badge');
    expect(moduleBadge).toHaveTextContent('Current module');
    const moduleBtn = screen.getByRole('button');
    expect(moduleBtn).toHaveAttribute('aria-label', expect.stringContaining('Current module'));

    // 2. API node when focused: must show "Focus node" and NOT "Current module"
    rerender(
      <xyflow.ReactFlowProvider>
        <CustomNode
          id="node-api-1"
          data={{
            id: 'node-api-1',
            label: 'POST /api/notices',
            nodeType: 'api',
            isFocused: true,
            findingCount: 0,
            maxSeverity: null,
          }}
          type="customNode"
          selected={false}
          zIndex={0}
          isConnectable={false}
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          draggable={false}
          selectable={true}
          deletable={false}
        />
      </xyflow.ReactFlowProvider>
    );

    expect(screen.queryByTestId('current-module-badge')).not.toBeInTheDocument();
    const apiBadge = screen.getByTestId('focus-node-badge');
    expect(apiBadge).toHaveTextContent('Focus node');
    const apiBtn = screen.getByRole('button');
    expect(apiBtn).toHaveAttribute('aria-label', expect.stringContaining('Focus node'));
    expect(apiBtn.getAttribute('aria-label')).not.toContain('Current module');

    // 3. Unfocused node: no badge and no focus label in aria-label
    rerender(
      <xyflow.ReactFlowProvider>
        <CustomNode
          id="node-api-1"
          data={{
            id: 'node-api-1',
            label: 'POST /api/notices',
            nodeType: 'api',
            isFocused: false,
            findingCount: 0,
            maxSeverity: null,
          }}
          type="customNode"
          selected={false}
          zIndex={0}
          isConnectable={false}
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          draggable={false}
          selectable={true}
          deletable={false}
        />
      </xyflow.ReactFlowProvider>
    );

    expect(screen.queryByTestId('current-module-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('focus-node-badge')).not.toBeInTheDocument();
    expect(screen.getByRole('button').getAttribute('aria-label')).not.toContain('Focus node');
    expect(screen.getByRole('button').getAttribute('aria-label')).not.toContain('Current module');
  });

  it('fitView is invoked with padding 0.25 and maxZoom 1.5 on layout finish and panel toggle', async () => {
    // Note: Canvas pixel rendering is not unit-testable in jsdom; we assert fitView invocation arguments and layout state
    mockFitView.mockClear();

    const testNodes: xyflow.Node<graphTransform.FlowNodeData>[] = [
      { id: 'node-1', type: 'customNode', position: { x: 0, y: 0 }, data: { id: 'node-1', label: 'Node 1', nodeType: 'module' } },
      { id: 'node-2', type: 'customNode', position: { x: 100, y: 0 }, data: { id: 'node-2', label: 'Node 2', nodeType: 'module' } },
    ];
    const testEdges: xyflow.Edge<graphTransform.FlowEdgeData>[] = [];

    const onSelectNode = vi.fn();

    const { rerender } = render(
      <GraphCanvas
        initialNodes={testNodes}
        initialEdges={testEdges}
        selectedNodeId={null}
        onSelectNode={onSelectNode}
        isPanelOpen={false}
      />
    );

    // Wait for layout calculation to finish and trigger fitView
    await waitFor(() => {
      expect(mockFitView).toHaveBeenCalledWith(
        expect.objectContaining({
          padding: 0.25,
          maxZoom: 1.5,
          duration: expect.any(Number),
        })
      );
    });

    mockFitView.mockClear();

    // Toggle panel open -> triggers fitView again
    rerender(
      <GraphCanvas
        initialNodes={testNodes}
        initialEdges={testEdges}
        selectedNodeId="node-1"
        onSelectNode={onSelectNode}
        isPanelOpen={true}
      />
    );

    await waitFor(() => {
      expect(mockFitView).toHaveBeenCalledWith(
        expect.objectContaining({
          padding: 0.25,
          maxZoom: 1.5,
          duration: expect.any(Number),
        })
      );
    });
  });

  it('nodes have minimum width 160px, label wraps up to two lines and carries full label in title attribute', () => {
    // 1. CustomNode
    const longModuleLabel = 'fees_calculation_service_with_extended_name_that_wraps';
    const { rerender } = render(
      <xyflow.ReactFlowProvider>
        <CustomNode
          id="custom-1"
          data={{
            id: 'custom-1',
            label: longModuleLabel,
            nodeType: 'module',
          }}
          type="customNode"
          selected={false}
          zIndex={0}
          isConnectable={false}
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          draggable={false}
          selectable={true}
          deletable={false}
        />
      </xyflow.ReactFlowProvider>
    );

    const customNodeEl = screen.getByRole('button');
    expect(customNodeEl.className).toContain('min-w-[160px]');
    const customLabel = screen.getByText(longModuleLabel);
    expect(customLabel).toHaveAttribute('title', longModuleLabel);
    expect(customLabel.className).toContain('line-clamp-2');
    expect(customLabel.className).toContain('text-[13px]');
    expect(customLabel.className).not.toContain('truncate');

    const customType = screen.getByText('module');
    expect(customType.className).toContain('text-[11px]');

    // 2. StubNode
    const longStubLabel = 'unresolved_external_payment_gateway_service';
    rerender(
      <xyflow.ReactFlowProvider>
        <StubNode
          id="stub-1"
          data={{
            id: 'stub-1',
            label: longStubLabel,
            nodeType: 'module',
          }}
          type="stubNode"
          selected={false}
          zIndex={0}
          isConnectable={false}
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          draggable={false}
          selectable={true}
          deletable={false}
        />
      </xyflow.ReactFlowProvider>
    );

    const stubNodeEl = screen.getByRole('button');
    expect(stubNodeEl.className).toContain('min-w-[160px]');
    const stubLabel = screen.getByText(longStubLabel);
    expect(stubLabel).toHaveAttribute('title', longStubLabel);
    expect(stubLabel.className).toContain('line-clamp-2');
    expect(stubLabel.className).toContain('text-[13px]');
    expect(stubLabel.className).not.toContain('truncate');

    const stubType = screen.getByText('Missing target');
    expect(stubType.className).toContain('text-[11px]');

    // 3. ClusterNode
    const longClusterLabel = 'database_cluster_with_multiple_tables_grouped';
    rerender(
      <xyflow.ReactFlowProvider>
        <ClusterNode
          id="cluster-1"
          data={{
            id: 'cluster-1',
            label: longClusterLabel,
            clusterCount: 8,
          }}
          type="clusterNode"
          selected={false}
          zIndex={0}
          isConnectable={false}
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          draggable={false}
          selectable={true}
          deletable={false}
        />
      </xyflow.ReactFlowProvider>
    );

    const clusterNodeEl = screen.getByRole('button');
    expect(clusterNodeEl.className).toContain('min-w-[160px]');
    const clusterLabel = screen.getByText(longClusterLabel);
    expect(clusterLabel).toHaveAttribute('title', longClusterLabel);
    expect(clusterLabel.className).toContain('line-clamp-2');
    expect(clusterLabel.className).toContain('text-[13px]');
    expect(clusterLabel.className).not.toContain('truncate');

    const clusterType = screen.getByText('Group cluster');
    expect(clusterType.className).toContain('text-[11px]');
  });

  it('text alternative summary has new title, visible helper line, card style, and is collapsed by default', () => {
    render(
      <GraphTextAlternative
        flowNodes={[]}
        flowEdges={[]}
        unmappedEdges={[]}
        clustersCount={0}
      />
    );

    const details = screen.getByTestId('graph-text-alternative');
    // Collapsed by default
    expect(details).not.toHaveAttribute('open');

    // Card style classes
    expect(details.className).toContain('rounded-xl');
    expect(details.className).toContain('border');
    expect(details.className).toContain('p-4');

    // Title and visible helper line
    expect(screen.getByText('Graph as a text list')).toBeInTheDocument();
    expect(
      screen.getByText('For screen readers and keyboard users. Lists every node and edge shown above.')
    ).toBeInTheDocument();
  });
});
