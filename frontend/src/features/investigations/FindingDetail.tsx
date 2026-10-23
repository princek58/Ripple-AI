import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Wrench, ShieldAlert, GitPullRequest } from 'lucide-react';
import { Button } from '../../components/ui/Button.js';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';
import { ConfidenceBadge } from '../../components/ui/ConfidenceBadge.js';
import { VerificationBadge } from '../../components/ui/VerificationBadge.js';
import { ruleLabel, formatEvidence } from './investigationsUrl.js';
import type { FindingDetailData } from '../../../../shared/types.js';

export interface FindingDetailProps {
  finding: FindingDetailData;
  onBack?: () => void;
  showBackButton?: boolean;
}

// Strict allowlist: ONLY these keys may ever be displayed from evidence
const ALLOWED_EVIDENCE_KEYS = new Set([
  'file',
  'line_start',
  'line_end',
  'specifier',
  'pattern',
]);

export const FindingDetail: React.FC<FindingDetailProps> = ({
  finding,
  onBack,
  showBackButton = false,
}) => {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Focus heading when component mounts (critical for mobile back-and-forth accessibility)
  useEffect(() => {
    if (showBackButton) {
      headingRef.current?.focus();
    }
  }, [finding.id, showBackButton]);

  return (
    <article
      className="h-full overflow-y-auto p-5 sm:p-6 bg-theme-surface border border-theme-border rounded-xl shadow-sm space-y-6"
      data-testid="finding-detail-container"
    >
      {/* Top Header Row with Optional Back Button */}
      <div className="space-y-3">
        {showBackButton && onBack && (
          <div className="pb-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onBack}
              aria-label="Back to findings"
              className="gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Back to findings</span>
            </Button>
          </div>
        )}

        {/* Rule and ID */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-theme-text-muted">
          <span className="font-semibold text-theme-text/80 uppercase tracking-wider text-[11px]">
            {ruleLabel(finding.rule_id)}
          </span>
          <span className="font-code text-[11px] text-theme-text-muted/70">
            {finding.id}
          </span>
        </div>

        {/* Title */}
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-xl sm:text-2xl font-heading font-bold text-theme-text tracking-tight outline-none"
        >
          {finding.title}
        </h2>

        {/* Three Separate Badges */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <SeverityBadge severity={finding.severity} size="md" />
          <ConfidenceBadge confidence={finding.confidence} size="md" />
          <VerificationBadge verification={finding.verification} size="md" />
        </div>

        {/* Verification = fix_proposed text banner */}
        {finding.verification === 'fix_proposed' && (
          <div
            data-testid="fix-proposed-banner"
            className="mt-3 p-3 rounded-lg border border-forest/30 dark:border-lime/30 bg-forest/5 dark:bg-lime/5 flex items-start gap-2.5 text-xs text-theme-text"
          >
            <GitPullRequest className="w-4 h-4 shrink-0 mt-0.5 text-forest dark:text-lime" aria-hidden="true" />
            <div>
              <p className="font-semibold">Fix proposed</p>
              <p className="text-theme-text-muted mt-0.5">
                A proposed fix is available for this finding and ready for review.
              </p>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="pt-2 text-sm text-theme-text leading-relaxed">
          {finding.summary}
        </div>
      </div>

      <hr className="border-theme-border" />

      {/* Labelled block: Evidence (ALLOWLIST ONLY) */}
      <section className="space-y-3" aria-labelledby="evidence-heading">
        <h3
          id="evidence-heading"
          className="text-xs font-semibold uppercase tracking-wider text-theme-text-muted"
        >
          Evidence
        </h3>

        <div className="p-3.5 rounded-lg bg-theme-bg border border-theme-border text-xs space-y-2.5">
          {(!finding.evidence || finding.evidence.length === 0) ? (
            <p className="text-theme-text-muted italic">No evidence recorded.</p>
          ) : (
            <ul className="space-y-2" data-testid="evidence-list">
              {finding.evidence.map((ev, idx) => {
                // Filter down ONLY to allowlisted keys: file, line_start, line_end, specifier, pattern
                const locText = formatEvidence(ev);
                const specifier =
                  ALLOWED_EVIDENCE_KEYS.has('specifier') && typeof ev.specifier === 'string'
                    ? ev.specifier
                    : undefined;
                const pattern =
                  ALLOWED_EVIDENCE_KEYS.has('pattern') && typeof ev.pattern === 'string'
                    ? ev.pattern
                    : undefined;

                return (
                  <li
                    key={idx}
                    className="p-2.5 rounded bg-theme-surface border border-theme-border font-code text-xs text-theme-text space-y-1"
                  >
                    {locText && (
                      <div className="font-medium text-theme-text">
                        {locText}
                      </div>
                    )}
                    {specifier && (
                      <div className="text-theme-text-muted">
                        <span className="font-semibold text-theme-text">specifier:</span> {specifier}
                      </div>
                    )}
                    {pattern && (
                      <div className="text-theme-text-muted">
                        <span className="font-semibold text-theme-text">pattern:</span> {pattern}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Mandatory note */}
          <p className="text-[11px] text-theme-text-muted pt-1 border-t border-theme-border/60">
            Source code is not displayed in Phase 1
          </p>
        </div>
      </section>

      {/* Labelled block: Likely cause */}
      <section className="space-y-2" aria-labelledby="likely-cause-heading">
        <h3
          id="likely-cause-heading"
          className="text-xs font-semibold uppercase tracking-wider text-theme-text-muted"
        >
          Likely cause
        </h3>
        <div className="p-3.5 rounded-lg bg-theme-surface border border-theme-border text-xs sm:text-sm text-theme-text leading-relaxed">
          {finding.likely_cause || 'No likely cause identified.'}
        </div>
      </section>

      {/* Labelled block: What is not confirmed (ALWAYS shown) */}
      <section className="space-y-2" aria-labelledby="not-confirmed-heading">
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-theme-text-muted" aria-hidden="true" />
          <h3
            id="not-confirmed-heading"
            className="text-xs font-semibold uppercase tracking-wider text-theme-text-muted"
          >
            What is not confirmed
          </h3>
        </div>
        <div
          data-testid="not-confirmed-block"
          className="p-3.5 rounded-lg bg-theme-surface border border-theme-border text-xs sm:text-sm text-theme-text-muted leading-relaxed"
        >
          {finding.not_confirmed || 'None specified.'}
        </div>
      </section>

      {/* Labelled block: Affected nodes */}
      <section className="space-y-2" aria-labelledby="affected-nodes-heading">
        <h3
          id="affected-nodes-heading"
          className="text-xs font-semibold uppercase tracking-wider text-theme-text-muted"
        >
          Affected nodes
        </h3>
        {(!finding.nodes || finding.nodes.length === 0) ? (
          <p className="text-xs text-theme-text-muted italic">No linked nodes.</p>
        ) : (
          <ul className="divide-y divide-theme-border border border-theme-border rounded-lg overflow-hidden">
            {finding.nodes.map((node) => (
              <li
                key={node.id}
                className="p-3 bg-theme-surface flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-theme-text truncate">
                    {node.label}
                  </div>
                  <div className="text-[11px] text-theme-text-muted flex items-center gap-2 mt-0.5">
                    <span className="capitalize font-medium px-1.5 py-0.5 rounded bg-theme-bg border border-theme-border">
                      {node.type}
                    </span>
                    <span className="truncate font-code text-[10px]">{node.path}</span>
                  </div>
                </div>

                <Link
                  to={`/app/graph?focus=${encodeURIComponent(node.id)}`}
                  className="inline-flex items-center gap-1 font-medium text-forest dark:text-lime hover:underline shrink-0 text-xs px-2 py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime"
                >
                  <span>View in Graph</span>
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <hr className="border-theme-border" />

      {/* Action / Suggested Fix Button */}
      <section className="space-y-2 pt-1" aria-labelledby="suggested-fix-heading">
        <h3 id="suggested-fix-heading" className="sr-only">
          Suggested fix action
        </h3>
        <div className="p-4 rounded-xl bg-theme-bg border border-theme-border space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Link
              to={`/app/fixes?finding=${encodeURIComponent(finding.id)}`}
              className="inline-flex items-center justify-center font-medium rounded-lg px-4 py-2 text-sm gap-2 bg-forest text-cream dark:bg-lime dark:text-forest hover:bg-forest/90 dark:hover:bg-lime/90 shadow-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime"
            >
              <Wrench className="w-4 h-4" aria-hidden="true" />
              <span>Suggested fix</span>
            </Link>
          </div>
          <p className="text-xs text-theme-text-muted">
            Suggested changes are never applied automatically
          </p>
        </div>
      </section>
    </article>
  );
};
