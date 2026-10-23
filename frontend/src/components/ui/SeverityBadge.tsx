import React from 'react';
import { AlertOctagon, AlertTriangle, AlertCircle, Info, HelpCircle } from 'lucide-react';
import type { FindingSeverity } from '../../../../shared/types.js';

export interface SeverityBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  severity: FindingSeverity;
  size?: 'sm' | 'md';
}

const SEVERITY_CONFIG: Record<
  FindingSeverity,
  { label: string; icon: React.ComponentType<{ className?: string }>; style: string }
> = {
  critical: {
    label: 'Critical',
    icon: AlertOctagon,
    style: 'border-severity-critical/30 text-severity-critical bg-severity-critical/10',
  },
  high: {
    label: 'High',
    icon: AlertTriangle,
    style: 'border-severity-high/30 text-severity-high bg-severity-high/10',
  },
  medium: {
    label: 'Medium',
    icon: AlertCircle,
    style: 'border-severity-medium/30 text-severity-medium bg-severity-medium/10',
  },
  low: {
    label: 'Low',
    icon: Info,
    style: 'border-severity-low/30 text-severity-low bg-severity-low/10',
  },
  unknown: {
    label: 'Unknown',
    icon: HelpCircle,
    style: 'border-severity-unknown/30 text-severity-unknown bg-severity-unknown/10',
  },
};

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({
  severity,
  size = 'md',
  className = '',
  ...props
}) => {
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.unknown;
  const Icon = config.icon;

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs gap-1' : 'px-2.5 py-1 text-xs gap-1.5';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      data-testid={`severity-badge-${severity}`}
      className={`inline-flex items-center font-medium rounded-full border ${config.style} ${sizeClasses} ${className}`}
      {...props}
    >
      <Icon className={`${iconSize} shrink-0`} aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
};
