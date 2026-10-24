import type Database from 'better-sqlite3';
import type { Fix, FixStatus } from '../types.js';

export interface ProjectFixItem {
  id: string;
  finding_id: string;
  finding_title: string;
  finding_severity: string;
  diff_text: string;
  files: string[];
  status: FixStatus;
  approved_at: string | null;
  patch_path: string | null;
}

export interface ListProjectFixesOptions {
  status?: string;
  page: number;
  pageSize: number;
}

export interface ListProjectFixesResult {
  items: ProjectFixItem[];
  total: number;
  page: number;
  pageSize: number;
}

function toFix(row: any): Fix {
  let files: string[] = [];
  try {
    files = JSON.parse(row.files_json || '[]');
  } catch {}

  return {
    id: row.id,
    finding_id: row.finding_id,
    diff_text: row.diff_text,
    files,
    status: row.status as FixStatus,
    approved_at: row.approved_at ?? null,
  };
}

export class FixesRepository {
  constructor(private db: Database.Database) {}

  findProposedByFindingId(findingId: string): Fix | undefined {
    const stmt = this.db.prepare(
      "SELECT * FROM fixes WHERE finding_id = ? AND status = 'proposed' ORDER BY id DESC LIMIT 1"
    );
    const row = stmt.get(findingId);
    return row ? toFix(row) : undefined;
  }

  findByFindingId(findingId: string): Fix[] {
    const stmt = this.db.prepare(
      'SELECT * FROM fixes WHERE finding_id = ? ORDER BY approved_at DESC, id DESC'
    );
    const rows = stmt.all(findingId) as any[];
    return rows.map(toFix);
  }

  findById(id: string): (Fix & { project_id: string; finding_title: string; finding_verification: string }) | undefined {
    const stmt = this.db.prepare(`
      SELECT f.*, fn.project_id, fn.title as finding_title, fn.verification as finding_verification
      FROM fixes f
      JOIN findings fn ON f.finding_id = fn.id
      WHERE f.id = ?
    `);
    const row = stmt.get(id) as any;
    if (!row) return undefined;

    const base = toFix(row);
    return {
      ...base,
      project_id: row.project_id,
      finding_title: row.finding_title,
      finding_verification: row.finding_verification,
    };
  }

  findByProjectId(
    projectId: string,
    options: ListProjectFixesOptions
  ): ListProjectFixesResult {
    let countSql = `
      SELECT COUNT(*) as total
      FROM fixes f
      JOIN findings fn ON f.finding_id = fn.id
      WHERE fn.project_id = ?
    `;
    let querySql = `
      SELECT f.*, fn.title as finding_title, fn.severity as finding_severity
      FROM fixes f
      JOIN findings fn ON f.finding_id = fn.id
      WHERE fn.project_id = ?
    `;
    const params: unknown[] = [projectId];

    if (options.status) {
      countSql += ' AND f.status = ?';
      querySql += ' AND f.status = ?';
      params.push(options.status);
    }

    querySql += ' ORDER BY f.id DESC LIMIT ? OFFSET ?';

    const countRow = this.db.prepare(countSql).get(...params) as { total: number } | undefined;
    const total = countRow?.total ?? 0;

    const offset = (options.page - 1) * options.pageSize;
    const rows = this.db.prepare(querySql).all(...params, options.pageSize, offset) as any[];

    const items: ProjectFixItem[] = rows.map((r) => {
      let files: string[] = [];
      try {
        files = JSON.parse(r.files_json || '[]');
      } catch {}

      return {
        id: r.id,
        finding_id: r.finding_id,
        finding_title: r.finding_title,
        finding_severity: r.finding_severity,
        diff_text: r.diff_text,
        files,
        status: r.status as FixStatus,
        approved_at: r.approved_at ?? null,
        patch_path: r.status === 'approved' ? `patches/${r.id}.patch` : null,
      };
    });

    return {
      items,
      total,
      page: options.page,
      pageSize: options.pageSize,
    };
  }

  createFix(input: {
    id: string;
    finding_id: string;
    diff_text: string;
    files_json: string;
    status: FixStatus;
  }): Fix {
    const insertStmt = this.db.prepare(`
      INSERT INTO fixes (id, finding_id, diff_text, files_json, status, approved_at)
      VALUES (?, ?, ?, ?, ?, NULL)
    `);

    const updateFinding = this.db.prepare(`
      UPDATE findings
      SET verification = 'fix_proposed'
      WHERE id = ?
    `);

    const tx = this.db.transaction(() => {
      insertStmt.run(
        input.id,
        input.finding_id,
        input.diff_text,
        input.files_json,
        input.status
      );
      updateFinding.run(input.finding_id);
    });

    tx();

    return toFix({
      ...input,
      approved_at: null,
    });
  }

  approveFix(id: string): Fix {
    const approvedAt = new Date().toISOString();
    const updateStmt = this.db.prepare(`
      UPDATE fixes
      SET status = 'approved', approved_at = ?
      WHERE id = ?
    `);

    updateStmt.run(approvedAt, id);

    const updated = this.db.prepare('SELECT * FROM fixes WHERE id = ?').get(id);
    return toFix(updated);
  }

  rejectFix(id: string, findingId: string): Fix {
    const updateStmt = this.db.prepare(`
      UPDATE fixes
      SET status = 'rejected'
      WHERE id = ?
    `);

    const countOtherActive = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM fixes
      WHERE finding_id = ? AND status IN ('proposed', 'approved') AND id != ?
    `);

    const revertFinding = this.db.prepare(`
      UPDATE findings
      SET verification = 'not_tested'
      WHERE id = ?
    `);

    const tx = this.db.transaction(() => {
      updateStmt.run(id);
      const row = countOtherActive.get(findingId, id) as { count: number };
      if (row.count === 0) {
        revertFinding.run(findingId);
      }
    });

    tx();

    const updated = this.db.prepare('SELECT * FROM fixes WHERE id = ?').get(id);
    return toFix(updated);
  }
}
