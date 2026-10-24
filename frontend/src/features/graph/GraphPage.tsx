import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AlertCircle, RefreshCw, FolderOpen, ArrowLeft, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useProjects } from '../../lib/projectContext.js';
import { isNeverScanned } from '../../lib/scanState.js';
import { api, ApiClientError, getFriendlyErrorMessage } from '../../lib/api.js';
import { useRescan } from '../../lib/useRescan.js';
import { Button } from '../../components/ui/Button.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { GraphCanvas } from './GraphCanvas.js';
import { ShownCounter } from './ShownCounter.js';
import { GraphLegendContent } from './GraphLegend.js';
import { GraphTextAlternative } from './GraphTextAlternative.js';
import { GraphBreadcrumb } from './GraphBreadcrumb.js';
import { GraphSearchFilters } from './GraphSearchFilters.js';
import { NodeDetailsPanel } from './NodeDetailsPanel.js';
import {
  responseToFlow,
  parseGraphUrl,
  resolveLevelFromNodeType,
  type FlowTransformResult,
} from './graphTransform.js';
import type {
  GraphResponseData,
  NodeDetailsData,
  GraphNode,
} from '../../../../shared/types.js';

export const GraphPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { selectedProject, selectedProjectId, projects, isLoading: isProjectsLoading } =
    useProjects();
  const { rescan, isScanning } = useRescan();

  // URL state
  const { focus: urlFocus, level: urlLevel, depth: urlDepth } = useMemo(
    () => parseGraphUrl(searchParams),
    [searchParams]
  );

  // Component state
  const [graphData, setGraphData] = useState<GraphResponseData | null>(null);
  const [isGraphLoading, setIsGraphLoading] = useState<boolean>(true);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [is404Focus, setIs404Focus] = useState<boolean>(false);
  const [focusNodeDetails, setFocusNodeDetails] = useState<NodeDetailsData | null>(null);
  const [maxNodes, setMaxNodes] = useState<number>(50);
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(false);

  // References to handle project switching and race conditions
  const activeAbortRef = useRef<AbortController | null>(null);
  const previousProjectIdRef = useRef<string | null>(selectedProjectId);

  // Reset URL to Level 1 and abort on project switch
  useEffect(() => {
    if (
      previousProjectIdRef.current &&
      selectedProjectId &&
      previousProjectIdRef.current !== selectedProjectId
    ) {
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
      }
      navigate('/app/graph', { replace: true });
      setSelectedNodeId(null);
      setIs404Focus(false);
      setFocusNodeDetails(null);
      setMaxNodes(50);
    }
    previousProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId, navigate]);

  // Fetch graph and resolve missing level if focus without level
  const fetchGraphData = useCallback(async () => {
    if (!selectedProjectId) return;

    if (isNeverScanned(selectedProject)) {
      setIsGraphLoading(false);
      return;
    }

    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortRef.current = controller;

    setIsGraphLoading(true);
    setGraphError(null);
    setIs404Focus(false);

    try {
      // Case 1: Focus provided without level (e.g. from Overview screen link)
      if (urlFocus && urlLevel === null) {
        try {
          const details = await api.getNodeDetails(
            selectedProjectId,
            urlFocus,
            controller.signal
          );
          if (controller.signal.aborted) return;

          const { level, depth } = resolveLevelFromNodeType(details.node.type);
          if (level === 2) {
            setSearchParams({ focus: urlFocus, level: '2' }, { replace: true });
          } else {
            setSearchParams(
              { focus: urlFocus, level: '3', depth: String(depth) },
              { replace: true }
            );
          }
          return;
        } catch (err: unknown) {
          if (controller.signal.aborted) return;
          if (err instanceof ApiClientError && err.status === 404) {
            setIs404Focus(true);
            setIsGraphLoading(false);
            return;
          }
          throw err;
        }
      }

      // Case 2: Standard fetch
      const effectiveLevel = urlLevel ?? 1;
      const queryParams: {
        level?: number;
        focus?: string;
        depth?: number;
        maxNodes?: number;
      } = {
        level: effectiveLevel,
        maxNodes,
      };

      if (urlFocus && effectiveLevel > 1) {
        queryParams.focus = urlFocus;
      }
      if (effectiveLevel === 3) {
        queryParams.depth = urlDepth;
      }

      const data = await api.getGraph(selectedProjectId, queryParams, controller.signal);
      if (!controller.signal.aborted) {
        setGraphData(data);
        setIsGraphLoading(false);
      }

      // Fetch node details for focus node to populate breadcrumb
      if (urlFocus && effectiveLevel > 1) {
        try {
          const details = await api.getNodeDetails(
            selectedProjectId,
            urlFocus,
            controller.signal
          );
          if (!controller.signal.aborted) {
            setFocusNodeDetails(details);
          }
        } catch {
          // Ignore breadcrumb detail fetch failure
        }
      } else {
        setFocusNodeDetails(null);
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return;

      if (err instanceof ApiClientError && err.status === 404) {
        setIs404Focus(true);
      } else {
        const friendly = getFriendlyErrorMessage(err);
        setGraphError(friendly);
      }
      setIsGraphLoading(false);
    }
  }, [selectedProjectId, selectedProject, urlFocus, urlLevel, urlDepth, maxNodes, setSearchParams]);

  useEffect(() => {
    if (selectedProjectId) {
      fetchGraphData();
    }
  }, [selectedProjectId, fetchGraphData]);

  // Transform graph data into React Flow nodes and edges
  const flowResult: FlowTransformResult = useMemo(() => {
    if (!graphData) {
      return {
        flowNodes: [],
        flowEdges: [],
        unmappedEdges: [],
        stubsCount: 0,
        clustersCount: 0,
      };
    }
    return responseToFlow(graphData, { focusNodeId: urlFocus });
  }, [graphData, urlFocus]);

  // Search result selection handler
  const handleSelectSearchResult = useCallback(
    (node: GraphNode) => {
      const { level, depth } = resolveLevelFromNodeType(node.type);
      if (level === 2) {
        navigate(`/app/graph?level=2&focus=${node.id}`);
      } else {
        navigate(`/app/graph?level=3&focus=${node.id}&depth=${depth}`);
      }
    },
    [navigate]
  );

  // Node selection handler: marks selected node
  const handleSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  // Node expand handler
  const handleExpandNode = useCallback(
    (nodeId: string, nodeType: string, depth = 1) => {
      setSelectedNodeId(null);
      if (nodeType === 'module') {
        navigate(`/app/graph?level=2&focus=${nodeId}`);
      } else {
        const clampedDepth = Math.max(1, Math.min(3, depth));
        navigate(`/app/graph?level=3&focus=${nodeId}&depth=${clampedDepth}`);
      }
    },
    [navigate]
  );

  // Double click handler on canvas node
  const handleDoubleClickNode = useCallback(
    (nodeId: string, nodeType?: string) => {
      if (nodeType === 'module') {
        navigate(`/app/graph?level=2&focus=${nodeId}`);
      } else {
        navigate(`/app/graph?level=3&focus=${nodeId}&depth=1`);
      }
    },
    [navigate]
  );

  // 1. Projects loading state
  if (isProjectsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  // 2. Empty state: No projects exist
  if (!projects || projects.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          title="Upload your first project"
          description="Analyze codebase dependencies, services, and architecture by uploading a project archive."
          action={
            <Button
              variant="primary"
              size="md"
              data-testid="upload-first-project-graph-btn"
              onClick={() => navigate('/app/projects')}
            >
              <FolderOpen className="w-4 h-4 mr-2" aria-hidden="true" />
              Upload Project
            </Button>
          }
        />
      </div>
    );
  }

  // 3. Never scanned state
  const neverScanned = isNeverScanned(selectedProject);
  if (neverScanned && selectedProject) {
    return (
      <div className="p-6">
        <div
          data-testid="never-scanned-graph-state"
          className="flex flex-col items-center justify-center text-center p-12 rounded-2xl border border-theme-border bg-theme-surface shadow-sm space-y-4 max-w-lg mx-auto mt-12"
        >
          <div className="w-12 h-12 rounded-full bg-theme-surface-active border border-theme-border flex items-center justify-center text-theme-text-muted">
            <RefreshCw className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-heading font-semibold text-theme-text">
              Not scanned yet
            </h2>
            <p className="text-sm text-theme-text-muted">
              Project <strong className="text-theme-text font-medium">{selectedProject.name}</strong> has not been analyzed yet. Run a scan to view its dependency graph.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            data-testid="rescan-graph-btn"
            disabled={isScanning}
            onClick={() => rescan(selectedProject.id, fetchGraphData)}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${isScanning ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {isScanning ? 'Scanning...' : 'Re-scan'}
          </Button>
        </div>
      </div>
    );
  }

  // 4. 404 Node Error State
  if (is404Focus) {
    return (
      <div className="p-6">
        <div
          data-testid="node-404-state"
          className="flex flex-col items-center justify-center text-center p-12 rounded-2xl border border-theme-border bg-theme-surface shadow-sm space-y-4 max-w-lg mx-auto mt-12"
        >
          <div className="w-12 h-12 rounded-full bg-theme-surface-active border border-theme-border flex items-center justify-center text-theme-text-muted">
            <AlertCircle className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-heading font-semibold text-theme-text">
              This node is not in the selected project
            </h2>
            <p className="text-sm text-theme-text-muted">
              The requested focus node ID does not exist in project{' '}
              <strong className="text-theme-text font-medium">{selectedProject?.name}</strong>.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            data-testid="back-to-level1-btn"
            onClick={() => {
              setIs404Focus(false);
              navigate('/app/graph');
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
            Back to Level 1
          </Button>
        </div>
      </div>
    );
  }

  // 5. General Error State
  if (graphError) {
    return (
      <div className="p-6">
        <ErrorState
          title="Could not load dependency graph"
          message={graphError}
          onRetry={fetchGraphData}
        />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-4rem)] overflow-y-auto bg-theme-background">
      {/* Top Bar: Breadcrumb, ShownCounter, Search & Filters */}
      <header className="flex-shrink-0 border-b border-theme-border bg-theme-surface/80 backdrop-blur-md px-4 py-2.5 z-20 flex flex-col gap-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-heading font-bold text-lg text-theme-text">
              Dependency Graph
            </h1>
            <span className="text-xs text-theme-text-muted font-mono">
              {urlLevel ? `Level ${urlLevel}` : 'Level 1'}
            </span>
            <GraphBreadcrumb
              project={selectedProject}
              parentModule={focusNodeDetails?.parentModule ?? null}
              currentNode={focusNodeDetails?.node ?? null}
              currentLevel={urlLevel ?? 1}
            />
          </div>

          <div className="flex items-center gap-2">
            {flowResult.clustersCount > 0 && (
              <div className="flex items-center gap-2">
                {maxNodes < 500 ? (
                  <button
                    type="button"
                    data-testid="show-more-clusters-btn"
                    onClick={() => setMaxNodes((prev) => Math.min(500, prev + 50))}
                    className="px-2.5 py-1 rounded-lg border border-theme-border bg-theme-surface hover:bg-theme-surface-active text-theme-text font-medium text-xs transition-colors"
                  >
                    Show more
                  </button>
                ) : (
                  <span
                    data-testid="max-nodes-reached-note"
                    className="text-theme-text-muted text-[11px]"
                  >
                    Maximum nodes reached (500). Clusters retained for remaining nodes.
                  </span>
                )}
              </div>
            )}
            <ShownCounter
              shown={graphData?.shown ?? flowResult.flowNodes.length}
              total={graphData?.total ?? flowResult.flowNodes.length}
              clustersCount={flowResult.clustersCount}
            />
          </div>
        </div>

        {/* Search & Filters and Legend Toggle */}
        {selectedProjectId && (
          <div className="pt-0.5 flex items-center justify-between flex-wrap gap-2">
            <div className="flex-1 min-w-0 sm:min-w-[280px]">
              <GraphSearchFilters
                projectId={selectedProjectId}
                onSelectResult={handleSelectSearchResult}
              />
            </div>
            <button
              type="button"
              data-testid="toggle-legend-btn"
              onClick={() => setIsLegendOpen((prev) => !prev)}
              aria-expanded={isLegendOpen}
              aria-controls="graph-legend-panel"
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors select-none ${
                isLegendOpen
                  ? 'bg-theme-surface-active border-theme-primary text-theme-primary'
                  : 'bg-theme-surface border-theme-border text-theme-text hover:bg-theme-surface-active'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5 text-theme-text-muted" aria-hidden="true" />
              <span>Legend</span>
              {isLegendOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-theme-text-muted" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-theme-text-muted" aria-hidden="true" />
              )}
            </button>
          </div>
        )}

        {/* Legend panel below toolbar */}
        {isLegendOpen && (
          <div
            id="graph-legend-panel"
            data-testid="graph-legend"
            className="p-3.5 rounded-xl border border-theme-border bg-theme-surface shadow-sm text-xs mt-1"
          >
            <GraphLegendContent />
          </div>
        )}
      </header>

      {/* Main Canvas Area */}
      <main className="relative w-full h-[clamp(420px,65vh,720px)] flex-shrink-0">
        {isGraphLoading ? (
          <div className="w-full h-full flex items-center justify-center p-8">
            <div className="flex flex-col items-center gap-3">
              <Skeleton className="w-64 h-8 rounded-xl" />
              <Skeleton className="w-48 h-4 rounded-lg" />
              <Skeleton className="w-96 h-64 rounded-2xl mt-4" />
            </div>
          </div>
        ) : (
          <>
            <GraphCanvas
              initialNodes={flowResult.flowNodes}
              initialEdges={flowResult.flowEdges}
              selectedNodeId={selectedNodeId}
              onSelectNode={handleSelectNode}
              onDoubleClickNode={handleDoubleClickNode}
              isPanelOpen={Boolean(selectedNodeId || isLegendOpen)}
              className="w-full h-full"
            />

            {/* Node Details Panel */}
            {selectedProjectId && (
              <NodeDetailsPanel
                projectId={selectedProjectId}
                nodeId={selectedNodeId}
                onClose={() => setSelectedNodeId(null)}
                onNavigateNode={(id) => setSelectedNodeId(id)}
                onExpand={handleExpandNode}
                onBackToLevel1={() => {
                  setSelectedNodeId(null);
                  navigate('/app/graph');
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Accessible Text Alternative (Collapsible card at bottom) */}
      <footer className="flex-shrink-0 px-4 pt-4 pb-12 max-w-7xl w-full mx-auto">
        <GraphTextAlternative
          flowNodes={flowResult.flowNodes}
          flowEdges={flowResult.flowEdges}
          unmappedEdges={flowResult.unmappedEdges}
          clustersCount={flowResult.clustersCount}
        />
      </footer>
    </div>
  );
};

export default GraphPage;
