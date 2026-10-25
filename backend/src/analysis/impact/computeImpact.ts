import type {
  EdgeRelation,
  EdgeStatus,
  ImpactAffectedNode,
  ImpactByModule,
  ImpactCertainty,
  ImpactCounts,
  ImpactResult,
  ImpactStartNode,
  ImpactTestReviewNode,
  ImpactVia,
  NodeType,
} from '../../types.js';

export interface GraphNodeLike {
  id: string;
  project_id?: string;
  type: string;
  level?: number;
  parent_id?: string | null;
  label: string;
  path: string;
  language?: string | null;
  meta_json?: string | null;
}

export interface GraphEdgeLike {
  id: string;
  project_id?: string;
  source_id: string;
  target_id: string;
  relation: string;
  status: string;
  confidence?: string;
  evidence_json?: string | null;
}

export interface GraphLike {
  nodes: GraphNodeLike[];
  edges: GraphEdgeLike[];
}

export interface ComputeImpactOptions {
  depth?: number;
  maxNodes?: number;
}

/**
 * Returns the dependent neighbor ID if `edge` indicates that a node depends on `currentId`.
 *
 * Traversal Rule:
 * For `serves` and `configures`: Target depends on Source (if source === currentId -> target is affected).
 * For `imports`, `tests`, `calls`, `reads`, `writes` (and defaults): Source depends on Target (if target === currentId -> source is affected).
 */
export function getDependentNeighborId(edge: GraphEdgeLike, currentId: string): string | null {
  const rel = edge.relation as EdgeRelation;
  if (rel === 'serves' || rel === 'configures') {
    return edge.source_id === currentId ? edge.target_id : null;
  }
  return edge.target_id === currentId ? edge.source_id : null;
}

/**
 * Pure function: computeImpact
 * Traverses dependent nodes using breadth-first search according to the edge direction audit.
 */
export function computeImpact(
  graph: GraphLike,
  startNodeId: string,
  options: ComputeImpactOptions = {}
): ImpactResult {
  const depthLimit = Math.max(1, Math.min(10, options.depth ?? 10));
  const effectiveMaxNodes = Math.max(1, Math.min(500, options.maxNodes ?? 300));

  const nodeMap = new Map<string, GraphNodeLike>();
  const moduleMap = new Map<string, string>();

  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
    if (node.type === 'module') {
      moduleMap.set(node.id, node.label);
    }
  }

  const startNode = nodeMap.get(startNodeId);
  if (!startNode) {
    throw new Error(`Start node ${startNodeId} not found in graph`);
  }

  const getModuleLabel = (node: GraphNodeLike): string => {
    if (node.type === 'module') return node.label;
    if (node.parent_id && moduleMap.has(node.parent_id)) {
      return moduleMap.get(node.parent_id)!;
    }
    // Check if path has module indicator
    if (node.path && node.path.startsWith('module:')) {
      return node.path.replace(/^module:/, '');
    }
    return 'shared';
  };

  const startModule = getModuleLabel(startNode);
  const start: ImpactStartNode = {
    id: startNode.id,
    label: startNode.label,
    type: startNode.type as NodeType,
    path: startNode.path,
    module: startModule,
  };

  // Build adjacency list for dependent traversal
  // currentId -> array of { neighborId, edge }
  const adjacency = new Map<string, Array<{ neighborId: string; edge: GraphEdgeLike }>>();
  for (const edge of graph.edges) {
    // Unresolved edges are never traversed to add nodes
    if (edge.status === 'unresolved') continue;

    // Check serves/configures
    if (edge.relation === 'serves' || edge.relation === 'configures') {
      const list = adjacency.get(edge.source_id) || [];
      list.push({ neighborId: edge.target_id, edge });
      adjacency.set(edge.source_id, list);
    } else {
      // imports, tests, calls, reads, writes
      const list = adjacency.get(edge.target_id) || [];
      list.push({ neighborId: edge.source_id, edge });
      adjacency.set(edge.target_id, list);
    }
  }

  // Visited state: nodeId -> { distance, certainty, via, node }
  interface VisitedEntry {
    distance: number;
    certainty: ImpactCertainty;
    via: ImpactVia;
    node: GraphNodeLike;
  }

  const visited = new Map<string, VisitedEntry>();
  // Start node is placed in visited with distance 0 to prevent self-cycles and self-inclusion
  visited.set(startNodeId, {
    distance: 0,
    certainty: 'proven',
    via: { relation: 'imports', status: 'resolved' },
    node: startNode,
  });

  const queue: Array<{ id: string; distance: number; certainty: ImpactCertainty }> = [
    { id: startNodeId, distance: 0, certainty: 'proven' },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.distance >= depthLimit) {
      continue;
    }

    const neighbors = adjacency.get(current.id) || [];
    for (const { neighborId, edge } of neighbors) {
      const neighborNode = nodeMap.get(neighborId);
      if (!neighborNode) continue;

      // Certainty logic: if incoming path was possible OR this edge is possible -> possible; else proven
      const edgeCertainty: ImpactCertainty =
        current.certainty === 'possible' || edge.status === 'possible' ? 'possible' : 'proven';

      const via: ImpactVia = {
        relation: edge.relation as EdgeRelation,
        status: edge.status as EdgeStatus,
      };

      if (!visited.has(neighborId)) {
        visited.set(neighborId, {
          distance: current.distance + 1,
          certainty: edgeCertainty,
          via,
          node: neighborNode,
        });
        queue.push({
          id: neighborId,
          distance: current.distance + 1,
          certainty: edgeCertainty,
        });
      } else {
        // If already visited at the same distance but now proven (upgrade certainty)
        const existing = visited.get(neighborId)!;
        if (existing.distance === current.distance + 1 && existing.certainty === 'possible' && edgeCertainty === 'proven') {
          existing.certainty = 'proven';
          existing.via = via;
        }
      }
    }
  }

  // Collect affected entries (excluding start node)
  const rawAffected: ImpactAffectedNode[] = [];
  for (const [nodeId, entry] of visited.entries()) {
    if (nodeId === startNodeId) continue;
    rawAffected.push({
      id: entry.node.id,
      label: entry.node.label,
      type: entry.node.type as NodeType,
      path: entry.node.path,
      module: getModuleLabel(entry.node),
      distance: entry.distance,
      certainty: entry.certainty,
      via: entry.via,
    });
  }

  // Deterministic order: distance asc, then type asc, then path asc, then label asc, then id asc
  rawAffected.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    const typeCompare = a.type.localeCompare(b.type);
    if (typeCompare !== 0) return typeCompare;
    const pathCompare = a.path.localeCompare(b.path);
    if (pathCompare !== 0) return pathCompare;
    const labelCompare = a.label.localeCompare(b.label);
    if (labelCompare !== 0) return labelCompare;
    return a.id.localeCompare(b.id);
  });

  const truncated = rawAffected.length > effectiveMaxNodes;
  const affected = truncated ? rawAffected.slice(0, effectiveMaxNodes) : rawAffected;

  // Unresolved nearby: count distinct unresolved edges touching the start node or any affected node
  const touchedNodeIds = new Set<string>([startNodeId, ...affected.map((a) => a.id)]);
  const unresolvedEdgesSeen = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.status === 'unresolved') {
      if (touchedNodeIds.has(edge.source_id) || touchedNodeIds.has(edge.target_id)) {
        unresolvedEdgesSeen.add(edge.id);
      }
    }
  }
  const unresolved_nearby = unresolvedEdgesSeen.size;

  // Aggregate counts
  let filesCount = 0;
  let apiEndpointsCount = 0;
  let configCount = 0;
  let testsCount = 0;
  const moduleSet = new Set<string>();
  const moduleCounts = new Map<string, number>();

  for (const item of affected) {
    if (item.type === 'frontend' || item.type === 'backend' || item.type === 'database') {
      filesCount++;
    } else if (item.type === 'api') {
      apiEndpointsCount++;
    } else if (item.type === 'config') {
      configCount++;
    } else if (item.type === 'test') {
      testsCount++;
    }

    if (item.module) {
      moduleSet.add(item.module);
      moduleCounts.set(item.module, (moduleCounts.get(item.module) || 0) + 1);
    }
  }

  const counts: ImpactCounts = {
    files: filesCount,
    api_endpoints: apiEndpointsCount,
    config: configCount,
    tests: testsCount,
    modules: moduleSet.size,
  };

  const by_module: ImpactByModule[] = Array.from(moduleCounts.entries())
    .map(([module, count]) => ({ module, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.module.localeCompare(b.module);
    });

  // tests_to_review: candidate test nodes with explicit disclaimer
  const tests_to_review: ImpactTestReviewNode[] = affected
    .filter((a) => a.type === 'test')
    .map((a) => ({
      id: a.id,
      label: a.label,
      path: a.path,
      distance: a.distance,
      certainty: a.certainty,
      note: 'Candidate test found by static evidence; no code was run',
    }));

  // Notes
  const notes: string[] = [];
  if (affected.length === 0) {
    notes.push('No other file depends on this file');
  }
  if (unresolved_nearby > 0) {
    notes.push(
      `${unresolved_nearby} dynamic or unresolved reference(s) touch this area, so the real impact may be larger`
    );
  }
  if (truncated) {
    notes.push(
      `Impact traversal was truncated at ${effectiveMaxNodes} nodes; additional dependents may exist`
    );
  }

  return {
    start,
    affected,
    counts,
    by_module,
    tests_to_review,
    truncated,
    unresolved_nearby,
    notes,
  };
}
