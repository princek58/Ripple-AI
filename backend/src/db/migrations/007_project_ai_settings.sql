-- Migration 007: Per-project AI settings and consent

CREATE TABLE IF NOT EXISTS project_ai_settings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  ai_enabled INTEGER NOT NULL DEFAULT 0,
  share_code INTEGER NOT NULL DEFAULT 0,
  consent_version TEXT DEFAULT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_ai_settings_project_id ON project_ai_settings (project_id);
