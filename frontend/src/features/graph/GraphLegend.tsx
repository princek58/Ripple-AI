import React, { useState } from 'react';
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { NodeShape, NODE_SHAPE_DESCRIPTIONS } from './nodeShapes.js';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';
import type { NodeType, FindingSeverity } from '../../../../shared/types.js';

export interface GraphLegendProps {
  className?: string;
  isOpen?: boolean;
  onToggle?: () => void;
}

const SEVERITIES: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'unknown'];

const NODE_TYPES: NodeType[] = [
  'project',
  'module',
  'frontend',
  'backend',
  'api',
  'database',
  'config',
  'test',
];

export const GraphLegendContent: React.FC = () => {
  return (
    <div className="space-y-4">
      {/* Node Shapes */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-theme-text-muted">
          Node Shapes & Types
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-x-3 gap-y-1.5">
          {NODE_TYPES.map((t) => (
            <div key={t} className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 40 40" aria-hidden="true" className="flex-shrink-0">
                <NodeShape type={t} cx={20} cy={20} r={14} />
              </svg>
              <span className="capitalize text-theme-text text-[11px]">
                {t} ({NODE_SHAPE_DESCRIPTIONS[t].shape})
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded border-2 border-dashed border-theme-border bg-theme-surface/60" />
            <span className="text-theme-text text-[11px]">Stub (Unresolved)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded border-2 border-dashed border-theme-border bg-theme-surface-active" />
            <span className="text-theme-text text-[11px]">Cluster (Group)</span>
          </div>
        </div>
      </div>

      {/* Severity Labels */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-theme-text-muted">
          Findings Severity
        </span>
        <div className="flex flex-wrap gap-1.5">
          {SEVERITIES.map((s) => (
            <SeverityBadge key={s} severity={s} size="sm" />
          ))}
        </div>
      </div>

      {/* Edge Styles */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-theme-text-muted">
          Edge Styles
        </span>
        <div className="flex flex-wrap gap-4 text-[11px] text-theme-text">
          <div className="flex items-center gap-2">
            <svg width="32" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="32" y2="5" stroke="var(--theme-border)" strokeWidth="2" />
            </svg>
            <span>Resolved (Solid)</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="32" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="32" y2="5" stroke="var(--theme-border)" strokeWidth="2" strokeDasharray="6 4" />
            </svg>
            <span>Possible (Dashed)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <svg width="24" height="10" aria-hidden="true">
                <line x1="0" y1="5" x2="24" y2="5" stroke="var(--theme-border)" strokeWidth="2" strokeDasharray="3 3" />
              </svg>
              <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-theme-surface border border-theme-border text-[8px] font-bold">
                ?
              </span>
            </div>
            <span>Unresolved (Dotted with ?)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const GraphLegend: React.FC<GraphLegendProps> = ({
  className = '',
  isOpen: propIsOpen,
  onToggle,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isExpanded = propIsOpen !== undefined ? propIsOpen : internalOpen;
  const handleToggle = onToggle || (() => setInternalOpen((prev) => !prev));

  return (
    <div
      data-testid="graph-legend"
      className={`bg-theme-surface border border-theme-border rounded-xl shadow-sm text-xs transition-all overflow-hidden ${className}`}
    >
      <button
        type="button"
        data-testid="toggle-legend-btn"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-theme-text font-semibold hover:bg-theme-surface-active transition-colors focus:outline-none focus:ring-1 focus:ring-theme-primary"
        aria-expanded={isExpanded}
        aria-controls="graph-legend-content"
      >
        <span className="flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-theme-text-muted" aria-hidden="true" />
          <span>Legend</span>
        </span>
        {isExpanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-theme-text-muted" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-theme-text-muted" aria-hidden="true" />
        )}
      </button>

      {isExpanded && (
        <div id="graph-legend-content" className="p-3 border-t border-theme-border">
          <GraphLegendContent />
        </div>
      )}
    </div>
  );
};
