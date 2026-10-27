import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GraphResponseData } from '../../../../shared/types.js';
import { NodeShape } from '../graph/nodeShapes.js';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';
import { Card } from '../../components/ui/Card.js';
import { computeL1Layout } from './l1Layout.js';

export interface ProjectGraphCardProps {
  graphData: GraphResponseData;
  className?: string;
}

export const ProjectGraphCard: React.FC<ProjectGraphCardProps> = ({
  graphData,
  className = '',
}) => {
  const navigate = useNavigate();

  const layout = useMemo(() => computeL1Layout(graphData), [graphData]);
  const {
    svgWidth,
    svgHeight,
    centerX,
    centerY,
    orbitRadius,
    projectNode,
    moduleNodes,
    edges,
    hiddenEdgesCount,
    overflowModulesCount,
    mostAffectedModuleId,
  } = layout;

  const allModuleNodes = useMemo(
    () => graphData.nodes.filter((n) => n.type === 'module'),
    [graphData.nodes]
  );

  const handleNodeClick = (node: { id: string }) => {
    navigate(`/app/graph?focus=${encodeURIComponent(node.id)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent, node: { id: string }) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleNodeClick(node);
    }
  };

  return (
    <Card className={`p-5 space-y-4 ${className}`}>
      {/* Header and Counters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-theme-border/60 pb-3">
        <div>
          <h2 className="font-heading font-semibold text-lg text-theme-text">
            Level 1 Architecture & Dependency Graph
          </h2>
          <p className="text-xs text-theme-text-muted">
            Project core and derived module-to-module dependencies from static analysis.
          </p>
        </div>
        <div
          data-testid="graph-shown-counter"
          className="text-xs font-medium px-2.5 py-1 rounded-full bg-theme-border/40 text-theme-text-muted self-start sm:self-auto"
        >
          Showing {graphData.shown} of {graphData.total} nodes
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-hidden rounded-xl bg-theme-bg/50 border border-theme-border flex items-center justify-center p-2">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full max-w-2xl h-auto select-none"
          role="img"
          aria-label="Level 1 dependency graph visualization"
        >
          {/* Subtle center background circle */}
          <circle
            cx={centerX}
            cy={centerY}
            r={orbitRadius}
            fill="none"
            stroke="var(--theme-border)"
            strokeDasharray="3 3"
            strokeWidth={1}
            aria-hidden="true"
          />

          {/* Spokes connecting center project to modules */}
          {moduleNodes.map((mod) => (
            <line
              key={`spoke-${mod.id}`}
              x1={centerX}
              y1={centerY}
              x2={mod.pos.x}
              y2={mod.pos.y}
              stroke="var(--theme-border)"
              strokeWidth={1}
              strokeDasharray="2 2"
              aria-hidden="true"
            />
          ))}

          {/* Derived Module-to-Module Edges with Quadratic Outward Arc */}
          {edges.map((edge) => {
            const isResolved = edge.status === 'resolved';
            const isPossible = edge.status === 'possible';
            const isUnresolved = edge.status === 'unresolved';

            const strokeDash = isResolved
              ? undefined
              : isPossible
              ? '4 4'
              : '2 3';

            return (
              <g key={edge.id} className="edge-group">
                <path
                  d={edge.pathD}
                  fill="none"
                  stroke="var(--theme-text-muted)"
                  strokeWidth={1.5}
                  strokeOpacity={0.6}
                  strokeDasharray={strokeDash}
                />
                {/* Edge count badge / label positioned without overlapping labels or other chips */}
                {edge.count !== undefined && edge.chipPos && (
                  <g transform={`translate(${edge.chipPos.x}, ${edge.chipPos.y})`}>
                    <circle
                      r={9}
                      fill="var(--theme-surface)"
                      stroke="var(--theme-border)"
                      strokeWidth={1}
                    />
                    <text
                      textAnchor="middle"
                      dy="3"
                      fontSize={10}
                      fill="var(--theme-text-muted)"
                      className="font-mono font-semibold select-none"
                    >
                      {edge.count}
                    </text>
                  </g>
                )}
                {isUnresolved && edge.chipPos && (
                  <text
                    x={edge.chipPos.x + 10}
                    y={edge.chipPos.y - 5}
                    fontSize={11}
                    fontWeight="bold"
                    fill="var(--severity-high)"
                  >
                    ?
                  </text>
                )}
              </g>
            );
          })}

          {/* Project Node in Center */}
          {projectNode && (
            <g
              data-testid={`graph-node-${projectNode.id}`}
              tabIndex={0}
              role="button"
              aria-label={`Project: ${projectNode.label}`}
              onClick={() => handleNodeClick(projectNode)}
              onKeyDown={(e) => handleKeyDown(e, projectNode)}
              className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime"
            >
              <NodeShape
                type="project"
                cx={projectNode.pos.x}
                cy={projectNode.pos.y}
                r={projectNode.radius}
                stroke="var(--theme-surface)"
                strokeWidth={3}
              />
              {/* Readable background for project label */}
              <rect
                x={projectNode.labelBox.x}
                y={projectNode.labelBox.y}
                width={projectNode.labelBox.width}
                height={projectNode.labelBox.height}
                rx={4}
                fill="var(--theme-surface)"
                fillOpacity={0.85}
              />
              <foreignObject
                x={projectNode.labelBox.x}
                y={projectNode.labelBox.y}
                width={projectNode.labelBox.width}
                height={projectNode.labelBox.height}
                className="overflow-visible"
              >
                <div
                  data-testid="overview-project-label"
                  title={projectNode.label}
                  className="project-label truncate font-heading font-bold text-xs text-theme-text text-center select-none"
                  style={{
                    width: `${projectNode.labelBox.width}px`,
                    maxWidth: `${projectNode.labelBox.width}px`,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: `${projectNode.labelBox.height}px`,
                  }}
                >
                  {projectNode.label}
                </div>
              </foreignObject>
            </g>
          )}

          {/* Module Nodes */}
          {moduleNodes.map((node) => {
            const isMostAffected = node.isMostAffected;
            const hasFindings = (node.findingCount ?? 0) > 0;

            return (
              <g
                key={node.id}
                data-testid={`graph-node-${node.id}`}
                tabIndex={0}
                role="button"
                aria-label={`Module ${node.label}, ${node.findingCount ?? 0} findings${isMostAffected ? ', Most affected' : ''}`}
                onClick={() => handleNodeClick(node)}
                onKeyDown={(e) => handleKeyDown(e, node)}
                className="cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime"
              >
                {/* Highlight outline for most affected module */}
                {isMostAffected && (
                  <circle
                    cx={node.pos.x}
                    cy={node.pos.y}
                    r={node.ringRadius || 26}
                    fill="none"
                    stroke="var(--severity-high)"
                    strokeWidth={3.5}
                    strokeDasharray="4 2"
                    className="animate-pulse motion-reduce:animate-none"
                  />
                )}

                <NodeShape
                  type="module"
                  cx={node.pos.x}
                  cy={node.pos.y}
                  r={node.radius}
                  stroke={isMostAffected ? 'var(--severity-high)' : 'var(--theme-surface)'}
                  strokeWidth={isMostAffected ? 3 : 2}
                />

                {/* Readable background for module label */}
                <rect
                  x={node.labelBox.x}
                  y={node.labelBox.y}
                  width={node.labelBox.width}
                  height={node.labelBox.height}
                  rx={3}
                  fill="var(--theme-surface)"
                  fillOpacity={0.85}
                />
                <text
                  x={node.pos.x}
                  y={node.labelBox.y + 11}
                  textAnchor="middle"
                  paintOrder="stroke fill"
                  stroke="var(--theme-surface)"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  className="font-heading font-medium text-[11px] fill-theme-text select-none"
                >
                  {node.label}
                </text>

                {/* Most affected text label with semantic tokens and sufficient padding */}
                {isMostAffected && (
                  <g transform={`translate(${node.pos.x}, ${node.pos.y - 34})`}>
                    <rect
                      x={-44}
                      y={-10}
                      width={88}
                      height={20}
                      rx={10}
                      fill="var(--pill-most-affected-bg)"
                    />
                    <text
                      textAnchor="middle"
                      dy={3.5}
                      fontSize={9}
                      fill="var(--pill-most-affected-text)"
                      className="font-bold select-none uppercase tracking-wider"
                    >
                      Most affected
                    </text>
                  </g>
                )}

                {/* Severity Badge / Finding count */}
                {hasFindings && node.maxSeverity && (
                  <foreignObject
                    x={node.pos.x - 28}
                    y={node.labelBox.y + node.labelBox.height + 2}
                    width={56}
                    height={24}
                    className="overflow-visible pointer-events-none"
                  >
                    <div className="flex justify-center">
                      <SeverityBadge severity={node.maxSeverity} size="sm">
                        {node.findingCount}
                      </SeverityBadge>
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}

          {/* Hidden edges count text when edges are capped */}
          {hiddenEdgesCount > 0 && (
            <text
              x={centerX}
              y={overflowModulesCount > 0 ? svgHeight - 28 : svgHeight - 15}
              textAnchor="middle"
              className="text-xs font-medium fill-theme-text-muted select-none"
            >
              +{hiddenEdgesCount} more connections, see the module list
            </text>
          )}

          {/* Overflow text if > 24 modules */}
          {overflowModulesCount > 0 && (
            <text
              x={centerX}
              y={svgHeight - 12}
              textAnchor="middle"
              className="text-xs font-medium fill-theme-text-muted select-none"
            >
              +{overflowModulesCount} more modules
            </text>
          )}
        </svg>
      </div>

      {/* Legend & Details */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-theme-text-muted pt-2 border-t border-theme-border/60">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-node-project inline-block" />
            <span>Project</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-node-module inline-block" />
            <span>Module</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-theme-text-muted inline-block" />
            <span>Resolved</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-t border-dashed border-theme-text-muted inline-block" />
            <span>Possible</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-t border-dotted border-theme-text-muted inline-block" />
            <span>Unresolved (?)</span>
          </div>
        </div>

        {/* Accessible Text Alternative */}
        <details className="cursor-pointer text-xs">
          <summary className="hover:text-theme-text font-medium">
            Accessible module list ({allModuleNodes.length})
          </summary>
          <ul className="mt-2 space-y-1 pl-4 list-disc max-h-32 overflow-y-auto">
            {allModuleNodes.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => handleNodeClick(m)}
                  className="hover:underline text-left text-theme-text"
                >
                  {m.label} &mdash; {m.findingCount ?? 0} findings
                  {m.id === mostAffectedModuleId ? ' (Most affected)' : ''}
                </button>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </Card>
  );
};
