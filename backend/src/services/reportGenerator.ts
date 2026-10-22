import type Database from 'better-sqlite3';

export function generateMarkdownReport(db: Database.Database, projectId: string): string {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) {
    throw new Error('Project not found');
  }

  const scan = db
    .prepare('SELECT * FROM scans WHERE project_id = ? ORDER BY started_at DESC LIMIT 1')
    .get(projectId) as any;

  const nodes = db.prepare('SELECT id, type FROM nodes WHERE project_id = ?').all(projectId) as any[];
  const edges = db.prepare('SELECT id, status FROM edges WHERE project_id = ?').all(projectId) as any[];
  const unresolvedEdges = edges.filter((e) => e.status === 'unresolved');

  const findings = db
    .prepare('SELECT * FROM findings WHERE project_id = ? ORDER BY created_at ASC')
    .all(projectId) as any[];

  const fixes = db
    .prepare(`
      SELECT f.*, fn.title as finding_title
      FROM fixes f
      JOIN findings fn ON f.finding_id = fn.id
      WHERE fn.project_id = ?
      ORDER BY f.id ASC
    `)
    .all(projectId) as any[];

  const testRuns = db
    .prepare('SELECT * FROM test_runs WHERE project_id = ? ORDER BY name ASC')
    .all(projectId) as any[];

  // 1. Severity counts
  const sevCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
  };
  for (const f of findings) {
    if (f.severity in sevCounts) {
      sevCounts[f.severity as keyof typeof sevCounts]++;
    }
  }

  // 2. Verification & confidence counts
  const verifiedCount = findings.filter((f) => f.verification === 'fix_verified').length;
  const reproducedCount = findings.filter((f) => f.verification === 'reproduced').length;
  const likelyOrConfirmedCount = findings.filter(
    (f) => f.confidence === 'likely' || f.confidence === 'confirmed'
  ).length;
  const hypothesisCount = findings.filter((f) => f.confidence === 'hypothesis').length;

  const lastScanTime = scan?.finished_at || project.last_scan_at || 'Not completed';

  let md = `# Ripple AI Analysis Report: ${project.name}\n\n`;

  // Summary Section
  md += '## Summary\n';
  md += `- **Project Name**: ${project.name}\n`;
  md += `- **Last Scan Time**: ${lastScanTime}\n`;
  md += `- **Files Analyzed**: ${project.file_count || 0}\n`;
  md += `- **Graph Nodes**: ${nodes.length}\n`;
  md += `- **Graph Edges**: ${edges.length} (${unresolvedEdges.length} unresolved)\n`;
  md += `- **Total Findings**: ${findings.length}\n\n`;

  // Findings by Severity Section
  md += '## Findings by Severity\n';
  md += `- **Critical**: ${sevCounts.critical}\n`;
  md += `- **High**: ${sevCounts.high}\n`;
  md += `- **Medium**: ${sevCounts.medium}\n`;
  md += `- **Low**: ${sevCounts.low}\n`;
  md += `- **Unknown**: ${sevCounts.unknown}\n\n`;

  // Verification Coverage Section
  md += '## Verification Coverage\n';
  md += `${findings.length} findings: ${verifiedCount} verified, ${reproducedCount} reproduced, ${likelyOrConfirmedCount} likely or confirmed, ${hypothesisCount} hypothesis\n\n`;

  // Findings Table Section
  md += '## Findings Table\n\n';
  md += '| Title | Rule | Severity | Confidence | Verification | File:Line |\n';
  md += '| --- | --- | --- | --- | --- | --- |\n';

  if (findings.length === 0) {
    md += '| No findings detected | - | - | - | - | - |\n';
  } else {
    for (const f of findings) {
      let fileLine = '-';
      try {
        const ev = JSON.parse(f.evidence_json || '[]');
        if (ev[0]?.file) {
          fileLine = `${ev[0].file}:${ev[0].line_start || 1}`;
        }
      } catch {}

      const cleanTitle = f.title.replace(/\|/g, '\\|');
      md += `| ${cleanTitle} | ${f.rule_id} | ${f.severity} | ${f.confidence} | ${f.verification} | ${fileLine} |\n`;
    }
  }
  md += '\n';

  // Evidence List Section
  md += '## Evidence List\n\n';
  if (findings.length === 0) {
    md += 'No evidence recorded.\n\n';
  } else {
    for (const f of findings) {
      md += `### ${f.title}\n`;
      md += `- **Rule**: ${f.rule_id}\n`;
      let evItems: any[] = [];
      try {
        evItems = JSON.parse(f.evidence_json || '[]');
      } catch {}

      if (evItems.length === 0) {
        md += '- Evidence: None\n';
      } else {
        for (const item of evItems) {
          const fileLoc = item.file ? `${item.file}:${item.line_start || 1}` : 'Unknown';
          const patternInfo = item.pattern ? ` (pattern: ${item.pattern})` : '';
          md += `- Location: \`${fileLoc}\`${patternInfo}\n`;
        }
      }
      md += '\n';
    }
  }

  // Fixes Section
  md += '## Fixes and Status\n\n';
  if (fixes.length === 0) {
    md += 'No fixes have been proposed or approved for this project.\n\n';
  } else {
    for (const fix of fixes) {
      let files: string[] = [];
      try {
        files = JSON.parse(fix.files_json || '[]');
      } catch {}
      const fileList = files.length > 0 ? files.join(', ') : 'None';
      md += `- Fix \`${fix.id}\` for "${fix.finding_title}": status **${fix.status}** (Files: ${fileList})\n`;
    }
    md += '\n';
  }

  // What was not checked Section
  md += '## What was not checked\n';
  md += '- Code was not executed (Phase 1 executes no uploaded code).\n';
  md += `- No tests were run (${testRuns.length} test files catalogued, none executed in Phase 1).\n`;
  md += '- Response-shape comparison not done (frontend API calls were checked for route existence only, not JSON payload schemas).\n';
  md += `- Dynamic and unresolved references: ${unresolvedEdges.length} unresolved references detected (dynamic imports, runtime-constructed URLs).\n`;

  return md;
}
