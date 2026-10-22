-- Migration 002: Project files table

CREATE TABLE IF NOT EXISTS project_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  size INTEGER NOT NULL,
  language TEXT NOT NULL,
  sensitive INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_path ON project_files(path);
