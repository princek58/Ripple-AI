import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { Position, ReactFlowProvider, useStoreApi } from '@xyflow/react';

const TestFlowWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useStoreApi();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (ref.current) {
      store.setState({ domNode: ref.current });
    }
  }, [store]);
  return (
    <div ref={ref} className="react-flow">
      <div className="react-flow__edgelabel-renderer" />
      <svg>{children}</svg>
    </div>
  );
};
import { FindingDetail } from '../features/investigations/FindingDetail.js';
import { MiniEvidenceGraph } from '../features/investigations/MiniEvidenceGraph.js';
import { CustomEdge } from '../features/graph/CustomEdge.js';
import { api, ApiClientError } from '../lib/api.js';
import type { FindingDetailData, GraphResponseData } from '../../../shared/types.js';

// Real captures
import brokenImportFinding from './fixtures/api/l4_finding_detail_broken_import.json';
import brokenImportGraph from './fixtures/api/l4_graph_broken_import.json';

import circularDepFinding from './fixtures/api/l4_finding_detail_circular_dependency.json';
import circularDepGraph from './fixtures/api/l4_graph_circular_dependency.json';

import isolatedFileFinding from './fixtures/api/l4_finding_detail_isolated_file.json';
import isolatedFileGraph from './fixtures/api/l4_graph_isolated_file.json';

import apiUnmatchedFinding from './fixtures/api/l4_finding_detail_api_unmatched_call.json';
import apiUnmatchedGraph from './fixtures/api/l4_graph_api_unmatched_call.json';

describe('Mini Evidence Graph UI (Step 14 Part 2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CustomEdge investigation path rendering', () => {
    it('draws thicker stroke (3.5), semantic token color, and "Investigation path" text label when isInvestigationPath is true', () => {
      render(
        <ReactFlowProvider>
          <TestFlowWrapper>
            <CustomEdge
              id="edge-test-1"
              source="node-a"
              target="node-b"
              sourceX={0}
              sourceY={0}
              targetX={200}
              targetY={100}
              sourcePosition={Position.Right}
              targetPosition={Position.Left}
              data={{
                id: 'edge-test-1',
                relation: 'imports',
                status: 'unresolved',
                isInvestigationPath: true,
              }}
            />
          </TestFlowWrapper>
        </ReactFlowProvider>
      );

      // Thicker stroke and token color on edge path
      const pathEl = document.querySelector('path.react-flow__edge-path') as SVGPathElement;
      expect(pathEl).toBeInTheDocument();
      expect(pathEl.style.stroke).toBe('var(--edge-investigation-path)');
      expect(pathEl.style.strokeWidth).toBe('3.5');

      // Investigation path text label
      const label = screen.getByTestId('edge-investigation-path-label-edge-test-1');
      expect(label).toBeInTheDocument();
      expect(label).toHaveTextContent('Investigation path');
    });

    it('draws standard stroke (1.5) without investigation path label when isInvestigationPath is false', () => {
      render(
        <svg>
          <CustomEdge
            id="edge-test-2"
            source="node-a"
            target="node-b"
            sourceX={0}
            sourceY={0}
            targetX={200}
            targetY={100}
            sourcePosition={Position.Right}
            targetPosition={Position.Left}
            data={{
              id: 'edge-test-2',
              relation: 'imports',
              status: 'resolved',
              isInvestigationPath: false,
            }}
          />
        </svg>
      );

      const pathEl = document.querySelector('path.react-flow__edge-path') as SVGPathElement;
      expect(pathEl).toBeInTheDocument();
      expect(pathEl.style.strokeWidth).toBe('1.5');
      expect(screen.queryByTestId('edge-investigation-path-label-edge-test-2')).not.toBeInTheDocument();
    });
  });

  describe('FindingDetail & MiniEvidenceGraph Component Integration', () => {
    it('the Evidence path card is closed by default and fetches only after opening', async () => {
      const getGraphSpy = vi.spyOn(api, 'getGraph').mockResolvedValue(brokenImportGraph.data as any);

      render(
        <MemoryRouter>
          <FindingDetail finding={brokenImportFinding.data as unknown as FindingDetailData} />
        </MemoryRouter>
      );

      const detailsCard = screen.getByTestId('evidence-path-card') as HTMLDetailsElement;
      expect(detailsCard.open).toBe(false);

      // Endpoint must NOT be called before user opens the card
      expect(getGraphSpy).not.toHaveBeenCalled();

      // User opens the details card by clicking summary
      fireEvent.click(screen.getByTestId('evidence-path-summary'));

      await waitFor(() => {
        expect(getGraphSpy).toHaveBeenCalledWith(
          brokenImportFinding.data.project_id,
          {
            level: 3,
            focus: brokenImportFinding.data.nodes[0].id,
            depth: 1,
          },
          expect.any(AbortSignal)
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('mini-graph-container')).toBeInTheDocument();
      });
    });

    it('broken_import finding highlights the unresolved fees.js to feeService edge and shows "Investigation path" label', async () => {
      vi.spyOn(api, 'getGraph').mockResolvedValue(brokenImportGraph.data as any);

      render(
        <MemoryRouter>
          <MiniEvidenceGraph
            projectId={brokenImportFinding.data.project_id}
            firstNodeId={brokenImportFinding.data.nodes[0].id}
            findingEvidence={brokenImportFinding.data.evidence as any}
            findingNodes={brokenImportFinding.data.nodes as any}
          />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('mini-graph-container')).toBeInTheDocument();
      });

      // Check legend label
      expect(screen.getByText('Investigation path')).toBeInTheDocument();

      // Check Open in Graph link
      const openLink = screen.getByTestId('mini-graph-open-link');
      expect(openLink).toHaveAttribute('href', `/app/graph?focus=${brokenImportFinding.data.nodes[0].id}`);

      // Check text alternative mentions the unresolved stub and investigation path
      const textAlt = screen.getByTestId('mini-graph-text-alternative');
      expect(textAlt).toHaveTextContent('Investigation path:');
      expect(textAlt).toHaveTextContent('fees.js');
      expect(textAlt).toHaveTextContent('Unresolved: feeService');
      expect(textAlt).toHaveTextContent('(Investigation path)');
    });

    it('circular_dependency highlights both reciprocal import edges in text alternative and legend', async () => {
      vi.spyOn(api, 'getGraph').mockResolvedValue(circularDepGraph.data as any);

      render(
        <MemoryRouter>
          <MiniEvidenceGraph
            projectId={circularDepFinding.data.project_id}
            firstNodeId={circularDepFinding.data.nodes[0].id}
            findingEvidence={circularDepFinding.data.evidence as any}
            findingNodes={circularDepFinding.data.nodes as any}
          />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('mini-graph-container')).toBeInTheDocument();
      });

      expect(screen.getByText('Investigation path')).toBeInTheDocument();

      const textAlt = screen.getByTestId('mini-graph-text-alternative');
      expect(textAlt).toHaveTextContent('helpers.js');
      expect(textAlt).toHaveTextContent('format.js');
      // Both edges are marked on the investigation path
      expect(textAlt).toHaveTextContent('Investigation path: helpers.js imports format.js');
      expect(textAlt).toHaveTextContent('Investigation path: format.js imports helpers.js');
    });

    it('isolated_file shows "no other file connects to this file" sentence and no highlight', async () => {
      vi.spyOn(api, 'getGraph').mockResolvedValue(isolatedFileGraph.data as any);

      render(
        <MemoryRouter>
          <MiniEvidenceGraph
            projectId={isolatedFileFinding.data.project_id}
            firstNodeId={isolatedFileFinding.data.nodes[0].id}
            findingEvidence={isolatedFileFinding.data.evidence as any}
            findingNodes={isolatedFileFinding.data.nodes as any}
          />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('mini-graph-container')).toBeInTheDocument();
      });

      const textAlt = screen.getByTestId('mini-graph-text-alternative');
      expect(textAlt).toHaveTextContent('No other file connects to this file.');
      expect(textAlt).not.toHaveTextContent('Investigation path:');
    });

    it('api_unmatched_call shows the honest sentence when no edge matches', async () => {
      vi.spyOn(api, 'getGraph').mockResolvedValue(apiUnmatchedGraph.data as any);

      render(
        <MemoryRouter>
          <MiniEvidenceGraph
            projectId={apiUnmatchedFinding.data.project_id}
            firstNodeId={apiUnmatchedFinding.data.nodes[0].id}
            findingEvidence={apiUnmatchedFinding.data.evidence as any}
            findingNodes={apiUnmatchedFinding.data.nodes as any}
          />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('mini-graph-container')).toBeInTheDocument();
      });

      const textAlt = screen.getByTestId('mini-graph-text-alternative');
      expect(textAlt).toHaveTextContent('No edge matches this evidence.');
      expect(textAlt).not.toHaveTextContent('Investigation path:');
    });

    it('displays "+N more nodes" badge when graph has more than 12 nodes', async () => {
      const baseGraph = circularDepGraph.data as any;
      const extraNodes = Array.from({ length: 13 }, (_, i) => ({
        id: `node-extra-${i}`,
        project_id: baseGraph.nodes[0].project_id,
        scan_id: baseGraph.nodes[0].scan_id,
        type: 'backend',
        level: 3,
        parent_id: null,
        label: `extra-${i}.js`,
        path: `src/extra-${i}.js`,
        line_start: null,
        line_end: null,
        language: 'JavaScript',
        meta_json: null,
        findingCount: 0,
        maxSeverity: null,
      }));

      const bigGraph: GraphResponseData = {
        ...baseGraph,
        nodes: [...baseGraph.nodes, ...extraNodes],
        total: baseGraph.nodes.length + extraNodes.length,
        shown: 12,
      };

      vi.spyOn(api, 'getGraph').mockResolvedValue(bigGraph);

      render(
        <MemoryRouter>
          <MiniEvidenceGraph
            projectId={circularDepFinding.data.project_id}
            firstNodeId={circularDepFinding.data.nodes[0].id}
            findingEvidence={circularDepFinding.data.evidence as any}
            findingNodes={circularDepFinding.data.nodes as any}
          />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('mini-graph-omitted-badge')).toBeInTheDocument();
      });

      const badge = screen.getByTestId('mini-graph-omitted-badge');
      expect(badge).toHaveTextContent('+4 more nodes');
    });

    it('aborts the in-flight graph request when finding changes', async () => {
      let capturedSignal: AbortSignal | undefined;
      vi.spyOn(api, 'getGraph').mockImplementation((_pid, _query, signal) => {
        capturedSignal = signal;
        return new Promise(() => {}); // never resolves to keep pending
      });

      const { rerender } = render(
        <MemoryRouter>
          <FindingDetail finding={brokenImportFinding.data as unknown as FindingDetailData} />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByTestId('evidence-path-summary'));

      await waitFor(() => {
        expect(capturedSignal).toBeDefined();
      });
      expect(capturedSignal?.aborted).toBe(false);

      // Switch finding
      rerender(
        <MemoryRouter>
          <FindingDetail finding={circularDepFinding.data as unknown as FindingDetailData} />
        </MemoryRouter>
      );

      // Previous request signal must be aborted
      expect(capturedSignal?.aborted).toBe(true);
    });

    it('renders error state with Retry button and retries successfully', async () => {
      const getGraphSpy = vi
        .spyOn(api, 'getGraph')
        .mockRejectedValueOnce(new Error('Network error on graph'))
        .mockResolvedValueOnce(brokenImportGraph.data as any);

      render(
        <MemoryRouter>
          <MiniEvidenceGraph
            projectId={brokenImportFinding.data.project_id}
            firstNodeId={brokenImportFinding.data.nodes[0].id}
            findingEvidence={brokenImportFinding.data.evidence as any}
            findingNodes={brokenImportFinding.data.nodes as any}
          />
        </MemoryRouter>
      );

      // Error state appears
      await waitFor(() => {
        expect(screen.getByTestId('mini-graph-error')).toBeInTheDocument();
      });
      expect(screen.getByText('Network error on graph')).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      expect(retryBtn).toBeInTheDocument();

      // Click retry
      fireEvent.click(retryBtn);

      // Second call resolves successfully
      await waitFor(() => {
        expect(screen.getByTestId('mini-graph-container')).toBeInTheDocument();
      });
      expect(getGraphSpy).toHaveBeenCalledTimes(2);
    });

    it('handles 404 response with friendly message', async () => {
      vi.spyOn(api, 'getGraph').mockRejectedValueOnce(new ApiClientError('Node not found', 404, 'NOT_FOUND'));

      render(
        <MemoryRouter>
          <MiniEvidenceGraph
            projectId={brokenImportFinding.data.project_id}
            firstNodeId={brokenImportFinding.data.nodes[0].id}
            findingEvidence={brokenImportFinding.data.evidence as any}
            findingNodes={brokenImportFinding.data.nodes as any}
          />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('mini-graph-404')).toBeInTheDocument();
      });
      expect(screen.getByText('Node not found in graph for this finding.')).toBeInTheDocument();
    });
  });
});
