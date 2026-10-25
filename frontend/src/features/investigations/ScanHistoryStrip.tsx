import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '../../components/ui/Button.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { api } from '../../lib/api.js';
import type { Scan } from '../../../../shared/types.js';

export interface ScanHistoryStripProps {
  projectId: string;
  initialScans?: Scan[];
}

export function formatScanDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function getScanStatusIcon(status: string) {
  switch (status.toLowerCase()) {
    case 'completed':
      return (
        <CheckCircle2
          className="w-3.5 h-3.5 text-forest dark:text-lime shrink-0"
          aria-hidden="true"
        />
      );
    case 'failed':
      return (
        <XCircle
          className="w-3.5 h-3.5 text-severity-critical shrink-0"
          aria-hidden="true"
        />
      );
    case 'running':
      return (
        <RefreshCw
          className="w-3.5 h-3.5 text-forest dark:text-lime animate-spin shrink-0"
          aria-hidden="true"
        />
      );
    default:
      return (
        <Clock
          className="w-3.5 h-3.5 text-theme-text-muted shrink-0"
          aria-hidden="true"
        />
      );
  }
}

export const ScanHistoryStrip: React.FC<ScanHistoryStripProps> = ({
  projectId,
  initialScans,
}) => {
  const [scans, setScans] = useState<Scan[]>(initialScans || []);
  const [isLoading, setIsLoading] = useState<boolean>(!initialScans);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState<number>(0);
  const [isExpandedMobile, setIsExpandedMobile] = useState<boolean>(false);

  const fetchScans = useCallback(() => {
    if (!projectId) return () => {};

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    api
      .getScans(projectId, controller.signal)
      .then((data) => {
        // Sort newest first by started_at and take up to 5
        const sorted = (data || [])
          .slice()
          .sort(
            (a, b) =>
              new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
          )
          .slice(0, 5);
        setScans(sorted);
        setIsLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') {
          return;
        }
        setIsLoading(false);
        setError(err.message || 'Failed to load scan history');
      });

    return () => {
      controller.abort();
    };
  }, [projectId, retryKey]);

  useEffect(() => {
    if (initialScans) {
      setScans(initialScans.slice(0, 5));
      setIsLoading(false);
      return;
    }
    const cancel = fetchScans();
    return () => {
      cancel();
    };
  }, [fetchScans, initialScans]);

  // Loading skeleton state
  if (isLoading) {
    return (
      <div
        data-testid="scan-history-loading"
        className="w-full bg-theme-surface border border-theme-border rounded-lg p-2.5 sm:p-3"
      >
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-40 hidden sm:block" />
        </div>
      </div>
    );
  }

  // Error state with retry that does not block the page
  if (error) {
    return (
      <div
        data-testid="scan-history-error"
        className="w-full bg-theme-surface border border-theme-border rounded-lg p-2.5 sm:p-3 flex items-center justify-between gap-3 text-xs"
      >
        <div className="flex items-center gap-2 text-severity-critical">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setRetryKey((k) => k + 1)}
          data-testid="scan-history-retry"
          className="gap-1 h-7 text-xs"
          aria-label="Retry loading scan history"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  // No scans or zero scans: do not show zeros
  if (scans.length === 0) {
    return null;
  }

  const latestScan = scans[0];

  return (
    <section
      aria-label="Scan history"
      data-testid="scan-history-strip"
      className="w-full bg-theme-surface border border-theme-border rounded-lg shadow-2xs overflow-hidden"
    >
      {/* Phone Collapsed View (< sm) */}
      <div className="sm:hidden">
        <div className="p-2.5 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-semibold text-theme-text shrink-0 text-[11px]">
              Scan history. Timing is a hint, not proof.
            </span>
            <div className="flex items-center gap-1.5 text-theme-text-muted truncate text-[11px]">
              {getScanStatusIcon(latestScan.status)}
              <span className="truncate">{formatScanDateTime(latestScan.started_at)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsExpandedMobile(!isExpandedMobile)}
            data-testid="scan-history-mobile-toggle"
            aria-expanded={isExpandedMobile}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-forest dark:text-lime hover:bg-theme-bg border border-theme-border/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime"
          >
            <span>{isExpandedMobile ? 'Collapse' : 'Expand'}</span>
            {isExpandedMobile ? (
              <ChevronUp className="w-3 h-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3 h-3" aria-hidden="true" />
            )}
          </button>
        </div>

        {isExpandedMobile && (
          <div
            data-testid="scan-history-mobile-expanded"
            className="border-t border-theme-border p-2.5 space-y-2 bg-theme-bg/30 text-xs"
          >
            {scans.map((scan, idx) => (
              <div
                key={scan.id || idx}
                data-testid={`scan-history-item-${scan.id}`}
                className="p-2 rounded bg-theme-surface border border-theme-border/70 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-medium text-theme-text">
                    {getScanStatusIcon(scan.status)}
                    <span className="capitalize">{scan.status}</span>
                  </div>
                  <time
                    dateTime={scan.started_at}
                    className="text-[11px] text-theme-text-muted font-mono"
                  >
                    {formatScanDateTime(scan.started_at)}
                  </time>
                </div>
                {scan.notes && (
                  <p className="text-[11px] text-theme-text-muted leading-relaxed">
                    {scan.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop / Tablet View (>= sm) */}
      <div className="hidden sm:block p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-theme-text">
              Scan history. Timing is a hint, not proof.
            </span>
          </div>
          <span className="text-[11px] text-theme-text-muted">
            Latest {scans.length} {scans.length === 1 ? 'scan' : 'scans'}
          </span>
        </div>

        <div className="divide-y divide-theme-border/60 border border-theme-border/60 rounded-md bg-theme-bg/30 overflow-hidden">
          {scans.map((scan, idx) => (
            <div
              key={scan.id || idx}
              data-testid={`scan-history-item-${scan.id}`}
              className="p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs hover:bg-theme-bg/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center gap-1.5 shrink-0 font-medium text-theme-text">
                  {getScanStatusIcon(scan.status)}
                  <span className="capitalize">{scan.status}</span>
                </div>
                <time
                  dateTime={scan.started_at}
                  className="text-[11px] text-theme-text-muted font-mono shrink-0"
                >
                  {formatScanDateTime(scan.started_at)}
                </time>
                {scan.notes && (
                  <span className="text-[11px] text-theme-text-muted truncate max-w-xl">
                    {scan.notes}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
