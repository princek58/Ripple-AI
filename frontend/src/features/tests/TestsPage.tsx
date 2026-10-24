import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  AlertCircle,
  HelpCircle,
  FileCode,
  Search,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { useProjects } from '../../lib/projectContext.js';
import { isNeverScanned } from '../../lib/scanState.js';
import { useRescan } from '../../lib/useRescan.js';
import { api, getFriendlyErrorMessage } from '../../lib/api.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { Button } from '../../components/ui/Button.js';
import { TestRunItem, TestRunStatus, TestCounts } from './testsTypes.js';
import {
  parseTestsUrl,
  buildTestsUrl,
  filterTests,
  testStatusLabel,
} from './testsPure.js';

export const TestsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { projects, selectedProject, selectedProjectId, isLoading: isProjectsLoading } = useProjects();
  const { rescan, isScanning } = useRescan();

  const previousProjectIdRef = useRef<string | null>(selectedProjectId ?? null);
  const activeAbortRef = useRef<AbortController | null>(null);

  // Parse state from URL
  const { status: urlStatus, q: urlQ } = useMemo(
    () => parseTestsUrl(searchParams),
    [searchParams]
  );

  const [items, setItems] = useState<TestRunItem[]>([]);
  const [counts, setCounts] = useState<TestCounts | null>(null);
  const [note, setNote] = useState<string>('Tests are not executed in Phase 1.');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sync state update to URL
  const updateUrl = useCallback(
    (updates: { status?: TestRunStatus | string; q?: string }) => {
      const nextStatus =
        updates.status !== undefined
          ? updates.status.trim() === ''
            ? undefined
            : updates.status
          : urlStatus;

      const nextQ =
        updates.q !== undefined
          ? updates.q.trim() === ''
            ? undefined
            : updates.q
          : urlQ;

      const qs = buildTestsUrl({ status: nextStatus, q: nextQ });
      setSearchParams(new URLSearchParams(qs.startsWith('?') ? qs.slice(1) : qs), {
        replace: true,
      });
    },
    [urlStatus, urlQ, setSearchParams]
  );

  // Fetch tests for current project
  const fetchTests = useCallback(async () => {
    if (!selectedProjectId) {
      setIsLoading(false);
      return;
    }

    // Never-scanned project
    if (isNeverScanned(selectedProject)) {
      setIsLoading(false);
      setItems([]);
      setCounts(null);
      setError(null);
      return;
    }

    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    const abortController = new AbortController();
    activeAbortRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      const res = await api.getTests(selectedProjectId, abortController.signal);
      if (!abortController.signal.aborted) {
        setItems(res.items || []);
        setCounts(res.counts || { pass: 0, fail: 0, skipped: 0, not_run: 0 });
        if (res.note) {
          setNote(res.note);
        }
      }
    } catch (err: unknown) {
      if (!abortController.signal.aborted) {
        setError(getFriendlyErrorMessage(err));
      }
    } finally {
      if (!abortController.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [selectedProjectId, selectedProject]);

  // Project switch effect: abort in-flight requests, reset URL, reload
  useEffect(() => {
    if (
      previousProjectIdRef.current &&
      selectedProjectId &&
      previousProjectIdRef.current !== selectedProjectId
    ) {
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
      }
      setSearchParams(new URLSearchParams(), { replace: true });
    }
    if (selectedProjectId) {
      previousProjectIdRef.current = selectedProjectId;
    }
  }, [selectedProjectId, setSearchParams]);

  useEffect(() => {
    fetchTests();
    return () => {
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
      }
    };
  }, [fetchTests]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return filterTests(items, urlStatus, urlQ);
  }, [items, urlStatus, urlQ]);

  // Condition: every item in project is not_run
  const isAllNotRun = useMemo(() => {
    return items.length > 0 && items.every((it) => it.status === 'not_run');
  }, [items]);

  // Helper for status badge icon
  const getStatusIcon = (status: TestRunStatus) => {
    switch (status) {
      case 'not_run':
        return <Clock className="w-4 h-4 text-theme-text-muted" aria-hidden="true" />;
      case 'pass':
        return <CheckCircle2 className="w-4 h-4 text-theme-text-muted" aria-hidden="true" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-severity-high" aria-hidden="true" />;
      case 'skipped':
        return <MinusCircle className="w-4 h-4 text-severity-medium" aria-hidden="true" />;
      default:
        return <Clock className="w-4 h-4 text-theme-text-muted" aria-hidden="true" />;
    }
  };

  // State 1: Projects list loading
  if (isProjectsLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6" data-testid="tests-skeleton">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // State 2: No projects uploaded
  if (!projects || projects.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <EmptyState
          title="Upload your first project"
          description="Upload and scan a ZIP archive to analyze tests and code structure."
          action={
            <Button
              variant="primary"
              size="md"
              onClick={() => navigate('/app/overview')}
              className="gap-2"
            >
              <span>Go to Overview</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          }
        />
      </div>
    );
  }

  // State 3: Project never scanned (NEVER show zeros here)
  if (isNeverScanned(selectedProject)) {
    return (
      <div className="h-full flex items-center justify-center p-6" data-testid="tests-never-scanned">
        <div className="flex flex-col items-center justify-center text-center p-8 bg-theme-surface border border-theme-border rounded-xl max-w-md space-y-4">
          <div className="w-12 h-12 rounded-full bg-severity-medium/10 flex items-center justify-center text-severity-medium">
            <AlertCircle className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="font-heading font-semibold text-lg text-theme-text">Not scanned yet</h2>
          <p className="text-xs text-theme-text-muted">
            This project has not been scanned yet. Run a scan to discover test files and catalogue test suites.
          </p>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              if (selectedProjectId) {
                rescan(selectedProjectId);
              }
            }}
            disabled={isScanning}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning...' : 'Re-scan'}</span>
          </Button>
        </div>
      </div>
    );
  }

  // State 4: Tests loading
  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6" data-testid="tests-skeleton">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // State 5: Error loading tests
  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorState
          title="Failed to load tests"
          message={error}
          onRetry={fetchTests}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div>
        <h1 className="font-heading font-bold text-2xl sm:text-3xl text-theme-text tracking-tight">
          Tests
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-theme-text-muted">
          Catalogued test files and suites discovered in the repository.
        </p>
      </div>

      {/* 4 Labelled Counts Tiles (Passed, Failed, Skipped, Not run) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Passed */}
        <div
          data-testid="tile-passed"
          className="p-4 rounded-xl bg-theme-surface border border-theme-border flex items-center gap-3.5"
        >
          <div className="w-10 h-10 rounded-lg bg-theme-bg flex items-center justify-center text-theme-text-muted">
            <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs text-theme-text-muted font-medium">Passed</div>
            <div className="text-xl font-semibold text-theme-text" data-testid="count-pass">
              {counts?.pass ?? 0}
            </div>
          </div>
        </div>

        {/* Failed */}
        <div
          data-testid="tile-failed"
          className="p-4 rounded-xl bg-theme-surface border border-theme-border flex items-center gap-3.5"
        >
          <div className="w-10 h-10 rounded-lg bg-severity-high/10 flex items-center justify-center text-severity-high">
            <XCircle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs text-theme-text-muted font-medium">Failed</div>
            <div className="text-xl font-semibold text-theme-text" data-testid="count-fail">
              {counts?.fail ?? 0}
            </div>
          </div>
        </div>

        {/* Skipped */}
        <div
          data-testid="tile-skipped"
          className="p-4 rounded-xl bg-theme-surface border border-theme-border flex items-center gap-3.5"
        >
          <div className="w-10 h-10 rounded-lg bg-severity-medium/10 flex items-center justify-center text-severity-medium">
            <MinusCircle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs text-theme-text-muted font-medium">Skipped</div>
            <div className="text-xl font-semibold text-theme-text" data-testid="count-skipped">
              {counts?.skipped ?? 0}
            </div>
          </div>
        </div>

        {/* Not run */}
        <div
          data-testid="tile-not-run"
          className="p-4 rounded-xl bg-theme-surface border border-theme-border flex items-center gap-3.5"
        >
          <div className="w-10 h-10 rounded-lg bg-theme-bg flex items-center justify-center text-theme-text-muted">
            <Clock className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs text-theme-text-muted font-medium">Not run</div>
            <div className="text-xl font-semibold text-theme-text" data-testid="count-not-run">
              {counts?.not_run ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* Banner: shown when every item is not_run. NEVER show a green or all good message. */}
      {isAllNotRun && (
        <div
          role="alert"
          data-testid="tests-not-run-banner"
          className="p-4 rounded-xl bg-severity-medium/10 border border-severity-medium/30 flex items-start gap-3 text-theme-text"
        >
          <AlertCircle className="w-5 h-5 text-severity-medium shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <div className="font-semibold text-sm text-theme-text">
              No tests were run. This is not a pass.
            </div>
            <div className="text-xs text-theme-text-muted">
              Ripple AI catalogued {items.length} test {items.length === 1 ? 'file' : 'files'} but did not execute them, because Phase 1 executes no code.
            </div>
          </div>
        </div>
      )}

      {/* ALWAYS show the backend note and explanation of not_run */}
      <div
        data-testid="tests-phase1-note"
        className="p-3.5 rounded-xl bg-theme-surface border border-theme-border flex items-start gap-3 text-xs text-theme-text-muted"
      >
        <HelpCircle className="w-4 h-4 text-theme-text-muted shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-0.5">
          <div className="font-medium text-theme-text">{note}</div>
          <div>{testStatusLabel('not_run').description}</div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      {items.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          {/* Status Radiogroup */}
          <div
            role="radiogroup"
            aria-label="Filter test files by status"
            className="inline-flex flex-wrap p-1 rounded-lg bg-theme-bg border border-theme-border text-xs gap-1"
          >
            {[
              { value: '', label: 'All' },
              { value: 'not_run', label: 'Not run' },
              { value: 'pass', label: 'Passed' },
              { value: 'fail', label: 'Failed' },
              { value: 'skipped', label: 'Skipped' },
            ].map((opt) => {
              const isSelected = (urlStatus || '') === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => updateUrl({ status: opt.value })}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    isSelected
                      ? 'bg-theme-surface text-theme-text shadow-sm'
                      : 'text-theme-text-muted hover:text-theme-text'
                  }`}
                  data-testid={`filter-status-${opt.value || 'all'}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-muted" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search test files"
              placeholder="Search test files by name..."
              value={urlQ || ''}
              onChange={(e) => updateUrl({ q: e.target.value })}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-theme-surface border border-theme-border text-theme-text placeholder:text-theme-text-muted focus:outline-none focus:border-brand-primary"
              data-testid="tests-search-input"
            />
          </div>
        </div>
      )}

      {/* Counter */}
      {items.length > 0 && (
        <div className="text-xs text-theme-text-muted font-medium" data-testid="tests-counter">
          Showing {filteredItems.length} of {items.length} test files
        </div>
      )}

      {/* Test List Rows or Empty States */}
      {items.length === 0 ? (
        <div
          data-testid="no-test-files-scanned"
          className="p-8 text-center bg-theme-surface border border-theme-border rounded-xl space-y-2"
        >
          <div className="text-sm font-semibold text-theme-text">
            No test files found in this project
          </div>
          <p className="text-xs text-theme-text-muted">
            Ripple AI completed the scan and discovered 0 test suites or test files in this project.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div
          data-testid="no-test-files-match"
          className="p-8 text-center bg-theme-surface border border-theme-border rounded-xl space-y-2"
        >
          <div className="text-sm font-medium text-theme-text">No test files match your filters</div>
          <p className="text-xs text-theme-text-muted">
            Try adjusting your search query or status filter.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              data-testid={`test-row-${item.id}`}
              className="p-3.5 sm:p-4 rounded-xl bg-theme-surface border border-theme-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 overflow-hidden"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <FileCode className="w-4 h-4 text-theme-text-muted shrink-0" aria-hidden="true" />
                <span
                  className="font-mono text-xs sm:text-sm text-theme-text truncate break-all"
                  title={item.name}
                  data-testid={`test-name-${item.id}`}
                >
                  {item.name}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-theme-bg border-theme-border text-theme-text"
                  data-testid={`test-status-${item.id}`}
                >
                  {getStatusIcon(item.status)}
                  <span>{testStatusLabel(item.status).label}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TestsPage;
