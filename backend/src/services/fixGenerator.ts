import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';
import type Database from 'better-sqlite3';

export interface FixCandidate {
  diffText: string;
  files: string[];
}

export interface FixGenerationResult {
  success: boolean;
  fix?: FixCandidate;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Safely resolves a project file path under backend/storage/<projectId>/files/
 * with strict containment verification.
 */
function getSafeFilePath(projectId: string, relPath: string): string | null {
  const storageBase = path.resolve(config.storagePath);
  const projectFilesDir = path.resolve(storageBase, projectId, 'files');
  if (!projectFilesDir.startsWith(storageBase + path.sep)) {
    return null;
  }
  const resolved = path.resolve(projectFilesDir, relPath);
  if (!resolved.startsWith(projectFilesDir + path.sep) && resolved !== projectFilesDir) {
    return null;
  }
  return resolved;
}

/**
 * Generates deterministic fix unified diffs for allowed rules only:
 * - env_undeclared
 * - api_unmatched_call
 * - broken_import
 * 
 * Never returns or exposes secret values or env values.
 * Never modifies files under storage/<projectId>/files/.
 */
export function generateFixForFinding(
  db: Database.Database,
  finding: any
): FixGenerationResult {
  const ruleId = finding.rule_id;

  // 1. circular_dependency, secret_pattern, isolated_file, etc. -> NO_AUTOMATIC_FIX
  if (ruleId === 'secret_pattern') {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: 'Secrets must be revoked and rotated manually. Automatic removal is unsafe.',
    };
  }

  if (ruleId === 'circular_dependency') {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: 'Circular dependencies require architectural restructuring to extract shared modules or interfaces.',
    };
  }

  if (ruleId === 'isolated_file') {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: 'Isolated files must be verified manually to determine if they are dead code or dynamically imported.',
    };
  }

  if (ruleId === 'env_undeclared') {
    return generateEnvUndeclaredFix(db, finding);
  }

  if (ruleId === 'api_unmatched_call') {
    return generateApiUnmatchedCallFix(db, finding);
  }

  if (ruleId === 'broken_import') {
    return generateBrokenImportFix(db, finding);
  }

  return {
    success: false,
    errorCode: 'NO_AUTOMATIC_FIX',
    errorMessage: `No automatic fix template available for rule "${ruleId}".`,
  };
}

/**
 * Template for env_undeclared:
 * Appends "NAME=" to .env.example (or creates it if missing).
 * Names only, never any value.
 */
function generateEnvUndeclaredFix(
  db: Database.Database,
  finding: any
): FixGenerationResult {
  // Extract variable names from finding title or node_ids_json
  let envNames: string[] = [];
  const singleMatch = finding.title.match(/Undeclared environment variable "([^"]+)"/);
  if (singleMatch) {
    envNames = [singleMatch[1]];
  } else {
    // Try from associated nodes
    let nodeIds: string[] = [];
    try {
      nodeIds = JSON.parse(finding.node_ids_json || '[]');
    } catch {}

    if (nodeIds.length > 0) {
      const placeholders = nodeIds.map(() => '?').join(',');
      const rows = db
        .prepare(`SELECT path FROM nodes WHERE id IN (${placeholders})`)
        .all(...nodeIds) as Array<{ path: string }>;
      envNames = rows.map((r) => r.path).filter(Boolean);
    }
  }

  if (envNames.length === 0) {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: 'Could not determine undeclared environment variable name.',
    };
  }

  const safePath = getSafeFilePath(finding.project_id, '.env.example');
  if (!safePath) {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: 'Invalid project storage path.',
    };
  }

  const fileExists = fs.existsSync(safePath);
  let oldContent = '';
  if (fileExists) {
    try {
      oldContent = fs.readFileSync(safePath, 'utf-8');
    } catch {
      return {
        success: false,
        errorCode: 'NO_AUTOMATIC_FIX',
        errorMessage: 'Failed to read .env.example.',
      };
    }
  }

  const linesToAppend = envNames.map((name) => `${name}=`);

  let diffText = '# Suggested change, not applied, not tested\n';

  if (!fileExists) {
    diffText += '--- /dev/null\n';
    diffText += '+++ b/.env.example\n';
    diffText += `@@ -0,0 +1,${linesToAppend.length} @@\n`;
    for (const l of linesToAppend) {
      diffText += `+${l}\n`;
    }
  } else {
    const rawLines = oldContent.split(/\r?\n/);
    const trimmedLines = oldContent.endsWith('\n') ? rawLines.slice(0, -1) : rawLines;
    const oldLineCount = trimmedLines.length;

    // Provide up to 2 lines of context from the end of the existing file
    const contextCount = Math.min(2, oldLineCount);
    const startLine = Math.max(1, oldLineCount - contextCount + 1);
    const contextLines = trimmedLines.slice(oldLineCount - contextCount);

    diffText += '--- a/.env.example\n';
    diffText += '+++ b/.env.example\n';
    diffText += `@@ -${startLine},${contextCount} +${startLine},${contextCount + linesToAppend.length} @@\n`;
    for (const ctx of contextLines) {
      diffText += ` ${ctx}\n`;
    }
    for (const l of linesToAppend) {
      diffText += `+${l}\n`;
    }
  }

  return {
    success: true,
    fix: {
      diffText,
      files: ['.env.example'],
    },
  };
}

/**
 * Template for api_unmatched_call:
 * Changes the URL string on the evidence line to the closest known route,
 * only if the closest route was computed with a clear single match.
 * Reads only the evidence line plus 2 lines of context from the project file on disk.
 */
function generateApiUnmatchedCallFix(
  _db: Database.Database,
  finding: any
): FixGenerationResult {
  // Extract unmatched URL from finding title: e.g. Unmatched API call "GET /api/notice/list" in NoticePage.tsx
  const urlMatch = finding.title.match(/Unmatched API call "[A-Z]+\s+([^"]+)"/);
  const unmatchedUrl = urlMatch ? urlMatch[1] : null;

  // Extract closest route from likely_cause: Closest route: GET /api/notices...
  const closestMatch = finding.likely_cause?.match(/Closest route:\s*(?:[A-Z]+\s+)?([^\s\.]+)/);
  const closestRoute = closestMatch ? closestMatch[1] : null;

  if (!unmatchedUrl || !closestRoute || unmatchedUrl === closestRoute) {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: 'No clear unique closest route found for this API call.',
    };
  }

  let evidence: Array<{ file: string; line_start: number; line_end: number }> = [];
  try {
    evidence = JSON.parse(finding.evidence_json || '[]');
  } catch {}

  const targetFile = evidence[0]?.file;
  const lineStart = evidence[0]?.line_start || 1;

  if (!targetFile) {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: 'Missing evidence file for unmatched API call.',
    };
  }

  const safePath = getSafeFilePath(finding.project_id, targetFile);
  if (!safePath || !fs.existsSync(safePath)) {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: `Evidence file "${targetFile}" not found on disk.`,
    };
  }

  let fileLines: string[] = [];
  try {
    fileLines = fs.readFileSync(safePath, 'utf-8').split(/\r?\n/);
  } catch {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: `Could not read evidence file "${targetFile}".`,
    };
  }

  const targetIdx = lineStart - 1;
  if (targetIdx < 0 || targetIdx >= fileLines.length) {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: 'Evidence line is outside file line bounds.',
    };
  }

  const oldLine = fileLines[targetIdx];
  if (!oldLine.includes(unmatchedUrl)) {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: `Unmatched URL "${unmatchedUrl}" not found on evidence line ${lineStart}.`,
    };
  }

  const newLine = oldLine.replace(unmatchedUrl, closestRoute);

  // Up to 2 lines of context: 1 before and 1 after
  const ctxStart = Math.max(0, targetIdx - 1);
  const ctxEnd = Math.min(fileLines.length - 1, targetIdx + 1);

  const oldHunkCount = ctxEnd - ctxStart + 1;
  const newHunkCount = oldHunkCount;

  let diffText = '# Suggested change, not applied, not tested\n';
  diffText += `--- a/${targetFile}\n`;
  diffText += `+++ b/${targetFile}\n`;
  diffText += `@@ -${ctxStart + 1},${oldHunkCount} +${ctxStart + 1},${newHunkCount} @@\n`;

  for (let i = ctxStart; i <= ctxEnd; i++) {
    if (i === targetIdx) {
      diffText += `-${oldLine}\n`;
      diffText += `+${newLine}\n`;
    } else {
      diffText += ` ${fileLines[i]}\n`;
    }
  }

  return {
    success: true,
    fix: {
      diffText,
      files: [targetFile],
    },
  };
}

/**
 * Template for broken_import:
 * Changes the specifier to an existing project file ONLY if exactly one file
 * with the same base name exists. If zero or several match, do not guess.
 */
function generateBrokenImportFix(
  db: Database.Database,
  finding: any
): FixGenerationResult {
  let evidence: Array<{ file: string; line_start: number; specifier?: string }> = [];
  try {
    evidence = JSON.parse(finding.evidence_json || '[]');
  } catch {}

  const sourceFile = evidence[0]?.file;
  const specifier = evidence[0]?.specifier;
  const lineStart = evidence[0]?.line_start || 1;

  if (!sourceFile || !specifier) {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: 'Missing import specifier in evidence for broken import.',
    };
  }

  // Base name without extension
  const specBase = path.posix.basename(specifier).replace(/\.[^.]+$/, '');

  // Find all project files
  const projectFiles = db
    .prepare('SELECT path FROM project_files WHERE project_id = ?')
    .all(finding.project_id) as Array<{ path: string }>;

  // Match files having the exact same base name (ignoring extension)
  const matches = projectFiles.filter((f) => {
    const fBase = path.posix.basename(f.path).replace(/\.[^.]+$/, '');
    return fBase.toLowerCase() === specBase.toLowerCase();
  });

  if (matches.length === 0) {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: `No project file matching "${specBase}" exists.`,
    };
  }

  if (matches.length > 1) {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: `Multiple files match "${specBase}". Manual resolution is required.`,
    };
  }

  const matchedFile = matches[0].path;

  // Compute relative path from sourceFile's directory to matchedFile
  const sourceDir = path.posix.dirname(sourceFile);
  let relSpecifier = path.posix.relative(sourceDir, matchedFile);
  if (!relSpecifier.startsWith('.') && !relSpecifier.startsWith('/')) {
    relSpecifier = `./${relSpecifier}`;
  }

  if (!/\.[a-z0-9]+$/i.test(specifier)) {
    relSpecifier = relSpecifier.replace(/\.[a-z0-9]+$/i, '');
  }

  const safePath = getSafeFilePath(finding.project_id, sourceFile);
  if (!safePath || !fs.existsSync(safePath)) {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: `Source file "${sourceFile}" not found on disk.`,
    };
  }

  let fileLines: string[] = [];
  try {
    fileLines = fs.readFileSync(safePath, 'utf-8').split(/\r?\n/);
  } catch {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: `Could not read source file "${sourceFile}".`,
    };
  }

  const targetIdx = lineStart - 1;
  if (targetIdx < 0 || targetIdx >= fileLines.length) {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: 'Evidence line is outside file line bounds.',
    };
  }

  const oldLine = fileLines[targetIdx];
  if (!oldLine.includes(specifier)) {
    return {
      success: false,
      errorCode: 'NO_AUTOMATIC_FIX',
      errorMessage: `Specifier "${specifier}" not found on evidence line ${lineStart}.`,
    };
  }

  const newLine = oldLine.replace(specifier, relSpecifier);

  const ctxStart = Math.max(0, targetIdx - 1);
  const ctxEnd = Math.min(fileLines.length - 1, targetIdx + 1);

  const oldHunkCount = ctxEnd - ctxStart + 1;
  const newHunkCount = oldHunkCount;

  let diffText = '# Suggested change, not applied, not tested\n';
  diffText += `--- a/${sourceFile}\n`;
  diffText += `+++ b/${sourceFile}\n`;
  diffText += `@@ -${ctxStart + 1},${oldHunkCount} +${ctxStart + 1},${newHunkCount} @@\n`;

  for (let i = ctxStart; i <= ctxEnd; i++) {
    if (i === targetIdx) {
      diffText += `-${oldLine}\n`;
      diffText += `+${newLine}\n`;
    } else {
      diffText += ` ${fileLines[i]}\n`;
    }
  }

  return {
    success: true,
    fix: {
      diffText,
      files: [sourceFile],
    },
  };
}
