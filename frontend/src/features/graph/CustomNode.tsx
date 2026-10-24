import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { NodeShape } from './nodeShapes.js';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';
import type { FlowNodeData } from './graphTransform.js';
import type { NodeType } from '../../../../shared/types.js';

export const CustomNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as FlowNodeData;
  const isDimmed = nodeData.isDimmed ?? false;
  const isHighlighted = nodeData.isHighlighted ?? false;
  const isSelected = selected || nodeData.isSelected;
  const findingCount = nodeData.findingCount ?? 0;
  const maxSeverity = nodeData.maxSeverity || null;
  const nodeType = (nodeData.nodeType as NodeType) || 'module';
  const isModule = nodeType === 'module';
  const focusLabel = isModule ? 'Current module' : 'Focus node';

  const ariaLabel = `${nodeData.label}, type ${nodeType}${
    nodeData.isFocused ? `, ${focusLabel}` : ''
  }${
    findingCount > 0 ? `, ${findingCount} findings, severity ${maxSeverity || 'unknown'}` : ''
  }`;

  return (
    <div
      role="button"
      tabIndex={0}
      data-node-id={id}
      aria-label={ariaLabel}
      className={`relative flex items-center gap-2.5 px-3 py-2 rounded-xl w-[220px] min-w-[160px] max-w-[220px] bg-theme-surface border border-theme-border shadow-sm cursor-pointer select-none transition-all focus:outline-none focus:ring-2 focus:ring-theme-primary ${
        isSelected
          ? 'ring-2 ring-theme-primary border-theme-primary bg-theme-surface'
          : isHighlighted
          ? 'ring-2 ring-theme-primary/70'
          : 'hover:border-theme-text-muted/40'
      } ${isDimmed ? 'opacity-30' : 'opacity-100'}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-1.5 h-1.5 !bg-theme-border opacity-0 pointer-events-none"
      />

      <div className="flex-shrink-0 flex items-center justify-center">
        <svg width="24" height="24" viewBox="0 0 40 40" aria-hidden="true" className="overflow-visible">
          <NodeShape type={nodeType} cx={20} cy={20} r={14} />
        </svg>
      </div>

      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-[13px] font-medium text-theme-text line-clamp-2 break-words"
            title={nodeData.label}
          >
            {nodeData.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0 mt-0.5 flex-wrap">
          <span className="text-[11px] text-theme-text-muted capitalize">
            {nodeType}
          </span>
          {nodeData.isFocused && (
            <span
              data-testid={isModule ? 'current-module-badge' : 'focus-node-badge'}
              className="flex-shrink-0 text-[10px] font-semibold text-theme-primary px-1.5 py-0.5 rounded bg-theme-surface-active border border-theme-border leading-none"
            >
              {focusLabel}
            </span>
          )}
        </div>
      </div>

      {findingCount > 0 && maxSeverity && (
        <div className="flex-shrink-0 ml-auto pl-1">
          <SeverityBadge
            severity={maxSeverity}
            size="sm"
          >
            {findingCount}
          </SeverityBadge>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="w-1.5 h-1.5 !bg-theme-border opacity-0 pointer-events-none"
      />
    </div>
  );
};

