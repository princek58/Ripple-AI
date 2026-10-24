import { TestRunItem, TestRunStatus, TestCounts } from './testsTypes.js';

const VALID_STATUSES: readonly TestRunStatus[] = [
  'pass',
  'fail',
  'skipped',
  'not_run',
] as const;

export function parseTestsUrl(search: string | URLSearchParams): {
  status?: TestRunStatus;
  q?: string;
} {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;

  const rawStatus = params.get('status');
  const rawQ = params.get('q');

  const status =
    rawStatus && VALID_STATUSES.includes(rawStatus as TestRunStatus)
      ? (rawStatus as TestRunStatus)
      : undefined;

  const q = rawQ && rawQ.trim() !== '' ? rawQ.trim() : undefined;

  return { status, q };
}

export function buildTestsUrl(state: {
  status?: TestRunStatus | string;
  q?: string;
}): string {
  const params = new URLSearchParams();
  if (state.status && VALID_STATUSES.includes(state.status as TestRunStatus)) {
    params.set('status', state.status);
  }
  if (state.q && state.q.trim() !== '') {
    params.set('q', state.q.trim());
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

export function filterTests(
  items: TestRunItem[],
  status?: TestRunStatus | string,
  q?: string
): TestRunItem[] {
  if (!Array.isArray(items)) return [];

  const filterStatus =
    status && VALID_STATUSES.includes(status as TestRunStatus)
      ? (status as TestRunStatus)
      : undefined;

  const query = q?.toLowerCase().trim();

  return items.filter((item) => {
    if (filterStatus && item.status !== filterStatus) {
      return false;
    }
    if (query && !item.name.toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });
}

export function testStatusLabel(status: TestRunStatus | string): {
  label: string;
  description: string;
} {
  switch (status) {
    case 'not_run':
      return {
        label: 'Not run',
        description:
          'Not run: Ripple AI found this test file but did not execute it, because Phase 1 executes no code',
      };
    case 'pass':
      return {
        label: 'Passed',
        description: 'Pass: Test suite passed',
      };
    case 'fail':
      return {
        label: 'Failed',
        description: 'Fail: Test suite failed',
      };
    case 'skipped':
      return {
        label: 'Skipped',
        description: 'Skipped: Test suite skipped',
      };
    default:
      return {
        label: status || 'Unknown',
        description: `Status: ${status || 'Unknown'}`,
      };
  }
}

export function countsTotal(counts?: Partial<TestCounts> | null): number {
  if (!counts) return 0;
  return (
    (Number(counts.pass) || 0) +
    (Number(counts.fail) || 0) +
    (Number(counts.skipped) || 0) +
    (Number(counts.not_run) || 0)
  );
}
