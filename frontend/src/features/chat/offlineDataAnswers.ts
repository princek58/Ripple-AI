/**
 * Offline Data Answers for Ripple AI.
 * Computes deterministic answers from project data (summary, findings, scans).
 * Never labelled as AI. Ends with label:
 * "Offline help from Ripple's own data. Not AI-written."
 */

import { api, getFriendlyErrorMessage } from '../../lib/api.js';
import { getHowToFix } from '../investigations/howToFix.js';
import type {
  ProjectSummary,
  Finding,
  FindingDetailData,
} from '../../../../shared/types.js';
import type { ChatLang } from './types.js';
import type { OfflineQuestionType } from './offlineKeywords.js';

export const OFFLINE_DATA_FOOTER =
  "Offline help from Ripple's own data. Not AI-written.";

const RULE_DISPLAY_NAMES: Record<string, string> = {
  circular_dependency: 'Circular dependency',
  broken_import: 'Broken import',
  isolated_file: 'Isolated file',
  api_unmatched_call: 'Unmatched API call',
  env_undeclared: 'Undeclared environment variable',
  missing_config: 'Missing config',
};

const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};

const CONFIDENCE_WEIGHTS: Record<string, number> = {
  confirmed: 3,
  likely: 2,
  hypothesis: 1,
};

export interface OfflineDataContext {
  projectId: string;
  isScanned: boolean;
  lang: ChatLang;
  screen?: string;
  findingId?: string;
  findingDetail?: FindingDetailData | null;
  signal?: AbortSignal;
}

/**
 * Compute the answer for a matched offline question.
 */
export async function getOfflineDataAnswer(
  type: OfflineQuestionType,
  ctx: OfflineDataContext
): Promise<string> {
  const { projectId, isScanned, lang, signal } = ctx;

  // (e) What is not checked - does not require scan or project data
  if (type === 'WHAT_IS_NOT_CHECKED') {
    return formatWhatIsNotChecked(lang);
  }

  // Never-scanned rule: answer "Not scanned yet" and never give zeros
  if (!isScanned) {
    return formatNeverScanned();
  }

  try {
    switch (type) {
      case 'HOW_MANY_FINDINGS': {
        const [summary, findingsRes] = await Promise.all([
          api.getSummary(projectId, signal),
          api.getFindings(projectId, { pageSize: 100 }, signal),
        ]);

        return formatHowManyFindings(summary, findingsRes.items, lang);
      }

      case 'MOST_RISKY_MODULE': {
        const summary = await api.getSummary(projectId, signal);
        return formatMostRiskyModule(summary, lang);
      }

      case 'WHAT_TO_FIX_FIRST': {
        const findingsRes = await api.getFindings(projectId, { pageSize: 100 }, signal);
        return formatWhatToFixFirst(findingsRes.items, lang);
      }

      case 'LAST_SCAN': {
        const summary = await api.getSummary(projectId, signal);
        return formatLastScan(summary, lang);
      }

      case 'EXPLAIN_FINDING': {
        let finding: Finding | undefined =
          (ctx.findingDetail as any)?.finding || (ctx.findingDetail as any);
        if (!finding && ctx.findingId) {
          try {
            const detail = await api.getFinding(ctx.findingId, signal);
            finding = (detail as any)?.finding || (detail as any);
          } catch {
            finding = undefined;
          }
        }
        return formatExplainFinding(finding, lang);
      }

      default:
        return `${formatNeverScanned()}`;
    }
  } catch (err: unknown) {
    if (signal?.aborted) {
      throw err;
    }
    const friendlyErr = getFriendlyErrorMessage(err);
    return `${friendlyErr}\n\n${OFFLINE_DATA_FOOTER}`;
  }
}

/**
 * Format answer for never-scanned projects.
 * "Not scanned yet" and never give zeros.
 */
export function formatNeverScanned(): string {
  return `Not scanned yet.\n\n${OFFLINE_DATA_FOOTER}`;
}

/**
 * (a) "how many findings / kitni findings" -> counts by severity and rule.
 */
export function formatHowManyFindings(
  summary: ProjectSummary,
  findings: Finding[],
  lang: ChatLang
): string {
  const total = summary.kpi?.openFindings ?? findings.length;

  if (total === 0) {
    return `No findings from the 6 automated checks. That does not mean no problems.\n\n${OFFLINE_DATA_FOOTER}`;
  }

  // Count by severity
  const severityCounts: Record<string, number> = {
    critical: summary.bySeverity?.critical ?? 0,
    high: summary.bySeverity?.high ?? 0,
    medium: summary.bySeverity?.medium ?? 0,
    low: summary.bySeverity?.low ?? 0,
    unknown: summary.bySeverity?.unknown ?? 0,
  };

  // If summary had 0s but findings exist, compute from findings
  if (Object.values(severityCounts).reduce((a, b) => a + b, 0) === 0 && findings.length > 0) {
    for (const f of findings) {
      severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
    }
  }

  // Count by rule
  const ruleCounts: Record<string, number> = {};
  for (const f of findings) {
    const key = f.rule_id;
    ruleCounts[key] = (ruleCounts[key] || 0) + 1;
  }

  const lines: string[] = [];

  if (lang === 'hi') {
    lines.push(`Kul ${total} findings mili hain.`);
    lines.push('\nSeverity ke hisaab se:');
    if (severityCounts.critical > 0) lines.push(`- Critical: ${severityCounts.critical}`);
    if (severityCounts.high > 0) lines.push(`- High: ${severityCounts.high}`);
    if (severityCounts.medium > 0) lines.push(`- Medium: ${severityCounts.medium}`);
    if (severityCounts.low > 0) lines.push(`- Low: ${severityCounts.low}`);
    if (severityCounts.unknown > 0) lines.push(`- Unknown: ${severityCounts.unknown}`);

    lines.push('\nRule ke hisaab se:');
    const sortedRules = Object.entries(ruleCounts).sort((a, b) => b[1] - a[1]);
    for (const [ruleId, count] of sortedRules) {
      const displayName = RULE_DISPLAY_NAMES[ruleId] || ruleId;
      lines.push(`- ${displayName}: ${count}`);
    }
  } else {
    lines.push(`Total findings: ${total}`);
    lines.push('\nBy severity:');
    if (severityCounts.critical > 0) lines.push(`- Critical: ${severityCounts.critical}`);
    if (severityCounts.high > 0) lines.push(`- High: ${severityCounts.high}`);
    if (severityCounts.medium > 0) lines.push(`- Medium: ${severityCounts.medium}`);
    if (severityCounts.low > 0) lines.push(`- Low: ${severityCounts.low}`);
    if (severityCounts.unknown > 0) lines.push(`- Unknown: ${severityCounts.unknown}`);

    lines.push('\nBy rule:');
    const sortedRules = Object.entries(ruleCounts).sort((a, b) => b[1] - a[1]);
    for (const [ruleId, count] of sortedRules) {
      const displayName = RULE_DISPLAY_NAMES[ruleId] || ruleId;
      lines.push(`- ${displayName}: ${count}`);
    }
  }

  lines.push(`\n${OFFLINE_DATA_FOOTER}`);
  return lines.join('\n');
}

/**
 * (b) "most risky module / sabse risky module" -> highest max severity, then most findings.
 */
export function formatMostRiskyModule(summary: ProjectSummary, lang: ChatLang): string {
  const modules = summary.affectedModules || [];

  if (modules.length === 0) {
    return `No findings from the 6 automated checks. That does not mean no problems.\n\n${OFFLINE_DATA_FOOTER}`;
  }

  // Sort modules: highest maxSeverity, then highest findingCount
  const sorted = [...modules].sort((a, b) => {
    const sevA = SEVERITY_WEIGHTS[a.maxSeverity || 'unknown'] ?? 0;
    const sevB = SEVERITY_WEIGHTS[b.maxSeverity || 'unknown'] ?? 0;
    if (sevB !== sevA) return sevB - sevA;
    return b.findingCount - a.findingCount;
  });

  const best = sorted[0];
  const bestSevWeight = SEVERITY_WEIGHTS[best.maxSeverity || 'unknown'] ?? 0;

  // Check for ties
  const tied = sorted.filter(
    (m) =>
      (SEVERITY_WEIGHTS[m.maxSeverity || 'unknown'] ?? 0) === bestSevWeight &&
      m.findingCount === best.findingCount
  );

  const lines: string[] = [];

  if (tied.length > 1) {
    const names = tied.map((m) => m.label).join(', ');
    if (lang === 'hi') {
      lines.push(
        `Sabse risky modules (tied): ${names} (Max severity: ${best.maxSeverity}, Findings: ${best.findingCount} each)`
      );
    } else {
      lines.push(
        `Most risky modules (tied): ${names} (Max severity: ${best.maxSeverity}, Findings: ${best.findingCount} each)`
      );
    }
  } else {
    if (lang === 'hi') {
      lines.push(
        `Sabse risky module: ${best.label} (Max severity: ${best.maxSeverity}, Findings: ${best.findingCount})`
      );
    } else {
      lines.push(
        `Most risky module: ${best.label} (Max severity: ${best.maxSeverity}, Findings: ${best.findingCount})`
      );
    }
  }

  lines.push(`\n${OFFLINE_DATA_FOOTER}`);
  return lines.join('\n');
}

/**
 * (c) "what should I fix first / pehle kya theek karun" -> top 3 findings ordered by
 * severity then confidence, with title and file:line, and the sentence
 * "This order comes from severity and confidence, it is not a guarantee".
 */
export function formatWhatToFixFirst(findings: Finding[], lang: ChatLang): string {
  if (findings.length === 0) {
    return `No findings from the 6 automated checks. That does not mean no problems.\n\n${OFFLINE_DATA_FOOTER}`;
  }

  const sorted = [...findings].sort((a, b) => {
    const sevA = SEVERITY_WEIGHTS[a.severity] ?? 0;
    const sevB = SEVERITY_WEIGHTS[b.severity] ?? 0;
    if (sevB !== sevA) return sevB - sevA;

    const confA = CONFIDENCE_WEIGHTS[a.confidence] ?? 0;
    const confB = CONFIDENCE_WEIGHTS[b.confidence] ?? 0;
    if (confB !== confA) return confB - confA;

    return a.id.localeCompare(b.id);
  });

  const top3 = sorted.slice(0, 3);
  const lines: string[] = [];

  if (lang === 'hi') {
    lines.push('Pehle theek karne ke liye top findings:');
  } else {
    lines.push('Top findings to fix first:');
  }

  top3.forEach((f, idx) => {
    const ev = f.evidence && f.evidence[0];
    const fileLine = ev ? `${ev.file}:${ev.line_start}` : 'unknown location';
    lines.push(`${idx + 1}. ${f.title} (${fileLine})`);
  });

  lines.push('\nThis order comes from severity and confidence, it is not a guarantee.');
  lines.push(`\n${OFFLINE_DATA_FOOTER}`);
  return lines.join('\n');
}

/**
 * (d) "when was the last scan / scan kab hua" -> last scan time and status.
 */
export function formatLastScan(summary: ProjectSummary, lang: ChatLang): string {
  const lastScan = summary.lastScan;

  if (!lastScan || !lastScan.finished_at) {
    return formatNeverScanned();
  }

  const timeStr = lastScan.finished_at;
  const statusStr = lastScan.status || 'completed';

  const lines: string[] = [];
  if (lang === 'hi') {
    lines.push(`Aakhri scan: ${timeStr} (status: ${statusStr}).`);
  } else {
    lines.push(`Last scan: ${timeStr} (status: ${statusStr}).`);
  }

  lines.push(`\n${OFFLINE_DATA_FOOTER}`);
  return lines.join('\n');
}

/**
 * (e) "what is not checked / kya check nahi hua" -> fixed Phase 1 limits.
 */
export function formatWhatIsNotChecked(lang: ChatLang): string {
  const lines: string[] = [];

  if (lang === 'hi') {
    lines.push('Ripple AI Phase 1 ke fixed limits:');
    lines.push('1. No code execution: Koi code run ya execute nahi hota; pura analysis sirf static AST parsing hai.');
    lines.push('2. Sirf 6 automated checks: circular dependency, broken import, isolated file, unmatched API call, undeclared environment variable, aur missing config.');
    lines.push('3. Language parsing: Sirf JavaScript aur TypeScript (.js, .jsx, .ts, .tsx, .mjs, .cjs) parse hote hain.');
  } else {
    lines.push('Fixed Phase 1 limits of Ripple AI:');
    lines.push('1. No code is run: Analysis is strictly static AST parsing; no code is executed in any sandbox or runtime.');
    lines.push('2. Only 6 static checks: circular dependency, broken import, isolated file, unmatched API call, undeclared environment variable, and missing config.');
    lines.push('3. Language scope: Only JavaScript and TypeScript files (.js, .jsx, .ts, .tsx, .mjs, .cjs) are parsed.');
  }

  lines.push(`\n${OFFLINE_DATA_FOOTER}`);
  return lines.join('\n');
}

/**
 * (f) on a finding screen: "explain this finding / ye finding samjhao" -> rule guidance plus evidence file:line.
 */
export function formatExplainFinding(
  finding: Finding | undefined,
  lang: ChatLang
): string {
  if (!finding) {
    const msg =
      lang === 'hi'
        ? 'Koi finding select nahi hai. Kisi finding par jaakar ye sawal poochein.'
        : 'No finding selected. Navigate to a finding on the Investigations screen to explain it.';
    return `${msg}\n\n${OFFLINE_DATA_FOOTER}`;
  }

  const ev = finding.evidence && finding.evidence[0];
  const fileLine = ev ? `${ev.file}:${ev.line_start}` : 'location not specified';

  const guidance = getHowToFix(finding.rule_id, lang);
  const lines: string[] = [];

  if (lang === 'hi') {
    lines.push(`Finding: ${finding.title}`);
    lines.push(`Evidence: ${fileLine}`);
    lines.push(`\nMatlab: ${guidance.whatItMeans}`);
    if (guidance.steps && guidance.steps.length > 0) {
      lines.push('\nTheek karne ke steps:');
      guidance.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    }
    lines.push(`\nVerify: ${guidance.verify}`);
    if (guidance.caution) {
      lines.push(`Note: ${guidance.caution}`);
    }
  } else {
    lines.push(`Finding: ${finding.title}`);
    lines.push(`Evidence: ${fileLine}`);
    lines.push(`\nWhat it means: ${guidance.whatItMeans}`);
    if (guidance.steps && guidance.steps.length > 0) {
      lines.push('\nSteps to fix:');
      guidance.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    }
    lines.push(`\nVerify: ${guidance.verify}`);
    if (guidance.caution) {
      lines.push(`Caution: ${guidance.caution}`);
    }
  }

  lines.push(`\n${OFFLINE_DATA_FOOTER}`);
  return lines.join('\n');
}
