import type Database from 'better-sqlite3';
import type { Project } from '../types.js';

export interface CreateProjectInput {
  id: string;
  name: string;
  created_at?: string;
  size_bytes?: number;
  file_count?: number;
  languages?: string | string[];
  last_scan_at?: string | null;
}

export interface CreateProjectWithScanAndFilesInput {
  project: {
    id: string;
    name: string;
    size_bytes: number;
    file_count: number;
    languages: string | string[];
    created_at?: string;
    last_scan_at?: string | null;
  };
  scan: {
    id: string;
    started_at: string;
    finished_at?: string | null;
    status: string;
    files_total: number;
    files_skipped: number;
    notes?: string | null;
  };
  files: Array<{
    id: string;
    path: string;
    size: number;
    language: string;
    sensitive: boolean;
  }>;
}

export interface ListFilesOptions {
  page: number;
  pageSize: number;
  q?: string;
}

export interface ListFilesResult {
  items: Array<{
    id: string;
    path: string;
    size: number;
    language: string;
    sensitive: boolean;
  }>;
  page: number;
  pageSize: number;
  total: number;
}

function parseLanguages(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

function toProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    size_bytes: row.size_bytes,
    file_count: row.file_count,
    languages: parseLanguages(row.languages),
    last_scan_at: row.last_scan_at ?? null,
  };
}

export class ProjectsRepository {
  constructor(private db: Database.Database) {}

  findAll(): Project[] {
    const stmt = this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
    const rows = stmt.all() as any[];
    return rows.map(toProject);
  }

  findById(id: string): Project | undefined {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    const row = stmt.get(id);
    return row ? toProject(row) : undefined;
  }

  create(project: CreateProjectInput): Project {
    const createdAt = project.created_at || new Date().toISOString();
    const sizeBytes = project.size_bytes ?? 0;
    const fileCount = project.file_count ?? 0;
    const languagesStr = Array.isArray(project.languages)
      ? JSON.stringify(project.languages)
      : (project.languages ?? '[]');
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
      languagesStr,
      lastScanAt
    );

    return toProject({
      id: project.id,
      name: project.name,
      created_at: createdAt,
      size_bytes: sizeBytes,
      file_count: fileCount,
      languages: languagesStr,
      last_scan_at: lastScanAt,
    });
  }

  createWithScanAndFiles(input: CreateProjectWithScanAndFilesInput): Project {
    const createdAt = input.project.created_at || new Date().toISOString();
    const lastScanAt = input.project.last_scan_at ?? createdAt;
    const languagesStr = Array.isArray(input.project.languages)
      ? JSON.stringify(input.project.languages)
      : (input.project.languages ?? '[]');

    const insertProject = this.db.prepare(`
      INSERT INTO projects (id, name, created_at, size_bytes, file_count, languages, last_scan_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertScan = this.db.prepare(`
      INSERT INTO scans (id, project_id, started_at, finished_at, status, files_total, files_skipped, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertFile = this.db.prepare(`
      INSERT INTO project_files (id, project_id, scan_id, path, size, language, sensitive)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction(() => {
      insertProject.run(
        input.project.id,
        input.project.name,
        createdAt,
        input.project.size_bytes,
        input.project.file_count,
        languagesStr,
        lastScanAt
      );

      insertScan.run(
        input.scan.id,
        input.project.id,
        input.scan.started_at,
        input.scan.finished_at ?? new Date().toISOString(),
        input.scan.status,
        input.scan.files_total,
        input.scan.files_skipped,
        input.scan.notes ?? null
      );

      for (const file of input.files) {
        insertFile.run(
          file.id,
          input.project.id,
          input.scan.id,
          file.path,
          file.size,
          file.language,
          file.sensitive ? 1 : 0
        );
      }
    });

    tx();

    return toProject({
      id: input.project.id,
      name: input.project.name,
      created_at: createdAt,
      size_bytes: input.project.size_bytes,
      file_count: input.project.file_count,
      languages: languagesStr,
      last_scan_at: lastScanAt,
    });
  }

  findFiles(projectId: string, options: ListFilesOptions): ListFilesResult {
    let countSql = 'SELECT COUNT(*) as count FROM project_files WHERE project_id = ?';
    let selectSql = 'SELECT id, path, size, language, sensitive FROM project_files WHERE project_id = ?';
    const params: unknown[] = [projectId];

    if (options.q && options.q.trim()) {
      countSql += ' AND LOWER(path) LIKE ?';
      selectSql += ' AND LOWER(path) LIKE ?';
      params.push(`%${options.q.trim().toLowerCase()}%`);
    }

    selectSql += ' ORDER BY path ASC LIMIT ? OFFSET ?';

    const countRow = this.db.prepare(countSql).get(...params) as { count: number } | undefined;
    const total = countRow?.count ?? 0;

    const offset = (options.page - 1) * options.pageSize;
    const rows = this.db.prepare(selectSql).all(...params, options.pageSize, offset) as Array<{
      id: string;
      path: string;
      size: number;
      language: string;
      sensitive: number;
    }>;

    const items = rows.map((r) => ({
      id: r.id,
      path: r.path,
      size: r.size,
      language: r.language,
      sensitive: Boolean(r.sensitive),
    }));

    return {
      items,
      page: options.page,
      pageSize: options.pageSize,
      total,
    };
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM projects WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  getTestRuns(projectId: string): {
    items: Array<{ id: string; name: string; status: string }>;
    counts: { pass: number; fail: number; skipped: number; not_run: number };
    note: string;
  } {
    const rows = this.db
      .prepare('SELECT id, name, status FROM test_runs WHERE project_id = ? ORDER BY name ASC')
      .all(projectId) as Array<{ id: string; name: string; status: string }>;

    const counts = { pass: 0, fail: 0, skipped: 0, not_run: 0 };
    for (const r of rows) {
      if (r.status in counts) {
        counts[r.status as keyof typeof counts]++;
      }
    }

    return {
      items: rows,
      counts,
      note: 'Tests are not executed in Phase 1.',
    };
  }
}
