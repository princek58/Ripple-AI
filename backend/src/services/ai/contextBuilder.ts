import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import config from '../../config.js';
import { FindingsRepository } from '../../db/findingsRepository.js';
import { GraphRepository } from '../../db/graphRepository.js';

import { PRIVATE_KEY_PATTERN, CLOUD_KEY_PATTERN } from '../../checks/secret_pattern.js';

export interface FindingContext {
  findingId: string;
  projectId: string;
  ruleId: string;
  title: string;
  summary: string;
  severity: string;
  confidence: string;
  verification: string;
  likelyCause: string | null;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  codeSnippet: string | null;
}

/**
 * Matches an assignment of a string literal of 8 or more characters to a name containing
 * password, secret, token, api_key or apikey (case-insensitive).
 * Formats: name = "x", name: "x", name = 'x', name = `x` (and name: 'x', name: `x`).
 */
export const SECRET_ASSIGNMENT_PATTERN =
  /\b[a-zA-Z0-9_$]*(?:password|secret|token|api_?key)[a-zA-Z0-9_$]*\s*[:=]\s*(?:"[^"\r\n]{8,}"|'[^'\r\n]{8,}'|`[^`\r\n]{8,}`)/i;

export function matchesSecretPattern(text: string): boolean {
  return (
    PRIVATE_KEY_PATTERN.test(text) ||
    CLOUD_KEY_PATTERN.test(text) ||
    SECRET_ASSIGNMENT_PATTERN.test(text)
  );
}

/**
 * Extracts a window of up to 7 lines surrounding the cited line.
 * Format: `<line_number>: <content>`.
 * Rules:
 * - Up to 7 lines (lineStart +/- 3)
 * - Never for sensitive, .env, binary or over-1-MB files or paths that escape backend/storage/<id>/files
 * - The whole snippet is dropped (return null, never redacted) if ANY line matches the scanner's
 *   secret patterns (private keys, cloud keys) or an assignment of an 8+ character string literal
 *   to a name containing password/secret/token/api_key/apikey.
 */
export function extractCodeSnippet(
  filePath: string,
  targetLine: number,
  storageRoot: string,
  projectId: string
): string | null {
  try {
    const baseName = path.basename(filePath).toLowerCase();
    // Exclude .env files
    if (baseName === '.env' || baseName.startsWith('.env.') || baseName.endsWith('.env')) {
      return null;
    }

    const projectFilesDir = path.resolve(storageRoot, projectId, 'files');
    const fullPath = path.resolve(projectFilesDir, filePath);

    // Prevent path traversal outside project files directory
    if (!fullPath.startsWith(projectFilesDir)) {
      return null;
    }

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const stat = fs.statSync(fullPath);
    // Never for files over 1 MB (1048576 bytes)
    if (stat.size > 1048576) {
      return null;
    }

    // Binary check: search for null byte in first 512 bytes
    const fd = fs.openSync(fullPath, 'r');
    const buffer = Buffer.alloc(Math.min(512, stat.size));
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
    if (buffer.includes(0)) {
      return null;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    if (lines.length === 0) {
      return null;
    }

    const clampedTarget = Math.max(1, Math.min(lines.length, targetLine));
    const startLine = Math.max(1, clampedTarget - 3);
    const endLine = Math.min(lines.length, startLine + 6);

    const snippetLines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      const lineText = lines[i - 1] ?? '';
      // If ANY returned line matches a secret pattern or secret assignment, drop the WHOLE snippet (return null)
      if (matchesSecretPattern(lineText)) {
        return null;
      }
      snippetLines.push(`${i}: ${lineText}`);
    }

    return snippetLines.join('\n');
  } catch {
    return null;
  }
}

/**
 * Builds finding context for AI explanation.
 * If includeCode is false, codeSnippet is strictly null (zero lines transmitted).
 */
export function buildFindingContext(
  db: Database.Database,
  findingId: string,
  includeCode: boolean
): FindingContext | null {
  const repo = new FindingsRepository(db);
  const finding = repo.findById(findingId);

  if (!finding) {
    return null;
  }

  const evidenceItem = Array.isArray(finding.evidence) && finding.evidence.length > 0 ? finding.evidence[0] : null;
  const filePath = evidenceItem?.file || (finding.nodes?.[0]?.path ?? null);
  const lineStart = typeof evidenceItem?.line_start === 'number' ? evidenceItem.line_start : null;
  const lineEnd = typeof evidenceItem?.line_end === 'number' ? evidenceItem.line_end : null;

  let codeSnippet: string | null = null;
  if (includeCode && filePath && lineStart) {
    // Check sensitive file flag in database
    const fileRow = db.prepare('SELECT sensitive FROM project_files WHERE project_id = ? AND path = ?').get(finding.project_id, filePath) as any;
    if (!fileRow || fileRow.sensitive !== 1) {
      codeSnippet = extractCodeSnippet(filePath, lineStart, config.storagePath, finding.project_id);
    }
  }

  return {
    findingId: finding.id,
    projectId: finding.project_id,
    ruleId: finding.rule_id,
    title: finding.title,
    summary: finding.summary,
    severity: finding.severity,
    confidence: finding.confidence,
    verification: finding.verification,
    likelyCause: finding.likely_cause,
    filePath,
    lineStart,
    lineEnd,
    codeSnippet,
  };
}

export interface BuildContextParams {
  screen: string;
  finding_id?: string;
  node_id?: string;
  fix_id?: string;
  report_id?: string;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  unknown: 1,
};

function getArchitectureSummaryBlock(
  db: Database.Database,
  projectId: string,
  scanId: string,
  clamp300: (s: string | null | undefined) => string
): string[] {
  const lines: string[] = [];
  try {
    const nodeCountRow = db
      .prepare('SELECT COUNT(*) as count FROM nodes WHERE project_id = ? AND scan_id = ?')
      .get(projectId, scanId) as any;
    const totalNodes = nodeCountRow?.count ?? 0;

    const moduleNodes = db
      .prepare("SELECT id, label FROM nodes WHERE project_id = ? AND scan_id = ? AND type = 'module'")
      .all(projectId, scanId) as any[];
    const moduleCount = moduleNodes.length;

    const findings = db
      .prepare('SELECT id, severity, node_ids_json, evidence_json FROM findings WHERE project_id = ? AND scan_id = ?')
      .all(projectId, scanId) as any[];

    let totalFindings = findings.length;
    let highFindings = 0;
    let medFindings = 0;
    let lowFindings = 0;

    for (const f of findings) {
      const sev = (f.severity || '').toLowerCase();
      if (sev === 'critical' || sev === 'high') {
        highFindings += 1;
      } else if (sev === 'medium') {
        medFindings += 1;
      } else if (sev === 'low') {
        lowFindings += 1;
      }
    }

    lines.push(
      `Project Architecture Summary: Total Graph Nodes (files, APIs, configs): ${totalNodes} | Top-Level Modules: ${moduleCount} | Total Findings: ${totalFindings} (High: ${highFindings}, Medium: ${medFindings}, Low: ${lowFindings})`
    );

    // Compute per-module counts
    const childRows = db
      .prepare('SELECT id, parent_id FROM nodes WHERE project_id = ? AND scan_id = ? AND parent_id IS NOT NULL')
      .all(projectId, scanId) as { id: string; parent_id: string }[];
    const parentMap = new Map<string, string>();
    for (const cr of childRows) {
      parentMap.set(cr.id, cr.parent_id);
    }

    const pathRows = db
      .prepare('SELECT path, parent_id FROM nodes WHERE project_id = ? AND scan_id = ? AND parent_id IS NOT NULL AND path IS NOT NULL')
      .all(projectId, scanId) as { path: string; parent_id: string }[];
    const pathMap = new Map<string, string>();
    for (const pr of pathRows) {
      pathMap.set(pr.path, pr.parent_id);
    }

    const moduleStats = new Map<string, { total: number; high: number; medium: number; low: number }>();
    for (const mod of moduleNodes) {
      moduleStats.set(mod.id, { total: 0, high: 0, medium: 0, low: 0 });
    }

    for (const f of findings) {
      const targetModuleIds = new Set<string>();
      let nodeIds: string[] = [];
      try {
        nodeIds = JSON.parse(f.node_ids_json);
      } catch {}
      for (const nid of nodeIds) {
        if (moduleStats.has(nid)) {
          targetModuleIds.add(nid);
        } else if (parentMap.has(nid)) {
          targetModuleIds.add(parentMap.get(nid)!);
        }
      }
      if (targetModuleIds.size === 0 && f.evidence_json) {
        try {
          const ev = JSON.parse(f.evidence_json);
          if (Array.isArray(ev) && ev[0]?.file && pathMap.has(ev[0].file)) {
            targetModuleIds.add(pathMap.get(ev[0].file)!);
          }
        } catch {}
      }

      const sev = (f.severity || '').toLowerCase();
      for (const mid of targetModuleIds) {
        const stats = moduleStats.get(mid);
        if (stats) {
          stats.total += 1;
          if (sev === 'critical' || sev === 'high') {
            stats.high += 1;
          } else if (sev === 'medium') {
            stats.medium += 1;
          } else if (sev === 'low') {
            stats.low += 1;
          }
        }
      }
    }

    if (moduleNodes.length > 0) {
      moduleNodes.sort((a, b) => {
        const statA = moduleStats.get(a.id) || { total: 0, high: 0, medium: 0, low: 0 };
        const statB = moduleStats.get(b.id) || { total: 0, high: 0, medium: 0, low: 0 };
        if (statB.total !== statA.total) return statB.total - statA.total;
        if (statB.high !== statA.high) return statB.high - statA.high;
        return a.label.localeCompare(b.label);
      });

      lines.push('Visible Modules:');
      for (const mod of moduleNodes.slice(0, 24)) {
        const stat = moduleStats.get(mod.id) || { total: 0, high: 0, medium: 0, low: 0 };
        lines.push(
          `- Module "${clamp300(mod.label)}": ${stat.total} findings (High: ${stat.high}, Medium: ${stat.medium}, Low: ${stat.low})`
        );
      }
    }

    // Module Connections
    try {
      const graphRepo = new GraphRepository(db);
      const level1 = graphRepo.getLevel1(projectId, 200);
      if (level1) {
        const labelMap = new Map<string, string>();
        for (const n of level1.nodes) {
          labelMap.set(n.id, n.label);
        }
        const edges = (level1.edges || []).slice(0, 20);
        if (edges.length > 0) {
          lines.push('Module Connections:');
          for (const edge of edges) {
            const srcLabel = labelMap.get(edge.source_id) || edge.source_id;
            const tgtLabel = labelMap.get(edge.target_id) || edge.target_id;
            const count = (edge as any).count ?? (edge as any).evidence?.count ?? 1;
            lines.push(
              `- ${clamp300(srcLabel)} -> ${clamp300(tgtLabel)}: ${count} connection${count === 1 ? '' : 's'}`
            );
          }
        }
      }
    } catch {}

    lines.push(...getTopFindingsBlock(db, projectId, scanId, clamp300));
  } catch {}
  return lines;
}

function getTopFindingsBlock(
  db: Database.Database,
  projectId: string,
  scanId: string,
  clamp300: (s: string | null | undefined) => string
): string[] {
  const resultLines: string[] = [];
  try {
    const findings = db
      .prepare(`
        SELECT id, rule_id, severity, confidence, title, evidence_json, node_ids_json
        FROM findings
        WHERE project_id = ? AND scan_id = ?
        ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, id ASC
        LIMIT 5
      `)
      .all(projectId, scanId) as any[];

    if (findings.length > 0) {
      resultLines.push('Top Findings:');
      for (const f of findings) {
        let loc = '';
        try {
          const ev = JSON.parse(f.evidence_json);
          if (Array.isArray(ev) && ev.length > 0 && ev[0].file) {
            const file = ev[0].file;
            const line = typeof ev[0].line_start === 'number' ? `:${ev[0].line_start}` : '';
            loc = `${file}${line}`;
          }
        } catch {}
        if (!loc) {
          try {
            const nids = JSON.parse(f.node_ids_json);
            if (Array.isArray(nids) && nids.length > 0) {
              const nodeRow = db
                .prepare('SELECT path, line_start FROM nodes WHERE id = ?')
                .get(nids[0]) as any;
              if (nodeRow?.path) {
                const line =
                  typeof nodeRow.line_start === 'number' ? `:${nodeRow.line_start}` : '';
                loc = `${nodeRow.path}${line}`;
              }
            }
          } catch {}
        }
        const locStr = loc ? ` at ${clamp300(loc)}` : '';
        resultLines.push(
          `- [${f.severity}] ${clamp300(f.title)} (${f.confidence}, rule: ${f.rule_id}${locStr})`
        );
      }
    }
  } catch {}
  return resultLines;
}

/**
 * Builds context per screen from database only.
 * Enforces:
 * - No project name
 * - No absolute paths
 * - No file contents (except 7-line code snippet when shareCode is on)
 * - No env values
 * - No secret matches
 * - Strings cut at 300 characters
 * - Whole context capped at 6000 characters
 * - If project is not scanned: "This project has not been scanned yet."
 */
export function buildScreenContext(
  db: Database.Database,
  projectId: string,
  params: BuildContextParams,
  shareCode: boolean
): string {
  if (params.screen === 'landing' || params.screen === 'general') {
    return '';
  }

  const lastScan = db
    .prepare('SELECT id, started_at, status FROM scans WHERE project_id = ? ORDER BY started_at DESC LIMIT 1')
    .get(projectId) as any;

  if (!lastScan) {
    return 'This project has not been scanned yet.';
  }

  const scanId = lastScan.id;
  const lines: string[] = [];

  const clamp300 = (s: string | null | undefined): string => {
    if (!s) return '';
    const trimmed = s.trim();
    return trimmed.length > 300 ? `${trimmed.slice(0, 297)}...` : trimmed;
  };

  // 1. Architecture Header, Visible Modules, Connections, and Top Findings always at the top on every screen
  lines.push(...getArchitectureSummaryBlock(db, projectId, scanId, clamp300));

  switch (params.screen) {
    case 'overview':
    case 'projects': {
      break;
    }

    case 'graph': {
      if (params.node_id) {
        const node = db.prepare('SELECT id, label, type, path, parent_id FROM nodes WHERE id = ? AND project_id = ?').get(params.node_id, projectId) as any;
        if (node) {
          lines.push('Selected Graph Node:');
          lines.push(`- Label: ${clamp300(node.label)}`);
          lines.push(`- Type: ${node.type}`);
          if (node.path) lines.push(`- Relative path: ${clamp300(node.path)}`);

          if (node.parent_id) {
            const parent = db.prepare('SELECT label FROM nodes WHERE id = ?').get(node.parent_id) as any;
            if (parent) lines.push(`- Parent module: ${clamp300(parent.label)}`);
          }

          const inEdges = db.prepare(`
            SELECT relation, status, COUNT(*) as count FROM edges WHERE target_id = ? GROUP BY relation, status
          `).all(params.node_id) as any[];
          const outEdges = db.prepare(`
            SELECT relation, status, COUNT(*) as count FROM edges WHERE source_id = ? GROUP BY relation, status
          `).all(params.node_id) as any[];
          if (inEdges.length > 0) {
            lines.push(`- Incoming edges: ${inEdges.map(e => `${e.relation} (${e.status}): ${e.count}`).join(', ')}`);
          }
          if (outEdges.length > 0) {
            lines.push(`- Outgoing edges: ${outEdges.map(e => `${e.relation} (${e.status}): ${e.count}`).join(', ')}`);
          }

          const relatedFindings = db.prepare(`
            SELECT title, severity FROM findings WHERE project_id = ? AND scan_id = ? AND node_ids_json LIKE ? LIMIT 5
          `).all(projectId, scanId, `%"${params.node_id}"%`) as any[];
          if (relatedFindings.length > 0) {
            lines.push('- Related findings:');
            for (const f of relatedFindings) {
              lines.push(`  * [${f.severity}] ${clamp300(f.title)}`);
            }
          }

          if (['frontend', 'backend', 'api', 'config'].includes(node.type)) {
            try {
              const graphRepo = new GraphRepository(db);
              const impact = graphRepo.getImpact(projectId, params.node_id);
              if (impact) {
                lines.push(`- Impact analysis: changing this node affects ${impact.counts.files} files, ${impact.counts.api_endpoints} APIs, ${impact.counts.config} configs, ${impact.counts.tests} tests across ${impact.counts.modules} modules.`);
              }
            } catch {}
          }
        }
      } else {
        const nodeCount = (db.prepare('SELECT COUNT(*) as count FROM nodes WHERE project_id = ? AND scan_id = ?').get(projectId, scanId) as any)?.count ?? 0;
        const edgeCount = (db.prepare('SELECT COUNT(*) as count FROM edges WHERE project_id = ? AND scan_id = ?').get(projectId, scanId) as any)?.count ?? 0;
        lines.push('Architecture Graph Overview:');
        lines.push(`- Total nodes: ${nodeCount}`);
        lines.push(`- Total edges: ${edgeCount}`);
      }
      break;
    }

    case 'investigations': {
      if (params.finding_id) {
        const repo = new FindingsRepository(db);
        const finding = repo.findById(params.finding_id);
        if (finding) {
          lines.push('Finding Details:');
          lines.push(`- Rule: ${finding.rule_id} (${finding.severity.toUpperCase()}, confidence: ${finding.confidence}, verification: ${finding.verification})`);
          lines.push(`- Title: ${clamp300(finding.title)}`);
          lines.push(`- Summary: ${clamp300(finding.summary)}`);

          const evidenceItem = Array.isArray(finding.evidence) && finding.evidence.length > 0 ? finding.evidence[0] : null;
          const filePath = evidenceItem?.file || null;
          const lineStart = typeof evidenceItem?.line_start === 'number' ? evidenceItem.line_start : null;
          const lineEnd = typeof evidenceItem?.line_end === 'number' ? evidenceItem.line_end : null;

          if (filePath) {
            const loc = lineStart ? `:${lineStart}${lineEnd && lineEnd !== lineStart ? `-${lineEnd}` : ''}` : '';
            lines.push(`- Location: ${clamp300(filePath)}${loc}`);
          }

          if (finding.likely_cause) {
            lines.push(`- Likely cause: ${clamp300(finding.likely_cause)}`);
          }
          if (finding.not_confirmed) {
            lines.push(`- Not confirmed: ${clamp300(finding.not_confirmed)}`);
          }

          if (shareCode && filePath && lineStart) {
            const fileRow = db.prepare('SELECT sensitive FROM project_files WHERE project_id = ? AND path = ?').get(projectId, filePath) as any;
            if (!fileRow || fileRow.sensitive !== 1) {
              const snippet = extractCodeSnippet(filePath, lineStart, config.storagePath, projectId);
              if (snippet) {
                lines.push('');
                lines.push('Code excerpt (up to 7 lines surrounding finding):');
                lines.push(snippet);
              }
            }
          }
        }
      }
      break;
    }

    case 'fixes': {
      if (params.fix_id) {
        const fix = db.prepare(`
          SELECT fx.status, fx.diff_text, fx.files_json
          FROM fixes fx
          JOIN findings f ON fx.finding_id = f.id
          WHERE fx.id = ? AND f.project_id = ?
        `).get(params.fix_id, projectId) as any;

        if (fix) {
          lines.push('Fix Details:');
          lines.push(`- Status: ${fix.status}`);
          try {
            const files = JSON.parse(fix.files_json);
            if (Array.isArray(files)) {
              lines.push(`- Affected files: ${files.map(f => clamp300(f)).join(', ')}`);
            }
          } catch {}

          if (fix.diff_text) {
            const diffLines = fix.diff_text.split(/\r?\n/);
            let skipFile = false;
            const safeDiffLines: string[] = [];
            for (const dLine of diffLines) {
              if (dLine.startsWith('--- ') || dLine.startsWith('+++ ')) {
                skipFile = /\.env/i.test(dLine);
              }
              if (!skipFile && !matchesSecretPattern(dLine)) {
                safeDiffLines.push(dLine);
              }
            }
            if (safeDiffLines.length > 0) {
              lines.push('- Proposed diff:');
              lines.push(clamp300(safeDiffLines.join('\n')));
            }
          }
        }
      } else if (params.finding_id) {
        const fix = db.prepare('SELECT status FROM fixes WHERE finding_id = ?').get(params.finding_id) as any;
        if (fix) {
          lines.push(`Fix status for finding: ${fix.status}`);
        } else {
          lines.push('No automated fix is available for this finding.');
        }
      } else {
        const fixCounts = db.prepare(`
          SELECT fx.status, COUNT(*) as count
          FROM fixes fx
          JOIN findings f ON fx.finding_id = f.id
          WHERE f.project_id = ?
          GROUP BY fx.status
        `).all(projectId) as any[];
        lines.push('Fixes Summary:');
        if (fixCounts.length > 0) {
          for (const fc of fixCounts) {
            lines.push(`- ${fc.status}: ${fc.count}`);
          }
        } else {
          lines.push('- No fixes proposed.');
        }

        const fixItems = db.prepare(`
          SELECT fx.id, fx.status, f.title, fx.files_json
          FROM fixes fx
          JOIN findings f ON fx.finding_id = f.id
          WHERE f.project_id = ?
          ORDER BY fx.id ASC
          LIMIT 10
        `).all(projectId) as any[];
        if (fixItems.length > 0) {
          lines.push('Fix Items:');
          for (const fx of fixItems) {
            let relPaths = '';
            try {
              const files = JSON.parse(fx.files_json);
              if (Array.isArray(files)) {
                relPaths = files.map((f: string) => clamp300(f)).join(', ');
              }
            } catch {}
            const pathStr = relPaths ? ` (files: ${relPaths})` : '';
            lines.push(`- ${clamp300(fx.title)}: status=${fx.status}${pathStr}`);
          }
        }
      }
      break;
    }

    case 'tests': {
      const counts = db.prepare(`
        SELECT status, COUNT(*) as count FROM test_runs WHERE project_id = ? AND scan_id = ? GROUP BY status
      `).all(projectId, scanId) as any[];
      const countMap: Record<string, number> = { pass: 0, fail: 0, skipped: 0, not_run: 0 };
      for (const c of counts) {
        if (countMap[c.status] !== undefined) {
          countMap[c.status] = c.count;
        }
      }
      lines.push('Test Suite Overview:');
      lines.push(`- Pass: ${countMap.pass}`);
      lines.push(`- Fail: ${countMap.fail}`);
      lines.push(`- Skipped: ${countMap.skipped}`);
      lines.push(`- Not run: ${countMap.not_run}`);
      lines.push('- Note: Phase 1: everything not_run (code execution is disabled)');

      const testItems = db.prepare(`
        SELECT id, name, status FROM test_runs WHERE project_id = ? AND scan_id = ? ORDER BY id ASC LIMIT 10
      `).all(projectId, scanId) as any[];
      if (testItems.length > 0) {
        lines.push('Test Items:');
        for (const t of testItems) {
          lines.push(`- ${clamp300(t.name)}: status=${t.status}`);
        }
      }
      break;
    }

    case 'reports': {
      if (params.report_id) {
        const report = db.prepare('SELECT created_at, markdown FROM reports WHERE id = ? AND project_id = ?').get(params.report_id, projectId) as any;
        if (report) {
          lines.push(`Report generated at: ${report.created_at}`);
          const headers = (report.markdown || '')
            .split(/\r?\n/)
            .filter((l: string) => l.startsWith('## '))
            .map((l: string) => clamp300(l.replace(/^##\s+/, '')));
          if (headers.length > 0) {
            lines.push(`Report sections: ${headers.join(', ')}`);
          }
        }
      } else {
        const reportCount = (db.prepare('SELECT COUNT(*) as count FROM reports WHERE project_id = ?').get(projectId) as any)?.count ?? 0;
        lines.push(`Audit Reports: ${reportCount} report(s) available.`);

        const reportItems = db.prepare(`
          SELECT id, created_at FROM reports WHERE project_id = ? ORDER BY created_at DESC LIMIT 10
        `).all(projectId) as any[];
        if (reportItems.length > 0) {
          lines.push('Report Items:');
          for (const r of reportItems) {
            lines.push(`- Report from ${r.created_at} (status: ready)`);
          }
        }
      }
      break;
    }
  }

  return lines.join('\n').slice(0, 6000);
}
