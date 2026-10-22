import type { NodeType, NodeLevel, EdgeRelation, EdgeStatus, FindingConfidence } from '../../types.js';

export interface GraphNode {
  id: string;
  project_id: string;
  scan_id: string;
  type: NodeType;
  level: NodeLevel;
  parent_id: string | null;
  label: string;
  path: string;
  line_start?: number | null;
  line_end?: number | null;
  language?: string | null;
  meta_json?: string | null;
}

export interface GraphEdge {
  id: string;
  project_id: string;
  scan_id: string;
  source_id: string;
  target_id: string;
  relation: EdgeRelation;
  status: EdgeStatus;
  confidence: FindingConfidence;
  evidence_json?: string | null;
}

export interface BuildGraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  filesTotal: number;
  filesSkipped: number;
  unresolvedCount: number;
  notes: string;
}
