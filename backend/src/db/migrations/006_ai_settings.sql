-- Migration 006: AI settings, user consent, and response cache

CREATE TABLE IF NOT EXISTS ai_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ai_enabled INTEGER NOT NULL DEFAULT 0,
  ai_code_enabled INTEGER NOT NULL DEFAULT 0,
  consent_version TEXT DEFAULT NULL,
  consent_given_at TEXT DEFAULT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO ai_settings (id, ai_enabled, ai_code_enabled, consent_version, consent_given_at, updated_at)
VALUES (1, 0, 0, NULL, NULL, CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key TEXT PRIMARY KEY,
  response_text TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_created_at ON ai_cache (created_at);
