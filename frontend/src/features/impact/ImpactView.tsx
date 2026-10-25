import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';
import { api, ApiClientError, getFriendlyErrorMessage } from '../../lib/api.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import {
  impactSentences,
  impactRounds,
  rippleLayout,
  type RippleLayoutResult,
} from './impactPure.js';
import { RippleDiagram } from './RippleDiagram.js';
import type { ImpactResult } from '../../../../shared/types.js';

export interface ImpactViewProps {
  projectId: string;
  nodeId: string;
  onClose: () => void;
  onNavigateFocus: (nodeId: string) => void;
  className?: string;
}

export const ImpactView: React.FC<ImpactViewProps> = ({
  projectId,
  nodeId,
  onClose,
  onNavigateFocus,
  className = '',
}) => {
  const [data, setData] = useState<ImpactResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Round-by-round progressive reveal state
  const [maxRound, setMaxRound] = useState<number>(1);
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);

  // Desktop vs Phone detection
  const [isDesktop, setIsDesktop] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  const activeAbortRef = useRef<AbortController | null>(null);
  const playTimerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Listen to screen resize for desktop vs phone
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(media.matches);

    const listener = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    if (media.addEventListener) {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, []);

  // Fetch impact data with abort on nodeId/projectId/close change
  const fetchImpact = useCallback(async () => {
    if (!projectId || !nodeId) return;

    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const res = await api.getImpact(projectId, nodeId, undefined, controller.signal);
      if (controller.signal.aborted) return;

      setData(res);
      const rounds = impactRounds(res);
      const totalRounds = rounds.length > 0 ? rounds[rounds.length - 1].round : 1;
      setMaxRound(totalRounds);

      // If prefers reduced motion, show all rounds immediately, else reveal
      if (prefersReducedMotion) {
        setCurrentRound(totalRounds);
        setIsPlaying(false);
      } else {
        setCurrentRound(totalRounds); // default show full or progressive
        setIsPlaying(false);
      }

      setIsLoading(false);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setIsLoading(false);
      if (err instanceof ApiClientError) {
        setError(err.message || getFriendlyErrorMessage(err));
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Backend is not reachable');
      }
    }
  }, [projectId, nodeId, prefersReducedMotion]);

  useEffect(() => {
    fetchImpact();
    return () => {
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
      }
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
      }
    };
  }, [fetchImpact]);

  // Round playback timer (800ms per round)
  useEffect(() => {
    if (isPlaying && !prefersReducedMotion) {
      playTimerRef.current = setInterval(() => {
        setCurrentRound((prev) => {
          if (prev >= maxRound) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 800);
    } else {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    }

    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
      }
    };
  }, [isPlaying, maxRound, prefersReducedMotion]);

  // Handle Play toggle
  const handleTogglePlay = () => {
    if (prefersReducedMotion) return;
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentRound >= maxRound) {
        setCurrentRound(1);
      }
      setIsPlaying(true);
    }
  };

  const handlePrevRound = () => {
    setIsPlaying(false);
    setCurrentRound((prev) => Math.max(1, prev - 1));
  };

  const handleNextRound = () => {
    setIsPlaying(false);
    setCurrentRound((prev) => Math.min(maxRound, prev + 1));
  };

  // Keyboard navigation: Escape key closes and focus trap on phone
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trap for mobile overlay
      if (!isDesktop && containerRef.current && e.key === 'Tab') {
        const focusables = containerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isDesktop]);

  // Layout calculation
  const layout: RippleLayoutResult | null = data ? rippleLayout(data) : null;
  const sentences = data ? impactSentences(data) : [];
  const rounds = data ? impactRounds(data) : [];

  return (
    <section
      ref={containerRef}
      role="region"
      aria-label="Change impact analysis panel"
      data-testid="impact-view-panel"
      className={
        isDesktop
          ? `flex flex-col bg-theme-surface border-t lg:border-t-0 lg:border-l border-theme-border shadow-2xl z-30 overflow-y-auto ${className}`
          : `fixed inset-0 z-50 bg-theme-surface flex flex-col overflow-y-auto p-4 ${className}`
      }
    >
      {/* Panel Top Header */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-theme-border bg-theme-surface/90 sticky top-0 z-20 backdrop-blur-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-forest dark:bg-lime animate-pulse" />
          <h2 className="font-heading font-bold text-base text-theme-text">Change Impact (Ripple View)</h2>
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          data-testid="impact-close-btn"
          aria-label="Close impact view"
          onClick={onClose}
          className="p-1.5 rounded-lg text-theme-text-muted hover:text-theme-text hover:bg-theme-surface-active transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-4 sm:p-5 space-y-5">
        {/* Loading State */}
        {isLoading && (
          <div data-testid="impact-loading-skeleton" className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="w-48 h-6 rounded-lg" />
              <Skeleton className="w-full h-4 rounded-md" />
              <Skeleton className="w-3/4 h-4 rounded-md" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
            <Skeleton className="w-full h-64 rounded-2xl mt-4" />
          </div>
        )}

        {/* Error State with Retry */}
        {!isLoading && error && (
          <div
            data-testid="impact-error-banner"
            className="p-4 rounded-xl border border-severity-critical/30 bg-severity-critical/10 text-theme-text space-y-3"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-severity-critical shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-semibold text-sm">Impact analysis error</p>
                <p className="text-xs text-theme-text-muted mt-0.5">{error}</p>
              </div>
            </div>
            <button
              type="button"
              data-testid="impact-retry-btn"
              onClick={fetchImpact}
              className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-theme-surface border border-theme-border text-xs font-semibold text-theme-text hover:bg-theme-surface-active transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Success State */}
        {!isLoading && !error && data && (
          <>
            {/* Start Node Details Header */}
            <div className="p-3.5 rounded-xl border border-theme-border bg-theme-surface-active/40 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-sm text-theme-text">{data.start.label}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-theme-bg border border-theme-border text-theme-text">
                  {data.start.type}
                </span>
              </div>
              <div className="font-code text-xs text-theme-text-muted break-all">
                {data.start.path}
              </div>
            </div>

            {/* Mandatory Always-Visible Disclaimer */}
            <div
              data-testid="impact-disclaimer"
              className="p-3 rounded-xl border border-theme-border bg-theme-surface-active/60 flex items-start gap-2.5 text-xs text-theme-text"
            >
              <ShieldAlert className="w-4 h-4 text-theme-text-muted shrink-0 mt-0.5" aria-hidden="true" />
              <p className="leading-relaxed">
                This is a static estimate from code connections. It is not a guarantee, and no code was run.
              </p>
            </div>

            {/* Sentences Summary */}
            <div data-testid="impact-sentences-block" className="space-y-1.5 text-xs sm:text-sm text-theme-text leading-relaxed">
              {sentences.map((sentence, idx) => (
                <p key={idx}>{sentence}</p>
              ))}
            </div>

            {/* Count Tiles (never shown for failed requests) */}
            <div
              data-testid="impact-count-tiles"
              className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1"
            >
              <div className="p-2.5 rounded-xl border border-theme-border bg-theme-surface text-center">
                <div className="text-base font-bold text-theme-text">{data.counts.files}</div>
                <div className="text-[10px] uppercase font-semibold text-theme-text-muted tracking-wider">
                  Files
                </div>
              </div>
              <div className="p-2.5 rounded-xl border border-theme-border bg-theme-surface text-center">
                <div className="text-base font-bold text-theme-text">{data.counts.api_endpoints}</div>
                <div className="text-[10px] uppercase font-semibold text-theme-text-muted tracking-wider">
                  API Endpoints
                </div>
              </div>
              <div className="p-2.5 rounded-xl border border-theme-border bg-theme-surface text-center">
                <div className="text-base font-bold text-theme-text">{data.counts.config}</div>
                <div className="text-[10px] uppercase font-semibold text-theme-text-muted tracking-wider">
                  Config Items
                </div>
              </div>
              <div className="p-2.5 rounded-xl border border-theme-border bg-theme-surface text-center">
                <div className="text-base font-bold text-theme-text">{data.counts.tests}</div>
                <div className="text-[10px] uppercase font-semibold text-theme-text-muted tracking-wider">
                  Tests
                </div>
              </div>
              <div className="p-2.5 rounded-xl border border-theme-border bg-theme-surface text-center">
                <div className="text-base font-bold text-theme-text">{data.counts.modules}</div>
                <div className="text-[10px] uppercase font-semibold text-theme-text-muted tracking-wider">
                  Modules
                </div>
              </div>
            </div>

            {/* Ripple Diagram & Round Controls (only if affected nodes exist) */}
            {data.affected.length > 0 && layout && (
              <div className="space-y-3 pt-2">
                {/* Round-by-Round Playback Controls (hidden under prefers-reduced-motion) */}
                {!prefersReducedMotion && maxRound > 1 && (
                  <div
                    data-testid="round-controls"
                    className="flex items-center justify-between p-2 rounded-xl border border-theme-border bg-theme-surface-active/40 text-xs"
                  >
                    <div className="font-semibold text-theme-text">
                      Showing Round {currentRound} of {maxRound}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        data-testid="round-prev-btn"
                        onClick={handlePrevRound}
                        disabled={currentRound <= 1}
                        aria-label="Previous round"
                        className="p-1 rounded border border-theme-border bg-theme-surface disabled:opacity-40 hover:bg-theme-surface-active transition-colors text-theme-text"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        data-testid="round-play-btn"
                        onClick={handleTogglePlay}
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                        className="py-1 px-2.5 rounded font-semibold border border-theme-border bg-theme-surface hover:bg-theme-surface-active transition-colors flex items-center gap-1 text-theme-text"
                      >
                        {isPlaying ? (
                          <>
                            <Pause className="w-3 h-3 text-forest dark:text-lime" aria-hidden="true" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 text-forest dark:text-lime" aria-hidden="true" />
                            <span>Play</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        data-testid="round-next-btn"
                        onClick={handleNextRound}
                        disabled={currentRound >= maxRound}
                        aria-label="Next round"
                        className="p-1 rounded border border-theme-border bg-theme-surface disabled:opacity-40 hover:bg-theme-surface-active transition-colors text-theme-text"
                      >
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}

                {/* SVG Ripple Diagram */}
                <RippleDiagram
                  layout={layout}
                  maxVisibleRound={prefersReducedMotion ? maxRound : currentRound}
                  onNavigateFocus={onNavigateFocus}
                />
              </div>
            )}

            {/* Zero results state */}
            {data.affected.length === 0 && (
              <div
                data-testid="zero-impact-banner"
                className="p-4 rounded-xl border border-theme-border bg-theme-surface-active/30 text-center space-y-1"
              >
                <p className="font-semibold text-sm text-theme-text">No other file depends on this item.</p>
                <p className="text-xs text-theme-text-muted">
                  Static analysis did not identify any incoming callers, importers or references.
                </p>
              </div>
            )}

            {/* Grouped Text List (Collapsible <details> serving as accessible text alternative) */}
            {rounds.length > 0 && (
              <details
                open={isDesktop}
                data-testid="impact-grouped-details"
                className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden"
              >
                <summary className="p-3 bg-theme-surface-active/60 font-semibold text-xs text-theme-text cursor-pointer select-none hover:bg-theme-surface-active transition-colors">
                  All affected items by round ({data.affected.length})
                </summary>
                <div className="p-3 space-y-4">
                  {rounds.map((round) => (
                    <div key={round.round} className="space-y-1.5">
                      <div className="font-semibold text-xs text-theme-text font-mono border-b border-theme-border/60 pb-1">
                        {round.label} ({round.items.length})
                      </div>
                      <ul className="space-y-1">
                        {round.items.map((item) => (
                          <li
                            key={item.id}
                            data-testid={`text-list-item-${item.id}`}
                            className="p-2 rounded-lg bg-theme-surface-active/40 border border-theme-border/50 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                          >
                            <div className="min-w-0 flex items-center gap-2">
                              <span className="capitalize font-semibold text-[10px] px-1.5 py-0.5 rounded bg-theme-bg border border-theme-border">
                                {item.type}
                              </span>
                              <button
                                type="button"
                                onClick={() => onNavigateFocus(item.id)}
                                className="font-medium text-forest dark:text-lime hover:underline truncate max-w-[200px] sm:max-w-[280px] text-left"
                              >
                                {item.label}
                              </button>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-theme-text-muted shrink-0">
                              <span className={item.certainty === 'proven' ? 'font-medium' : 'font-semibold text-impact-possible'}>
                                {item.certainty}
                              </span>
                              <span>•</span>
                              <span>
                                via {item.via.relation} ({item.via.status})
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Tests to review list */}
            {data.tests_to_review.length > 0 && (
              <div
                data-testid="impact-tests-to-review"
                className="p-3.5 rounded-xl border border-theme-border bg-theme-surface space-y-2"
              >
                <div className="space-y-0.5">
                  <h3 className="font-bold text-xs uppercase text-theme-text tracking-wider">
                    Tests to review ({data.tests_to_review.length})
                  </h3>
                  <p className="text-[11px] text-theme-text-muted italic">
                    Candidates found by static evidence. Nothing was run.
                  </p>
                </div>
                <ul className="space-y-1.5">
                  {data.tests_to_review.map((testItem) => (
                    <li
                      key={testItem.id}
                      className="p-2 rounded-lg bg-theme-surface-active/50 border border-theme-border flex items-center justify-between text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => onNavigateFocus(testItem.id)}
                        className="font-medium text-forest dark:text-lime hover:underline truncate text-left"
                      >
                        {testItem.label}
                      </button>
                      <span className="font-code text-[10px] text-theme-text-muted truncate max-w-[150px]">
                        {testItem.path}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Backend Notes */}
            {data.notes.length > 0 && (
              <div
                data-testid="impact-notes-card"
                className="p-3 rounded-xl border border-theme-border bg-theme-surface-active/30 space-y-1 text-xs text-theme-text-muted"
              >
                {data.notes.map((note, idx) => (
                  <p key={idx}>• {note}</p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default ImpactView;
