export type TestRunStatus = 'pass' | 'fail' | 'skipped' | 'not_run';

export interface TestRunItem {
  id: string;
  name: string;
  status: TestRunStatus;
}

export interface TestCounts {
  pass: number;
  fail: number;
  skipped: number;
  not_run: number;
}

export interface ProjectTestsData {
  items: TestRunItem[];
  counts: TestCounts;
  note: string;
}
