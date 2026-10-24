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
  languages: string[];
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

export interface FindingEvidenceItem {
  file?: string;
  line_start?: number;
  line_end?: number;
  specifier?: string;
  pattern?: string;
  [key: string]: unknown;
}

export interface FindingNode {
  id: string;
  label: string;
  type: NodeType | string;
  path: string;
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
  evidence: FindingEvidenceItem[];
  node_ids: string[];
  likely_cause: string | null;
  not_confirmed: string | null;
  created_at: string;
  evidence_json?: string | null;
  node_ids_json?: string | null;
}

export interface FindingDetailData extends Finding {
  nodes: FindingNode[];
}

export interface PaginatedFindings {
  items: Finding[];
  page: number;
  pageSize: number;
  total: number;
}

export interface FindingsQueryParams {
  severity?: FindingSeverity;
  confidence?: FindingConfidence;
  verification?: FindingVerification;
  rule_id?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface Fix {
  id: string;
  finding_id: string;
  diff_text: string;
  files: string[];
  status: FixStatus;
  approved_at: string | null;
  patch_path?: string | null;
}

export interface ProjectFixItem {
  id: string;
  finding_id: string;
  finding_title: string;
  finding_severity: FindingSeverity;
  diff_text: string;
  files: string[];
  status: FixStatus;
  approved_at: string | null;
  patch_path: string | null;
}

export interface ProjectFixesResult {
  items: ProjectFixItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TestRun {
  id: string;
  project_id: string;
  scan_id?: string | null;
  name: string;
  status: TestRunStatus;
  created_at?: string | null;
}

export interface Report {
  id: string;
  project_id: string;
  created_at: string;
  markdown: string;
}

export interface ReportListItem {
  id: string;
  project_id: string;
  created_at: string;
}

export interface PaginatedReportsResult {
  items: ReportListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProjectSummary {
  lastScan: {
    finished_at: string | null;
    status: string;
  } | null;
  counts: {
    nodes: number;
    edges: number;
    unresolvedEdges: number;
    files: number;
  };
  kpi: {
    openFindings: number;
    criticalPlusHigh: number;
    fixesPendingApproval: number;
    verifiedFixes: number;
  };
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
  };
  byConfidence: {
    confirmed: number;
    likely: number;
    hypothesis: number;
  };
  byVerification: {
    not_tested: number;
    reproduced: number;
    fix_proposed: number;
    fix_verified: number;
  };
  affectedModules: Array<{
    moduleId: string;
    label: string;
    findingCount: number;
    maxSeverity: FindingSeverity | null;
  }>;
}

export interface GraphNode extends Node {
  findingCount?: number;
  maxSeverity?: FindingSeverity | null;
  focused?: boolean;
}

export interface GraphCluster {
  id: string;
  label: string;
  count: number;
  sample_node_ids?: string[];
}

export interface GraphEdge extends Edge {
  count?: number;
  derived?: boolean;
  evidence?: Record<string, unknown> | null;
}

export interface GraphResponseData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  shown: number;
  total: number;
  level: NodeLevel;
  focus: string | null;
}

export interface NodeDetailsEdge {
  id: string;
  relation: EdgeRelation;
  status: EdgeStatus;
  confidence: FindingConfidence;
  evidence?: Record<string, unknown> | null;
  otherNode: {
    id: string;
    label: string;
    type: NodeType;
    path: string;
  };
}

export interface NodeDetailsData {
  node: GraphNode;
  parentModule: {
    id: string;
    label: string;
    path: string;
  } | null;
  incomingEdges: NodeDetailsEdge[];
  outgoingEdges: NodeDetailsEdge[];
  lineRange: {
    start: number | null;
    end: number | null;
  } | null;
  relatedFindings: Array<{
    id: string;
    title: string;
    severity: FindingSeverity;
    confidence: FindingConfidence;
    verification: FindingVerification;
  }>;
}

export interface GraphSearchResponseData {
  items: GraphNode[];
  total: number;
}

export interface GraphSearchParams {
  q?: string;
  type?: NodeType;
  severity?: FindingSeverity;
  verification?: FindingVerification;
  limit?: number;
  offset?: number;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface ApiError {
  data: null;
  error: string;
}

