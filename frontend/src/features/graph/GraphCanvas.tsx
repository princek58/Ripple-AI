import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  useReactFlow,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CustomNode } from './CustomNode.js';
import { StubNode } from './StubNode.js';
import { ClusterNode } from './ClusterNode.js';
import { CustomEdge } from './CustomEdge.js';
import { calculateElkLayout, type FlowNodeData, type FlowEdgeData } from './graphTransform.js';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { AlertCircle } from 'lucide-react';

// Define nodeTypes and edgeTypes OUTSIDE components (stable references)
const NODE_TYPES = {
  customNode: CustomNode,
  stubNode: StubNode,
  clusterNode: ClusterNode,
};

const EDGE_TYPES = {
  customEdge: CustomEdge,
};

export interface GraphCanvasProps {
  initialNodes: FlowNode<FlowNodeData>[];
  initialEdges: FlowEdge<FlowEdgeData>[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  className?: string;
}

const GraphCanvasInner: React.FC<GraphCanvasProps> = ({
  initialNodes,
  initialEdges,
  selectedNodeId,
  onSelectNode,
  className = '',
}) => {
  const [isLayouting, setIsLayouting] = useState<boolean>(true);
  const [layoutFailed, setLayoutFailed] = useState<boolean>(false);
  const [layoutedNodes, setLayoutedNodes] = useState<FlowNode<FlowNodeData>[]>([]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const { fitView } = useReactFlow();
  const prefersReducedMotion = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute layout asynchronously with ELK
  useEffect(() => {
    let isCancelled = false;
    setIsLayouting(true);

    calculateElkLayout(initialNodes, initialEdges)
      .then(({ positionedNodes, layoutSuccess }) => {
        if (!isCancelled) {
          setLayoutedNodes(positionedNodes);
          setLayoutFailed(!layoutSuccess);
          setIsLayouting(false);

          // Fit view after layout computation (reduced motion duration 0)
          setTimeout(() => {
            if (!isCancelled) {
              fitView({ duration: 0, padding: 0.2 });
            }
          }, 30);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLayoutedNodes(initialNodes);
          setLayoutFailed(true);
          setIsLayouting(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [initialNodes, initialEdges, fitView]);

  // Connected nodes & edges calculation for hover/keyboard focus highlight
  const connectedInfo = useMemo(() => {
    if (!hoveredNodeId) {
      return { neighborIds: new Set<string>(), connectedEdgeIds: new Set<string>() };
    }

    const neighborIds = new Set<string>([hoveredNodeId]);
    const connectedEdgeIds = new Set<string>();

    for (const edge of initialEdges) {
      if (edge.source === hoveredNodeId) {
        connectedEdgeIds.add(edge.id);
        neighborIds.add(edge.target);
      } else if (edge.target === hoveredNodeId) {
        connectedEdgeIds.add(edge.id);
        neighborIds.add(edge.source);
      }
    }

    return { neighborIds, connectedEdgeIds };
  }, [hoveredNodeId, initialEdges]);

  // Compute decorated nodes with highlight/dim/select state
  const renderedNodes = useMemo(() => {
    return layoutedNodes.map((node) => {
      const isSelected = node.id === selectedNodeId;
      const isHighlighted = hoveredNodeId
        ? connectedInfo.neighborIds.has(node.id)
        : false;
      const isDimmed = hoveredNodeId
        ? !connectedInfo.neighborIds.has(node.id)
        : false;

      return {
        ...node,
        data: {
          ...node.data,
          isSelected,
          isHighlighted,
          isDimmed,
        },
      };
    });
  }, [layoutedNodes, selectedNodeId, hoveredNodeId, connectedInfo]);

  // Compute decorated edges with highlight/dim state
  const renderedEdges = useMemo(() => {
    return initialEdges.map((edge) => {
      const isHighlighted = hoveredNodeId
        ? connectedInfo.connectedEdgeIds.has(edge.id)
        : false;
      const isDimmed = hoveredNodeId
        ? !connectedInfo.connectedEdgeIds.has(edge.id)
        : false;

      return {
        ...edge,
        data: {
          ...edge.data,
          isHighlighted,
          isDimmed,
        },
      };
    });
  }, [initialEdges, hoveredNodeId, connectedInfo]);

  // Node click handler: marks node selected
  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      onSelectNode(node.id);
    },
    [onSelectNode]
  );

  const onNodeMouseEnter: NodeMouseHandler = useCallback((_event, node) => {
    setHoveredNodeId(node.id);
  }, []);

  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  // Keyboard navigation & accessibility handlers on container
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const active = document.activeElement;
        const nodeId = active?.getAttribute('data-node-id');
        if (nodeId) {
          e.preventDefault();
          onSelectNode(nodeId);
        }
      }
    },
    [onSelectNode]
  );

  const handleFocus = useCallback((e: React.FocusEvent) => {
    const nodeId = (e.target as HTMLElement)?.getAttribute('data-node-id');
    if (nodeId) {
      setHoveredNodeId(nodeId);
    }
  }, []);

  const handleBlur = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const showMinimap = renderedNodes.length > 50;
  const onlyRenderVisible = renderedNodes.length > 200;

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      onFocusCapture={handleFocus}
      onBlurCapture={handleBlur}
      className={`relative w-full h-full min-h-[400px] select-none ${className}`}
    >
      {/* Fallback layout alert banner */}
      {layoutFailed && (
        <div
          data-testid="autolayout-unavailable-alert"
          role="status"
          className="absolute top-3 left-3 z-30 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-theme-surface border border-theme-border text-xs text-theme-text shadow-md"
        >
          <AlertCircle className="w-4 h-4 text-theme-text-muted" aria-hidden="true" />
          <span>Auto-layout unavailable</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLayouting && (
        <div
          data-testid="graph-layout-skeleton"
          className="absolute inset-0 z-20 flex items-center justify-center bg-theme-background/60 backdrop-blur-[2px]"
        >
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="w-48 h-6 rounded-lg" />
            <Skeleton className="w-32 h-4 rounded-lg" />
          </div>
        </div>
      )}

      <ReactFlow
        nodes={renderedNodes}
        edges={renderedEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        onlyRenderVisibleElements={onlyRenderVisible}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        fitView={true}
        fitViewOptions={{
          duration: prefersReducedMotion ? 0 : 0,
          padding: 0.2,
        }}
        proOptions={{ hideAttribution: true }}
        aria-label="Interactive architecture dependency graph"
        className="w-full h-full bg-theme-background"
      >
        <Controls
          showInteractive={false}
          className="!bg-theme-surface !border !border-theme-border !shadow-md !rounded-lg !overflow-hidden [&>button]:!bg-theme-surface [&>button]:!border-b [&>button]:!border-theme-border [&>button]:!text-theme-text hover:[&>button]:!bg-theme-surface-active"
        />
        {showMinimap && (
          <MiniMap
            pannable
            zoomable
            nodeStrokeColor="var(--theme-border)"
            nodeColor="var(--theme-surface-active)"
            maskColor="var(--theme-surface)"
            className="!bg-theme-surface !border !border-theme-border !rounded-lg !shadow-md"
          />
        )}
      </ReactFlow>
    </div>
  );
};

export const GraphCanvas: React.FC<GraphCanvasProps> = (props) => {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
};
