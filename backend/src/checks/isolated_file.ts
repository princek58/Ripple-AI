import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckFinding } from './types.js';

const ENTRY_PATTERN = /^(index|main|server|app)\.[a-z0-9]+$/i;
const PARSEABLE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

export const BUILD_TOOLING_CONFIG_PATTERNS = [
  /\.config\.[a-z0-9]+$/i,
  /^vite\.config\.[a-z0-9]+$/i,
  /^tailwind\.[a-z0-9.]+/i,
  /^postcss\.[a-z0-9.]+/i,
  /^webpack\.[a-z0-9.]+/i,
];

export function isBuildConfigOrTooling(filePath: string): boolean {
  const base = path.posix.basename(filePath);
  return BUILD_TOOLING_CONFIG_PATTERNS.some((pattern) => pattern.test(base));
}

export function isAmbientDeclaration(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith('.d.ts') || lower.endsWith('.d.mts') || lower.endsWith('.d.cts');
}

function isParseableSource(filePath: string): boolean {
  const dotIdx = filePath.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const ext = filePath.slice(dotIdx).toLowerCase();
  return PARSEABLE_EXTENSIONS.has(ext);
}

/**
 * Checks for source files that have zero incoming import, call, or test edges.
 * Excludes entry points, config files, test files, build tooling, ambient declaration files,
 * sibling files in dynamic ORM loader directories, and non-parseable assets.
 */
export function checkIsolatedFile(context: CheckContext): CheckFinding[] {
  const { projectId, scanId, nodes, edges, files } = context;

  // Build incoming edge counts for each node (imports, calls, tests)
  // Only resolved edges from a DIFFERENT node count (self-edges and unresolved edges do not count)
  const incomingCount = new Map<string, number>();
  for (const edge of edges) {
    if (
      ['imports', 'calls', 'tests'].includes(edge.relation) &&
      edge.source_id !== edge.target_id &&
      edge.status === 'resolved'
    ) {
      incomingCount.set(edge.target_id, (incomingCount.get(edge.target_id) || 0) + 1);
    }
  }

  // Identify directories with dynamic ORM/module loaders (e.g. index.js / index.ts using fs.readdirSync)
  const dynamicLoaderDirs = new Set<string>();
  if (Array.isArray(files)) {
    for (const file of files) {
      const normPath = (file.path || '').replace(/\\/g, '/');
      const base = path.posix.basename(normPath);
      if (/^index\.(js|ts|cjs|mjs)$/i.test(base)) {
        let content = file.content;
        if (!content && file.fullPath) {
          try {
            content = fs.readFileSync(file.fullPath, 'utf-8');
          } catch {}
        }
        if (content && /(readdirSync|fs\.readdir)/i.test(content)) {
          dynamicLoaderDirs.add(path.posix.dirname(normPath));
        }
      }
    }
  }

  const findings: CheckFinding[] = [];

  for (const node of nodes) {
    // Only file nodes (level 3) of code types
    if (node.level !== 3) continue;
    if (node.type !== 'frontend' && node.type !== 'backend' && node.type !== 'database') {
      continue;
    }

    const normPath = (node.path || node.label || '').replace(/\\/g, '/');
    const baseName = path.posix.basename(normPath);
    const nodeDir = path.posix.dirname(normPath);

    // 1. Exclude entry-like files (index.*, main.*, server.*, app.*, App.*)
    if (ENTRY_PATTERN.test(baseName)) {
      continue;
    }

    // 2. Exclude test files
    if (
      /\.(test|spec)\.[a-z0-9]+$/i.test(normPath) ||
      normPath.includes('__tests__') ||
      normPath.includes('/tests/')
    ) {
      continue;
    }

    // 3. Exclude config files and build/tooling configuration files
    if (
      normPath.includes('/config/') ||
      normPath.endsWith('.json') ||
      normPath.endsWith('.yaml') ||
      normPath.endsWith('.yml') ||
      normPath.includes('.env') ||
      isBuildConfigOrTooling(baseName)
    ) {
      continue;
    }

    // 4. Exclude TypeScript ambient declaration files (*.d.ts)
    if (isAmbientDeclaration(normPath)) {
      continue;
    }

    // 5. Exclude sibling files in directories using dynamic directory scanning (e.g. Sequelize models)
    if (dynamicLoaderDirs.has(nodeDir)) {
      continue;
    }

    // 6. Exclude non-parseable files
    if (!isParseableSource(normPath)) {
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
