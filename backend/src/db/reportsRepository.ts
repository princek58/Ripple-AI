import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Report } from '../types.js';

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

  findByProjectId(projectId: string): Report[] {
    const stmt = this.db.prepare(
      'SELECT * FROM reports WHERE project_id = ? ORDER BY created_at DESC'
    );
    return stmt.all(projectId) as Report[];
  }
}
