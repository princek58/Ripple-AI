import type Database from 'better-sqlite3';
import type { Scan } from '../types.js';
import type { GraphNode, GraphEdge } from '../analysis/graphBuilder/types.js';

export interface CreateScanInput {
  id: string;
  project_id: string;
  started_at: string;
  status: string;
  files_total?: number;
  files_skipped?: number;
  notes?: string | null;
}

export interface CompleteScanInput {
  finished_at: string;
  status: 'completed' | 'failed';
  files_total: number;
  files_skipped: number;
  notes: string | null;
}

export class ScansRepository {
  constructor(private db: Database.Database) {}

  create(input: CreateScanInput): Scan {
    const stmt = this.db.prepare(`
      INSERT INTO scans (id, project_id, started_at, status, files_total, files_skipped, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.id,
      input.project_id,
      input.started_at,
      input.status,
      input.files_total ?? 0,
      input.files_skipped ?? 0,
      input.notes ?? null
    );

    return {
      id: input.id,
      project_id: input.project_id,
      started_at: input.started_at,
      finished_at: null,
      status: input.status,
      files_total: input.files_total ?? 0,
      files_skipped: input.files_skipped ?? 0,
      notes: input.notes ?? null,
    };
  }

  update(id: string, input: CompleteScanInput): void {
    const stmt = this.db.prepare(`
      UPDATE scans
      SET status = ?, finished_at = ?, files_total = ?, files_skipped = ?, notes = ?
      WHERE id = ?
    `);

    stmt.run(
      input.status,
      input.finished_at,
      input.files_total,
      input.files_skipped,
      input.notes,
      id
    );
  }

  findById(id: string): Scan | undefined {
    const stmt = this.db.prepare('SELECT * FROM scans WHERE id = ?');
    return stmt.get(id) as Scan | undefined;
  }

  findByProjectId(projectId: string): Scan[] {
    const stmt = this.db.prepare('SELECT * FROM scans WHERE project_id = ? ORDER BY started_at DESC');
    return stmt.all(projectId) as Scan[];
  }

  /**
   * Replaces the graph and findings for a project atomically inside a single transaction.
   * Deletes old findings, edges, and nodes, inserts new ones, and marks scan completed.
   */
  saveGraphTransaction(
    projectId: string,
    scanId: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
    scanUpdate: CompleteScanInput,
    findings: any[] = []
  ): Scan {
    const deleteFindings = this.db.prepare('DELETE FROM findings WHERE project_id = ?');
    const deleteEdges = this.db.prepare('DELETE FROM edges WHERE project_id = ?');
    const deleteNodes = this.db.prepare('DELETE FROM nodes WHERE project_id = ?');

    const insertNode = this.db.prepare(`
      INSERT INTO nodes (
        id, project_id, scan_id, type, level, parent_id,
        label, path, line_start, line_end, language, meta_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertEdge = this.db.prepare(`
      INSERT INTO edges (
        id, project_id, scan_id, source_id, target_id,
        relation, status, confidence, evidence_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertFinding = this.db.prepare(`
      INSERT INTO findings (
        id, project_id, scan_id, rule_id, title, summary,
        severity, confidence, verification, evidence_json,
        node_ids_json, likely_cause, not_confirmed, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateScanStmt = this.db.prepare(`
      UPDATE scans
      SET status = ?, finished_at = ?, files_total = ?, files_skipped = ?, notes = ?
      WHERE id = ?
    `);

    const updateProjectLastScan = this.db.prepare(`
      UPDATE projects
      SET last_scan_at = ?
      WHERE id = ?
    `);

    const tx = this.db.transaction(() => {
      // 1. Delete previous findings, edges, and nodes
      deleteFindings.run(projectId);
      deleteEdges.run(projectId);
      deleteNodes.run(projectId);

      // 2. Insert new nodes
      for (const node of nodes) {
        insertNode.run(
          node.id,
          node.project_id,
          node.scan_id,
          node.type,
          node.level,
          node.parent_id ?? null,
          node.label,
          node.path,
          node.line_start ?? null,
          node.line_end ?? null,
          node.language ?? null,
          node.meta_json ?? null
        );
      }

      // 3. Insert new edges
      for (const edge of edges) {
        insertEdge.run(
          edge.id,
          edge.project_id,
          edge.scan_id,
          edge.source_id,
          edge.target_id,
          edge.relation,
          edge.status,
          edge.confidence,
          edge.evidence_json ?? null
        );
      }

      // 4. Insert new findings
      for (const finding of findings) {
        insertFinding.run(
          finding.id,
          finding.project_id,
          finding.scan_id,
          finding.rule_id,
          finding.title,
          finding.summary,
          finding.severity,
          finding.confidence,
          finding.verification,
          finding.evidence_json ?? null,
          finding.node_ids_json ?? null,
          finding.likely_cause ?? null,
          finding.not_confirmed ?? null,
          finding.created_at || new Date().toISOString()
        );
      }

      // 5. Update scan status
      updateScanStmt.run(
        scanUpdate.status,
        scanUpdate.finished_at,
        scanUpdate.files_total,
        scanUpdate.files_skipped,
        scanUpdate.notes,
        scanId
      );

      // 6. Update project last_scan_at
      updateProjectLastScan.run(scanUpdate.finished_at, projectId);
    });

    tx();

    return this.findById(scanId)!;
  }
}
