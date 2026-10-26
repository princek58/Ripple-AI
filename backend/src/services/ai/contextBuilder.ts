import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import config from '../../config.js';
import { FindingsRepository } from '../../db/findingsRepository.js';

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
 * Extracts a window of up to 7 lines surrounding the cited line.
 * Format: `<line_number>: <content>`.
 */
export function extractCodeSnippet(
  filePath: string,
  targetLine: number,
  storageRoot: string,
  projectId: string
): string | null {
  try {
    const projectFilesDir = path.resolve(storageRoot, projectId, 'files');
    const fullPath = path.resolve(projectFilesDir, filePath);

    // Prevent path traversal outside project files directory
    if (!fullPath.startsWith(projectFilesDir)) {
      return null;
    }

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    if (lines.length === 0) {
      return null;
    }

    const clampedTarget = Math.max(1, Math.min(lines.length, targetLine));
    // Up to 7 lines around cited line (target - 3 to target + 3)
    const startLine = Math.max(1, clampedTarget - 3);
    const endLine = Math.min(lines.length, startLine + 6);

    const snippetLines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      let lineText = lines[i - 1] ?? '';
      // Basic secret redaction: redact credential-shaped tokens
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
    codeSnippet = extractCodeSnippet(filePath, lineStart, config.storagePath, finding.project_id);
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
