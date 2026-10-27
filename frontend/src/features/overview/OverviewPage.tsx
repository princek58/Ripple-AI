import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  FolderOpen,
  RefreshCw,
  Search,
  ShieldAlert,
  CheckCircle,
  FileSearch,
  Loader2,
  Clock,
} from 'lucide-react';
import { useProjects } from '../../lib/projectContext.js';
import { isNeverScanned } from '../../lib/scanState.js';
import { api, getFriendlyErrorMessage } from '../../lib/api.js';
import { useRescan } from '../../lib/useRescan.js';
import { LastScanLabel } from './LastScanLabel.js';
import { ProjectGraphCard } from './ProjectGraphCard.js';
import { AffectedModulesStrip } from './AffectedModulesStrip.js';
import { FindingsBySeverityBar } from './FindingsBySeverityBar.js';
import { VerificationCoverage } from './VerificationCoverage.js';
import { ExplanationCard } from './ExplanationCard.js';
import { KpiTile } from '../../components/ui/KpiTile.js';
import { Button } from '../../components/ui/Button.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import type { ProjectSummary, GraphResponseData } from '../../../../shared/types.js';

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { selectedProject, selectedProjectId, projects, isLoading: isProjectsLoading } =
    useProjects();
  const { rescan, isScanning } = useRescan();

  const [summaryState, setSummaryState] = useState<{
    data: ProjectSummary | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  const [graphState, setGraphState] = useState<{
    data: GraphResponseData | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  const activeAbortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(
    async (projectId: string) => {
      // Abort previous in-flight request
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }

      const controller = new AbortController();
      activeAbortControllerRef.current = controller;

      setSummaryState((prev) => ({ ...prev, loading: true, error: null }));
      setGraphState((prev) => ({ ...prev, loading: true, error: null }));

      const [summaryResult, graphResult] = await Promise.allSettled([
        api.getSummary(projectId, controller.signal),
        api.getGraph(projectId, { level: 1 }, controller.signal),
      ]);

      // If aborted or project changed while waiting, ignore stale response
      if (controller.signal.aborted) {
        return;
      }

      // Handle summary outcome
      if (summaryResult.status === 'fulfilled') {
        setSummaryState({ data: summaryResult.value, loading: false, error: null });
      } else {
        setSummaryState({
          data: null,
          loading: false,
          error: getFriendlyErrorMessage(summaryResult.reason),
        });
      }

      // Handle graph outcome
      if (graphResult.status === 'fulfilled') {
        setGraphState({ data: graphResult.value, loading: false, error: null });
      } else {
        setGraphState({
          data: null,
          loading: false,
          error: getFriendlyErrorMessage(graphResult.reason),
        });
      }
    },
    []
  );

  useEffect(() => {
    if (selectedProjectId) {
      fetchData(selectedProjectId);
    } else {
      setSummaryState({ data: null, loading: false, error: null });
      setGraphState({ data: null, loading: false, error: null });
    }

    return () => {
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
    };
  }, [selectedProjectId, fetchData]);

  const handleRescan = async () => {
    if (!selectedProjectId) return;
    await rescan(selectedProjectId, () => fetchData(selectedProjectId));
  };

  // 1. Loading projects state
  if (isProjectsLoading) {
    return (
      <div data-testid="overview-loading-skeletons" className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-6 w-36" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  // 2. Empty state: No projects in workspace
  if (projects.length === 0 || !selectedProject) {
    return (
      <EmptyState
        title="Upload your first project"
        description="To view architecture insights, dependencies, and security findings, start by uploading your repository as a ZIP archive."
        icon={<FolderOpen className="w-8 h-8 text-theme-text-muted" aria-hidden="true" />}
        action={
          <Button
            variant="primary"
            size="md"
            data-testid="upload-first-project-overview-btn"
            onClick={() => navigate('/app/projects')}
          >
            Go to Projects
          </Button>
        }
      />
    );
  }

  // Check if project is never scanned
  const neverScanned = isNeverScanned(selectedProject, summaryState.data);

  // 3. Never-scanned State: Project uploaded but not yet scanned
  if (neverScanned && !summaryState.loading && !graphState.loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-heading font-bold text-2xl sm:text-3xl text-theme-text tracking-tight truncate max-w-xl" title={selectedProject.name}>
              {selectedProject.name}
            </h1>
            <div className="mt-1">
              <LastScanLabel isNeverScanned={true} />
            </div>
          </div>
        </div>

        <div
          data-testid="never-scanned-card"
          className="p-8 rounded-2xl border border-dashed border-theme-border bg-theme-surface flex flex-col items-center justify-center text-center space-y-4 shadow-sm"
        >
          <div className="w-12 h-12 rounded-full bg-forest/10 dark:bg-lime/10 text-forest dark:text-lime flex items-center justify-center">
            <Clock className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="max-w-md space-y-1.5">
            <h2 className="font-heading font-bold text-xl text-theme-text">Not scanned yet</h2>
            <p className="text-xs sm:text-sm text-theme-text-muted">
              This project was uploaded but has not undergone static code analysis yet. Initiate a scan to map its architectural dependencies and identify findings.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            data-testid="never-scanned-rescan-button"
            disabled={isScanning}
            onClick={handleRescan}
          >
            {isScanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                Scanning...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
                Scan now
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // 4. Scanned State: Full View
  return (
    <div className="space-y-6">
      {/* Header with Project Title and LastScanLabel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-theme-text tracking-tight truncate max-w-xl" title={selectedProject.name}>
            {selectedProject.name}
          </h1>
          <div className="mt-1">
            <LastScanLabel
              finishedAt={summaryState.data?.lastScan?.finished_at}
              status={summaryState.data?.lastScan?.status}
              isNeverScanned={neverScanned}
            />
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          data-testid="rescan-overview-button"
          disabled={isScanning}
          onClick={handleRescan}
        >
          {isScanning ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" aria-hidden="true" />
              Scanning...
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              Re-scan
            </>
          )}
        </Button>
      </div>

      {/* KPI Tiles (4 tiles) */}
      {summaryState.loading ? (
        <div data-testid="kpis-loading" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : summaryState.error ? (
        <div
          data-testid="summary-section-error"
          role="alert"
          className="p-4 rounded-xl border border-severity-critical/30 bg-theme-surface flex items-center justify-between text-xs text-theme-text"
        >
          <div className="flex items-center gap-2 text-severity-critical font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Summary unavailable: {summaryState.error}</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => selectedProjectId && fetchData(selectedProjectId)}
          >
            Retry
          </Button>
        </div>
      ) : summaryState.data ? (
        <div data-testid="kpi-tiles-grid" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiTile
            label="Open findings"
            value={summaryState.data.kpi.openFindings}
            icon={<Search className="w-4 h-4" aria-hidden="true" />}
          />
          <KpiTile
            label="Critical + High"
            value={summaryState.data.kpi.criticalPlusHigh}
            icon={<ShieldAlert className="w-4 h-4" aria-hidden="true" />}
          />
          <KpiTile
            label="Fixes pending approval"
            value={summaryState.data.kpi.fixesPendingApproval}
            icon={<FileSearch className="w-4 h-4" aria-hidden="true" />}
          />
          <KpiTile
            label="Verified fixes"
            value={summaryState.data.kpi.verifiedFixes}
            icon={<CheckCircle className="w-4 h-4" aria-hidden="true" />}
          />
        </div>
      ) : null}

      {/* Level 1 Graph Card */}
      {graphState.loading ? (
        <div data-testid="graph-loading">
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : graphState.error ? (
        <div
          data-testid="graph-section-error"
          role="alert"
          className="p-6 rounded-xl border border-severity-critical/30 bg-theme-surface flex flex-col items-center justify-center text-center space-y-3"
        >
          <AlertTriangle className="w-6 h-6 text-severity-critical" aria-hidden="true" />
          <div>
            <h3 className="font-heading font-semibold text-sm text-theme-text">Graph unavailable</h3>
            <p className="mt-1 text-xs text-theme-text-muted">{graphState.error}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => selectedProjectId && fetchData(selectedProjectId)}
          >
            Retry graph
          </Button>
        </div>
      ) : graphState.data ? (
        <ProjectGraphCard graphData={graphState.data} />
      ) : null}

      {/* Affected Modules Strip */}
      {summaryState.data && (
        <AffectedModulesStrip affectedModules={summaryState.data.affectedModules} />
      )}

      {/* Bottom Grid: Findings by Severity, Verification Coverage, and ExplanationCard */}
      {summaryState.data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <FindingsBySeverityBar bySeverity={summaryState.data.bySeverity} />
          <VerificationCoverage
            byVerification={summaryState.data.byVerification}
            byConfidence={summaryState.data.byConfidence}
          />
          <ExplanationCard summary={summaryState.data} />
        </div>
      )}
    </div>
  );
};
