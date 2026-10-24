import type {
  FixStatus,
  ParsedDiff,
  DiffHunk,
  DiffLine,
  FixesUrlState,
} from './fixesTypes.js';

export const VALID_FIX_STATUSES: readonly FixStatus[] = [
  'proposed',
  'approved',
  'rejected',
];

/**
 * 1. parseUnifiedDiff(text)
 * Returns { header: string[], hunks: [{ oldStart, newStart, lines: [{ kind, text, oldNo, newNo }] }], truncated?: boolean }
 * Lines starting with "#" before the first "---" are header text.
 * Must not throw on malformed input (return raw lines as meta) and cap at 2000 lines with truncated: true.
 */
export function parseUnifiedDiff(text: string): ParsedDiff {
  if (!text || typeof text !== 'string') {
    return { header: [], hunks: [] };
  }

  let rawLines = text.split(/\r?\n/);
  // Remove a trailing empty line if the diff ends with a newline
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop();
  }

  let truncated = false;
  if (rawLines.length > 2000) {
    rawLines = rawLines.slice(0, 2000);
    truncated = true;
  }

  const header: string[] = [];
  const hunks: DiffHunk[] = [];

  let idx = 0;
  // Lines starting with '#' before the first '---' or hunk header are header lines
  while (idx < rawLines.length) {
    const line = rawLines[idx];
    if (line.startsWith('#')) {
      header.push(line);
      idx++;
    } else {
      break;
    }
  }

  let currentHunk: DiffHunk | null = null;
  let currentOld = 0;
  let currentNew = 0;
  const unhunkedLines: DiffLine[] = [];

  const hunkHeaderRegex = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/;

  for (; idx < rawLines.length; idx++) {
    const line = rawLines[idx];

    // Check for hunk header
    const match = line.match(hunkHeaderRegex);
    if (match) {
      const oldStart = parseInt(match[1], 10);
      const newStart = parseInt(match[3], 10);

      currentOld = oldStart;
      currentNew = newStart;

      currentHunk = {
        oldStart,
        newStart,
        lines: [],
      };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) {
      // Lines before any hunk (e.g. --- a/file, +++ b/file)
      unhunkedLines.push({
        kind: 'meta',
        text: line,
      });
      continue;
    }

    // Inside a hunk
    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.lines.push({
        kind: 'add',
        text: line.slice(1),
        newNo: currentNew++,
      });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.lines.push({
        kind: 'del',
        text: line.slice(1),
        oldNo: currentOld++,
      });
    } else if (line.startsWith(' ')) {
      currentHunk.lines.push({
        kind: 'context',
        text: line.slice(1),
        oldNo: currentOld++,
        newNo: currentNew++,
      });
    } else if (line === '') {
      // Empty line in context
      currentHunk.lines.push({
        kind: 'context',
        text: '',
        oldNo: currentOld++,
        newNo: currentNew++,
      });
    } else {
      // Malformed or extra meta line inside/between hunks
      currentHunk.lines.push({
        kind: 'meta',
        text: line,
      });
    }
  }

  // If no hunks were found at all and there were non-header lines, wrap in a fallback meta hunk
  if (hunks.length === 0 && unhunkedLines.length > 0) {
    hunks.push({
      oldStart: 0,
      newStart: 0,
      lines: unhunkedLines,
    });
  }

  const result: ParsedDiff = {
    header,
    hunks,
  };

  if (truncated) {
    result.truncated = true;
  }

  return result;
}

/**
 * 2. maskEnvValues(path, line)
 * For a file whose path basename is ".env" or starts with ".env.",
 * a line of the form NAME=something has everything after the first "=" replaced by "***" unless it is empty.
 * All other files unchanged. This is a defensive mask; the backend should never send values.
 */
export function maskEnvValues(path: string, line: string): string {
  if (!path || !line) return line;

  const basename = path.split(/[/\\]/).pop() || '';
  const isEnv = basename === '.env' || basename.startsWith('.env.');
  if (!isEnv) {
    return line;
  }

  const eqIndex = line.indexOf('=');
  if (eqIndex === -1) {
    return line;
  }

  const valuePart = line.slice(eqIndex + 1);
  if (valuePart.length === 0) {
    // Value is empty (e.g. NAME=), leave unchanged
    return line;
  }

  // Replace everything after first '=' with '***'
  return `${line.slice(0, eqIndex + 1)}***`;
}

/**
 * 3. parseFixesUrl / buildFixesUrl
 * For ?fix=&finding=&status=&page=
 * (status only proposed|approved|rejected, page minimum 1, anything else dropped)
 */
export function parseFixesUrl(search: URLSearchParams | string): FixesUrlState {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;

  const rawFix = params.get('fix') || undefined;
  const rawFinding = params.get('finding') || undefined;
  const rawStatus = params.get('status');
  const rawPage = params.get('page');

  const status = VALID_FIX_STATUSES.includes(rawStatus as FixStatus)
    ? (rawStatus as FixStatus)
    : undefined;

  let page = 1;
  if (rawPage) {
    const parsed = parseInt(rawPage, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      page = parsed;
    }
  }

  return {
    fix: rawFix,
    finding: rawFinding,
    status,
    page,
  };
}

export function buildFixesUrl(state: Partial<FixesUrlState>): string {
  const params = new URLSearchParams();

  if (state.fix) {
    params.set('fix', state.fix);
  }
  if (state.finding) {
    params.set('finding', state.finding);
  }
  if (state.status && VALID_FIX_STATUSES.includes(state.status)) {
    params.set('status', state.status);
  }
  if (state.page && state.page > 1) {
    params.set('page', String(state.page));
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * statusLabel(status)
 * Returning text + a short plain description for:
 * - proposed ("Suggested, waiting for your decision")
 * - approved ("Approved: patch saved, not applied to your project")
 * - rejected ("Rejected")
 */
export function statusLabel(status: FixStatus | string): {
  label: string;
  description: string;
} {
  switch (status) {
    case 'proposed':
      return {
        label: 'Proposed',
        description: 'Suggested, waiting for your decision',
      };
    case 'approved':
      return {
        label: 'Approved',
        description: 'Approved: patch saved, not applied to your project',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        description: 'Rejected',
      };
    default:
      return {
        label: status || 'Unknown',
        description: status || 'Unknown',
      };
  }
}

/**
 * 4. buildPatchFileName(fix)
 * Returning "<rule_id or fix>-<first 8 chars of id>.patch" with only letters, digits, dash and dot.
 */
export function buildPatchFileName(fix: {
  id?: string;
  rule_id?: string;
  ruleId?: string;
}): string {
  const rawRule = fix.rule_id || fix.ruleId || 'fix';
  // Replace underscores and spaces with dash, and strip anything not letters, digits, dash, dot
  const cleanRule = rawRule
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'fix';

  const rawId = (fix.id || '').replace(/[^a-zA-Z0-9]/g, '');
  const cleanId = rawId.slice(0, 8) || '00000000';

  return `${cleanRule}-${cleanId}.patch`;
}
