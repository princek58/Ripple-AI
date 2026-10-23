import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { HelpCircle } from 'lucide-react';
import type { FlowNodeData } from './graphTransform.js';

export const StubNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as FlowNodeData;
  const isDimmed = nodeData.isDimmed ?? false;
  const isHighlighted = nodeData.isHighlighted ?? false;
  const isSelected = selected || nodeData.isSelected;

  return (
    <div
      role="button"
      tabIndex={0}
      data-node-id={id}
      aria-label={`${nodeData.label}, unresolved target`}
      className={`relative flex items-center gap-2 px-3 py-2 rounded-xl min-w-[160px] bg-theme-surface/70 border-2 border-dashed border-theme-border shadow-sm cursor-pointer select-none transition-all focus:outline-none focus:ring-2 focus:ring-theme-primary ${
        isSelected
          ? 'ring-2 ring-theme-primary border-theme-primary'
          : isHighlighted
          ? 'ring-2 ring-theme-primary/70'
          : 'hover:border-theme-text-muted/60'
      } ${isDimmed ? 'opacity-30' : 'opacity-100'}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-1.5 h-1.5 !bg-theme-border opacity-0 pointer-events-none"
      />

      <div className="flex-shrink-0 text-theme-text-muted">
        <HelpCircle className="w-4 h-4" aria-hidden="true" />
      </div>

      <div className="flex flex-col min-w-0 flex-1">
        <span
          className="text-[13px] font-mono font-medium text-theme-text line-clamp-2 break-words"
          title={nodeData.label}
        >
          {nodeData.label}
        </span>
        <span className="text-[11px] text-theme-text-muted">
          Missing target
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-1.5 h-1.5 !bg-theme-border opacity-0 pointer-events-none"
      />
    </div>
  );
};
