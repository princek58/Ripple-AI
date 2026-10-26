/**
 * URL helpers for the chat feature.
 * Pure functions – no React, no side-effects.
 */
import type { ChatScreen, ContextIds } from './types.js';

/** UUID v4 pattern – only accept properly formatted UUIDs */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Map a React Router pathname to a `screen` value for the chat POST body.
 * Matching is done on the final path segment; `/app/overview` → `"overview"`.
 * The landing page (pathname `/`) and any unrecognised path → `"general"`.
 */
export function screenFromPath(pathname: string): ChatScreen {
  const segment = pathname.replace(/\/$/, '').split('/').pop() ?? '';
  switch (segment) {
    case 'overview':      return 'overview';
    case 'projects':      return 'projects';
    case 'graph':         return 'graph';
    case 'investigations':return 'investigations';
    case 'fixes':         return 'fixes';
    case 'tests':         return 'tests';
    case 'reports':       return 'reports';
    case '':              return 'landing';  // root "/"
    default:              return 'general';
  }
}

/**
 * Build the full `ContextIds` object from a pathname and query string.
 * Only includes optional id fields when the value is a valid UUID v4.
 * URL params used:
 *   ?finding   → finding_id
 *   ?focus     → node_id
 *   ?fix       → fix_id
 *   ?report    → report_id
 */
export function contextIdsFromUrl(
  pathname: string,
  search: string,
): ContextIds {
  const screen = screenFromPath(pathname);
  const params = new URLSearchParams(search);

  const result: ContextIds = { screen };

  const finding = params.get('finding');
  if (isValidUuid(finding)) result.finding_id = finding;

  const focus = params.get('focus');
  if (isValidUuid(focus)) result.node_id = focus;

  const fix = params.get('fix');
  if (isValidUuid(fix)) result.fix_id = fix;

  const report = params.get('report');
  if (isValidUuid(report)) result.report_id = report;

  return result;
}
