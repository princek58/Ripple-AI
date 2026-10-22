import type Database from 'better-sqlite3';
import type { Project } from '../types.js';

export interface CreateProjectInput {
  id: string;
  name: string;
  created_at?: string;
  size_bytes?: number;
  file_count?: number;
  languages?: string;
  last_scan_at?: string | null;
}

export class ProjectsRepository {
  constructor(private db: Database.Database) {}

  findAll(): Project[] {
    const stmt = this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
    return stmt.all() as Project[];
  }

  findById(id: string): Project | undefined {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    return stmt.get(id) as Project | undefined;
  }

  create(project: CreateProjectInput): Project {
    const createdAt = project.created_at || new Date().toISOString();
    const sizeBytes = project.size_bytes ?? 0;
    const fileCount = project.file_count ?? 0;
    const languages = project.languages ?? '[]';
    const lastScanAt = project.last_scan_at ?? null;

    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, created_at, size_bytes, file_count, languages, last_scan_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      project.id,
      project.name,
      createdAt,
      sizeBytes,
      fileCount,
      languages,
      lastScanAt
    );

    return {
      id: project.id,
      name: project.name,
      created_at: createdAt,
      size_bytes: sizeBytes,
      file_count: fileCount,
      languages,
      last_scan_at: lastScanAt,
    };
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM projects WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
