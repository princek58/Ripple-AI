import React from 'react';
import { FlaskConical } from 'lucide-react';

export interface SampleDataTagProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: 'sm' | 'md';
}

export const SampleDataTag: React.FC<SampleDataTagProps> = ({
  size = 'md',
  className = '',
  ...props
}) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      data-testid="sample-data-tag"
      className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-theme-border/60 text-theme-text-muted border border-theme-border select-none ${sizeClasses} ${className}`}
      {...props}
    >
      <FlaskConical className={`${iconSize} text-theme-text-muted`} aria-hidden="true" />
      <span>Sample data</span>
    </span>
  );
};
