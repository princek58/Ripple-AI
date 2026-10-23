import path from 'node:path';
import type Database from 'better-sqlite3';

export interface GraphNodeRecord {
  id: string;
  project_id: string;
  scan_id: string;
  type: string;
  level: number;
  parent_id: string | null;
  label: string;
  path: string;
  line_start: number | null;
  line_end: number | null;
  language: string | null;
  meta_json: string | null;
  findingCount?: number;
  maxSeverity?: string | null;
  stub?: boolean;
  focused?: boolean;
}

export interface GraphEdgeRecord {
  id: string;
  project_id: string;
  scan_id?: string;
  source_id: string;
  target_id: string;
  relation: string;
  status: string;
  confidence: string;
  evidence_json: string | null;
  evidence?: any;
  derived?: boolean;
  count?: number;
}

export interface GraphCluster {
  id: string;
  label: string;
  count: number;
  sample_node_ids: string[];
}

export interface GraphResult {
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
  clusters: GraphCluster[];
  shown: number;
  total: number;
  level: number;
  focus: string | null;
}

export interface SearchFilters {
  q?: string;
  type?: string;
  severity?: string;
  verification?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  items: GraphNodeRecord[];
  total: number;
}

export interface NodeDetailsEdge {
  id: string;
  relation: string;
  status: string;
  confidence: string;
  evidence: any;
  otherNode: {
    id: string;
    label: string;
    type: string;
    path: string;
  } | null;
}

export interface RelatedFindingSummary {
  id: string;
  title: string;
  severity: string;
  confidence: string;
  verification: string;
}

export interface NodeDetailsResult {
  node: GraphNodeRecord;
  parentModule: {
    id: string;
    label: string;
    path: string;
  } | null;
  incomingEdges: NodeDetailsEdge[];
  outgoingEdges: NodeDetailsEdge[];
  lineRange: {
    start: number | null;
    end: number | null;
  } | null;
  relatedFindings: RelatedFindingSummary[];
}

const RELATION_STRENGTH: Record<string, number> = {
  calls: 7,
  imports: 6,
  serves: 5,
  writes: 4,
  reads: 3,
  configures: 2,
  tests: 1,
};

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  unknown: 1,
};

function getMaxSeverity(severities: string[]): string | null {
  if (severities.length === 0) return null;
  let maxWeight = -1;
  let maxSev: string | null = null;
  for (const s of severities) {
    const weight = SEVERITY_WEIGHT[s] ?? 0;
    if (weight > maxWeight) {
      maxWeight = weight;
      maxSev = s;
    }
  }
  return maxSev;
}

function getStrongestRelation(relations: string[]): string {
  if (relations.length === 0) return 'imports';
  let strongest = relations[0];
  let maxScore = RELATION_STRENGTH[strongest] ?? 0;
  for (const rel of relations) {
    const score = RELATION_STRENGTH[rel] ?? 0;
    if (score > maxScore) {
      maxScore = score;
      strongest = rel;
    }
  }
  return strongest;
}

function parseEvidence(evidenceJson: string | null): any {
  if (!evidenceJson) return null;
  try {
    return JSON.parse(evidenceJson);
  } catch {
    return null;
  }
}

/**
 * Groups surplus nodes into directory clusters if count exceeds maxNodes.
 */
function applyClustering(
  allNodes: GraphNodeRecord[],
  allEdges: GraphEdgeRecord[],
  maxNodes: number
): { nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[]; clusters: GraphCluster[]; shown: number; total: number } {
  const total = allNodes.length;

  if (total <= maxNodes) {
    return {
      nodes: allNodes,
      edges: allEdges,
      clusters: [],
      shown: total,
      total,
    };
  }

  // Deterministic order: focused node always comes first, then Level asc, type asc, path asc, id asc
  const sorted = [...allNodes].sort((a, b) => {
    const aFocused = a.focused ? 1 : 0;
    const bFocused = b.focused ? 1 : 0;
    if (aFocused !== bFocused) return bFocused - aFocused;
    if (a.level !== b.level) return a.level - b.level;
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.id.localeCompare(b.id);
  });

  const shownNodes = sorted.slice(0, maxNodes);
  const extraNodes = sorted.slice(maxNodes);

  // Group surplus nodes by directory
  const dirMap = new Map<string, GraphNodeRecord[]>();
  for (const node of extraNodes) {
    let dir = 'root';
    if (node.path && node.path.includes('/')) {
      dir = path.posix.dirname(node.path);
    } else if (node.path && node.path.startsWith('module:')) {
      dir = 'modules';
    }
    const list = dirMap.get(dir) || [];
    list.push(node);
    dirMap.set(dir, list);
  }

  const clusters: GraphCluster[] = [];
  const sortedDirs = Array.from(dirMap.keys()).sort();
  for (const dir of sortedDirs) {
    const nodesInDir = dirMap.get(dir)!;
    clusters.push({
      id: `cluster:${dir}`,
      label: dir,
      count: nodesInDir.length,
      sample_node_ids: nodesInDir.slice(0, 3).map((n) => n.id),
    });
  }

  const shownIds = new Set(shownNodes.map((n) => n.id));
  const filteredEdges = allEdges.filter(
    (e) => shownIds.has(e.source_id) && (shownIds.has(e.target_id) || e.status === 'unresolved')
  );

  return {
    nodes: shownNodes,
    edges: filteredEdges,
    clusters,
    shown: shownNodes.length,
    total,
  };
}

export class GraphRepository {
  constructor(private db: Database.Database) {}

  /**
   * Attaches findingCount and maxSeverity to nodes.
   * Module nodes aggregate their children's findings.
   */
  private attachFindingCounts(projectId: string, nodes: GraphNodeRecord[]): GraphNodeRecord[] {
    const findings = this.db
      .prepare('SELECT id, severity, node_ids_json FROM findings WHERE project_id = ?')
      .all(projectId) as any[];

    // Map: nodeId -> list of severities for findings directly pointing to this node
    const directSeverities = new Map<string, string[]>();
    for (const f of findings) {
      let nodeIds: string[] = [];
      try {
        nodeIds = JSON.parse(f.node_ids_json);
      } catch {}

      for (const nid of nodeIds) {
        const list = directSeverities.get(nid) || [];
        list.push(f.severity);
        directSeverities.set(nid, list);
      }
    }

    // Map: child node id -> parent_id (module)
    const childRows = this.db
      .prepare('SELECT id, parent_id FROM nodes WHERE project_id = ? AND parent_id IS NOT NULL')
      .all(projectId) as { id: string; parent_id: string }[];

    const parentMap = new Map<string, string>();
    for (const cr of childRows) {
      parentMap.set(cr.id, cr.parent_id);
    }

    // Map: moduleId -> list of severities of module and all its children
    const moduleAggregatedSeverities = new Map<string, string[]>();
    for (const [nid, sevs] of directSeverities.entries()) {
      // Direct on module
      const directList = moduleAggregatedSeverities.get(nid) || [];
      directList.push(...sevs);
      moduleAggregatedSeverities.set(nid, directList);

      // Child's parent module
      const parentMod = parentMap.get(nid);
      if (parentMod) {
        const parentList = moduleAggregatedSeverities.get(parentMod) || [];
        parentList.push(...sevs);
        moduleAggregatedSeverities.set(parentMod, parentList);
      }
    }

    // Also project-level aggregation
    const allProjectSeverities = findings.map((f) => f.severity);

    return nodes.map((node) => {
      let sevs: string[] = [];
      if (node.type === 'module') {
        sevs = moduleAggregatedSeverities.get(node.id) || [];
      } else if (node.type === 'project') {
        sevs = allProjectSeverities;
      } else {
        sevs = directSeverities.get(node.id) || [];
      }

      return {
        ...node,
        findingCount: sevs.length,
        maxSeverity: getMaxSeverity(sevs),
      };
    });
  }

  /**
   * Level 1: Project node + module nodes + derived module-to-module edges
   */
  getLevel1(projectId: string, maxNodes = 200): GraphResult | null {
    const projectNode = this.db
      .prepare('SELECT * FROM nodes WHERE project_id = ? AND type = ?')
      .get(projectId, 'project') as GraphNodeRecord | undefined;

    if (!projectNode) {
      const proj = this.db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (!proj) return null;
    }

    const moduleNodes = this.db
      .prepare('SELECT * FROM nodes WHERE project_id = ? AND type = ? ORDER BY label ASC')
      .all(projectId, 'module') as GraphNodeRecord[];

    const rawNodes: GraphNodeRecord[] = [];
    if (projectNode) rawNodes.push(projectNode);
    rawNodes.push(...moduleNodes);

    // Build map of child node id -> parent module id
    const childRows = this.db
      .prepare('SELECT id, parent_id FROM nodes WHERE project_id = ? AND level = 3 AND parent_id IS NOT NULL')
      .all(projectId) as { id: string; parent_id: string }[];

    const nodeModuleMap = new Map<string, string>();
    for (const row of childRows) {
      nodeModuleMap.set(row.id, row.parent_id);
    }

    const moduleIds = new Set(moduleNodes.map((m) => m.id));

    // Aggregate cross-module edges
    const allEdges = this.db
      .prepare('SELECT * FROM edges WHERE project_id = ?')
      .all(projectId) as (GraphEdgeRecord & { evidence_json: string | null })[];

    const modulePairEdges = new Map<string, { sourceModule: string; targetModule: string; relations: string[]; count: number }>();

    for (const edge of allEdges) {
      const sourceModule = nodeModuleMap.get(edge.source_id);
      const targetModule = nodeModuleMap.get(edge.target_id);

      if (sourceModule && targetModule && sourceModule !== targetModule && moduleIds.has(sourceModule) && moduleIds.has(targetModule)) {
        const key = `${sourceModule}->${targetModule}`;
        const existing = modulePairEdges.get(key) || {
          sourceModule,
          targetModule,
          relations: [],
          count: 0,
        };
        existing.relations.push(edge.relation);
        existing.count++;
        modulePairEdges.set(key, existing);
      }
    }

    const derivedEdges: GraphEdgeRecord[] = [];
    for (const pair of modulePairEdges.values()) {
      const strongest = getStrongestRelation(pair.relations);
      const evidence = { count: pair.count, strongestRelation: strongest };
      derivedEdges.push({
        id: `derived:${pair.sourceModule}:${pair.targetModule}`,
        project_id: projectId,
        source_id: pair.sourceModule,
        target_id: pair.targetModule,
        relation: strongest,
        status: 'resolved',
        confidence: 'confirmed',
        evidence_json: JSON.stringify(evidence),
        evidence,
        derived: true,
        count: pair.count,
      });
    }

    derivedEdges.sort((a, b) => a.id.localeCompare(b.id));

    const nodesWithFindings = this.attachFindingCounts(projectId, rawNodes);
    const clustered = applyClustering(nodesWithFindings, derivedEdges, maxNodes);

    return {
      nodes: clustered.nodes,
      edges: clustered.edges,
      clusters: clustered.clusters,
      shown: clustered.shown,
      total: clustered.total,
      level: 1,
      focus: null,
    };
  }

  /**
   * Level 2: Children of the focused module + internal edges + boundary edges to other modules
   */
  getLevel2(projectId: string, focusModuleId: string, maxNodes = 200): GraphResult | null {
    const focusModule = this.db
      .prepare('SELECT * FROM nodes WHERE id = ? AND project_id = ?')
      .get(focusModuleId, projectId) as GraphNodeRecord | undefined;

    if (!focusModule) {
      return null;
    }

    const children = this.db
      .prepare('SELECT * FROM nodes WHERE project_id = ? AND parent_id = ? ORDER BY path ASC, id ASC')
      .all(projectId, focusModuleId) as GraphNodeRecord[];

    const childIds = new Set(children.map((c) => c.id));
    const focusModuleNode: GraphNodeRecord = {
      ...focusModule,
      focused: true,
    };
    const nodes: GraphNodeRecord[] = [focusModuleNode, ...children];
    const edges: GraphEdgeRecord[] = [];

    const relatedEdges = this.db
      .prepare(`
        SELECT * FROM edges 
        WHERE project_id = ? AND (source_id IN (SELECT id FROM nodes WHERE project_id = ? AND parent_id = ?) 
                                OR target_id IN (SELECT id FROM nodes WHERE project_id = ? AND parent_id = ?))
      `)
      .all(projectId, projectId, focusModuleId, projectId, focusModuleId) as GraphEdgeRecord[];

    const allProjectNodes = this.db
      .prepare('SELECT id, type, parent_id, label, path FROM nodes WHERE project_id = ?')
      .all(projectId) as { id: string; type: string; parent_id: string | null; label: string; path: string }[];

    const nodeParentMap = new Map<string, string | null>();
    const nodeRecordMap = new Map<string, { id: string; type: string; label: string; path: string }>();
    for (const n of allProjectNodes) {
      nodeParentMap.set(n.id, n.parent_id);
      nodeRecordMap.set(n.id, n);
    }

    const otherModulesMap = new Map<string, GraphNodeRecord>();
    const outgoingBoundaryToModule = new Map<string, { count: number; relations: string[] }>();
    const incomingBoundaryFromModule = new Map<string, { count: number; relations: string[] }>();

    for (const edge of relatedEdges) {
      const isSourceChild = childIds.has(edge.source_id);
      const isTargetChild = childIds.has(edge.target_id);

      if (isSourceChild && isTargetChild) {
        edges.push({
          ...edge,
          evidence: parseEvidence(edge.evidence_json),
        });
        continue;
      }

      if (edge.status === 'unresolved' && isSourceChild) {
        if (!childIds.has(edge.target_id) && !nodes.some((n) => n.id === edge.target_id)) {
          const stubLabel = edge.relation === 'imports' ? 'Unresolved import' : 'Unresolved target';
          const stub: GraphNodeRecord = {
            id: edge.target_id,
            project_id: projectId,
            scan_id: edge.scan_id || '',
            type: 'unknown',
            level: 3,
            parent_id: focusModuleId,
            label: stubLabel,
            path: `unresolved:${edge.target_id}`,
            line_start: null,
            line_end: null,
            language: null,
            meta_json: null,
            stub: true,
          };
          nodes.push(stub);
          childIds.add(stub.id);
        }
        edges.push({
          ...edge,
          evidence: parseEvidence(edge.evidence_json),
        });
        continue;
      }

      if (isSourceChild && !isTargetChild) {
        const targetParentModId = nodeParentMap.get(edge.target_id);
        const targetModId = targetParentModId || edge.target_id;
        if (targetModId && targetModId !== focusModuleId) {
          const modRec = nodeRecordMap.get(targetModId);
          if (modRec && !otherModulesMap.has(targetModId)) {
            const fullModNode = this.db
              .prepare('SELECT * FROM nodes WHERE id = ?')
              .get(targetModId) as GraphNodeRecord | undefined;
            if (fullModNode) otherModulesMap.set(targetModId, fullModNode);
          }
          const existing = outgoingBoundaryToModule.get(targetModId) || { count: 0, relations: [] };
          existing.count++;
          existing.relations.push(edge.relation);
          outgoingBoundaryToModule.set(targetModId, existing);
        }
      }

      if (!isSourceChild && isTargetChild) {
        const sourceParentModId = nodeParentMap.get(edge.source_id);
        const sourceModId = sourceParentModId || edge.source_id;
        if (sourceModId && sourceModId !== focusModuleId) {
          const modRec = nodeRecordMap.get(sourceModId);
          if (modRec && !otherModulesMap.has(sourceModId)) {
            const fullModNode = this.db
              .prepare('SELECT * FROM nodes WHERE id = ?')
              .get(sourceModId) as GraphNodeRecord | undefined;
            if (fullModNode) otherModulesMap.set(sourceModId, fullModNode);
          }
          const existing = incomingBoundaryFromModule.get(sourceModId) || { count: 0, relations: [] };
          existing.count++;
          existing.relations.push(edge.relation);
          incomingBoundaryFromModule.set(sourceModId, existing);
        }
      }
    }

    for (const modNode of otherModulesMap.values()) {
      nodes.push(modNode);
    }

    for (const [targetModId, data] of outgoingBoundaryToModule.entries()) {
      const strongest = getStrongestRelation(data.relations);
      const evidence = { count: data.count, strongestRelation: strongest };
      edges.push({
        id: `boundary:${focusModuleId}->${targetModId}`,
        project_id: projectId,
        source_id: focusModuleId,
        target_id: targetModId,
        relation: strongest,
        status: 'resolved',
        confidence: 'confirmed',
        evidence_json: JSON.stringify(evidence),
        evidence,
        derived: true,
        count: data.count,
      });
    }

    for (const [sourceModId, data] of incomingBoundaryFromModule.entries()) {
      const strongest = getStrongestRelation(data.relations);
      const evidence = { count: data.count, strongestRelation: strongest };
      edges.push({
        id: `boundary:${sourceModId}->${focusModuleId}`,
        project_id: projectId,
        source_id: sourceModId,
        target_id: focusModuleId,
        relation: strongest,
        status: 'resolved',
        confidence: 'confirmed',
        evidence_json: JSON.stringify(evidence),
        evidence,
        derived: true,
        count: data.count,
      });
    }

    edges.sort((a, b) => a.id.localeCompare(b.id));

    const nodesWithFindings = this.attachFindingCounts(projectId, nodes);
    const clustered = applyClustering(nodesWithFindings, edges, maxNodes);

    return {
      nodes: clustered.nodes,
      edges: clustered.edges,
      clusters: clustered.clusters,
      shown: clustered.shown,
      total: clustered.total,
      level: 2,
      focus: focusModuleId,
    };
  }

  /**
   * Level 3: Neighbourhood of focused node, BFS up to depth (1-3)
   */
  getLevel3(projectId: string, focusNodeId: string, depth = 1, maxNodes = 200): GraphResult | null {
    const focusNode = this.db
      .prepare('SELECT * FROM nodes WHERE id = ? AND project_id = ?')
      .get(focusNodeId, projectId) as GraphNodeRecord | undefined;

    if (!focusNode) {
      return null;
    }

    const visitedNodes = new Map<string, GraphNodeRecord>();
    visitedNodes.set(focusNodeId, focusNode);

    const visitedEdges = new Map<string, GraphEdgeRecord>();
    const queue: { id: string; currentDepth: number }[] = [{ id: focusNodeId, currentDepth: 0 }];

    const getEdgesForNodeStmt = this.db.prepare(`
      SELECT * FROM edges 
      WHERE project_id = ? AND (source_id = ? OR target_id = ?)
    `);

    const getNodeByIdStmt = this.db.prepare('SELECT * FROM nodes WHERE id = ? AND project_id = ?');

    while (queue.length > 0) {
      const { id: currentId, currentDepth } = queue.shift()!;
      if (currentDepth >= depth) continue;

      const incidentEdges = getEdgesForNodeStmt.all(projectId, currentId, currentId) as GraphEdgeRecord[];

      for (const edge of incidentEdges) {
        visitedEdges.set(edge.id, {
          ...edge,
          evidence: parseEvidence(edge.evidence_json),
        });

        const neighborId = edge.source_id === currentId ? edge.target_id : edge.source_id;

        if (!visitedNodes.has(neighborId)) {
          const neighborNode = getNodeByIdStmt.get(neighborId, projectId) as GraphNodeRecord | undefined;
          if (neighborNode) {
            visitedNodes.set(neighborId, neighborNode);
            queue.push({ id: neighborId, currentDepth: currentDepth + 1 });
          } else if (edge.status === 'unresolved') {
            const stub: GraphNodeRecord = {
              id: neighborId,
              project_id: projectId,
              scan_id: edge.scan_id || '',
              type: 'unknown',
              level: 3,
              parent_id: null,
              label: 'Unresolved target',
              path: `unresolved:${neighborId}`,
              line_start: null,
              line_end: null,
              language: null,
              meta_json: null,
              stub: true,
            };
            visitedNodes.set(neighborId, stub);
          }
        }
      }
    }

    const nodeIdsArray = Array.from(visitedNodes.keys());
    if (nodeIdsArray.length > 1) {
      const placeholders = nodeIdsArray.map(() => '?').join(',');
      const crossEdges = this.db
        .prepare(`
          SELECT * FROM edges 
          WHERE project_id = ? AND source_id IN (${placeholders}) AND target_id IN (${placeholders})
        `)
        .all(projectId, ...nodeIdsArray, ...nodeIdsArray) as GraphEdgeRecord[];

      for (const e of crossEdges) {
        if (!visitedEdges.has(e.id)) {
          visitedEdges.set(e.id, {
            ...e,
            evidence: parseEvidence(e.evidence_json),
          });
        }
      }
    }

    const rawNodes = Array.from(visitedNodes.values());
    const rawEdges = Array.from(visitedEdges.values()).sort((a, b) => a.id.localeCompare(b.id));

    const nodesWithFindings = this.attachFindingCounts(projectId, rawNodes);
    const clustered = applyClustering(nodesWithFindings, rawEdges, maxNodes);

    return {
      nodes: clustered.nodes,
      edges: clustered.edges,
      clusters: clustered.clusters,
      shown: clustered.shown,
      total: clustered.total,
      level: 3,
      focus: focusNodeId,
    };
  }

  /**
   * Search nodes with substring matching on label and path, and optional type/severity filters
   */
  search(projectId: string, filters: SearchFilters): SearchResult | null {
    const proj = this.db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!proj) return null;

    const conditions: string[] = ['project_id = ?'];
    const params: any[] = [projectId];

    if (filters.q && filters.q.trim()) {
      const pattern = `%${filters.q.trim().toLowerCase()}%`;
      conditions.push('(LOWER(label) LIKE ? OR LOWER(path) LIKE ?)');
      params.push(pattern, pattern);
    }

    if (filters.type && filters.type.trim()) {
      conditions.push('type = ?');
      params.push(filters.type.trim());
    }

    if (filters.severity && filters.severity.trim()) {
      conditions.push(`
        id IN (
          SELECT json_each.value FROM findings f, json_each(f.node_ids_json)
          WHERE f.project_id = ? AND f.severity = ?
        )
      `);
      params.push(projectId, filters.severity.trim());
    }

    if (filters.verification && filters.verification.trim()) {
      conditions.push(`
        id IN (
          SELECT json_each.value FROM findings f, json_each(f.node_ids_json)
          WHERE f.project_id = ? AND f.verification = ?
        )
      `);
      params.push(projectId, filters.verification.trim());
    }

    const whereClause = conditions.join(' AND ');

    const countStmt = this.db.prepare(`SELECT COUNT(*) as total FROM nodes WHERE ${whereClause}`);
    const { total } = countStmt.get(...params) as { total: number };

    const limit = filters.limit ?? 25;
    const offset = filters.offset ?? 0;

    const queryStmt = this.db.prepare(`
      SELECT * FROM nodes 
      WHERE ${whereClause} 
      ORDER BY level ASC, type ASC, path ASC, id ASC 
      LIMIT ? OFFSET ?
    `);

    const items = queryStmt.all(...params, limit, offset) as GraphNodeRecord[];
    const itemsWithFindings = this.attachFindingCounts(projectId, items);

    return {
      items: itemsWithFindings,
      total,
    };
  }

  /**
   * Detailed node query with incoming/outgoing edges, parent module, and related findings
   */
  getNodeDetails(projectId: string, nodeId: string): NodeDetailsResult | null {
    const proj = this.db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!proj) return null;

    const node = this.db
      .prepare('SELECT * FROM nodes WHERE id = ? AND project_id = ?')
      .get(nodeId, projectId) as GraphNodeRecord | undefined;

    if (!node) return null;

    // Attach finding count and max severity to this node
    const [nodeWithCounts] = this.attachFindingCounts(projectId, [node]);

    // Redact sensitive nodes if any
    const isSensitive = nodeWithCounts.path.includes('.env') || nodeWithCounts.language === 'Environment';
    const returnedNode: GraphNodeRecord = isSensitive
      ? {
          ...nodeWithCounts,
          meta_json: JSON.stringify({ sensitive: true }),
        }
      : nodeWithCounts;

    // Parent module
    let parentModule: { id: string; label: string; path: string } | null = null;
    if (node.parent_id) {
      const parent = this.db
        .prepare('SELECT id, label, path FROM nodes WHERE id = ? AND project_id = ?')
        .get(node.parent_id, projectId) as { id: string; label: string; path: string } | undefined;
      if (parent) {
        parentModule = parent;
      }
    }

    // Incoming edges
    const incomingRows = this.db
      .prepare(`
        SELECT e.*, n.id as other_id, n.label as other_label, n.type as other_type, n.path as other_path
        FROM edges e
        LEFT JOIN nodes n ON n.id = e.source_id
        WHERE e.project_id = ? AND e.target_id = ?
        ORDER BY e.relation ASC
      `)
      .all(projectId, nodeId) as any[];

    const incomingEdges: NodeDetailsEdge[] = incomingRows.map((row) => ({
      id: row.id,
      relation: row.relation,
      status: row.status,
      confidence: row.confidence,
      evidence: parseEvidence(row.evidence_json),
      otherNode: row.other_id
        ? {
            id: row.other_id,
            label: row.other_label,
            type: row.other_type,
            path: row.other_path,
          }
        : null,
    }));

    // Outgoing edges
    const outgoingRows = this.db
      .prepare(`
        SELECT e.*, n.id as other_id, n.label as other_label, n.type as other_type, n.path as other_path
        FROM edges e
        LEFT JOIN nodes n ON n.id = e.target_id
        WHERE e.project_id = ? AND e.source_id = ?
        ORDER BY e.relation ASC
      `)
      .all(projectId, nodeId) as any[];

    const outgoingEdges: NodeDetailsEdge[] = outgoingRows.map((row) => ({
      id: row.id,
      relation: row.relation,
      status: row.status,
      confidence: row.confidence,
      evidence: parseEvidence(row.evidence_json),
      otherNode: row.other_id
        ? {
            id: row.other_id,
            label: row.other_label,
            type: row.other_type,
            path: row.other_path,
          }
        : null,
    }));

    // Line range
    let lineStart = node.line_start;
    let lineEnd = node.line_end;

    if (!lineStart && !lineEnd) {
      for (const e of [...incomingEdges, ...outgoingEdges]) {
        if (e.evidence && typeof e.evidence.line_start === 'number') {
          lineStart = e.evidence.line_start;
          lineEnd = e.evidence.line_end ?? e.evidence.line_start;
          break;
        }
      }
    }

    // Query real related findings for this node
    const relatedFindingsRows = this.db
      .prepare(`
        SELECT f.id, f.title, f.severity, f.confidence, f.verification
        FROM findings f, json_each(f.node_ids_json)
        WHERE f.project_id = ? AND json_each.value = ?
        ORDER BY 
          CASE f.severity 
            WHEN 'critical' THEN 1 
            WHEN 'high' THEN 2 
            WHEN 'medium' THEN 3 
            WHEN 'low' THEN 4 
            ELSE 5 
          END, f.created_at DESC
      `)
      .all(projectId, nodeId) as RelatedFindingSummary[];

    return {
      node: returnedNode,
      parentModule,
      incomingEdges,
      outgoingEdges,
      lineRange: lineStart ? { start: lineStart, end: lineEnd ?? lineStart } : null,
      relatedFindings: relatedFindingsRows,
    };
  }
}
