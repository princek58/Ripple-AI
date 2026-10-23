import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GraphResponseData, GraphNode, FindingSeverity } from '../../../../shared/types.js';
import { NodeShape } from '../graph/nodeShapes.js';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';
import { Card } from '../../components/ui/Card.js';

export interface ProjectGraphCardProps {
  graphData: GraphResponseData;
  className?: string;
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  unknown: 1,
};

export const ProjectGraphCard: React.FC<ProjectGraphCardProps> = ({
  graphData,
  className = '',
}) => {
  const navigate = useNavigate();

  const projectNode = useMemo(
    () => graphData.nodes.find((n) => n.type === 'project'),
    [graphData.nodes]
  );

  const moduleNodes = useMemo(
    () => graphData.nodes.filter((n) => n.type === 'module'),
    [graphData.nodes]
  );

  // Cap at 24 modules
  const MAX_DISPLAYED_MODULES = 24;
  const displayedModules = useMemo(
    () => moduleNodes.slice(0, MAX_DISPLAYED_MODULES),
    [moduleNodes]
  );
  const overflowCount = moduleNodes.length - displayedModules.length;

  // Identify highest maxSeverity module
  const mostAffectedModuleId = useMemo(() => {
    let topModuleId: string | null = null;
    let highestRank = -1;
    let highestCount = -1;

    for (const m of moduleNodes) {
      if (m.maxSeverity && (m.findingCount ?? 0) > 0) {
        const rank = SEVERITY_ORDER[m.maxSeverity] ?? 0;
        const count = m.findingCount ?? 0;
        if (rank > highestRank || (rank === highestRank && count > highestCount)) {
          highestRank = rank;
          highestCount = count;
          topModuleId = m.id;
        }
      }
    }
    return topModuleId;
  }, [moduleNodes]);

  // SVG layout dimensions
  const svgWidth = 640;
  const svgHeight = 440;
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;
  const orbitRadius = 145;

  // Node positions map
  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    if (projectNode) {
      map.set(projectNode.id, { x: centerX, y: centerY });
    }

    const count = displayedModules.length;
    displayedModules.forEach((mod, index) => {
      const angle = (2 * Math.PI * index) / (count || 1) - Math.PI / 2;
      const x = Math.round(centerX + orbitRadius * Math.cos(angle));
      const y = Math.round(centerY + orbitRadius * Math.sin(angle));
      map.set(mod.id, { x, y });
    });

    return map;
  }, [projectNode, displayedModules, centerX, centerY, orbitRadius]);

  const handleNodeClick = (node: GraphNode) => {
    navigate(`/app/graph?focus=${encodeURIComponent(node.id)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent, node: GraphNode) => {
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
          {displayedModules.map((mod) => {
            const pos = nodePositions.get(mod.id);
            if (!pos) return null;
            return (
              <line
                key={`spoke-${mod.id}`}
                x1={centerX}
                y1={centerY}
                x2={pos.x}
                y2={pos.y}
                stroke="var(--theme-border)"
                strokeWidth={1}
                strokeDasharray="2 2"
                aria-hidden="true"
              />
            );
          })}

          {/* Derived Module-to-Module Edges */}
          {graphData.edges.map((edge) => {
            const source = nodePositions.get(edge.source_id);
            const target = nodePositions.get(edge.target_id);
            if (!source || !target) return null;

            // Offset to prevent direct node overlap
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;

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
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="var(--theme-text-muted)"
                  strokeWidth={1.5}
                  strokeOpacity={0.6}
                  strokeDasharray={strokeDash}
                />
                {/* Edge count badge / label */}
                {edge.count !== undefined && (
                  <g transform={`translate(${midX}, ${midY})`}>
                    <circle r={9} fill="var(--theme-surface)" stroke="var(--theme-border)" strokeWidth={1} />
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
                {isUnresolved && (
                  <text
                    x={midX + 10}
                    y={midY - 5}
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
                cx={centerX}
                cy={centerY}
                r={28}
                stroke="var(--theme-surface)"
                strokeWidth={3}
              />
              <text
                x={centerX}
                y={centerY + 42}
                textAnchor="middle"
                className="font-heading font-bold text-xs fill-theme-text select-none"
              >
                {projectNode.label}
              </text>
            </g>
          )}

          {/* Module Nodes */}
          {displayedModules.map((node) => {
            const pos = nodePositions.get(node.id);
            if (!pos) return null;

            const isMostAffected = node.id === mostAffectedModuleId;
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
                    cx={pos.x}
                    cy={pos.y}
                    r={26}
                    fill="none"
                    stroke="var(--severity-high)"
                    strokeWidth={3.5}
                    strokeDasharray="4 2"
                    className="animate-pulse motion-reduce:animate-none"
                  />
                )}

                <NodeShape
                  type="module"
                  cx={pos.x}
                  cy={pos.y}
                  r={20}
                  stroke={isMostAffected ? 'var(--severity-high)' : 'var(--theme-surface)'}
                  strokeWidth={isMostAffected ? 3 : 2}
                />

                {/* Module Label */}
                <text
                  x={pos.x}
                  y={pos.y + 32}
                  textAnchor="middle"
                  className="font-heading font-medium text-[11px] fill-theme-text select-none"
                >
                  {node.label}
                </text>

                {/* Most affected text label */}
                {isMostAffected && (
                  <g transform={`translate(${pos.x}, ${pos.y - 32})`}>
                    <rect
                      x={-38}
                      y={-10}
                      width={76}
                      height={18}
                      rx={9}
                      fill="var(--severity-high)"
                      className="fill-severity-high"
                    />
                    <text
                      textAnchor="middle"
                      dy={3}
                      fontSize={9}
                      className="fill-cream font-bold select-none uppercase tracking-wider"
                    >
                      Most affected
                    </text>
                  </g>
                )}

                {/* Severity Badge / Finding count */}
                {hasFindings && node.maxSeverity && (
                  <foreignObject
                    x={pos.x - 28}
                    y={pos.y + 38}
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

          {/* Overflow text if > 24 modules */}
          {overflowCount > 0 && (
            <text
              x={centerX}
              y={svgHeight - 15}
              textAnchor="middle"
              className="text-xs font-medium fill-theme-text-muted select-none"
            >
              +{overflowCount} more modules
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
            Accessible module list ({moduleNodes.length})
          </summary>
          <ul className="mt-2 space-y-1 pl-4 list-disc max-h-32 overflow-y-auto">
            {moduleNodes.map((m) => (
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
