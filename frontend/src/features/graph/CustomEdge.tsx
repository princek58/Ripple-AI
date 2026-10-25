import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import type { FlowEdgeData } from './graphTransform.js';

export const CustomEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}) => {
  const edgeData = (data || {}) as unknown as FlowEdgeData;
  const status = edgeData.status || 'resolved';
  const isDimmed = edgeData.isDimmed ?? false;
  const isHighlighted = edgeData.isHighlighted ?? false;
  const count = edgeData.count;
  const isDerived = edgeData.derived;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Calculate stroke dasharray based on status
  let strokeDasharray: string | undefined;
  if (status === 'possible') {
    strokeDasharray = '6 4';
  } else if (status === 'unresolved') {
    strokeDasharray = '3 3';
  }

  const isInvestigationPath = edgeData.isInvestigationPath ?? false;

  const strokeColor = isInvestigationPath
    ? 'var(--edge-investigation-path)'
    : isHighlighted
      ? 'var(--theme-primary)'
      : 'var(--theme-border)';

  const strokeWidth = isInvestigationPath ? 3.5 : isHighlighted ? 2.5 : 1.5;
  const opacity = isDimmed ? 0.2 : 1;

  const showCountLabel = Boolean(count && count > 1) || Boolean(isDerived && count);
  const showUnresolvedLabel = status === 'unresolved';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray,
          opacity,
          transition: 'opacity 0.15s ease, stroke 0.15s ease',
        }}
      />

      {(showCountLabel || showUnresolvedLabel || isInvestigationPath) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              opacity,
            }}
            className="nodrag nopan flex items-center gap-1"
          >
            {isInvestigationPath && (
              <span
                data-testid={`edge-investigation-path-label-${id}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-theme-surface border border-theme-border text-theme-text shadow-xs whitespace-nowrap"
                title="Investigation path"
              >
                Investigation path
              </span>
            )}
            {showUnresolvedLabel ? (
              <span
                data-testid={`edge-stub-label-${id}`}
                className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-theme-surface border border-theme-border text-[10px] font-bold text-theme-text shadow-sm"
                title="Unresolved edge"
                aria-label="Unresolved edge"
              >
                ?
              </span>
            ) : showCountLabel ? (
              <span
                data-testid={`edge-count-label-${id}`}
                className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-theme-surface border border-theme-border text-[10px] font-semibold text-theme-text shadow-sm"
                title={`${count} derived edges`}
                aria-label={`${count} edges`}
              >
                {count}
              </span>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
