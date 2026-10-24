import type { Project, ProjectSummary } from '../../../shared/types.js';

export interface HasLastScanAt {
  last_scan_at?: string | null;
}

export interface HasNodeCount {
  counts?: {
    nodes?: number;
  };
}

/**
 * Single unified helper to determine if a project has never undergone code analysis.
 *
 * Backend decides "never scanned" with `SELECT COUNT(*) FROM nodes WHERE project_id = ?` being 0.
 * The upload endpoint creates an extraction scan row and sets projects.last_scan_at.
 * Therefore, when summary is available, summary.counts.nodes === 0 is the definitive indicator.
 * When summary is not available (or null), we fall back to !project.last_scan_at.
 */
export function isNeverScanned(
  project?: HasLastScanAt | Project | null,
  summary?: HasNodeCount | ProjectSummary | null
): boolean {
  if (!project) {
    return false;
  }
  if (summary && summary.counts && typeof summary.counts.nodes === 'number') {
    return summary.counts.nodes === 0;
  }
  return !project.last_scan_at;
}
