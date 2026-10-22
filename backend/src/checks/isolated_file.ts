import crypto from 'node:crypto';
import path from 'node:path';
import type { CheckContext, CheckFinding } from './types.js';

const ENTRY_PATTERN = /^(index|main|server|app)\.[a-z0-9]+$/i;
const PARSEABLE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

function isParseableSource(filePath: string): boolean {
  const dotIdx = filePath.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const ext = filePath.slice(dotIdx).toLowerCase();
  return PARSEABLE_EXTENSIONS.has(ext);
}

/**
 * Checks for source files that have zero incoming import, call, or test edges.
 * Excludes entry points, config files, test files, and non-parseable assets.
 */
export function checkIsolatedFile(context: CheckContext): CheckFinding[] {
  const { projectId, scanId, nodes, edges } = context;

  // Build incoming edge counts for each node (imports, calls, tests)
  const incomingCount = new Map<string, number>();
  for (const edge of edges) {
    if (['imports', 'calls', 'tests'].includes(edge.relation)) {
      incomingCount.set(edge.target_id, (incomingCount.get(edge.target_id) || 0) + 1);
    }
  }

  const findings: CheckFinding[] = [];

  for (const node of nodes) {
    // Only file nodes (level 3) of code types
    if (node.level !== 3) continue;
    if (node.type !== 'frontend' && node.type !== 'backend' && node.type !== 'database') {
      continue;
    }

    const baseName = path.posix.basename(node.path || node.label);

    // 1. Exclude entry-like files (index.*, main.*, server.*, app.*, App.*)
    if (ENTRY_PATTERN.test(baseName)) {
      continue;
    }

    // 2. Exclude test files
    if (
      /\.(test|spec)\.[a-z0-9]+$/i.test(node.path) ||
      node.path.includes('__tests__') ||
      node.path.includes('/tests/')
    ) {
      continue;
    }

    // 3. Exclude config files
    if (
      node.path.includes('/config/') ||
      node.path.endsWith('.json') ||
      node.path.endsWith('.yaml') ||
      node.path.endsWith('.yml') ||
      node.path.includes('.env')
    ) {
      continue;
    }

    // 4. Exclude non-parseable files
    if (!isParseableSource(node.path)) {
      continue;
    }

    // Check incoming edges
    const incoming = incomingCount.get(node.id) || 0;
    if (incoming === 0) {
      findings.push({
        id: crypto.randomUUID(),
        project_id: projectId,
        scan_id: scanId,
        rule_id: 'isolated_file',
        title: `Isolated file "${baseName}" is never imported or tested`,
        summary: `The file "${node.path}" has no incoming imports, calls, or test references in the project graph.`,
        severity: 'low',
        confidence: 'hypothesis',
        verification: 'not_tested',
        evidence_json: JSON.stringify([
          {
            file: node.path,
            line_start: 1,
            line_end: 1,
          },
        ]),
        node_ids_json: JSON.stringify([node.id]),
        likely_cause: 'Dead code left after a refactor, an abandoned module, or an unreferenced utility file.',
        not_confirmed: 'It may be loaded dynamically, by a framework, or by a build tool.',
        created_at: new Date().toISOString(),
      });
    }
  }

  return findings;
}
