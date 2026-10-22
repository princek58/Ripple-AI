import type { CheckContext, CheckFinding } from './types.js';
import { checkCircularDependency } from './circular_dependency.js';
import { checkBrokenImport } from './broken_import.js';
import { checkIsolatedFile } from './isolated_file.js';
import { checkEnvUndeclared } from './env_undeclared.js';
import { checkApiUnmatchedCall } from './api_unmatched_call.js';
import { checkSecretPattern } from './secret_pattern.js';

export * from './types.js';
export {
  checkCircularDependency,
  checkBrokenImport,
  checkIsolatedFile,
  checkEnvUndeclared,
  checkApiUnmatchedCall,
  checkSecretPattern,
};

export interface RunChecksResult {
  findings: CheckFinding[];
  notesSummary: string;
}

const CHECKS: Array<{ name: string; fn: (context: CheckContext) => CheckFinding[] }> = [
  { name: 'circular_dependency', fn: checkCircularDependency },
  { name: 'broken_import', fn: checkBrokenImport },
  { name: 'isolated_file', fn: checkIsolatedFile },
  { name: 'env_undeclared', fn: checkEnvUndeclared },
  { name: 'api_unmatched_call', fn: checkApiUnmatchedCall },
  { name: 'secret_pattern', fn: checkSecretPattern },
];

const MAX_FINDINGS_PER_RULE = 100;

export function runAllChecks(context: CheckContext): RunChecksResult {
  const allFindings: CheckFinding[] = [];
  const checkErrors: string[] = [];
  const cappedNotes: string[] = [];

  for (const { name, fn } of CHECKS) {
    try {
      const results = fn(context);
      if (results.length > MAX_FINDINGS_PER_RULE) {
        const kept = results.slice(0, MAX_FINDINGS_PER_RULE);
        const overflow = results.length - MAX_FINDINGS_PER_RULE;
        allFindings.push(...kept);
        cappedNotes.push(`${name}: ${overflow} more not shown`);
      } else {
        allFindings.push(...results);
      }
    } catch (err: unknown) {
      checkErrors.push(`check ${name} failed`);
    }
  }

  // Count findings by severity
  const severityCounts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
  };

  for (const f of allFindings) {
    severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
  }

  const parts: string[] = [];
  if (severityCounts.critical > 0) parts.push(`${severityCounts.critical} critical`);
  if (severityCounts.high > 0) parts.push(`${severityCounts.high} high`);
  if (severityCounts.medium > 0) parts.push(`${severityCounts.medium} medium`);
  if (severityCounts.low > 0) parts.push(`${severityCounts.low} low`);
  if (severityCounts.unknown > 0) parts.push(`${severityCounts.unknown} unknown`);

  let notesSummary = `Findings: ${parts.length > 0 ? parts.join(', ') : '0 found'}.`;

  if (checkErrors.length > 0) {
    notesSummary += ` Warnings: ${checkErrors.join(', ')}.`;
  }

  if (cappedNotes.length > 0) {
    notesSummary += ` Caps: ${cappedNotes.join(', ')}.`;
  }

  return {
    findings: allFindings,
    notesSummary,
  };
}
