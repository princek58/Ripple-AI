import React from 'react';
import { Layers } from 'lucide-react';

export interface ShownCounterProps {
  shown: number;
  total: number;
  clustersCount: number;
  className?: string;
}

export const ShownCounter: React.FC<ShownCounterProps> = ({
  shown,
  total,
  clustersCount,
  className = '',
}) => {
  return (
    <div
      data-testid="shown-counter"
      className={`flex items-center gap-2 text-xs text-theme-text-muted bg-theme-surface/80 border border-theme-border px-3 py-1.5 rounded-lg shadow-sm ${className}`}
    >
      <span>
        Showing <strong className="text-theme-text font-semibold">{shown}</strong> of{' '}
        <strong className="text-theme-text font-semibold">{total}</strong> nodes
      </span>

      {clustersCount > 0 && (
        <span
          data-testid="clustered-count"
          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-theme-surface-active text-theme-text"
        >
          <Layers className="w-3 h-3 text-theme-text-muted" aria-hidden="true" />
          <span>(+{clustersCount} clustered)</span>
        </span>
      )}
    </div>
  );
};
