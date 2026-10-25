import React from 'react';
import { NodeShape } from '../graph/nodeShapes.js';
import type { RippleLayoutResult, RipplePositionedNode } from './impactPure.js';

export interface RippleDiagramProps {
  layout: RippleLayoutResult;
  maxVisibleRound?: number;
  onNavigateFocus: (nodeId: string) => void;
  className?: string;
}

function wrapLabel(label: string, maxLen = 12): [string, string] {
  if (label.length <= maxLen) {
    return [label, ''];
  }

  // Look for natural break point (space, slash, dot, underscore, dash)
  const breakIndex = label.slice(0, maxLen + 3).search(/[\s/._-]/);
  if (breakIndex > 2 && breakIndex <= maxLen + 2) {
    return [
      label.slice(0, breakIndex + 1),
      label.slice(breakIndex + 1, breakIndex + 1 + maxLen) +
        (label.length > breakIndex + 1 + maxLen ? '…' : ''),
    ];
  }

  return [label.slice(0, maxLen), label.slice(maxLen, maxLen * 2) + (label.length > maxLen * 2 ? '…' : '')];
}

export const RippleDiagram: React.FC<RippleDiagramProps> = ({
  layout,
  maxVisibleRound = Infinity,
  onNavigateFocus,
  className = '',
}) => {
  const { width, height, center, startNode, rings } = layout;

  return (
    <div
      data-testid="ripple-diagram-container"
      className={`w-full overflow-hidden flex items-center justify-center select-none ${className}`}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Concentric ripple diagram of affected items by round"
        className="w-full h-auto max-w-full max-h-[560px]"
      >
        <defs>
          <style>{`
            @keyframes ringPulse {
              0% { stroke-opacity: 0.3; transform-origin: ${center.x}px ${center.y}px; }
              50% { stroke-opacity: 0.8; transform: scale(1.01); transform-origin: ${center.x}px ${center.y}px; }
              100% { stroke-opacity: 0.5; transform: scale(1); transform-origin: ${center.x}px ${center.y}px; }
            }
            .ripple-ring-pulse {
              animation: ringPulse 1.2s ease-out 1;
            }
            @media (prefers-reduced-motion: reduce) {
              .ripple-ring-pulse {
                animation: none !important;
              }
            }
          `}</style>
        </defs>

        {/* Concentric rings */}
        {rings.map((ring) => {
          const isVisible = ring.round <= maxVisibleRound;
          if (!isVisible) return null;

          return (
            <g key={`ring-${ring.round}`} className="ripple-ring-group">
              {/* Concentric ring circle */}
              <circle
                cx={center.x}
                cy={center.y}
                r={ring.radius}
                fill="none"
                stroke="var(--impact-ring)"
                strokeWidth="1.75"
                strokeDasharray="4 4"
                className="ripple-ring-pulse"
                opacity="0.55"
              />

              {/* Ring round text label */}
              <text
                x={center.x}
                y={center.y - ring.radius + 15}
                textAnchor="middle"
                className="text-[11px] font-mono font-semibold fill-theme-text-muted select-none"
              >
                Round {ring.round}
              </text>

              {/* Overflow notice on ring */}
              {ring.overflowText && (
                <text
                  x={center.x}
                  y={center.y + ring.radius - 8}
                  textAnchor="middle"
                  className="text-[11px] font-mono font-medium fill-theme-text-muted select-none"
                  data-testid={`ring-overflow-${ring.round}`}
                >
                  {ring.overflowText}
                </text>
              )}
            </g>
          );
        })}

        {/* Start item in the centre */}
        <g
          className="start-node-group cursor-default"
          transform={`translate(${startNode.x}, ${startNode.y})`}
        >
          <title>{`${startNode.label} (${startNode.type}) - ${startNode.path} [Start Item]`}</title>
          <NodeShape
            type={startNode.type}
            cx={0}
            cy={0}
            r={startNode.radius}
            stroke="var(--theme-text)"
            strokeWidth={3}
            className="filter drop-shadow-md"
          />
          {/* Centre marker badge */}
          <circle cx={0} cy={0} r={startNode.radius * 0.35} fill="var(--color-lime)" />
          {/* Start label wrapped to two lines */}
          {(() => {
            const [l1, l2] = wrapLabel(startNode.label, 12);
            return (
              <text
                x={0}
                y={startNode.radius + 13}
                textAnchor="middle"
                className="text-[10px] font-semibold font-mono fill-theme-text pointer-events-none"
              >
                <tspan x={0} dy="0">
                  {l1}
                </tspan>
                {l2 && (
                  <tspan x={0} dy="11">
                    {l2}
                  </tspan>
                )}
              </text>
            );
          })()}
        </g>

        {/* Affected Nodes on visible rings */}
        {rings.map((ring) => {
          if (ring.round > maxVisibleRound) return null;

          return ring.nodes.map((node: RipplePositionedNode) => {
            const isProven = node.certainty === 'proven';
            const strokeColor = isProven ? 'var(--impact-proven)' : 'var(--impact-possible)';
            const strokeDash = isProven ? undefined : '4 3';
            const [line1, line2] = wrapLabel(node.label, 11);

            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`View ${node.label} (${node.type}) in graph. Distance ${node.distance}, certainty ${node.certainty}`}
                data-testid={`impact-node-${node.id}`}
                onClick={() => onNavigateFocus(node.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigateFocus(node.id);
                  }
                }}
                className="cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime"
              >
                <title>{`${node.label} (${node.type}) - ${node.path}\nCertainty: ${node.certainty} via ${node.via.relation} (${node.via.status})`}</title>

                {/* Node Shape */}
                <NodeShape
                  type={node.type}
                  cx={node.x}
                  cy={node.y}
                  r={node.radius}
                  stroke={strokeColor}
                  strokeWidth={2.5}
                  strokeDasharray={strokeDash}
                  className="transition-transform group-hover:scale-110 group-focus:scale-110"
                />

                {/* Possible certainty "?" indicator badge */}
                {!isProven && (
                  <g
                    transform={`translate(${node.x + node.radius * 0.7}, ${node.y - node.radius * 0.7})`}
                    data-testid={`possible-badge-${node.id}`}
                  >
                    <circle cx={0} cy={0} r={8} fill="var(--impact-possible)" stroke="var(--theme-surface)" strokeWidth={1.5} />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      className="text-[10px] font-bold fill-white select-none pointer-events-none"
                    >
                      ?
                    </text>
                  </g>
                )}

                {/* Wrapped 2-line label */}
                <text
                  x={node.x}
                  y={node.y + node.radius + 12}
                  textAnchor="middle"
                  className="text-[10px] font-mono fill-theme-text group-hover:underline group-focus:underline select-none pointer-events-none"
                >
                  <tspan x={node.x} dy="0">
                    {line1}
                  </tspan>
                  {line2 && (
                    <tspan x={node.x} dy="11">
                      {line2}
                    </tspan>
                  )}
                </text>
              </g>
            );
          });
        })}
      </svg>
    </div>
  );
};

export default RippleDiagram;
