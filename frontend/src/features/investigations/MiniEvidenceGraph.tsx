import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node as FlowNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowUpRight, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { CustomNode } from '../graph/CustomNode.js';
import { StubNode } from '../graph/StubNode.js';
import { ClusterNode } from '../graph/ClusterNode.js';
import { CustomEdge } from '../graph/CustomEdge.js';
import {
  calculateElkLayout,
  type FlowNodeData,
} from '../graph/graphTransform.js';
import {
  matchEvidenceEdges,
  buildMiniGraph,
  summarizeMiniGraph,
} from './miniGraphPure.js';
import { api, ApiClientError } from '../../lib/api.js';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion.js';
import type {
  GraphResponseData,
  FindingEvidenceItem,
  FindingNode,
} from '../../../../shared/types.js';

const NODE_TYPES = {
  customNode: CustomNode,
  stubNode: StubNode,
  clusterNode: ClusterNode,
};

const EDGE_TYPES = {
  customEdge: CustomEdge,
};

export interface MiniEvidenceGraphProps {
  projectId: string;
  firstNodeId?: string | null;
  findingEvidence?: FindingEvidenceItem[];
  findingNodes?: Array<FindingNode | { id: string; label?: string; type?: string; path?: string }>;
}

const MiniCanvas: React.FC<{
  nodes: FlowNode<FlowNodeData>[];
  edges: any[];
}> = ({ nodes, edges }) => {
  const { fitView } = useReactFlow();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [layoutedNodes, setLayoutedNodes] = useState<FlowNode<FlowNodeData>[]>([]);
  const [isLayouting, setIsLayouting] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    setIsLayouting(true);

    calculateElkLayout(nodes, edges)
      .then(({ positionedNodes }) => {
        if (!cancelled) {
          const withMeasured = positionedNodes.map((n) => ({
            ...n,
            width: n.width || (n.data?.nodeType === 'stub' ? 180 : 220),
            height: n.height || 60,
            measured: {
              width: n.width || (n.data?.nodeType === 'stub' ? 180 : 220),
              height: n.height || 60,
            },
          }));
          setLayoutedNodes(withMeasured);
          setIsLayouting(false);
          setTimeout(() => {
            if (!cancelled) {
              fitView({
                padding: 0.25,
                maxZoom: 1.5,
                duration: prefersReducedMotion ? 0 : 200,
              });
            }
          }, 30);
        }
      })
      .catch(() => {
        if (!cancelled) {
          const withMeasured = nodes.map((n) => ({
            ...n,
            width: n.width || 220,
            height: n.height || 60,
            measured: { width: 220, height: 60 },
          }));
          setLayoutedNodes(withMeasured);
          setIsLayouting(false);
          fitView({ padding: 0.25, maxZoom: 1.5, duration: 0 });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [nodes, edges, fitView, prefersReducedMotion]);

  if (isLayouting) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-theme-bg/30">
        <Skeleton className="w-3/4 h-3/4 rounded-lg" />
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={layoutedNodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      preventScrolling={true}
      proOptions={{ hideAttribution: true }}
      className="bg-theme-bg/40 rounded-lg select-none"
    />
  );
};

export const MiniEvidenceGraph: React.FC<MiniEvidenceGraphProps> = ({
  projectId,
  firstNodeId,
  findingEvidence = [],
  findingNodes = [],
}) => {
  const [graphData, setGraphData] = useState<GraphResponseData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [is404, setIs404] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);

  const fetchGraph = useCallback(() => {
    if (!firstNodeId || !projectId) {
      setIsLoading(false);
      setGraphData(null);
      return () => {};
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    setIs404(false);

    api
      .getGraph(
        projectId,
        { level: 3, focus: firstNodeId, depth: 1 },
        controller.signal
      )
      .then((data) => {
        setGraphData(data);
        setIsLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') {
          return;
        }
        setIsLoading(false);
        if (err instanceof ApiClientError && err.status === 404) {
          setIs404(true);
        } else {
          setError(err.message || 'Failed to load graph');
        }
      });

    return () => {
      controller.abort();
    };
  }, [projectId, firstNodeId, retryCount]);

  useEffect(() => {
    const cancel = fetchGraph();
    return () => {
      cancel();
    };
  }, [fetchGraph]);

  const matchedIds = useMemo(() => {
    return matchEvidenceEdges(findingEvidence, graphData?.edges);
  }, [findingEvidence, graphData]);

  const miniGraph = useMemo(() => {
    return buildMiniGraph(findingNodes, graphData || undefined, matchedIds, 12);
  }, [findingNodes, graphData, matchedIds]);

  const summary = useMemo(() => {
    return summarizeMiniGraph({
      flowNodes: miniGraph.flowNodes,
      flowEdges: miniGraph.flowEdges,
      matchedEdgeIds: miniGraph.matchedEdgeIds,
      omittedCount: miniGraph.omittedCount,
    });
  }, [miniGraph]);

  // Loading state
  if (isLoading) {
    return (
      <div data-testid="mini-graph-loading" className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
    );
  }

  // 404 Friendly Message
  if (is404) {
    return (
      <div data-testid="mini-graph-404" className="p-6 text-center space-y-2">
        <p className="text-xs sm:text-sm text-theme-text-muted">
          Node not found in graph for this finding.
        </p>
      </div>
    );
  }

  // Error State with Retry
  if (error) {
    return (
      <div
        data-testid="mini-graph-error"
        className="p-4 rounded-lg bg-theme-bg border border-theme-border text-center space-y-2.5"
      >
        <div className="flex items-center justify-center gap-1.5 text-xs text-severity-critical">
          <AlertCircle className="w-4 h-4" aria-hidden="true" />
          <span>{error}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setRetryCount((c) => c + 1)}
          className="gap-1.5 mx-auto"
          aria-label="Retry loading mini graph"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  if (!firstNodeId || !graphData || miniGraph.flowNodes.length === 0) {
    return (
      <div data-testid="mini-graph-empty" className="p-4 text-xs text-theme-text-muted text-center italic">
        No linked graph nodes to display.
      </div>
    );
  }

  return (
    <div data-testid="mini-graph-container" className="space-y-3">
      {/* Mini Graph Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {miniGraph.omittedCount > 0 && (
            <span
              data-testid="mini-graph-omitted-badge"
              className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-theme-bg border border-theme-border text-theme-text-muted"
            >
              +{miniGraph.omittedCount} more nodes
            </span>
          )}
          {firstNodeId && (
            <Link
              to={`/app/graph?focus=${encodeURIComponent(firstNodeId)}`}
              data-testid="mini-graph-open-link"
              className="inline-flex items-center gap-1 font-medium text-forest dark:text-lime hover:underline text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime rounded"
            >
              <span>Open in Graph</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-theme-text-muted flex-wrap">
          <div className="flex items-center gap-1.5">
            <span
              className="w-4 h-1 rounded"
              style={{ backgroundColor: 'var(--edge-investigation-path)' }}
              aria-hidden="true"
            />
            <span className="font-medium text-theme-text">Investigation path</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-theme-border border-t border-theme-border" aria-hidden="true" />
            <span>Ordinary</span>
          </div>
        </div>
      </div>

      {/* Read-Only Canvas */}
      <div className="w-full h-64 border border-theme-border rounded-lg overflow-hidden relative shadow-inner">
        <ReactFlowProvider>
          <MiniCanvas nodes={miniGraph.flowNodes} edges={miniGraph.flowEdges} />
        </ReactFlowProvider>
      </div>

      {/* Accessible Text Alternative */}
      <details
        data-testid="mini-graph-text-alternative"
        className="text-xs text-theme-text-muted rounded-lg border border-theme-border/60 p-2.5 bg-theme-bg/30"
      >
        <summary className="cursor-pointer font-medium hover:text-theme-text select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime rounded">
          Text alternative (nodes and edges)
        </summary>
        <div className="mt-2.5 pt-2 border-t border-theme-border/60 space-y-2 text-xs">
          {summary.sentences.map((sent, idx) => (
            <p key={idx} className="text-theme-text leading-relaxed font-medium">
              {sent}
            </p>
          ))}

          <div className="pt-2 border-t border-theme-border/40">
            <h4 className="font-semibold text-theme-text mb-1 text-[11px] uppercase tracking-wider">
              Nodes ({summary.nodeLines.length})
            </h4>
            <ul className="list-disc list-inside space-y-0.5 font-code text-[11px] text-theme-text/80">
              {summary.nodeLines.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="pt-2 border-t border-theme-border/40">
            <h4 className="font-semibold text-theme-text mb-1 text-[11px] uppercase tracking-wider">
              Edges ({summary.edgeLines.length})
            </h4>
            {summary.edgeLines.length === 0 ? (
              <p className="italic text-theme-text-muted text-[11px]">No edges connecting to this file.</p>
            ) : (
              <ul className="list-disc list-inside space-y-0.5 font-code text-[11px] text-theme-text/80">
                {summary.edgeLines.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </details>
    </div>
  );
};

export default MiniEvidenceGraph;
