export type FixStatus = 'proposed' | 'approved' | 'rejected';

export interface Fix {
  id: string;
  finding_id: string;
  diff_text: string;
  files: string[];
  status: FixStatus;
  approved_at: string | null;
  patch_path?: string | null;
}

export type { FindingSeverity, ProjectFixItem, ProjectFixesResult } from '../../../../shared/types.js';

export type DiffLineKind = 'add' | 'del' | 'context' | 'meta';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldNo?: number;
  newNo?: number;
}

export interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface ParsedDiff {
  header: string[];
  hunks: DiffHunk[];
  truncated?: boolean;
}

export interface FixesUrlState {
  fix?: string;
  finding?: string;
  status?: FixStatus;
  page: number;
}
