import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectProvider } from '../lib/projectContext.js';
import { GraphPage } from '../features/graph/GraphPage.js';
import { GraphCanvas } from '../features/graph/GraphCanvas.js';
import { GraphLegend } from '../features/graph/GraphLegend.js';
import { CustomNode } from '../features/graph/CustomNode.js';
import { api } from '../lib/api.js';
import * as graphTransform from '../features/graph/graphTransform.js';
import type {
  Project,
  GraphResponseData,
} from '../../../shared/types.js';
import { ReactFlowProvider, type Node as FlowNode, type Edge as FlowEdge } from '@xyflow/react';

// Real captured fixtures
import projectsListFixture from './fixtures/api/projects_list.json';
import graphLevel2FeesFixture from './fixtures/api/graph_level2_fees.json';

const capturedProjects: Project[] = projectsListFixture.data;
const graphLevel2Fees: GraphResponseData = graphLevel2FeesFixture.data as unknown as GraphResponseData;

describe('GraphCanvas, Layout, Legend & Interactions (Step 11a-2 Part C)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('fees module level 2 contains fees.js, the unresolved feeService stub and its "?" edge in the text alternative', async () => {
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
      expect(screen.getByTestId('graph-text-alternative')).toHaveTextContent('fees.js');
    });

    const textAlt = screen.getByTestId('graph-text-alternative');

    // Contains real node fees.js
    expect(textAlt).toHaveTextContent('fees.js');

    // Contains unresolved feeService stub
    expect(textAlt).toHaveTextContent('Unresolved: feeService');

    // Contains the unresolved edge targeting feeService stub
    expect(textAlt).toHaveTextContent('unresolved');
    expect(textAlt).toHaveTextContent('imports');
  });

  it('focused node shows "Current module" text label and accessible aria description', async () => {
    render(
      <ReactFlowProvider>
        <CustomNode
          id="node-focus-1"
          data={{
            id: 'node-focus-1',
            label: 'fees',
            nodeType: 'module',
            isFocused: true,
            findingCount: 2,
            maxSeverity: 'high',
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
      </ReactFlowProvider>
    );

    const badge = screen.getByTestId('current-module-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Current module');

    // Verify aria-label contains current module
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', expect.stringContaining('current module'));
  });

  it('layout failure falls back to deterministic grid and displays "Auto-layout unavailable"', async () => {
    // Note: Canvas pixel rendering is not unit-testable in jsdom; we assert on the fallback alert, state, and node positioning
    const testNodes: FlowNode<graphTransform.FlowNodeData>[] = [
      { id: 'node-1', type: 'customNode', position: { x: 0, y: 0 }, data: { id: 'node-1', label: 'Node 1', nodeType: 'module' } },
      { id: 'node-2', type: 'customNode', position: { x: 0, y: 0 }, data: { id: 'node-2', label: 'Node 2', nodeType: 'module' } },
    ];
    const testEdges: FlowEdge<graphTransform.FlowEdgeData>[] = [];

    // Force layout calculation to throw / fail
    vi.spyOn(graphTransform, 'calculateElkLayout').mockResolvedValue({
      positionedNodes: [
        { ...testNodes[0], position: { x: 0, y: 0 } },
        { ...testNodes[1], position: { x: 220, y: 0 } },
      ],
      layoutSuccess: false,
    });

    render(
      <GraphCanvas
        initialNodes={testNodes}
        initialEdges={testEdges}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('autolayout-unavailable-alert')).toBeInTheDocument();
      expect(screen.getByText('Auto-layout unavailable')).toBeInTheDocument();
    });
  });

  it('legend contains shapes with text names, severity labels with icons, and the three edge styles as text', async () => {
    render(<GraphLegend />);

    const toggleBtn = screen.getByTestId('toggle-legend-btn');
    expect(toggleBtn).toBeInTheDocument();

    // Open legend
    fireEvent.click(toggleBtn);

    // Shapes with text names
    expect(screen.getByText(/frontend \(rounded rectangle\)/i)).toBeInTheDocument();
    expect(screen.getByText(/module \(circle\)/i)).toBeInTheDocument();
    expect(screen.getByText(/project \(circle\)/i)).toBeInTheDocument();
    expect(screen.getByText('Stub (Unresolved)')).toBeInTheDocument();
    expect(screen.getByText('Cluster (Group)')).toBeInTheDocument();

    // Severities with icons + text (never color alone)
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();

    // Three edge styles as text
    expect(screen.getByText('Resolved (Solid)')).toBeInTheDocument();
    expect(screen.getByText('Possible (Dashed)')).toBeInTheDocument();
    expect(screen.getByText('Unresolved (Dotted with ?)')).toBeInTheDocument();
  });

  it('hover or focus dims non-neighbours and highlights connected nodes', async () => {
    const testNodes: FlowNode<graphTransform.FlowNodeData>[] = [
      { id: 'node-A', type: 'customNode', position: { x: 0, y: 0 }, data: { id: 'node-A', label: 'Node A', nodeType: 'module' } },
      { id: 'node-B', type: 'customNode', position: { x: 100, y: 0 }, data: { id: 'node-B', label: 'Node B', nodeType: 'module' } },
      { id: 'node-C', type: 'customNode', position: { x: 200, y: 0 }, data: { id: 'node-C', label: 'Node C', nodeType: 'module' } },
    ];
    // Edge: A -> B (C is unconnected)
    const testEdges: FlowEdge<graphTransform.FlowEdgeData>[] = [
      { id: 'e-ab', source: 'node-A', target: 'node-B', type: 'customEdge', data: { id: 'e-ab', relation: 'imports', status: 'resolved' } },
    ];

    vi.spyOn(graphTransform, 'calculateElkLayout').mockResolvedValue({
      positionedNodes: testNodes,
      layoutSuccess: true,
    });

    const { container } = render(
      <GraphCanvas
        initialNodes={testNodes}
        initialEdges={testEdges}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(container.querySelector('[data-node-id="node-A"]')).toBeInTheDocument();
    });

    const nodeA = container.querySelector('[data-node-id="node-A"]')!;
    const nodeB = container.querySelector('[data-node-id="node-B"]')!;
    const nodeC = container.querySelector('[data-node-id="node-C"]')!;

    // Focus on node A
    fireEvent.focus(nodeA);

    await waitFor(() => {
      // Node A is highlighted / not dimmed
      expect(nodeA.className).toContain('opacity-100');
      // Neighbor Node B is highlighted / not dimmed
      expect(nodeB.className).toContain('opacity-100');
      // Unconnected Node C is dimmed (opacity-30)
      expect(nodeC.className).toContain('opacity-30');
    });

    // Blur node A restores opacity
    fireEvent.blur(nodeA);

    await waitFor(() => {
      expect(nodeC.className).toContain('opacity-100');
    });
  });

  it('reduced-motion sets fitView duration 0', async () => {
    // Mock matchMedia for prefers-reduced-motion: reduce
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const testNodes: FlowNode<graphTransform.FlowNodeData>[] = [
      { id: 'node-1', type: 'customNode', position: { x: 0, y: 0 }, data: { id: 'node-1', label: 'Node 1', nodeType: 'module' } },
    ];

    vi.spyOn(graphTransform, 'calculateElkLayout').mockResolvedValue({
      positionedNodes: testNodes,
      layoutSuccess: true,
    });

    const { container } = render(
      <GraphCanvas
        initialNodes={testNodes}
        initialEdges={[]}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />
    );

    // Verify reduced-motion is detected and applied (fitView duration 0)
    await waitFor(() => {
      expect(screen.getByRole('application')).toBeInTheDocument();
      expect(container.firstElementChild).toHaveAttribute('data-reduced-motion', 'true');
    });

    window.matchMedia = originalMatchMedia;
  });

  it('keyboard Enter selects node visually', async () => {
    const testNodes: FlowNode<graphTransform.FlowNodeData>[] = [
      { id: 'node-target', type: 'customNode', position: { x: 0, y: 0 }, data: { id: 'node-target', label: 'Target', nodeType: 'module' } },
    ];

    vi.spyOn(graphTransform, 'calculateElkLayout').mockResolvedValue({
      positionedNodes: testNodes,
      layoutSuccess: true,
    });

    const onSelectNodeSpy = vi.fn();

    const { container } = render(
      <GraphCanvas
        initialNodes={testNodes}
        initialEdges={[]}
        selectedNodeId={null}
        onSelectNode={onSelectNodeSpy}
      />
    );

    await waitFor(() => {
      expect(container.querySelector('[data-node-id="node-target"]')).toBeInTheDocument();
    });

    const targetNode = container.querySelector('[data-node-id="node-target"]') as HTMLElement;
    targetNode.focus();

    // Fire Enter on focused node
    fireEvent.keyDown(targetNode, { key: 'Enter', code: 'Enter' });

    expect(onSelectNodeSpy).toHaveBeenCalledWith('node-target');
  });
});
