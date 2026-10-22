-- Migration 005: Add scan_id and created_at to test_runs, plus fixes and reports indexes
ALTER TABLE test_runs ADD COLUMN scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE;
ALTER TABLE test_runs ADD COLUMN created_at TEXT;

CREATE INDEX IF NOT EXISTS idx_test_runs_project_id ON test_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_scan_id ON test_runs(scan_id);
CREATE INDEX IF NOT EXISTS idx_fixes_finding_id ON fixes(finding_id);
CREATE INDEX IF NOT EXISTS idx_reports_project_id ON reports(project_id);
