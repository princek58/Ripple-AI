import React from 'react';
import { ShieldCheck, HelpCircle, Compass } from 'lucide-react';
import type { FindingConfidence } from '../../../../shared/types.js';

export interface ConfidenceBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  confidence: FindingConfidence;
  size?: 'sm' | 'md';
}

const CONFIDENCE_CONFIG: Record<
  FindingConfidence,
  { label: string; icon: React.ComponentType<{ className?: string }>; style: string }
> = {
  confirmed: {
    label: 'Confirmed',
    icon: ShieldCheck,
    style: 'border-theme-border text-theme-text bg-theme-surface font-semibold',
  },
  likely: {
    label: 'Likely',
    icon: HelpCircle,
    style: 'border-theme-border text-theme-text-muted bg-theme-surface/80',
  },
  hypothesis: {
    label: 'Hypothesis',
    icon: Compass,
    style: 'border-dashed border-theme-border text-theme-text-muted bg-transparent',
  },
};

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({
  confidence,
  size = 'md',
  className = '',
  ...props
}) => {
  const config = CONFIDENCE_CONFIG[confidence] || CONFIDENCE_CONFIG.hypothesis;
  const Icon = config.icon;

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs gap-1' : 'px-2.5 py-1 text-xs gap-1.5';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      data-testid={`confidence-badge-${confidence}`}
      className={`inline-flex items-center font-medium rounded-full border ${config.style} ${sizeClasses} ${className}`}
      {...props}
    >
      <Icon className={`${iconSize} shrink-0`} aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
};
