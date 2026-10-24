import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  Download,
  Copy,
  Printer,
  Sparkles,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { useProjects } from '../../lib/projectContext.js';
import { useRescan } from '../../lib/useRescan.js';
import { api, getFriendlyErrorMessage } from '../../lib/api.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { Button } from '../../components/ui/Button.js';
import { Report, ReportListItem } from './reportsTypes.js';
import { ReportPreview } from './ReportPreview.js';
import { buildReportFileName } from './reportsPure.js';

export const ReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { projects, selectedProject, selectedProjectId, isLoading: isProjectsLoading } = useProjects();
  const { rescan, isScanning } = useRescan();

  const reportIdFromUrl = searchParams.get('report');
  const pageFromUrl = searchParams.get('page');
  const page = pageFromUrl ? Math.max(1, parseInt(pageFromUrl, 10) || 1) : 1;
  const previousProjectIdRef = useRef<string | null>(selectedProjectId ?? null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isGeneratingRef = useRef<boolean>(false);

  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [totalReports, setTotalReports] = useState<number>(0);
  const pageSize = 25;

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);
  const [report404, setReport404] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const handlePageChange = useCallback(
    (newPage: number) => {
      const validPage = Math.max(1, newPage);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('page', String(validPage));
        return next;
      });
    },
    [setSearchParams]
  );

  // Fetch reports list for current project
  const fetchReportsList = useCallback(
    async (targetPage = page) => {
      if (!selectedProjectId) {
        setIsLoadingList(false);
        return;
      }

      if (selectedProject && !selectedProject.last_scan_at) {
        setIsLoadingList(false);
        setReports([]);
        setTotalReports(0);
        setSelectedReport(null);
        setListError(null);
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsLoadingList(true);
      setListError(null);

      try {
        const res = await api.getReports(
          selectedProjectId,
          { page: targetPage, pageSize },
          abortController.signal
        );
        if (!abortController.signal.aborted) {
          setReports(res.items || []);
          setTotalReports(res.total || 0);
        }
      } catch (err: unknown) {
        if (!abortController.signal.aborted) {
          setListError(getFriendlyErrorMessage(err));
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingList(false);
        }
      }
    },
    [selectedProjectId, selectedProject, page]
  );

  // Project switch cleanup
  useEffect(() => {
    if (
      previousProjectIdRef.current &&
      selectedProjectId &&
      previousProjectIdRef.current !== selectedProjectId
    ) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setReports([]);
      setTotalReports(0);
      setSelectedReport(null);
      setReport404(false);
      setSearchParams(new URLSearchParams(), { replace: true });
    }
    if (selectedProjectId) {
      previousProjectIdRef.current = selectedProjectId;
    }
  }, [selectedProjectId, setSearchParams]);

  useEffect(() => {
    fetchReportsList(page);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchReportsList, page]);

  // Load selected report detail whenever URL or reports list changes
  useEffect(() => {
    if (!reportIdFromUrl) {
      if (reports.length > 0) {
        // Auto-select latest report if none in URL
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set('report', reports[0].id);
          return next;
        }, { replace: true });
      } else {
        setSelectedReport(null);
        setReport404(false);
      }
      return;
    }

    // If selectedReport already matches reportIdFromUrl and has markdown, no need to refetch
    if (selectedReport && selectedReport.id === reportIdFromUrl && selectedReport.markdown) {
      return;
    }

    if (!isLoadingList) {
      let isSubscribed = true;
      setIsLoadingDetail(true);
      setReport404(false);
      api
        .getReport(reportIdFromUrl)
        .then((res) => {
          if (!isSubscribed) return;
          const reportObj = typeof res === 'string' ? null : res;
          if (reportObj && reportObj.id) {
            setSelectedReport(reportObj);
            setReport404(false);
          } else {
            setSelectedReport(null);
            setReport404(true);
          }
        })
        .catch(() => {
          if (!isSubscribed) return;
          setSelectedReport(null);
          setReport404(true);
        })
        .finally(() => {
          if (isSubscribed) {
            setIsLoadingDetail(false);
          }
        });

      return () => {
        isSubscribed = false;
      };
    }
  }, [reportIdFromUrl, reports, isLoadingList, selectedProjectId, selectedReport, setSearchParams]);

  // Generate Report action: POST once per click, disabled while running, double-click protected
  const handleGenerateReport = async () => {
    if (!selectedProjectId || isGeneratingRef.current || isGenerating) {
      return;
    }

    isGeneratingRef.current = true;
    setIsGenerating(true);

    try {
      const newReport = await api.createReport(selectedProjectId);
      await fetchReportsList(1);
      setSelectedReport(newReport);
      setReport404(false);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('report', newReport.id);
        next.set('page', '1');
        return next;
      });
    } catch (err: unknown) {
      setListError(getFriendlyErrorMessage(err));
    } finally {
      setIsGenerating(false);
      isGeneratingRef.current = false;
    }
  };

  const handleSelectReport = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('report', id);
      return next;
    });
  };

  // Export actions
  const handleDownload = () => {
    if (!selectedReport) return;
    const filename = buildReportFileName({
      project_name: selectedProject?.name,
      created_at: selectedReport.created_at,
      markdown: selectedReport.markdown,
    });
    const blob = new Blob([selectedReport.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    if (!selectedReport) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(selectedReport.markdown);
        setCopyStatus('Copied to clipboard!');
        setTimeout(() => setCopyStatus(null), 2500);
      } catch {
        setCopyStatus('Failed to copy');
        setTimeout(() => setCopyStatus(null), 2500);
      }
    } else {
      setCopyStatus('Clipboard not supported');
      setTimeout(() => setCopyStatus(null), 2500);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // State 1: Projects Loading
  if (isProjectsLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6" data-testid="reports-skeleton">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="lg:col-span-4 h-96 rounded-xl" />
          <Skeleton className="lg:col-span-8 h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  // State 2: No Projects
  if (!projects || projects.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <EmptyState
          title="Upload your first project"
          description="Upload and scan a ZIP archive to generate comprehensive analysis reports."
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

  // State 3: Project Never Scanned
  if (selectedProject && !selectedProject.last_scan_at) {
    return (
      <div className="h-full flex items-center justify-center p-6" data-testid="reports-never-scanned">
        <div className="flex flex-col items-center justify-center text-center p-8 bg-theme-surface border border-theme-border rounded-xl max-w-md space-y-4">
          <div className="w-12 h-12 rounded-full bg-severity-medium/10 flex items-center justify-center text-severity-medium">
            <AlertCircle className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="font-heading font-semibold text-lg text-theme-text">Not scanned yet</h2>
          <p className="text-xs text-theme-text-muted">
            This project has not been scanned yet. Run a scan before generating an analysis report.
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

  // State 4: Reports List Loading
  if (isLoadingList) {
    return (
      <div className="p-4 sm:p-6 space-y-6" data-testid="reports-skeleton">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="lg:col-span-4 h-96 rounded-xl" />
          <Skeleton className="lg:col-span-8 h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  // State 5: Reports List Error
  if (listError && !reports.length) {
    const isScanRequired =
      listError.includes('Scan the project first') || listError.includes('SCAN_REQUIRED');
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <ErrorState
          title={isScanRequired ? 'Scan required' : 'Failed to load reports'}
          message={listError}
          onRetry={fetchReportsList}
        />
        {isScanRequired && (
          <div className="flex justify-center">
            <Button
              variant="primary"
              size="md"
              onClick={() => selectedProjectId && rescan(selectedProjectId)}
              disabled={isScanning}
              className="gap-2"
              data-testid="reports-scan-first-rescan-btn"
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Scanning...' : 'Re-scan'}</span>
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Inline Error Banner (e.g. from failed generate action) */}
      {listError && (
        <div
          data-testid="reports-error-banner"
          className="p-3.5 rounded-lg bg-severity-high/10 border border-severity-high/30 flex items-center justify-between text-xs text-severity-high"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{listError}</span>
          </div>
          {(listError.includes('Scan the project first') ||
            listError.includes('SCAN_REQUIRED')) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedProjectId) {
                  rescan(selectedProjectId);
                }
              }}
              disabled={isScanning}
              className="gap-1.5"
              data-testid="reports-scan-first-rescan-btn"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Scanning...' : 'Re-scan'}</span>
            </Button>
          )}
        </div>
      )}

      {/* Header & Toolbar */}
      <div
        data-testid="reports-toolbar"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-theme-border no-print"
      >
        <div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-theme-text tracking-tight">
            Reports
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-theme-text-muted">
            Generate and export analysis reports containing findings, coverage, and notes.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="primary"
            size="md"
            onClick={handleGenerateReport}
            disabled={isGenerating || !selectedProject?.last_scan_at}
            className="gap-2"
            data-testid="generate-report-button"
          >
            {isGenerating ? (
              <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{isGenerating ? 'Generating...' : 'Generate report'}</span>
          </Button>
        </div>
      </div>

      {/* Main Layout: Reports List on Left, Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Past Reports Sidebar / List */}
        <aside
          data-testid="reports-list-panel"
          className="lg:col-span-4 bg-theme-surface border border-theme-border rounded-xl p-4 space-y-3 no-print"
        >
          <div className="flex items-center justify-between pb-2 border-b border-theme-border">
            <h2 className="font-heading font-semibold text-sm text-theme-text">
              Past Reports
            </h2>
            <span className="text-xs text-theme-text-muted">
              {totalReports} {totalReports === 1 ? 'report' : 'reports'}
            </span>
          </div>

          {reports.length === 0 ? (
            <div
              data-testid="reports-empty-list"
              className="p-6 text-center text-xs text-theme-text-muted space-y-2"
            >
              <FileText className="w-8 h-8 mx-auto text-theme-text-muted/60" aria-hidden="true" />
              <p>No reports generated yet for this project.</p>
              <p>Click &quot;Generate report&quot; to create your first report.</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5 max-h-[calc(100vh-20rem)] overflow-y-auto">
                {reports.map((r, index) => {
                  const isSelected = selectedReport?.id === r.id;
                  const dateStr = new Date(r.created_at).toLocaleString();
                  const shortId = r.id.slice(0, 8);

                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleSelectReport(r.id)}
                      className={`w-full p-3 rounded-lg text-left transition-colors border flex flex-col gap-1 ${
                        isSelected
                          ? 'bg-theme-bg border-brand-primary/50 text-theme-text shadow-sm'
                          : 'bg-theme-surface border-theme-border/60 hover:bg-theme-bg/60 text-theme-text'
                      }`}
                      data-testid={`report-item-${r.id}`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-mono text-xs text-theme-text font-medium">
                          {shortId}
                        </span>
                        {index === 0 && page === 1 && (
                          <span
                            data-testid="latest-report-badge"
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-severity-medium/15 text-severity-medium border border-severity-medium/30"
                          >
                            Latest
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-theme-text-muted">
                        {dateStr}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Pagination text and buttons */}
              <div className="pt-3 border-t border-theme-border flex flex-col gap-2">
                <div
                  className="text-xs text-theme-text-muted"
                  data-testid="reports-pagination-text"
                >
                  Showing {totalReports === 0 ? 0 : (page - 1) * pageSize + 1} to{' '}
                  {Math.min(page * pageSize, totalReports)} of {totalReports} reports
                </div>
                {totalReports > pageSize && (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => handlePageChange(page - 1)}
                      data-testid="reports-prev-page"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page * pageSize >= totalReports}
                      onClick={() => handlePageChange(page + 1)}
                      data-testid="reports-next-page"
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>

        {/* Report Preview Panel */}
        <section className="lg:col-span-8 space-y-4">
          {report404 ? (
            <div
              data-testid="report-404-container"
              className="p-8 text-center bg-theme-surface border border-theme-border rounded-xl space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-severity-medium/10 flex items-center justify-center text-severity-medium mx-auto">
                <AlertCircle className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="font-heading font-semibold text-base text-theme-text">
                  This report is not in the selected project
                </h3>
                <p className="text-xs text-theme-text-muted max-w-sm mx-auto">
                  The requested report ID could not be found under the active project.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setReport404(false);
                  if (reports.length > 0) {
                    setSearchParams({ report: reports[0].id });
                  } else {
                    setSearchParams({});
                  }
                }}
                className="gap-2 mx-auto"
                data-testid="back-to-reports-button"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Reports</span>
              </Button>
            </div>
          ) : isLoadingDetail ? (
            <div className="p-6 bg-theme-surface border border-theme-border rounded-xl space-y-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : selectedReport ? (
            <div className="space-y-4">
              {/* Action Toolbar for Selected Report (Download, Copy, Print) */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-theme-surface border border-theme-border rounded-xl no-print">
                <div className="flex items-center gap-2 text-xs text-theme-text-muted">
                  <FileText className="w-4 h-4 text-theme-text-muted shrink-0" aria-hidden="true" />
                  <span>Viewing report <code className="font-mono text-theme-text">{selectedReport.id.slice(0, 8)}</code></span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Download Markdown */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDownload}
                    className="gap-1.5"
                    data-testid="download-markdown-button"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Download Markdown</span>
                  </Button>

                  {/* Copy Markdown */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCopy}
                    className="gap-1.5"
                    data-testid="copy-markdown-button"
                  >
                    {copyStatus ? (
                      <Check className="w-3.5 h-3.5 text-brand-primary" aria-hidden="true" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>{copyStatus || 'Copy Markdown'}</span>
                  </Button>

                  {/* Print or save as PDF */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handlePrint}
                    className="gap-1.5"
                    data-testid="print-report-button"
                  >
                    <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Print or save as PDF</span>
                  </Button>
                </div>
              </div>

              {/* Rendered Preview */}
              <ReportPreview report={selectedReport} />
            </div>
          ) : (
            <div className="p-12 text-center bg-theme-surface border border-theme-border rounded-xl text-theme-text-muted space-y-2">
              <FileText className="w-10 h-10 mx-auto text-theme-text-muted/60" aria-hidden="true" />
              <p className="text-sm font-medium text-theme-text">No report selected</p>
              <p className="text-xs">
                Select a report from the past reports list, or click &quot;Generate report&quot; above.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ReportsPage;
