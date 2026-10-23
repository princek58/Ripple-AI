import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Layers } from 'lucide-react';
import type { FlowNodeData } from './graphTransform.js';

export const ClusterNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as FlowNodeData;
  const isDimmed = nodeData.isDimmed ?? false;
  const isHighlighted = nodeData.isHighlighted ?? false;
  const isSelected = selected || nodeData.isSelected;
  const count = nodeData.clusterCount ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      data-node-id={id}
      aria-label={`Cluster ${nodeData.label}, ${count} nodes`}
      className={`relative flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-theme-surface/60 border-2 border-dashed border-theme-border shadow-sm cursor-pointer select-none transition-all focus:outline-none focus:ring-2 focus:ring-theme-primary ${
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

      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-shrink-0 text-theme-text-muted">
          <Layers className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="flex flex-col min-w-0">
          <span
            className="text-xs font-semibold text-theme-text truncate max-w-[120px]"
            title={nodeData.label}
          >
            {nodeData.label}
          </span>
          <span className="text-[10px] text-theme-text-muted">
            Group cluster
          </span>
        </div>
      </div>

      <div className="flex-shrink-0 px-2 py-0.5 rounded-full bg-theme-surface-active border border-theme-border text-[11px] font-medium text-theme-text">
        {count} nodes
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-1.5 h-1.5 !bg-theme-border opacity-0 pointer-events-none"
      />
    </div>
  );
};
