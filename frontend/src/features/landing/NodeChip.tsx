import React from 'react';
import { MousePointer2 } from 'lucide-react';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';

export interface NodeChipProps {
  label: string;
  typeLabel?: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  isProblem?: boolean;
  severityLabel?: string;
  cursorLabel?: string;
  reducedMotion?: boolean;
  className?: string;
}

export const NodeChip: React.FC<NodeChipProps> = ({
  label,
  typeLabel,
  icon: Icon,
  isProblem = false,
  severityLabel,
  cursorLabel,
  reducedMotion = false,
  className = '',
}) => {
  return (
    <div
      data-testid={`node-chip-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className={`relative inline-flex flex-col gap-1.5 p-3 sm:p-4 rounded-xl border bg-theme-surface shadow-md select-none transition-all duration-300 ${
        isProblem
          ? 'border-severity-critical/60 shadow-severity-critical/10'
          : 'border-theme-border/80'
      } ${
        !reducedMotion ? 'hover:-translate-y-0.5' : ''
      } ${className}`}
    >
      {/* Small cursor arrow decoration */}
      <div
        className="absolute -top-3.5 -right-3 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-forest text-cream dark:bg-lime dark:text-forest text-[10px] font-mono shadow-sm pointer-events-none"
        aria-hidden="true"
      >
        <MousePointer2 className="w-2.5 h-2.5 fill-current" aria-hidden="true" />
        {cursorLabel && <span className="font-semibold">{cursorLabel}</span>}
      </div>

      <div className="flex items-center gap-2.5">
        <div
          className={`p-1.5 rounded-lg border ${
            isProblem
              ? 'bg-severity-critical/10 border-severity-critical/30 text-severity-critical'
              : 'bg-theme-bg border-theme-border/60 text-theme-text'
          }`}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
        </div>

        <div className="flex flex-col text-left">
          <span className="font-heading font-semibold text-sm text-theme-text leading-tight">
            {label}
          </span>
          {typeLabel && (
            <span className="text-[11px] font-mono text-theme-text-muted leading-tight">
              {typeLabel}
            </span>
          )}
        </div>
      </div>

      {/* Problem badge with icon and text (never colour alone) */}
      {isProblem && (
        <div className="mt-1 flex items-center">
          <SeverityBadge
            severity="critical"
            size="sm"
            label={severityLabel || 'Critical (sample)'}
          />
        </div>
      )}
    </div>
  );
};
