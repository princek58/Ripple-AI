import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw, FolderOpen, ArrowLeft } from 'lucide-react';
import { useProjects } from '../../lib/projectContext.js';
import { isNeverScanned } from '../../lib/scanState.js';
import { api, ApiClientError, getFriendlyErrorMessage } from '../../lib/api.js';
import { useRescan } from '../../lib/useRescan.js';
import { Button } from '../../components/ui/Button.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { FindingList } from './FindingList.js';
import { FindingDetail } from './FindingDetail.js';
import { ScanHistoryStrip } from './ScanHistoryStrip.js';
import {
  parseInvestigationsUrl,
  buildInvestigationsUrl,
  buildFindingsQuery,
} from './investigationsUrl.js';
import type {
  Finding,
  FindingDetailData,
  ProjectSummary,
} from '../../../../shared/types.js';

export const InvestigationsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    selectedProject,
    selectedProjectId,
    projects,
    isLoading: isProjectsLoading,
  } = useProjects();
  const { rescan, isScanning } = useRescan();

  // URL state
  const urlState = useMemo(
    () => parseInvestigationsUrl(searchParams),
    [searchParams]
  );

  // Summary state for never-scanned detection
  const [summary, setSummary] = useState<ProjectSummary | null>(null);

  // Findings list state
  const [findings, setFindings] = useState<Finding[]>([]);
  const [totalFindings, setTotalFindings] = useState<number>(0);
  const [isFindingsLoading, setIsFindingsLoading] = useState<boolean>(true);
  const [findingsError, setFindingsError] = useState<string | null>(null);

  // Finding detail state
  const [selectedFinding, setSelectedFinding] = useState<FindingDetailData | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isForeignOr404, setIsForeignOr404] = useState<boolean>(false);

  // Mobile / Desktop detection (< 1024px = phone/tablet stack)
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1024;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Tracking refs to abort stale requests & handle project switching
  const activeListAbortRef = useRef<AbortController | null>(null);
  const activeDetailAbortRef = useRef<AbortController | null>(null);
  const previousProjectIdRef = useRef<string | null>(selectedProjectId);
  const lastSelectedFindingIdRef = useRef<string | undefined>(urlState.findingId);

  // Keep lastSelectedFindingIdRef up to date for focus return
  useEffect(() => {
    if (urlState.findingId) {
      lastSelectedFindingIdRef.current = urlState.findingId;
    }
  }, [urlState.findingId]);

  // Project switch: abort in-flight requests, reset URL state, clear selection
  useEffect(() => {
    if (
      previousProjectIdRef.current &&
      selectedProjectId &&
      previousProjectIdRef.current !== selectedProjectId
    ) {
      if (activeListAbortRef.current) activeListAbortRef.current.abort();
      if (activeDetailAbortRef.current) activeDetailAbortRef.current.abort();

      updateUrl({ findingId: undefined });
      setSelectedFinding(null);
      setIsForeignOr404(false);
      setDetailError(null);
      setSummary(null);
    }
    previousProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId, navigate]);

  // Fetch paginated findings list
  const fetchFindingsList = useCallback(async () => {
    if (!selectedProjectId) return;

    if (isNeverScanned(selectedProject)) {
      setIsFindingsLoading(false);
      setFindings([]);
      setTotalFindings(0);
      return;
    }

    if (activeListAbortRef.current) {
      activeListAbortRef.current.abort();
    }
    const abortController = new AbortController();
    activeListAbortRef.current = abortController;

    setIsFindingsLoading(true);
    setFindingsError(null);

    try {
      const query = buildFindingsQuery(urlState, 25);
      const [res, summaryRes] = await Promise.allSettled([
        api.getFindings(selectedProjectId, query, abortController.signal),
        api.getSummary(selectedProjectId, abortController.signal),
      ]);

      if (abortController.signal.aborted) return;

      if (summaryRes.status === 'fulfilled') {
        setSummary(summaryRes.value);
        if (isNeverScanned(selectedProject, summaryRes.value)) {
          setIsFindingsLoading(false);
          setFindings([]);
          setTotalFindings(0);
          return;
        }
      }

      if (res.status === 'fulfilled') {
        setFindings(res.value.items || []);
        setTotalFindings(res.value.total ?? 0);
      } else {
        const msg = getFriendlyErrorMessage(res.reason);
        if (msg !== 'Request cancelled') {
          setFindingsError(msg);
        }
      }
    } catch (err: unknown) {
      if (abortController.signal.aborted) return;
      const msg = getFriendlyErrorMessage(err);
      if (msg !== 'Request cancelled') {
        setFindingsError(msg);
      }
    } finally {
      if (!abortController.signal.aborted) {
        setIsFindingsLoading(false);
      }
    }
  }, [selectedProjectId, selectedProject, urlState]);

  // Trigger findings fetch on query param changes
  useEffect(() => {
    fetchFindingsList();
  }, [fetchFindingsList]);

  // Fetch finding detail when urlState.findingId changes
  useEffect(() => {
    const findingId = urlState.findingId;
    if (!findingId || !selectedProjectId) {
      setSelectedFinding(null);
      setIsForeignOr404(false);
      setDetailError(null);
      return;
    }

    if (activeDetailAbortRef.current) {
      activeDetailAbortRef.current.abort();
    }
    const abortController = new AbortController();
    activeDetailAbortRef.current = abortController;

    setIsDetailLoading(true);
    setDetailError(null);
    setIsForeignOr404(false);

    api
      .getFinding(findingId, abortController.signal)
      .then((detail) => {
        if (abortController.signal.aborted) return;

        // Verify finding belongs to the selected project if project_id is present
        if (detail.project_id && detail.project_id !== selectedProjectId) {
          setIsForeignOr404(true);
          setSelectedFinding(null);
        } else {
          setSelectedFinding(detail);
          setIsForeignOr404(false);
        }
      })
      .catch((err: unknown) => {
        if (abortController.signal.aborted) return;

        if (err instanceof ApiClientError && err.status === 404) {
          setIsForeignOr404(true);
          setSelectedFinding(null);
        } else {
          const msg = getFriendlyErrorMessage(err);
          if (msg !== 'Request cancelled') {
            setDetailError(msg);
          }
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsDetailLoading(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [urlState.findingId, selectedProjectId]);

  // Helper to update URL params
  const updateUrl = useCallback(
    (updates: Partial<typeof urlState>) => {
      const next = { ...urlState, ...updates };
      const qs = buildInvestigationsUrl(next);
      navigate(`/app/investigations${qs}`, { replace: true });
    },
    [urlState, navigate]
  );

  // Row selection handler
  const handleSelectFinding = (findingId: string) => {
    lastSelectedFindingIdRef.current = findingId;
    updateUrl({ findingId });
  };

  // Back from detail handler (phone view)
  const handleBackToList = () => {
    const targetId = lastSelectedFindingIdRef.current || urlState.findingId;
    updateUrl({ findingId: undefined });

    // Focus returns to the row in the list
    if (targetId) {
      setTimeout(() => {
        const el = document.getElementById(`finding-row-${targetId}`);
        if (el) {
          el.focus();
        }
      }, 50);
    }
  };

  // Check if filters are active
  const hasActiveFilters = Boolean(
    urlState.severity ||
      urlState.confidence ||
      urlState.verification ||
      urlState.rule_id ||
      (urlState.q && urlState.q.trim())
  );

  // Clear filters handler
  const handleClearFilters = () => {
    updateUrl({
      severity: undefined,
      confidence: undefined,
      verification: undefined,
      rule_id: undefined,
      q: undefined,
      page: 1,
    });
  };

  // State 1: Projects still loading
  if (isProjectsLoading) {
    return (
      <div className="p-6 space-y-4" data-testid="investigations-loading-skeleton">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[600px]">
          <div className="lg:col-span-5">
            <Skeleton className="h-full w-full rounded-xl" />
          </div>
          <div className="lg:col-span-7">
            <Skeleton className="h-full w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // State 2: No projects exist
  if (projects.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          title="Upload your first project"
          description="Upload a ZIP archive to analyze dependencies, run automated checks, and investigate findings."
          action={
            <Button onClick={() => navigate('/app/projects')}>
              Go to Projects
            </Button>
          }
        />
      </div>
    );
  }

  // State 3: Project exists but never scanned (NO ZEROS)
  if (isNeverScanned(selectedProject, summary)) {
    return (
      <div className="p-6">
        <div
          data-testid="never-scanned-state"
          className="flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed border-theme-border bg-theme-surface text-theme-text"
        >
          <div className="w-12 h-12 mb-3 rounded-full bg-theme-border/40 flex items-center justify-center text-theme-text-muted">
            <FolderOpen className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="font-heading font-semibold text-lg text-theme-text">
            Not scanned yet
          </h2>
          <p className="mt-1 text-sm text-theme-text-muted max-w-sm">
            This project has not been scanned yet. Run a scan to build the dependency graph and discover findings.
          </p>
          <div className="mt-4">
            <Button
              onClick={() => selectedProject && rescan(selectedProject.id, fetchFindingsList)}
              disabled={isScanning}
              className="gap-2"
            >
              <RefreshCw
                className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{isScanning ? 'Scanning...' : 'Scan now'}</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // State 4: Findings list error with Retry
  if (findingsError) {
    return (
      <div className="p-6">
        <ErrorState
          title="Failed to load findings"
          message={findingsError}
          onRetry={fetchFindingsList}
        />
      </div>
    );
  }

  // State 5: Scanned project with zero findings unfiltered
  if (!isFindingsLoading && totalFindings === 0 && !hasActiveFilters) {
    return (
      <div className="p-4 sm:p-6 space-y-4" data-testid="zero-findings-state">
        {selectedProjectId && <ScanHistoryStrip projectId={selectedProjectId} />}
        <div className="flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed border-theme-border bg-theme-surface text-theme-text max-w-xl mx-auto">
          <div className="w-12 h-12 mb-3 rounded-full bg-forest/10 dark:bg-lime/10 flex items-center justify-center text-forest dark:text-lime">
            <AlertCircle className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="font-heading font-bold text-lg text-theme-text">
            No findings from the 6 automated checks
          </h2>
          <p className="mt-2 text-xs text-theme-text-muted leading-relaxed">
            No findings does not mean no problems: Phase 1 runs only 6 static checks and executes no code.
          </p>
        </div>
      </div>
    );
  }

  // Determine mobile display mode:
  // On mobile (< 1024px), if urlState.findingId is set, show only detail; otherwise show only list.
  const showMobileDetail = isMobile && Boolean(urlState.findingId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="min-h-[calc(100vh-8rem)] lg:h-[calc(100vh-8rem)] flex flex-col overflow-x-hidden p-4 sm:p-6 gap-4"
    >
      {selectedProjectId && <ScanHistoryStrip projectId={selectedProjectId} />}

      {/* Two Column Layout on Desktop, Single Column Stack on Phone */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
        {/* Left Column: Finding List (hidden on phone when viewing detail) */}
        <section
          aria-label="Findings directory"
          className={`h-full min-h-0 lg:col-span-5 ${
            showMobileDetail ? 'hidden lg:block' : 'block'
          }`}
        >
          {isFindingsLoading && findings.length === 0 ? (
            <div className="p-4 space-y-3 bg-theme-surface border border-theme-border rounded-xl h-full">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-8 w-full" />
              <div className="space-y-2 pt-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          ) : (
            <FindingList
              findings={findings}
              total={totalFindings}
              page={urlState.page}
              pageSize={25}
              selectedFindingId={urlState.findingId}
              onSelectFinding={handleSelectFinding}
              severityFilter={urlState.severity}
              onSeverityChange={(severity) => updateUrl({ severity, page: 1 })}
              confidenceFilter={urlState.confidence}
              onConfidenceChange={(confidence) => updateUrl({ confidence, page: 1 })}
              verificationFilter={urlState.verification}
              onVerificationChange={(verification) => updateUrl({ verification, page: 1 })}
              ruleFilter={urlState.rule_id}
              onRuleChange={(rule_id) => updateUrl({ rule_id, page: 1 })}
              searchQuery={urlState.q ?? ''}
              onSearchChange={(q) => updateUrl({ q: q || undefined, page: 1 })}
              onClearFilters={handleClearFilters}
              onPageChange={(page) => updateUrl({ page })}
              isLoading={isFindingsLoading}
              hasActiveFilters={hasActiveFilters}
            />
          )}
        </section>

        {/* Right Column: Finding Detail (hidden on phone when no finding selected) */}
        <section
          aria-label="Finding detail"
          className={`min-h-0 lg:h-full lg:col-span-7 ${
            !urlState.findingId && isMobile ? 'hidden' : 'block'
          }`}
        >
          {urlState.findingId ? (
            isForeignOr404 ? (
              /* 404 or Foreign Project Finding State */
              <div
                data-testid="foreign-or-404-state"
                className="h-full flex flex-col items-center justify-center text-center p-6 bg-theme-surface border border-theme-border rounded-xl space-y-3"
              >
                <div className="w-10 h-10 rounded-full bg-severity-critical/10 flex items-center justify-center text-severity-critical">
                  <AlertCircle className="w-5 h-5" aria-hidden="true" />
                </div>
                <h2 className="font-heading font-semibold text-base text-theme-text">
                  This finding is not in the selected project
                </h2>
                <p className="text-xs text-theme-text-muted max-w-sm">
                  The requested finding ID was not found in the active project graph.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleBackToList}
                  className="gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  <span>Back to findings</span>
                </Button>
              </div>
            ) : detailError ? (
              <div className="h-full flex items-center justify-center p-6 bg-theme-surface border border-theme-border rounded-xl">
                <ErrorState
                  title="Failed to load finding details"
                  message={detailError}
                  onRetry={() => {
                    const id = urlState.findingId;
                    if (id) {
                      updateUrl({ findingId: id });
                    }
                  }}
                />
              </div>
            ) : isDetailLoading || !selectedFinding ? (
              <div className="p-6 bg-theme-surface border border-theme-border rounded-xl h-full space-y-4">
                <Skeleton className="h-8 w-3/4" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <FindingDetail
                finding={selectedFinding}
                onBack={handleBackToList}
                showBackButton={isMobile}
              />
            )
          ) : (
            /* Desktop Prompt when no finding is selected */
            <div className="h-full hidden lg:flex flex-col items-center justify-center text-center p-8 bg-theme-surface/50 border border-dashed border-theme-border rounded-xl text-theme-text-muted">
              <FolderOpen className="w-10 h-10 mb-2 text-theme-text-muted/60" aria-hidden="true" />
              <h3 className="font-heading font-semibold text-sm text-theme-text">
                Select a finding
              </h3>
              <p className="text-xs text-theme-text-muted max-w-xs mt-1">
                Choose a finding from the list on the left to view evidence, likely cause, and suggested fixes.
              </p>
            </div>
          )}
        </section>
      </div>
    </motion.div>
  );
};

export default InvestigationsPage;
