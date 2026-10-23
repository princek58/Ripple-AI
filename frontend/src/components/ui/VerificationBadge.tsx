import React from 'react';
import { Check, GitPullRequest, RotateCw, CircleSlash } from 'lucide-react';
import type { FindingVerification } from '../../../../shared/types.js';

export interface VerificationBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  verification: FindingVerification;
  size?: 'sm' | 'md';
}

const VERIFICATION_CONFIG: Record<
  FindingVerification,
  { label: string; icon: React.ComponentType<{ className?: string }>; style: string }
> = {
  fix_verified: {
    label: 'Fix verified',
    icon: Check,
    style: 'border-theme-text text-theme-text bg-theme-surface font-semibold',
  },
  fix_proposed: {
    label: 'Fix proposed',
    icon: GitPullRequest,
    style: 'border-theme-border text-theme-text bg-theme-surface',
  },
  reproduced: {
    label: 'Reproduced',
    icon: RotateCw,
    style: 'border-severity-high/40 text-severity-high bg-severity-high/10',
  },
  not_tested: {
    label: 'Not tested',
    icon: CircleSlash,
    style: 'border-dashed border-theme-border text-theme-text-muted bg-transparent',
  },
};

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  verification,
  size = 'md',
  className = '',
  ...props
}) => {
  const config = VERIFICATION_CONFIG[verification] || VERIFICATION_CONFIG.not_tested;
  const Icon = config.icon;

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs gap-1' : 'px-2.5 py-1 text-xs gap-1.5';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      data-testid={`verification-badge-${verification}`}
      className={`inline-flex items-center font-medium rounded-full border ${config.style} ${sizeClasses} ${className}`}
      {...props}
    >
      <Icon className={`${iconSize} shrink-0`} aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
};
