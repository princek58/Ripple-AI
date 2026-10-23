import React from 'react';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
import type { FlowNodeData, FlowEdgeData } from './graphTransform.js';
import type { GraphEdge } from '../../../../shared/types.js';

export interface GraphTextAlternativeProps {
  flowNodes: FlowNode<FlowNodeData>[];
  flowEdges: FlowEdge<FlowEdgeData>[];
  unmappedEdges: GraphEdge[];
  clustersCount: number;
  className?: string;
}

export const GraphTextAlternative: React.FC<GraphTextAlternativeProps> = ({
  flowNodes,
  flowEdges,
  unmappedEdges,
  clustersCount,
  className = '',
}) => {
  return (
    <details
      data-testid="graph-text-alternative"
      className={`border border-theme-border rounded-xl p-3 bg-theme-surface text-xs text-theme-text shadow-sm ${className}`}
    >
      <summary className="font-semibold cursor-pointer hover:text-theme-primary focus:outline-none focus:ring-1 focus:ring-theme-primary rounded select-none py-0.5">
        Accessible Graph Structure (Text Alternative)
      </summary>

      <div className="mt-3 space-y-4 pt-3 border-t border-theme-border">
        {/* Nodes List */}
        <div className="space-y-1.5">
          <h3 className="font-semibold text-theme-text">
            Visible Nodes ({flowNodes.length})
          </h3>
          <ul className="list-disc list-inside space-y-1 pl-1 text-theme-text-muted">
            {flowNodes.map((n) => (
              <li key={n.id}>
                <span className="font-medium text-theme-text">{n.data.label}</span>{' '}
                <span>
                  [{n.data.nodeType || 'node'}
                  {n.data.findingCount ? `, ${n.data.findingCount} findings` : ''}
                  {n.data.clusterCount ? `, ${n.data.clusterCount} clustered nodes` : ''}
                  {n.data.specifier ? `, specifier: ${n.data.specifier}` : ''}]
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Edges List */}
        <div className="space-y-1.5">
          <h3 className="font-semibold text-theme-text">
            Graph Edges ({flowEdges.length})
          </h3>
          {flowEdges.length === 0 ? (
            <p className="text-theme-text-muted italic">No connected edges in this view.</p>
          ) : (
            <ul className="list-disc list-inside space-y-1 pl-1 text-theme-text-muted font-mono text-[11px]">
              {flowEdges.map((e) => (
                <li key={e.id}>
                  <span className="text-theme-text">{e.source}</span>
                  {' '}—[{e.data?.relation || 'relates'} ({e.data?.status || 'resolved'}
                  {e.data?.count && e.data.count > 1 ? `, count: ${e.data.count}` : ''})
                  ]—&gt;{' '}
                  <span className="text-theme-text">{e.target}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Clusters Count */}
        {clustersCount > 0 && (
          <div className="space-y-1">
            <h3 className="font-semibold text-theme-text">Clustered Nodes</h3>
            <p className="text-theme-text-muted">
              {clustersCount} additional nodes grouped into clusters due to view limits.
            </p>
          </div>
        )}

        {/* Unmapped Boundary Edges */}
        {unmappedEdges.length > 0 && (
          <div
            data-testid="unmapped-edges-section"
            className="space-y-1.5 p-2.5 rounded-lg bg-theme-surface-active border border-theme-border"
          >
            <h3 className="font-semibold text-theme-text">
              Unmapped Items ({unmappedEdges.length})
            </h3>
            <p className="text-[11px] text-theme-text-muted">
              These edges reference module IDs that are not present in the current level node set:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 text-theme-text-muted font-mono text-[11px]">
              {unmappedEdges.map((e) => (
                <li key={e.id}>
                  {e.source_id} —[{e.relation} ({e.status}{e.count ? `, count: ${e.count}` : ''})]—&gt; {e.target_id}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
};
