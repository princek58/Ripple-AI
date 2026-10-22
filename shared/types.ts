export type NodeType =
  | 'project'
  | 'module'
  | 'frontend'
  | 'backend'
  | 'api'
  | 'database'
  | 'config'
  | 'test';

export type NodeLevel = 1 | 2 | 3;

export type EdgeRelation =
  | 'imports'
  | 'calls'
  | 'serves'
  | 'reads'
  | 'writes'
  | 'configures'
  | 'tests';

export type EdgeStatus = 'resolved' | 'possible' | 'unresolved';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export type FindingConfidence = 'confirmed' | 'likely' | 'hypothesis';

export type FindingVerification =
  | 'not_tested'
  | 'reproduced'
  | 'fix_proposed'
  | 'fix_verified';

export type FixStatus = 'proposed' | 'approved' | 'rejected';

export type TestRunStatus = 'pass' | 'fail' | 'skipped' | 'not_run';

export interface Project {
  id: string;
  name: string;
  created_at: string;
  size_bytes: number;
  file_count: number;
  languages: string;
  last_scan_at: string | null;
}

export interface Scan {
  id: string;
  project_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  files_total: number;
  files_skipped: number;
  notes: string | null;
}

export interface Node {
  id: string;
  project_id: string;
  scan_id: string;
  type: NodeType;
  level: NodeLevel;
  parent_id: string | null;
  label: string;
  path: string;
  line_start: number | null;
  line_end: number | null;
  language: string | null;
  meta_json: string | null;
}

export interface Edge {
  id: string;
  project_id: string;
  scan_id: string;
  source_id: string;
  target_id: string;
  relation: EdgeRelation;
  status: EdgeStatus;
  confidence: FindingConfidence;
  evidence_json: string | null;
}

export interface Finding {
  id: string;
  project_id: string;
  scan_id: string;
  rule_id: string;
  title: string;
  summary: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  verification: FindingVerification;
  evidence_json: string | null;
  node_ids_json: string | null;
  likely_cause: string | null;
  not_confirmed: string | null;
  created_at: string;
}

export interface Fix {
  id: string;
  finding_id: string;
  diff_text: string;
  files_json: string | null;
  status: FixStatus;
  approved_at: string | null;
}

export interface TestRun {
  id: string;
  project_id: string;
  name: string;
  status: TestRunStatus;
}

export interface Report {
  id: string;
  project_id: string;
  created_at: string;
  markdown: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}
