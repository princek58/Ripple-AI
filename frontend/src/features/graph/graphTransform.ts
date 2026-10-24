import ELK from 'elkjs/lib/elk.bundled.js';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
import type {
  GraphResponseData,
  GraphNode,
  GraphEdge,
  NodeType,
  FindingSeverity,
  FindingConfidence,
  Project,
} from '../../../../shared/types.js';

export interface FlowNodeData extends Record<string, unknown> {
  id: string;
  label: string;
  nodeType: NodeType | 'stub' | 'cluster';
  rawNode?: GraphNode;
  findingCount?: number;
  maxSeverity?: FindingSeverity | null;
  clusterCount?: number;
  sampleNodeIds?: string[];
  specifier?: string;
  isFocused?: boolean;
  isDimmed?: boolean;
  isHighlighted?: boolean;
  isSelected?: boolean;
}

export interface FlowEdgeData extends Record<string, unknown> {
  id: string;
  relation: string;
  status: 'resolved' | 'possible' | 'unresolved';
  confidence?: FindingConfidence;
  count?: number;
  derived?: boolean;
  isDimmed?: boolean;
  isHighlighted?: boolean;
}

export interface FlowTransformResult {
  flowNodes: FlowNode<FlowNodeData>[];
  flowEdges: FlowEdge<FlowEdgeData>[];
  unmappedEdges: GraphEdge[];
  stubsCount: number;
  clustersCount: number;
}

/**
 * Extracts a readable module/file name from an import/specifier path.
 * e.g. "../services/feeService" -> "feeService"
 */
export function extractStubName(specifier: string): string {
  if (!specifier) return 'unknown';
  const clean = specifier.replace(/\\/g, '/');
  const parts = clean.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || specifier;
  return last.replace(/\.[a-zA-Z0-9]+$/, '');
}

/**
 * Transforms real API graph response data into React Flow nodes and edges,
 * creating stub nodes for unresolved references and cluster nodes for clusters.
 * Collects unmapped boundary edges rather than dropping them silently.
 */
export function responseToFlow(
  graphData: GraphResponseData,
  options?: { focusNodeId?: string | null }
): FlowTransformResult {
  const flowNodes: FlowNode<FlowNodeData>[] = [];
  const flowEdges: FlowEdge<FlowEdgeData>[] = [];
  const unmappedEdges: GraphEdge[] = [];

  const existingNodeIds = new Set<string>();

  // 1. Regular Graph Nodes
  for (const node of graphData.nodes) {
    existingNodeIds.add(node.id);
    const isFocused = Boolean(
      node.focused || (options?.focusNodeId && node.id === options.focusNodeId)
    );
    flowNodes.push({
      id: node.id,
      type: 'customNode',
      position: { x: 0, y: 0 },
      data: {
        id: node.id,
        label: node.label,
        nodeType: node.type,
        rawNode: node,
        findingCount: node.findingCount || 0,
        maxSeverity: node.maxSeverity || null,
        isFocused,
      },
    });
  }

  // 2. Clusters
  let clustersCount = 0;
  if (Array.isArray(graphData.clusters)) {
    for (const cluster of graphData.clusters) {
      existingNodeIds.add(cluster.id);
      clustersCount += cluster.count;
      flowNodes.push({
        id: cluster.id,
        type: 'clusterNode',
        position: { x: 0, y: 0 },
        data: {
          id: cluster.id,
          label: cluster.label,
          nodeType: 'cluster',
          clusterCount: cluster.count,
          sampleNodeIds: cluster.sample_node_ids,
        },
      });
    }
  }

  // 3. Edges & Unresolved Stubs
  let stubsCount = 0;
  const createdStubs = new Map<string, string>(); // specifier/key -> stubNodeId

  for (const edge of graphData.edges) {
    const isUnresolved = edge.status === 'unresolved';

    if (isUnresolved) {
      const evidence = (edge.evidence || {}) as { specifier?: string };
      const specifier = evidence.specifier || '';
      const stubName = extractStubName(specifier);
      const stubKey = specifier || edge.id;

      let stubId = createdStubs.get(stubKey);
      if (!stubId) {
        stubId = `stub:${stubKey}`;
        createdStubs.set(stubKey, stubId);
        existingNodeIds.add(stubId);
        stubsCount++;

        flowNodes.push({
          id: stubId,
          type: 'stubNode',
          position: { x: 0, y: 0 },
          data: {
            id: stubId,
            label: `Unresolved: ${stubName}`,
            nodeType: 'stub',
            specifier,
          },
        });
      }

      // Check if source node exists
      if (existingNodeIds.has(edge.source_id)) {
        flowEdges.push({
          id: edge.id,
          type: 'customEdge',
          source: edge.source_id,
          target: stubId,
          data: {
            id: edge.id,
            relation: edge.relation,
            status: 'unresolved',
            confidence: edge.confidence,
            count: edge.count,
            derived: edge.derived,
          },
        });
      } else {
        unmappedEdges.push(edge);
      }
      continue;
    }

    // Normal resolved or possible edge
    const sourceExists = existingNodeIds.has(edge.source_id);
    const targetExists = existingNodeIds.has(edge.target_id);

    if (sourceExists && targetExists) {
      flowEdges.push({
        id: edge.id,
        type: 'customEdge',
        source: edge.source_id,
        target: edge.target_id,
        data: {
          id: edge.id,
          relation: edge.relation,
          status: edge.status,
          confidence: edge.confidence,
          count: edge.count,
          derived: edge.derived,
        },
      });
    } else {
      // Unmapped boundary or foreign edge
      unmappedEdges.push(edge);
    }
  }

  return {
    flowNodes,
    flowEdges,
    unmappedEdges,
    stubsCount,
    clustersCount,
  };
}

/**
 * Builds layout graph object for ELK layered algorithm
 */
export function buildElkInput(
  flowNodes: FlowNode<FlowNodeData>[],
  flowEdges: FlowEdge<FlowEdgeData>[]
) {
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.spacing.nodeNode': '60',
      'elk.spacing.componentComponent': '80',
      'elk.layered.spacing.edgeNodeBetweenLayers': '40',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.edgeRouting': 'SPLINES',
    },
    children: flowNodes.map((n) => {
      let width = 220;
      let height = 72;
      if (n.type === 'clusterNode') {
        width = 220;
        height = 80;
      } else if (n.type === 'stubNode') {
        width = 180;
        height = 56;
      } else if (n.data?.isFocused) {
        height = 80;
      }
      return {
        id: n.id,
        width,
        height,
      };
    }),
    edges: flowEdges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };
}

// In-memory cache for deterministic ELK layouts across re-renders
const layoutCache = new Map<string, Record<string, { x: number; y: number }>>();

export function getLayoutCacheKey(
  flowNodes: FlowNode<FlowNodeData>[],
  flowEdges: FlowEdge<FlowEdgeData>[]
): string {
  const nodeKeys = flowNodes.map((n) => n.id).sort().join(',');
  const edgeKeys = flowEdges.map((e) => `${e.source}->${e.target}`).sort().join(',');
  return `${nodeKeys}|${edgeKeys}`;
}

export function clearLayoutCache(): void {
  layoutCache.clear();
}

/**
 * Computes deterministic layered layout with ELK.
 * Falls back to simple grid if ELK layout throws, returning layoutSuccess: false.
 */
export async function calculateElkLayout(
  flowNodes: FlowNode<FlowNodeData>[],
  flowEdges: FlowEdge<FlowEdgeData>[]
): Promise<{ positionedNodes: FlowNode<FlowNodeData>[]; layoutSuccess: boolean }> {
  if (flowNodes.length === 0) {
    return { positionedNodes: [], layoutSuccess: true };
  }

  const cacheKey = getLayoutCacheKey(flowNodes, flowEdges);
  const cached = layoutCache.get(cacheKey);

  if (cached) {
    const positionedNodes = flowNodes.map((node) => ({
      ...node,
      position: cached[node.id] || { x: 0, y: 0 },
    }));
    return { positionedNodes, layoutSuccess: true };
  }

  try {
    const elk = new ELK();
    const elkInput = buildElkInput(flowNodes, flowEdges);
    const layouted = await elk.layout(elkInput);

    const positions: Record<string, { x: number; y: number }> = {};
    if (layouted.children) {
      for (const child of layouted.children) {
        positions[child.id] = {
          x: child.x ?? 0,
          y: child.y ?? 0,
        };
      }
    }

    layoutCache.set(cacheKey, positions);

    const positionedNodes = flowNodes.map((node) => ({
      ...node,
      position: positions[node.id] || { x: 0, y: 0 },
    }));

    return { positionedNodes, layoutSuccess: true };
  } catch (err: unknown) {
    // Deterministic fallback grid layout: (col * 220, row * 120)
    const cols = Math.ceil(Math.sqrt(flowNodes.length)) || 1;
    const positionedNodes = flowNodes.map((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      return {
        ...node,
        position: {
          x: col * 220,
          y: row * 120,
        },
      };
    });

    return { positionedNodes, layoutSuccess: false };
  }
}

/**
 * URL state parser & builder:
 * /app/graph?focus=<nodeId>&level=<1|2|3>&depth=<1-3>
 */
export interface ParsedGraphUrl {
  focus: string | null;
  level: number | null;
  depth: number;
}

export function parseGraphUrl(searchParams: URLSearchParams): ParsedGraphUrl {
  const focus = searchParams.get('focus') || null;

  const rawLevel = searchParams.get('level');
  let level: number | null = null;
  if (rawLevel === '1' || rawLevel === '2' || rawLevel === '3') {
    level = parseInt(rawLevel, 10);
  }

  const rawDepth = searchParams.get('depth');
  let depth = 1;
  if (rawDepth) {
    const parsed = parseInt(rawDepth, 10);
    if (!isNaN(parsed)) {
      depth = Math.max(1, Math.min(3, parsed));
    }
  }

  return { focus, level, depth };
}

export function buildGraphUrl(params: {
  focus?: string | null;
  level?: number | null;
  depth?: number;
}): string {
  const sp = new URLSearchParams();

  if (params.focus) {
    sp.set('focus', params.focus);
  }

  if (params.level === 1 || params.level === 2 || params.level === 3) {
    sp.set('level', String(params.level));
  } else if (!params.focus) {
    sp.set('level', '1');
  }

  if (params.depth !== undefined && params.depth !== null) {
    const clampedDepth = Math.max(1, Math.min(3, params.depth));
    if (clampedDepth > 1) {
      sp.set('depth', String(clampedDepth));
    }
  }

  const qs = sp.toString();
  return `/app/graph${qs ? `?${qs}` : ''}`;
}

/**
 * Resolves level and depth from node type:
 * module means level 2, anything else level 3 with depth 1.
 */
export function resolveLevelFromNodeType(nodeType: NodeType | string): {
  level: number;
  depth: number;
} {
  if (nodeType === 'module') {
    return { level: 2, depth: 1 };
  }
  return { level: 3, depth: 1 };
}

/**
 * Builds breadcrumbs: Project > Module > Node
 */
export interface BreadcrumbItem {
  label: string;
  url: string;
  isCurrent: boolean;
}

export function buildBreadcrumb(
  project: Project | { name: string } | null,
  parentModule: { id: string; label: string; path?: string } | null,
  currentNode: { id: string; label: string; type: NodeType } | null,
  currentLevel: number
): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [
    {
      label: project?.name || 'Project',
      url: '/app/graph?level=1',
      isCurrent: currentLevel === 1,
    },
  ];

  if (currentLevel === 2) {
    const moduleLabel =
      currentNode?.type === 'module'
        ? currentNode.label
        : parentModule?.label || 'Module';
    const moduleId =
      currentNode?.type === 'module'
        ? currentNode.id
        : parentModule?.id;

    crumbs.push({
      label: moduleLabel,
      url: moduleId ? `/app/graph?level=2&focus=${moduleId}` : '/app/graph?level=2',
      isCurrent: true,
    });
  } else if (currentLevel === 3) {
    if (parentModule) {
      crumbs.push({
        label: parentModule.label,
        url: `/app/graph?level=2&focus=${parentModule.id}`,
        isCurrent: false,
      });
    }

    if (currentNode) {
      crumbs.push({
        label: currentNode.label,
        url: `/app/graph?level=3&focus=${currentNode.id}&depth=1`,
        isCurrent: true,
      });
    }
  }

  return crumbs;
}

/**
 * Checks if a response object represents a valid API error envelope
 */
export function isGraphApiError(res: unknown): boolean {
  if (!res || typeof res !== 'object') return false;
  const obj = res as { data?: unknown; error?: unknown };
  return obj.data === null && typeof obj.error === 'string' && obj.error.length > 0;
}

