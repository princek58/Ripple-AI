import React from 'react';
import { FolderOpen } from 'lucide-react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  className = '',
}) => {
  return (
    <div
      role="region"
      aria-label={title}
      className={`flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed border-theme-border bg-theme-surface/50 text-theme-text ${className}`}
    >
      <div className="w-12 h-12 mb-3 rounded-full bg-theme-border/40 flex items-center justify-center text-theme-text-muted">
        {icon || <FolderOpen className="w-6 h-6" aria-hidden="true" />}
      </div>
      <h3 className="font-heading font-semibold text-base text-theme-text">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-theme-text-muted max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
