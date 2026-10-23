import React from 'react';
import { ConfidenceBadge } from '../../components/ui/ConfidenceBadge.js';
import { VerificationBadge } from '../../components/ui/VerificationBadge.js';
import { ShieldAlert } from 'lucide-react';

export const SafetyStatement: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <section
      id="safety"
      data-testid="safety-section"
      className={`py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto ${className}`}
    >
      <div className="text-center max-w-3xl mx-auto mb-14 sm:mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-theme-border bg-theme-surface mb-6 text-xs font-mono font-medium text-forest dark:text-lime">
          <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Integrity Principle</span>
        </div>

        <h2 className="font-heading font-bold text-3xl sm:text-5xl md:text-6xl text-theme-text tracking-tight leading-tight">
          Suspected is not confirmed.
        </h2>
        <p className="mt-5 text-base sm:text-lg text-theme-text-muted leading-relaxed">
          Most tools present statistical hunches as certainties. Ripple AI explicitly separates
          conjectures, likely patterns, proven evidence, and verified fixes.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Status 1: Hypothesis */}
        <div
          data-testid="safety-status-hypothesis"
          className="flex flex-col justify-between p-6 rounded-2xl border border-theme-border/80 bg-theme-surface shadow-xs transition-colors"
        >
          <div>
            <div className="mb-4">
              <ConfidenceBadge confidence="hypothesis" size="md" />
            </div>
            <h3 className="font-heading font-semibold text-lg text-theme-text mb-2">
              Hypothesis
            </h3>
            <p className="text-xs sm:text-sm text-theme-text-muted leading-relaxed">
              A potential structural anomaly was flagged, but runtime context and execution proof
              are not yet established.
            </p>
          </div>
        </div>

        {/* Status 2: Likely */}
        <div
          data-testid="safety-status-likely"
          className="flex flex-col justify-between p-6 rounded-2xl border border-theme-border/80 bg-theme-surface shadow-xs transition-colors"
        >
          <div>
            <div className="mb-4">
              <ConfidenceBadge confidence="likely" size="md" />
            </div>
            <h3 className="font-heading font-semibold text-lg text-theme-text mb-2">
              Likely
            </h3>
            <p className="text-xs sm:text-sm text-theme-text-muted leading-relaxed">
              High code probability supported by naming conventions and AST route maps, though
              unverified in production.
            </p>
          </div>
        </div>

        {/* Status 3: Confirmed */}
        <div
          data-testid="safety-status-confirmed"
          className="flex flex-col justify-between p-6 rounded-2xl border border-theme-border/80 bg-theme-surface shadow-xs transition-colors"
        >
          <div>
            <div className="mb-4">
              <ConfidenceBadge confidence="confirmed" size="md" />
            </div>
            <h3 className="font-heading font-semibold text-lg text-theme-text mb-2">
              Confirmed
            </h3>
            <p className="text-xs sm:text-sm text-theme-text-muted leading-relaxed">
              Unambiguous source code facts, such as relative imports pointing to nonexistent files
              or circular loops.
            </p>
          </div>
        </div>

        {/* Status 4: Fix verified */}
        <div
          data-testid="safety-status-fix-verified"
          className="flex flex-col justify-between p-6 rounded-2xl border border-theme-border/80 bg-theme-surface shadow-xs transition-colors"
        >
          <div>
            <div className="mb-4">
              <VerificationBadge verification="fix_verified" size="md" />
            </div>
            <h3 className="font-heading font-semibold text-lg text-theme-text mb-2">
              Fix verified
            </h3>
            <p className="text-xs sm:text-sm text-theme-text-muted leading-relaxed">
              A deterministic patch has been created and verified to resolve the finding without
              altering original files.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
