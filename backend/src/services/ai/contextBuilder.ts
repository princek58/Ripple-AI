import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import config from '../../config.js';
import { FindingsRepository } from '../../db/findingsRepository.js';
import { GraphRepository } from '../../db/graphRepository.js';

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

const SECRET_PATTERN_REGEX = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16})/i;

export function matchesSecretPattern(text: string): boolean {
  return SECRET_PATTERN_REGEX.test(text);
}

/**
 * Extracts a window of up to 7 lines surrounding the cited line.
 * Format: `<line_number>: <content>`.
 * Rules:
 * - Up to 7 lines (lineStart +/- 3)
 * - Never for sensitive, .env, binary or over-1-MB files or paths that escape backend/storage/<id>/files
 * - The whole snippet is dropped if any line matches a secret pattern.
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
      let lineText = lines[i - 1] ?? '';
      // If any line matches a secret pattern (e.g. private key or AWS access key), drop the entire snippet
      if (matchesSecretPattern(lineText)) {
        return null;
      }
      // Redact credential-shaped tokens
      lineText = lineText.replace(/(password|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]+['"]/gi, '$1="[REDACTED]"');
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

  switch (params.screen) {
    case 'overview':
    case 'projects': {
      const countsRow = db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM nodes WHERE project_id = ? AND scan_id = ?) as node_count,
          (SELECT COUNT(*) FROM edges WHERE project_id = ? AND scan_id = ?) as edge_count,
          (SELECT COUNT(*) FROM edges WHERE project_id = ? AND scan_id = ? AND status = 'unresolved') as unresolved_edge_count,
          (SELECT COUNT(*) FROM project_files WHERE project_id = ?) as file_count,
          (SELECT COUNT(*) FROM findings WHERE project_id = ? AND scan_id = ?) as finding_count,
          (SELECT COUNT(*) FROM findings WHERE project_id = ? AND scan_id = ? AND severity IN ('critical', 'high')) as crit_high_count
      `).get(projectId, scanId, projectId, scanId, projectId, scanId, projectId, projectId, scanId, projectId, scanId) as any;

      lines.push('Project Architecture Summary:');
      lines.push(`- Files: ${countsRow?.file_count ?? 0}`);
      lines.push(`- Nodes: ${countsRow?.node_count ?? 0}`);
      lines.push(`- Edges: ${countsRow?.edge_count ?? 0} (${countsRow?.unresolved_edge_count ?? 0} unresolved)`);
      lines.push(`- Total findings: ${countsRow?.finding_count ?? 0} (${countsRow?.crit_high_count ?? 0} critical or high)`);

      const sevRows = db.prepare(`
        SELECT severity, COUNT(*) as count FROM findings WHERE project_id = ? AND scan_id = ? GROUP BY severity
      `).all(projectId, scanId) as any[];
      if (sevRows.length > 0) {
        lines.push(`- Findings by severity: ${sevRows.map(r => `${r.severity}: ${r.count}`).join(', ')}`);
      }

      const modRows = db.prepare(`
        SELECT m.label as module, COUNT(f.id) as finding_count
        FROM nodes m
        JOIN findings f ON f.project_id = m.project_id AND f.scan_id = m.scan_id
        WHERE m.project_id = ? AND m.scan_id = ? AND m.type = 'module'
        GROUP BY m.id
        ORDER BY finding_count DESC
        LIMIT 5
      `).all(projectId, scanId) as any[];
      if (modRows.length > 0) {
        lines.push(`- Top affected modules: ${modRows.map(r => `${r.module} (${r.finding_count} findings)`).join(', ')}`);
      }
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
      } else {
        const findings = db.prepare(`
          SELECT rule_id, severity, title FROM findings WHERE project_id = ? AND scan_id = ? ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END LIMIT 5
        `).all(projectId, scanId) as any[];
        lines.push('Top Project Findings:');
        for (const f of findings) {
          lines.push(`- [${f.severity}] ${f.rule_id}: ${clamp300(f.title)}`);
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
      }
      break;
    }
  }

  return lines.join('\n').slice(0, 6000);
}
