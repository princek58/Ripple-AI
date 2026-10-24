import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Report } from '../types.js';

export interface ReportListItem {
  id: string;
  project_id: string;
  created_at: string;
}

export interface ListReportsOptions {
  page: number;
  pageSize: number;
}

export interface ListReportsResult {
  items: ReportListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export class ReportsRepository {
  constructor(private db: Database.Database) {}

  create(projectId: string, markdown: string): Report {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO reports (id, project_id, created_at, markdown)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, projectId, createdAt, markdown);

    return {
      id,
      project_id: projectId,
      created_at: createdAt,
      markdown,
    };
  }

  findById(id: string): Report | undefined {
    const stmt = this.db.prepare('SELECT * FROM reports WHERE id = ?');
    return stmt.get(id) as Report | undefined;
  }

  findByProjectId(
    projectId: string,
    options: ListReportsOptions = { page: 1, pageSize: 25 }
  ): ListReportsResult {
    const countRow = this.db
      .prepare('SELECT COUNT(*) as total FROM reports WHERE project_id = ?')
      .get(projectId) as { total: number } | undefined;
    const total = countRow?.total ?? 0;

    const offset = (options.page - 1) * options.pageSize;
    const stmt = this.db.prepare(
      'SELECT id, project_id, created_at FROM reports WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    );
    const rows = stmt.all(projectId, options.pageSize, offset) as ReportListItem[];

    return {
      items: rows,
      total,
      page: options.page,
      pageSize: options.pageSize,
    };
  }
}
