import type { GraphNode, GraphEdge } from '../analysis/graphBuilder/types.js';
import type { ScannedFile } from '../analysis/scanner/types.js';

export interface CheckEvidence {
  file: string;
  line_start: number;
  line_end: number;
  pattern?: string;
  specifier?: string;
}

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';
export type FindingConfidence = 'confirmed' | 'likely' | 'hypothesis';
export type FindingVerification = 'not_tested' | 'reproduced' | 'fix_proposed' | 'fix_verified';

export interface CheckFinding {
  id?: string;
  project_id: string;
  scan_id: string;
  rule_id: 'circular_dependency' | 'broken_import' | 'isolated_file' | 'env_undeclared' | 'api_unmatched_call' | 'secret_pattern';
  title: string;
  summary: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  verification: FindingVerification;
  evidence_json: string;
  node_ids_json: string;
  likely_cause: string | null;
  not_confirmed: string | null;
  created_at?: string;
}

export interface CheckContext {
  projectId: string;
  scanId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  files: ScannedFile[];
}

export type CheckFunction = (context: CheckContext) => CheckFinding[];
