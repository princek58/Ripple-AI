import crypto from 'node:crypto';
import path from 'node:path';
import type { CheckContext, CheckFinding } from './types.js';

/**
 * Checks for unresolved relative imports pointing to nonexistent files.
 * Dynamic imports and runtime-built references are ignored.
 */
export function checkBrokenImport(context: CheckContext): CheckFinding[] {
  const { projectId, scanId, nodes, edges } = context;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const findings: CheckFinding[] = [];

  for (const edge of edges) {
    if (edge.relation !== 'imports' || edge.status !== 'unresolved') {
      continue;
    }

    if (!edge.evidence_json) continue;

    let evidence: any;
    try {
      evidence = JSON.parse(edge.evidence_json);
    } catch {
      continue;
    }

    // Dynamic imports never form broken_import findings
    if (evidence.type === 'dynamic_import_unresolved') {
      continue;
    }

    const specifier = evidence.specifier;
    // Relative specifier only (starts with ./ or ../)
    if (!specifier || (!specifier.startsWith('./') && !specifier.startsWith('../'))) {
      continue;
    }

    const sourceNode = nodeMap.get(edge.source_id);
    const fileName = evidence.file ? path.posix.basename(evidence.file) : (sourceNode?.label || 'file');

    findings.push({
      id: crypto.randomUUID(),
      project_id: projectId,
      scan_id: scanId,
      rule_id: 'broken_import',
      title: `Broken import "${specifier}" in ${fileName}`,
      summary: `The relative import "${specifier}" at line ${evidence.line_start || 1} could not be resolved to any file in the project.`,
      severity: 'high',
      confidence: 'confirmed',
      verification: 'not_tested',
      evidence_json: JSON.stringify([
        {
          file: evidence.file || sourceNode?.path || '',
          line_start: evidence.line_start || 1,
          line_end: evidence.line_end || evidence.line_start || 1,
          specifier,
        },
      ]),
      node_ids_json: JSON.stringify(sourceNode ? [sourceNode.id] : [edge.source_id]),
      likely_cause: 'The target file was moved, deleted, renamed, or the relative import path was misspelled.',
      not_confirmed: 'Whether this code path runs in production.',
      created_at: new Date().toISOString(),
    });
  }

  return findings;
}
