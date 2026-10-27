-- Migration 008: Persistent project chat messages

CREATE TABLE IF NOT EXISTS project_chat_messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_chat_messages_project_id_created_at
  ON project_chat_messages (project_id, created_at);
