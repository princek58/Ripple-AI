import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Sparkles, RefreshCw, AlertCircle, ArrowRight } from 'lucide-react';
import { useProjects } from '../../lib/projectContext.js';
import { isNeverScanned } from '../../lib/scanState.js';
import { useRescan } from '../../lib/useRescan.js';
import { api, getFriendlyErrorMessage } from '../../lib/api.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { Button } from '../../components/ui/Button.js';
import { FixList } from './FixList.js';
import { FixDetail } from './FixDetail.js';
import { GenerateFixCard } from './GenerateFixCard.js';
import { parseFixesUrl, buildFixesUrl } from './fixesPure.js';
import type { ProjectFixItem, Fix } from './fixesTypes.js';

export const FixesPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { projects, selectedProject, selectedProjectId, isLoading: isProjectsLoading } = useProjects();
  const { rescan, isScanning } = useRescan();

  // URL State
  const urlState = useMemo(() => parseFixesUrl(location.search), [location.search]);

  // Fixes list state
  const [items, setItems] = useState<ProjectFixItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [isListLoading, setIsListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Selected fix object
  const [selectedFix, setSelectedFix] = useState<Fix | ProjectFixItem | null>(null);

  // Finding fix check state (when ?finding=<id>)
  const [isCheckingFindingFixes, setIsCheckingFindingFixes] = useState(false);
  const [findingHasNoFix, setFindingHasNoFix] = useState(false);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Tracking refs to abort stale requests & handle project switching
  const activeListAbortRef = useRef<AbortController | null>(null);
  const previousProjectIdRef = useRef<string | null>(selectedProjectId);
  const lastSelectedFixIdRef = useRef<string | undefined>(urlState.fix);

  useEffect(() => {
    if (urlState.fix) {
      lastSelectedFixIdRef.current = urlState.fix;
    }
  }, [urlState.fix]);

  // Helper to update URL state
  const updateUrl = useCallback(
    (updates: Partial<typeof urlState>) => {
      const nextState = {
        fix: updates.fix !== undefined ? updates.fix : urlState.fix,
        finding: updates.finding !== undefined ? updates.finding : urlState.finding,
        status: updates.status !== undefined ? updates.status : urlState.status,
        page: updates.page !== undefined ? updates.page : urlState.page,
      };
      const qs = buildFixesUrl(nextState);
      navigate(qs ? `/app/fixes${qs}` : '/app/fixes');
    },
    [navigate, urlState]
  );

  // Project switch: abort in-flight requests, reset URL state, clear selection
  useEffect(() => {
    if (
      previousProjectIdRef.current &&
      selectedProjectId &&
      previousProjectIdRef.current !== selectedProjectId
    ) {
      if (activeListAbortRef.current) {
        activeListAbortRef.current.abort();
      }
      setSelectedFix(null);
      setFindingHasNoFix(false);
      navigate('/app/fixes', { replace: true });
    }
    if (selectedProjectId) {
      previousProjectIdRef.current = selectedProjectId;
    }
  }, [selectedProjectId, navigate]);

  // Fetch fixes list for project
  const fetchFixesList = useCallback(async () => {
    if (!selectedProjectId) return;

    // Never scanned project
    if (isNeverScanned(selectedProject)) {
      setIsListLoading(false);
      setItems([]);
      setTotalItems(0);
      return;
    }

    if (activeListAbortRef.current) {
      activeListAbortRef.current.abort();
    }
    const abortController = new AbortController();
    activeListAbortRef.current = abortController;

    setIsListLoading(true);
    setListError(null);

    try {
      const res = await api.getProjectFixes(
        selectedProjectId,
        {
          status: urlState.status || undefined,
          page: urlState.page,
          pageSize: 25,
        },
        abortController.signal
      );

      // Only apply if not aborted
      if (!abortController.signal.aborted) {
        setItems(res.items || []);
        setTotalItems(res.total || 0);
      }
    } catch (err: unknown) {
      if (!abortController.signal.aborted) {
        setListError(getFriendlyErrorMessage(err));
      }
    } finally {
      if (!abortController.signal.aborted) {
        setIsListLoading(false);
      }
    }
  }, [selectedProjectId, selectedProject, urlState.status, urlState.page]);

  useEffect(() => {
    fetchFixesList();
  }, [fetchFixesList]);

  // Handle ?finding=<id> resolution: check if fix exists; if yes open it, if not show Generate card
  useEffect(() => {
    if (!urlState.finding) {
      setFindingHasNoFix(false);
      return;
    }

    let isCancelled = false;
    const controller = new AbortController();
    setIsCheckingFindingFixes(true);

    api.getFindingFixes(urlState.finding, controller.signal)
      .then((fixes) => {
        if (isCancelled) return;
        if (fixes && fixes.length > 0) {
          // Fix exists! Open the first fix
          const fixToOpen = fixes[0];
          setSelectedFix(fixToOpen);
          setFindingHasNoFix(false);
          updateUrl({ fix: fixToOpen.id, finding: undefined });
        } else {
          // No fix yet for this finding -> show Generate card
          setFindingHasNoFix(true);
          setSelectedFix(null);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          // On error checking fixes, allow generate card to render and retry
          setFindingHasNoFix(true);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsCheckingFindingFixes(false);
        }
      });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [urlState.finding, updateUrl]);

  // Sync selectedFix with urlState.fix
  useEffect(() => {
    if (!urlState.fix) {
      if (!urlState.finding) {
        setSelectedFix(null);
      }
      return;
    }

    // Check if fix is in current items
    const foundInList = items.find((f) => f.id === urlState.fix);
    if (foundInList) {
      setSelectedFix(foundInList);
      return;
    }

    // Otherwise, if not found or list is filtered, keep selected fix if matching
    if (selectedFix && selectedFix.id === urlState.fix) {
      return;
    }

    // If still not present, we will wait for items to load or fetch
  }, [urlState.fix, items, selectedFix]);

  const handleSelectFix = (fixId: string) => {
    updateUrl({ fix: fixId, finding: undefined });
  };

  const handleBackToList = () => {
    updateUrl({ fix: undefined, finding: undefined });
    // Restore focus to previously selected item
    setTimeout(() => {
      if (lastSelectedFixIdRef.current) {
        const el = document.querySelector(`[data-testid="fix-row-${lastSelectedFixIdRef.current}"]`) as HTMLElement;
        el?.focus();
      }
    }, 50);
  };

  const handleFixCreated = (newFix: Fix) => {
    fetchFixesList();
    setSelectedFix(newFix);
    setFindingHasNoFix(false);
    updateUrl({ fix: newFix.id, finding: undefined });
  };

  // State 1: Projects loading
  if (isProjectsLoading) {
    return (
      <div className="h-full p-4 lg:p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-12rem)]">
          <Skeleton className="lg:col-span-5 h-full" />
          <Skeleton className="lg:col-span-7 h-full" />
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
          description="Upload and scan a ZIP archive to view and generate suggested changes for findings."
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

  // State 3: Project never scanned
  if (isNeverScanned(selectedProject)) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="flex flex-col items-center justify-center text-center p-8 bg-theme-surface border border-theme-border rounded-xl max-w-md space-y-4">
          <div className="w-12 h-12 rounded-full bg-severity-medium/10 flex items-center justify-center text-severity-medium">
            <AlertCircle className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="font-heading font-semibold text-lg text-theme-text">Not scanned yet</h2>
          <p className="text-xs text-theme-text-muted">
            This project has not been scanned yet. Run a scan to find issues and generate suggested changes.
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

  // State 4: List error with Retry
  if (listError) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <ErrorState
          title="Failed to load suggested changes"
          message={listError}
          onRetry={fetchFixesList}
        />
      </div>
    );
  }

  // State 5: Scanned project with no fixes yet and no ?finding= query
  const hasNoFixesAtAll = !isListLoading && items.length === 0 && !urlState.status && totalItems === 0;
  if (hasNoFixesAtAll && !urlState.finding) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="flex flex-col items-center justify-center text-center p-8 bg-theme-surface border border-theme-border rounded-xl max-w-lg space-y-4">
          <div className="w-12 h-12 rounded-full bg-theme-primary/10 flex items-center justify-center text-theme-primary">
            <Sparkles className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="font-heading font-semibold text-lg text-theme-text">
            No suggested changes yet
          </h2>
          <p className="text-xs sm:text-sm text-theme-text-muted leading-relaxed">
            Open a finding in Investigations and choose Suggested fix. Ripple AI can suggest a change for only some findings.
          </p>
          <div className="pt-2">
            <Link
              to="/app/investigations"
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-theme-primary text-theme-bg font-semibold text-xs hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-theme-primary"
            >
              <span>Go to Investigations</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const hasSelection = Boolean(urlState.fix || selectedFix || (urlState.finding && findingHasNoFix));

  return (
    <div className="h-full flex flex-col p-4 lg:p-6 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-0">
        {/* Left Column: Fixes List */}
        <section
          aria-label="Suggested changes list"
          className={`h-full min-h-0 lg:col-span-5 ${
            isMobile && hasSelection ? 'hidden' : 'block'
          }`}
        >
          {isListLoading && items.length === 0 ? (
            <div className="h-full bg-theme-surface border border-theme-border rounded-xl p-4 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-10 w-full" />
              <div className="space-y-2 pt-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          ) : (
            <FixList
              items={items}
              total={totalItems}
              page={urlState.page}
              pageSize={25}
              selectedFixId={urlState.fix}
              statusFilter={urlState.status || ''}
              onStatusChange={(status) => updateUrl({ status: status || undefined, page: 1 })}
              onPageChange={(page) => updateUrl({ page })}
              onSelectFix={handleSelectFix}
              isLoading={isListLoading}
            />
          )}
        </section>

        {/* Right Column: Fix Detail or Generate Card */}
        <section
          aria-label="Suggested change detail"
          className={`h-full min-h-0 lg:col-span-7 ${
            isMobile && !hasSelection ? 'hidden' : 'block'
          }`}
        >
          {isCheckingFindingFixes ? (
            <div className="h-full bg-theme-surface border border-theme-border rounded-xl p-6 space-y-4">
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : urlState.finding && findingHasNoFix ? (
            <GenerateFixCard
              findingId={urlState.finding}
              onFixCreated={handleFixCreated}
              onBack={isMobile ? handleBackToList : undefined}
            />
          ) : selectedFix ? (
            <FixDetail
              fix={selectedFix}
              onBack={isMobile ? handleBackToList : undefined}
              onRefresh={async () => {
                await fetchFixesList();
              }}
            />
          ) : (
            /* No fix selected desktop placeholder */
            <div className="h-full hidden lg:flex flex-col items-center justify-center text-center p-8 bg-theme-surface border border-theme-border rounded-xl text-theme-text-muted space-y-2">
              <Sparkles className="w-8 h-8 opacity-40 text-theme-primary" aria-hidden="true" />
              <h3 className="font-heading font-medium text-sm text-theme-text">No change selected</h3>
              <p className="text-xs max-w-xs">
                Select a suggested change from the list on the left to inspect the unified diff and take action.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default FixesPage;
