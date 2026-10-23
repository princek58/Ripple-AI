import type {
  FindingSeverity,
  FindingConfidence,
  FindingVerification,
  FindingEvidenceItem,
  FindingsQueryParams,
} from '../../../../shared/types.js';

export interface InvestigationsUrlState {
  findingId?: string;
  severity?: FindingSeverity;
  confidence?: FindingConfidence;
  verification?: FindingVerification;
  rule_id?: string;
  q?: string;
  page: number;
}

export const VALID_SEVERITIES: readonly FindingSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'unknown',
];

export const VALID_CONFIDENCES: readonly FindingConfidence[] = [
  'confirmed',
  'likely',
  'hypothesis',
];

export const VALID_VERIFICATIONS: readonly FindingVerification[] = [
  'not_tested',
  'reproduced',
  'fix_proposed',
  'fix_verified',
];

export const KNOWN_RULES: Record<string, string> = {
  circular_dependency: 'Circular dependency',
  broken_import: 'Broken import',
  isolated_file: 'Isolated file',
  env_undeclared: 'Undeclared environment variable',
  api_unmatched_call: 'Unmatched API call',
  secret_pattern: 'Secret pattern',
};

export function ruleLabel(ruleId: string): string {
  if (!ruleId) return '';
  return KNOWN_RULES[ruleId] ?? ruleId;
}

export function parseInvestigationsUrl(
  search: URLSearchParams | string
): InvestigationsUrlState {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;

  const rawFinding = params.get('finding') || undefined;
  const rawSeverity = params.get('severity');
  const rawConfidence = params.get('confidence');
  const rawVerification = params.get('verification');
  const rawRule = params.get('rule_id') || undefined;
  const rawQ = params.get('q') || undefined;
  const rawPage = params.get('page');

  const severity = VALID_SEVERITIES.includes(rawSeverity as FindingSeverity)
    ? (rawSeverity as FindingSeverity)
    : undefined;

  const confidence = VALID_CONFIDENCES.includes(rawConfidence as FindingConfidence)
    ? (rawConfidence as FindingConfidence)
    : undefined;

  const verification = VALID_VERIFICATIONS.includes(rawVerification as FindingVerification)
    ? (rawVerification as FindingVerification)
    : undefined;

  let page = 1;
  if (rawPage) {
    const parsed = parseInt(rawPage, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      page = parsed;
    }
  }

  return {
    findingId: rawFinding,
    severity,
    confidence,
    verification,
    rule_id: rawRule,
    q: rawQ,
    page,
  };
}

export function buildInvestigationsUrl(
  state: Partial<InvestigationsUrlState>
): string {
  const params = new URLSearchParams();

  if (state.findingId) {
    params.set('finding', state.findingId);
  }
  if (state.severity && VALID_SEVERITIES.includes(state.severity)) {
    params.set('severity', state.severity);
  }
  if (state.confidence && VALID_CONFIDENCES.includes(state.confidence)) {
    params.set('confidence', state.confidence);
  }
  if (state.verification && VALID_VERIFICATIONS.includes(state.verification)) {
    params.set('verification', state.verification);
  }
  if (state.rule_id) {
    params.set('rule_id', state.rule_id);
  }
  if (state.q && state.q.trim()) {
    params.set('q', state.q.trim());
  }
  if (state.page && state.page > 1) {
    params.set('page', String(state.page));
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function buildFindingsQuery(
  state: InvestigationsUrlState,
  pageSize = 25
): FindingsQueryParams {
  const query: FindingsQueryParams = {
    page: Math.max(1, state.page || 1),
    pageSize,
  };

  if (state.severity) query.severity = state.severity;
  if (state.confidence) query.confidence = state.confidence;
  if (state.verification) query.verification = state.verification;
  if (state.rule_id) query.rule_id = state.rule_id;
  if (state.q && state.q.trim()) query.q = state.q.trim();

  return query;
}

export function formatEvidence(ev: FindingEvidenceItem): string {
  if (!ev) return '';

  const file = typeof ev.file === 'string' ? ev.file : '';
  const lineStart =
    typeof ev.line_start === 'number'
      ? ev.line_start
      : typeof ev.line === 'number'
        ? ev.line
        : undefined;
  const lineEnd = typeof ev.line_end === 'number' ? ev.line_end : undefined;

  if (file) {
    if (lineStart !== undefined && lineEnd !== undefined && lineStart !== lineEnd) {
      return `${file}:${lineStart}-${lineEnd}`;
    }
    if (lineStart !== undefined) {
      return `${file}:${lineStart}`;
    }
    return file;
  }

  if (lineStart !== undefined && lineEnd !== undefined && lineStart !== lineEnd) {
    return `line ${lineStart}-${lineEnd}`;
  }
  if (lineStart !== undefined) {
    return `line ${lineStart}`;
  }

  return '';
}
