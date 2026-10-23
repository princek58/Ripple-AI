import React from 'react';
import { Clock } from 'lucide-react';
import { formatDate } from '../../lib/format.js';

export interface LastScanLabelProps {
  finishedAt?: string | null;
  status?: string | null;
  isNeverScanned?: boolean;
  className?: string;
}

export const LastScanLabel: React.FC<LastScanLabelProps> = ({
  finishedAt,
  status,
  isNeverScanned,
  className = '',
}) => {
  if (isNeverScanned || !finishedAt) {
    return (
      <div
        data-testid="last-scan-label"
        className={`inline-flex items-center gap-1.5 text-xs text-theme-text-muted ${className}`}
      >
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Not scanned yet</span>
      </div>
    );
  }

  const formatted = formatDate(finishedAt);
  const statusText = status ? ` (${status})` : '';

  return (
    <div
      data-testid="last-scan-label"
      className={`inline-flex items-center gap-1.5 text-xs text-theme-text-muted ${className}`}
    >
      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>
        Last scan: {formatted}
        {statusText}
      </span>
    </div>
  );
};
