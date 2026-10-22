-- Migration 004: Findings filter and summary indexes
CREATE INDEX IF NOT EXISTS idx_findings_project_rule ON findings(project_id, rule_id);
CREATE INDEX IF NOT EXISTS idx_findings_project_severity ON findings(project_id, severity);
CREATE INDEX IF NOT EXISTS idx_findings_project_verification ON findings(project_id, verification);
