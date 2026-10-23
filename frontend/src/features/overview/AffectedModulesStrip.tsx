import React from 'react';
import { Layers, CheckCircle2, Info } from 'lucide-react';
import type { FindingSeverity } from '../../../../shared/types.js';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';
import { Card } from '../../components/ui/Card.js';

export interface AffectedModuleItem {
  moduleId: string;
  label: string;
  findingCount: number;
  maxSeverity: FindingSeverity | null;
}

export interface AffectedModulesStripProps {
  affectedModules: AffectedModuleItem[];
  className?: string;
}

export const AffectedModulesStrip: React.FC<AffectedModulesStripProps> = ({
  affectedModules,
  className = '',
}) => {
  return (
    <Card className={`p-5 space-y-4 ${className}`}>
      <div className="flex items-center justify-between border-b border-theme-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-theme-text-muted" aria-hidden="true" />
          <h3 className="font-heading font-semibold text-sm text-theme-text uppercase tracking-wider">
            Affected Modules
          </h3>
        </div>
        <span className="text-xs text-theme-text-muted">
          {affectedModules.length} {affectedModules.length === 1 ? 'module' : 'modules'} with findings
        </span>
      </div>

      {affectedModules.length === 0 ? (
        <div
          data-testid="no-findings-banner"
          className="p-4 rounded-xl border border-forest/30 dark:border-lime/30 bg-forest/5 dark:bg-lime/5 space-y-2 text-theme-text"
        >
          <div className="flex items-center gap-2 font-medium text-sm text-forest dark:text-lime">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>No findings from the 6 automated checks</span>
          </div>
          <p className="text-xs text-theme-text-muted flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              No findings does not mean no problems: Phase 1 runs only 6 static checks and executes no code.
            </span>
          </p>
        </div>
      ) : (
        <div
          data-testid="affected-modules-list"
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3"
        >
          {affectedModules.map((mod) => (
            <div
              key={mod.moduleId}
              data-testid={`affected-module-${mod.label}`}
              className="p-3 rounded-lg border border-theme-border bg-theme-bg/60 flex items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <span className="font-heading font-semibold text-xs text-theme-text truncate block">
                  {mod.label}
                </span>
                <span className="text-[11px] text-theme-text-muted">
                  {mod.findingCount} {mod.findingCount === 1 ? 'finding' : 'findings'}
                </span>
              </div>
              {mod.maxSeverity && (
                <SeverityBadge severity={mod.maxSeverity} size="sm">
                  {mod.maxSeverity}
                </SeverityBadge>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
