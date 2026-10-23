import React from 'react';
import { ShieldCheck } from 'lucide-react';
import type { FindingVerification, FindingConfidence } from '../../../../shared/types.js';
import { Card } from '../../components/ui/Card.js';

export interface VerificationCoverageProps {
  byVerification: Record<FindingVerification, number>;
  byConfidence: Record<FindingConfidence, number>;
  className?: string;
}

const VERIFICATION_SEGMENTS: Array<{
  key: FindingVerification;
  label: string;
  bgClass: string;
}> = [
  { key: 'fix_verified', label: 'Fix verified', bgClass: 'bg-forest dark:bg-lime text-cream dark:text-forest' },
  { key: 'fix_proposed', label: 'Fix proposed', bgClass: 'bg-node-config text-cream' },
  { key: 'reproduced', label: 'Reproduced', bgClass: 'bg-node-backend text-cream' },
  { key: 'not_tested', label: 'Not tested', bgClass: 'bg-theme-border text-theme-text-muted' },
];

const CONFIDENCE_SEGMENTS: Array<{
  key: FindingConfidence;
  label: string;
  bgClass: string;
}> = [
  { key: 'confirmed', label: 'Confirmed', bgClass: 'bg-forest dark:bg-lime text-cream dark:text-forest' },
  { key: 'likely', label: 'Likely', bgClass: 'bg-node-frontend text-cream' },
  { key: 'hypothesis', label: 'Hypothesis', bgClass: 'bg-node-database text-cream' },
];

export const VerificationCoverage: React.FC<VerificationCoverageProps> = ({
  byVerification,
  byConfidence,
  className = '',
}) => {
  const totalVerification = Object.values(byVerification).reduce((sum, n) => sum + n, 0);
  const totalConfidence = Object.values(byConfidence).reduce((sum, n) => sum + n, 0);
  const total = Math.max(totalVerification, totalConfidence);

  const summaryText = `${total} findings: ${byVerification.fix_verified ?? 0} verified, ${byVerification.fix_proposed ?? 0} fix proposed, ${byVerification.reproduced ?? 0} reproduced, ${byVerification.not_tested ?? 0} not tested; ${byConfidence.confirmed ?? 0} confirmed, ${byConfidence.likely ?? 0} likely, ${byConfidence.hypothesis ?? 0} hypothesis`;

  return (
    <Card className={`p-5 space-y-5 ${className}`}>
      <div className="flex items-center justify-between border-b border-theme-border/60 pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-theme-text-muted" aria-hidden="true" />
          <h3 className="font-heading font-semibold text-sm text-theme-text uppercase tracking-wider">
            Verification & Confidence
          </h3>
        </div>
        <span className="text-xs text-theme-text-muted font-medium">
          Evidence-based
        </span>
      </div>

      {/* One-line text summary */}
      <p
        data-testid="verification-summary-text"
        className="text-xs text-theme-text font-medium leading-relaxed bg-theme-bg/60 p-2.5 rounded-lg border border-theme-border/70"
      >
        {summaryText}
      </p>

      {/* Accessible Table */}
      <table className="sr-only" aria-label="Verification and confidence breakdown">
        <thead>
          <tr>
            <th scope="col">Dimension</th>
            <th scope="col">Status</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {VERIFICATION_SEGMENTS.map(({ key, label }) => (
            <tr key={`v-${key}`}>
              <td>Verification</td>
              <td>{label}</td>
              <td>{byVerification[key] ?? 0}</td>
            </tr>
          ))}
          {CONFIDENCE_SEGMENTS.map(({ key, label }) => (
            <tr key={`c-${key}`}>
              <td>Confidence</td>
              <td>{label}</td>
              <td>{byConfidence[key] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Stacked Bar 1: byVerification */}
      <div data-testid="stacked-bar-verification" className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-theme-text">Verification Status</span>
          <span className="text-theme-text-muted text-[11px] font-mono">Total: {totalVerification}</span>
        </div>

        <div className="w-full h-6 bg-theme-border/40 rounded-lg overflow-hidden flex" aria-hidden="true">
          {totalVerification === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-theme-text-muted">
              No findings
            </div>
          ) : (
            VERIFICATION_SEGMENTS.map(({ key, label, bgClass }) => {
              const count = byVerification[key] ?? 0;
              if (count === 0) return null;
              const pct = (count / totalVerification) * 100;
              return (
                <div
                  key={key}
                  data-testid={`v-segment-${key}`}
                  data-count={count}
                  style={{ width: `${pct}%` }}
                  title={`${label}: ${count}`}
                  className={`${bgClass} h-full flex items-center justify-center px-1 text-[10px] font-bold truncate transition-all duration-500 ease-out motion-reduce:transition-none`}
                >
                  <span className="truncate">{count > 0 ? `${count} ${label}` : ''}</span>
                </div>
              );
            })
          )}
        </div>

        {/* Legend for verification */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-theme-text-muted pt-1">
          {VERIFICATION_SEGMENTS.map(({ key, label, bgClass }) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-xs ${bgClass.split(' ')[0]}`} />
              <span>
                {label} ({byVerification[key] ?? 0})
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Stacked Bar 2: byConfidence */}
      <div data-testid="stacked-bar-confidence" className="space-y-2 pt-2 border-t border-theme-border/50">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-theme-text">Confidence Level</span>
          <span className="text-theme-text-muted text-[11px] font-mono">Total: {totalConfidence}</span>
        </div>

        <div className="w-full h-6 bg-theme-border/40 rounded-lg overflow-hidden flex" aria-hidden="true">
          {totalConfidence === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-theme-text-muted">
              No findings
            </div>
          ) : (
            CONFIDENCE_SEGMENTS.map(({ key, label, bgClass }) => {
              const count = byConfidence[key] ?? 0;
              if (count === 0) return null;
              const pct = (count / totalConfidence) * 100;
              return (
                <div
                  key={key}
                  data-testid={`c-segment-${key}`}
                  data-count={count}
                  style={{ width: `${pct}%` }}
                  title={`${label}: ${count}`}
                  className={`${bgClass} h-full flex items-center justify-center px-1 text-[10px] font-bold truncate transition-all duration-500 ease-out motion-reduce:transition-none`}
                >
                  <span className="truncate">{count > 0 ? `${count} ${label}` : ''}</span>
                </div>
              );
            })
          )}
        </div>

        {/* Legend for confidence */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-theme-text-muted pt-1">
          {CONFIDENCE_SEGMENTS.map(({ key, label, bgClass }) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-xs ${bgClass.split(' ')[0]}`} />
              <span>
                {label} ({byConfidence[key] ?? 0})
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};
