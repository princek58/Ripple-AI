import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
import type {
  GraphResponseData,
  GraphNode,
  GraphEdge,
  FindingEvidenceItem,
  FindingNode,
} from '../../../../shared/types.js';
import {
  responseToFlow,
  type FlowNodeData,
  type FlowEdgeData,
} from '../graph/graphTransform.js';

export interface FrontendEdgeEvidence {
  file?: string;
  line_start?: number;
  line_end?: number;
  specifier?: string;
  pattern?: string;
}

export interface MiniGraphResult {
  flowNodes: FlowNode<FlowNodeData>[];
  flowEdges: FlowEdge<FlowEdgeData>[];
  omittedCount: number;
  matchedEdgeIds: string[];
}

export interface MiniGraphSummaryParams {
  flowNodes: FlowNode<FlowNodeData>[];
  flowEdges: FlowEdge<FlowEdgeData>[];
  matchedEdgeIds: string[];
  omittedCount?: number;
  findingEvidence?: FindingEvidenceItem[];
}

export interface MiniGraphSummary {
  sentences: string[];
  nodeLines: string[];
  edgeLines: string[];
  text: string;
}

function normalizePath(p?: string): string {
  return (p || '').replace(/\\/g, '/').trim().toLowerCase();
}

/**
 * Matches finding evidence items against graph edges by file path and line_start (or line range).
 * Returns array of matched edge IDs.
 */
export function matchEvidenceEdges(
  findingEvidence: FindingEvidenceItem[] | undefined,
  edges: GraphEdge[] | undefined
): string[] {
  if (!findingEvidence || !edges || findingEvidence.length === 0 || edges.length === 0) {
    return [];
  }

  const matchedIds: string[] = [];

  for (const edge of edges) {
    let ev = edge.evidence as FindingEvidenceItem | undefined;
    if (!ev && edge.evidence_json) {
      try {
        ev = JSON.parse(edge.evidence_json);
      } catch {}
    }

    if (!ev || !ev.file) continue;

    const edgeFile = normalizePath(ev.file);
    const edgeStart = typeof ev.line_start === 'number' ? ev.line_start : undefined;
    const edgeEnd = typeof ev.line_end === 'number' ? ev.line_end : edgeStart;

    const isMatch = findingEvidence.some((item) => {
      if (!item.file) return false;
      if (normalizePath(item.file) !== edgeFile) return false;

      // Line number matching
      if (typeof item.line_start === 'number' && typeof edgeStart === 'number') {
        const itemEnd = typeof item.line_end === 'number' ? item.line_end : item.line_start;
        return edgeStart <= itemEnd && (edgeEnd ?? edgeStart) >= item.line_start;
      }

      // Specifier matching if line numbers absent
      if (item.specifier && ev?.specifier && item.specifier === ev.specifier) {
        return true;
      }

      return false;
    });

    if (isMatch) {
      matchedIds.push(edge.id);
    }
  }

  return matchedIds;
}

/**
 * Builds flow nodes and edges for the L4 mini graph.
 * Ensures the finding's own nodes are always included, prioritizes investigation-path
 * connected nodes, respects maxNodes (default 12), and tracks omitted nodes.
 */
export function buildMiniGraph(
  findingNodes: Array<FindingNode | { id: string; label?: string; type?: string; path?: string }> | string[] | undefined,
  graphResponse: GraphResponseData | undefined,
  matchedIds: string[] = [],
  maxNodes = 12
): MiniGraphResult {
  if (!graphResponse || !Array.isArray(graphResponse.nodes)) {
    return {
      flowNodes: [],
      flowEdges: [],
      omittedCount: 0,
      matchedEdgeIds: [],
    };
  }

  const findingNodeIds = new Set<string>();
  if (Array.isArray(findingNodes)) {
    for (const fn of findingNodes) {
      if (typeof fn === 'string') {
        findingNodeIds.add(fn);
      } else if (fn && fn.id) {
        findingNodeIds.add(fn.id);
      }
    }
  }

  const allNodes = graphResponse.nodes;
  const allEdges = graphResponse.edges || [];

  // Identify nodes directly connected to matched edges
  const matchedEdgeNodeIds = new Set<string>();
  for (const edge of allEdges) {
    if (matchedIds.includes(edge.id)) {
      matchedEdgeNodeIds.add(edge.source_id);
      matchedEdgeNodeIds.add(edge.target_id);
    }
  }

  // 1. Mandatory nodes: finding's own nodes that exist in graph
  const mandatoryNodes: GraphNode[] = [];
  const investigationNodes: GraphNode[] = [];
  const otherNodes: GraphNode[] = [];

  for (const node of allNodes) {
    if (findingNodeIds.has(node.id)) {
      mandatoryNodes.push(node);
    } else if (matchedEdgeNodeIds.has(node.id)) {
      investigationNodes.push(node);
    } else {
      otherNodes.push(node);
    }
  }

  // If any finding node wasn't in graphResponse.nodes, synthesize a fallback GraphNode
  if (Array.isArray(findingNodes)) {
    for (const fn of findingNodes) {
      const id = typeof fn === 'string' ? fn : fn.id;
      if (id && !allNodes.some((n) => n.id === id)) {
        const label = typeof fn === 'object' && fn.label ? fn.label : id;
        const type = (typeof fn === 'object' && fn.type ? fn.type : 'backend') as GraphNode['type'];
        const path = typeof fn === 'object' && fn.path ? fn.path : '';
        mandatoryNodes.push({
          id,
          project_id: graphResponse.nodes[0]?.project_id || '',
          scan_id: graphResponse.nodes[0]?.scan_id || '',
          type,
          level: 3,
          parent_id: null,
          label,
          path,
          line_start: null,
          line_end: null,
          language: null,
          meta_json: null,
          findingCount: 1,
          maxSeverity: null,
        });
      }
    }
  }

  // Select nodes up to maxNodes: mandatory first, then investigation, then others
  const selectedNodes: GraphNode[] = [];
  for (const node of mandatoryNodes) {
    if (selectedNodes.length < maxNodes) {
      selectedNodes.push(node);
    }
  }
  for (const node of investigationNodes) {
    if (selectedNodes.length < maxNodes) {
      selectedNodes.push(node);
    }
  }
  for (const node of otherNodes) {
    if (selectedNodes.length < maxNodes) {
      selectedNodes.push(node);
    }
  }

  const totalCandidateNodes = mandatoryNodes.length + investigationNodes.length + otherNodes.length;
  const initialOmitted = Math.max(0, totalCandidateNodes - selectedNodes.length);

  const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));

  // Filter edges where both endpoints (or source for unresolved) are present
  const relevantEdges = allEdges.filter((edge) => {
    if (!selectedNodeIds.has(edge.source_id)) return false;
    if (edge.status === 'unresolved') return true;
    return selectedNodeIds.has(edge.target_id);
  });

  const subGraphData: GraphResponseData = {
    nodes: selectedNodes,
    edges: relevantEdges,
    clusters: [],
    shown: selectedNodes.length,
    total: totalCandidateNodes,
    level: 3,
    focus: selectedNodes[0]?.id || null,
  };

  const flowResult = responseToFlow(subGraphData, {
    focusNodeId: selectedNodes[0]?.id || null,
  });

  let flowNodes = flowResult.flowNodes;
  let flowEdges = flowResult.flowEdges;

  // If stubs created by responseToFlow caused flowNodes to exceed maxNodes, prune non-mandatory
  let omittedCount = initialOmitted;
  if (flowNodes.length > maxNodes) {
    const kept: FlowNode<FlowNodeData>[] = [];
    for (const fn of flowNodes) {
      if (kept.length < maxNodes) {
        kept.push(fn);
      } else {
        omittedCount++;
      }
    }
    const keptIds = new Set(kept.map((n) => n.id));
    flowNodes = kept;
    flowEdges = flowEdges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target));
  }

  // Mark matched edges with investigation path flag and styling data
  const matchedSet = new Set(matchedIds);
  flowEdges = flowEdges.map((edge) => {
    const isMatched = matchedSet.has(edge.id);
    if (isMatched && edge.data) {
      return {
        ...edge,
        data: {
          ...edge.data,
          id: edge.data.id || edge.id,
          relation: edge.data.relation || 'imports',
          status: edge.data.status || 'resolved',
          isInvestigationPath: true,
          isHighlighted: true,
        },
      };
    }
    return edge;
  });

  return {
    flowNodes,
    flowEdges,
    omittedCount,
    matchedEdgeIds: matchedIds,
  };
}

/**
 * Summarizes the mini graph in plain English sentences for accessible text alternatives.
 * Explains isolated files, unmatched evidence, unresolved stub targets, investigation paths,
 * and omitted nodes.
 */
export function summarizeMiniGraph(params: MiniGraphSummaryParams): MiniGraphSummary {
  const { flowNodes, flowEdges, matchedEdgeIds, omittedCount = 0 } = params;

  const sentences: string[] = [];
  const nodeLines: string[] = [];
  const edgeLines: string[] = [];

  const nodeMap = new Map<string, string>();
  for (const n of flowNodes) {
    const lbl = n.data?.label || n.id;
    nodeMap.set(n.id, lbl);
    nodeLines.push(`Node: ${lbl} (${n.data?.nodeType || 'node'})`);
  }

  // Size summary sentence
  sentences.push(
    `Showing ${flowNodes.length} node${flowNodes.length === 1 ? '' : 's'} and ${flowEdges.length} edge${flowEdges.length === 1 ? '' : 's'}.`
  );

  // Omitted count
  if (omittedCount > 0) {
    sentences.push(`+${omittedCount} more nodes omitted from preview.`);
  }

  // Isolated file case: node with 0 connections
  if (flowNodes.length > 0 && flowEdges.length === 0) {
    sentences.push('No other file connects to this file.');
  } else if (flowEdges.length > 0 && matchedEdgeIds.length === 0) {
    // Edges exist, but none match the finding evidence
    sentences.push('No edge matches this evidence.');
  }

  // Matched edges (Investigation path)
  const matchedSet = new Set(matchedEdgeIds);
  const matchedEdges = flowEdges.filter((e) => matchedSet.has(e.id));
  for (const edge of matchedEdges) {
    const src = nodeMap.get(edge.source) || edge.source;
    const tgt = nodeMap.get(edge.target) || edge.target;
    const relation = edge.data?.relation || 'connects to';
    const status = edge.data?.status || 'resolved';
    sentences.push(`Investigation path: ${src} ${relation} ${tgt} (${status}).`);
  }

  // Unresolved edges / stub targets
  const unresolvedEdges = flowEdges.filter((e) => e.data?.status === 'unresolved');
  for (const edge of unresolvedEdges) {
    const tgt = nodeMap.get(edge.target) || edge.target;
    sentences.push(`Unresolved target: ${tgt}.`);
  }

  // Edge lines for detailed alternative
  for (const edge of flowEdges) {
    const src = nodeMap.get(edge.source) || edge.source;
    const tgt = nodeMap.get(edge.target) || edge.target;
    const relation = edge.data?.relation || 'connects to';
    const status = edge.data?.status || 'resolved';
    const isPath = matchedSet.has(edge.id);
    edgeLines.push(
      `Edge: ${src} -> ${tgt} [${relation}, ${status}]${isPath ? ' (Investigation path)' : ''}.`
    );
  }

  return {
    sentences,
    nodeLines,
    edgeLines,
    text: sentences.join(' '),
  };
}
