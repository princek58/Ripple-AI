import React from 'react';

export interface KpiTileProps {
  label: string;
  value: number | string;
  helperText?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export const KpiTile: React.FC<KpiTileProps> = ({
  label,
  value,
  helperText,
  icon,
  badge,
  className = '',
}) => {
  return (
    <div
      className={`bg-theme-surface text-theme-text border border-theme-border rounded-xl p-4 shadow-sm flex flex-col justify-between transition-colors duration-150 motion-reduce:transition-none ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-theme-text-muted uppercase tracking-wider">
          {label}
        </span>
        {icon && <div className="text-theme-text-muted">{icon}</div>}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="font-heading font-semibold text-2xl lg:text-3xl text-theme-text tracking-tight">
          {value}
        </span>
        {badge}
      </div>

      {helperText && (
        <p className="mt-2 text-xs text-theme-text-muted">
          {helperText}
        </p>
      )}
    </div>
  );
};
