import type Database from 'better-sqlite3';
import type { CheckFinding } from '../checks/types.js';

export interface FindingOutput {
  id: string;
  project_id: string;
  scan_id: string;
  rule_id: string;
  title: string;
  summary: string;
  severity: string;
  confidence: string;
  verification: string;
  evidence: any;
  node_ids: string[];
  likely_cause: string | null;
  not_confirmed: string | null;
  created_at: string;
}

export interface FindingDetailOutput extends FindingOutput {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    path: string;
  }>;
}

export interface FindingsQueryFilters {
  severity?: string;
  confidence?: string;
  verification?: string;
  rule_id?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedFindings {
  items: FindingOutput[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ProjectSummaryResult {
  lastScan: {
    finished_at: string | null;
    status: string;
  } | null;
  counts: {
    nodes: number;
    edges: number;
    unresolvedEdges: number;
    files: number;
  };
  kpi: {
    openFindings: number;
    criticalPlusHigh: number;
    fixesPendingApproval: number;
    verifiedFixes: number;
  };
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
  };
  byConfidence: {
    confirmed: number;
    likely: number;
    hypothesis: number;
  };
  byVerification: {
    not_tested: number;
    reproduced: number;
    fix_proposed: number;
    fix_verified: number;
  };
  affectedModules: Array<{
    moduleId: string;
    label: string;
    findingCount: number;
    maxSeverity: string | null;
  }>;
}

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

function parseFindingRow(row: any): FindingOutput {
  let evidence: any = null;
  if (row.evidence_json) {
    try {
      evidence = JSON.parse(row.evidence_json);
    } catch {
      evidence = null;
    }
  }

  let node_ids: string[] = [];
  if (row.node_ids_json) {
    try {
      node_ids = JSON.parse(row.node_ids_json);
    } catch {
      node_ids = [];
    }
  }

  return {
    id: row.id,
    project_id: row.project_id,
    scan_id: row.scan_id,
    rule_id: row.rule_id,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    confidence: row.confidence,
    verification: row.verification,
    evidence,
    node_ids,
    likely_cause: row.likely_cause ?? null,
    not_confirmed: row.not_confirmed ?? null,
    created_at: row.created_at,
  };
}

export class FindingsRepository {
  constructor(private db: Database.Database) {}

  findByProjectId(projectId: string, filters: FindingsQueryFilters): PaginatedFindings | null {
    const proj = this.db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!proj) return null;

    const conditions: string[] = ['project_id = ?'];
    const params: any[] = [projectId];

    if (filters.severity) {
      conditions.push('severity = ?');
      params.push(filters.severity);
    }

    if (filters.confidence) {
      conditions.push('confidence = ?');
      params.push(filters.confidence);
    }

    if (filters.verification) {
      conditions.push('verification = ?');
      params.push(filters.verification);
    }

    if (filters.rule_id) {
      conditions.push('rule_id = ?');
      params.push(filters.rule_id);
    }

    if (filters.q && filters.q.trim()) {
      const pattern = `%${filters.q.trim().toLowerCase()}%`;
      conditions.push('(LOWER(title) LIKE ? OR LOWER(summary) LIKE ?)');
      params.push(pattern, pattern);
    }

    const whereClause = conditions.join(' AND ');

    const countStmt = this.db.prepare(`SELECT COUNT(*) as total FROM findings WHERE ${whereClause}`);
    const { total } = countStmt.get(...params) as { total: number };

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
    const offset = (page - 1) * pageSize;

    const queryStmt = this.db.prepare(`
      SELECT * FROM findings 
      WHERE ${whereClause} 
      ORDER BY 
        CASE severity 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
          ELSE 5 
        END, 
        created_at DESC, 
        id ASC
      LIMIT ? OFFSET ?
    `);

    const rows = queryStmt.all(...params, pageSize, offset) as any[];
    const items = rows.map(parseFindingRow);

    return {
      items,
      page,
      pageSize,
      total,
    };
  }

  findById(findingId: string): FindingDetailOutput | null {
    const row = this.db.prepare('SELECT * FROM findings WHERE id = ?').get(findingId) as any;
    if (!row) return null;

    const base = parseFindingRow(row);

    const nodes: Array<{ id: string; label: string; type: string; path: string }> = [];
    if (base.node_ids.length > 0) {
      const placeholders = base.node_ids.map(() => '?').join(',');
      const nodeRows = this.db
        .prepare(`SELECT id, label, type, path FROM nodes WHERE id IN (${placeholders})`)
        .all(...base.node_ids) as Array<{ id: string; label: string; type: string; path: string }>;
      nodes.push(...nodeRows);
    }

    return {
      ...base,
      nodes,
    };
  }

  getSummary(projectId: string): ProjectSummaryResult | null {
    const proj = this.db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!proj) return null;

    const latestScan = this.db
      .prepare('SELECT * FROM scans WHERE project_id = ? ORDER BY started_at DESC LIMIT 1')
      .get(projectId) as any;

    if (!latestScan) {
      return {
        lastScan: null,
        counts: { nodes: 0, edges: 0, unresolvedEdges: 0, files: 0 },
        kpi: { openFindings: 0, criticalPlusHigh: 0, fixesPendingApproval: 0, verifiedFixes: 0 },
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
        byConfidence: { confirmed: 0, likely: 0, hypothesis: 0 },
        byVerification: { not_tested: 0, reproduced: 0, fix_proposed: 0, fix_verified: 0 },
        affectedModules: [],
      };
    }

    // Counts
    const { nodeCount } = this.db
      .prepare('SELECT COUNT(*) as nodeCount FROM nodes WHERE project_id = ?')
      .get(projectId) as { nodeCount: number };

    const { edgeCount } = this.db
      .prepare('SELECT COUNT(*) as edgeCount FROM edges WHERE project_id = ?')
      .get(projectId) as { edgeCount: number };

    const { unresolvedEdgeCount } = this.db
      .prepare("SELECT COUNT(*) as unresolvedEdgeCount FROM edges WHERE project_id = ? AND status = 'unresolved'")
      .get(projectId) as { unresolvedEdgeCount: number };

    // Total files from scans or project_files
    const filesCount = latestScan.files_total ?? 0;

    // Findings breakdown
    const allFindings = this.db
      .prepare('SELECT id, severity, confidence, verification, node_ids_json FROM findings WHERE project_id = ?')
      .all(projectId) as any[];

    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
    const byConfidence = { confirmed: 0, likely: 0, hypothesis: 0 };
    const byVerification = { not_tested: 0, reproduced: 0, fix_proposed: 0, fix_verified: 0 };

    for (const f of allFindings) {
      if (f.severity in bySeverity) {
        bySeverity[f.severity as keyof typeof bySeverity]++;
      } else {
        bySeverity.unknown++;
      }

      if (f.confidence in byConfidence) {
        byConfidence[f.confidence as keyof typeof byConfidence]++;
      }

      if (f.verification in byVerification) {
        byVerification[f.verification as keyof typeof byVerification]++;
      }
    }

    const openFindings = allFindings.length;
    const criticalPlusHigh = bySeverity.critical + bySeverity.high;

    // Affected modules
    const moduleNodes = this.db
      .prepare("SELECT id, label FROM nodes WHERE project_id = ? AND type = 'module' ORDER BY label ASC")
      .all(projectId) as Array<{ id: string; label: string }>;

    // Map each child node id -> parent module id
    const childNodes = this.db
      .prepare('SELECT id, parent_id FROM nodes WHERE project_id = ? AND parent_id IS NOT NULL')
      .all(projectId) as Array<{ id: string; parent_id: string }>;

    const nodeToModule = new Map<string, string>();
    for (const cn of childNodes) {
      nodeToModule.set(cn.id, cn.parent_id);
    }

    const moduleFindingsMap = new Map<string, string[]>(); // moduleId -> list of severities
    for (const m of moduleNodes) {
      moduleFindingsMap.set(m.id, []);
    }

    for (const f of allFindings) {
      let nodeIds: string[] = [];
      try {
        nodeIds = JSON.parse(f.node_ids_json);
      } catch {}

      const affectedModuleIds = new Set<string>();
      for (const nid of nodeIds) {
        if (moduleFindingsMap.has(nid)) {
          affectedModuleIds.add(nid);
        }
        const parentMod = nodeToModule.get(nid);
        if (parentMod && moduleFindingsMap.has(parentMod)) {
          affectedModuleIds.add(parentMod);
        }
      }

      for (const mid of affectedModuleIds) {
        moduleFindingsMap.get(mid)!.push(f.severity);
      }
    }

    const affectedModules: Array<{
      moduleId: string;
      label: string;
      findingCount: number;
      maxSeverity: string | null;
    }> = [];

    for (const m of moduleNodes) {
      const sevs = moduleFindingsMap.get(m.id) || [];
      if (sevs.length > 0) {
        affectedModules.push({
          moduleId: m.id,
          label: m.label,
          findingCount: sevs.length,
          maxSeverity: getMaxSeverity(sevs),
        });
      }
    }

    // Sort affected modules by finding count desc, label asc
    affectedModules.sort((a, b) => b.findingCount - a.findingCount || a.label.localeCompare(b.label));

    return {
      lastScan: {
        finished_at: latestScan.finished_at ?? null,
        status: latestScan.status,
      },
      counts: {
        nodes: nodeCount,
        edges: edgeCount,
        unresolvedEdges: unresolvedEdgeCount,
        files: filesCount,
      },
      kpi: {
        openFindings,
        criticalPlusHigh,
        fixesPendingApproval: 0,
        verifiedFixes: 0,
      },
      bySeverity,
      byConfidence,
      byVerification,
      affectedModules,
    };
  }
}
