import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { X, ArrowLeft, Maximize2, RefreshCw, AlertCircle, ShieldAlert } from 'lucide-react';
import { api, ApiClientError, getFriendlyErrorMessage } from '../../lib/api.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';
import { ConfidenceBadge } from '../../components/ui/ConfidenceBadge.js';
import { VerificationBadge } from '../../components/ui/VerificationBadge.js';
import { NodeShape, NODE_SHAPE_DESCRIPTIONS } from './nodeShapes.js';
import type { NodeDetailsData, NodeType } from '../../../../shared/types.js';

export interface NodeDetailsPanelProps {
  projectId: string;
  nodeId: string | null;
  onClose: () => void;
  onNavigateNode: (nodeId: string) => void;
  onExpand: (nodeId: string, nodeType: string, depth?: number) => void;
  onBackToLevel1: () => void;
  className?: string;
}

export const NodeDetailsPanel: React.FC<NodeDetailsPanelProps> = ({
  projectId,
  nodeId,
  onClose,
  onNavigateNode,
  onExpand,
  onBackToLevel1,
  className = '',
}) => {
  const [data, setData] = useState<NodeDetailsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [is404, setIs404] = useState<boolean>(false);
  const [selectedDepth, setSelectedDepth] = useState<number>(1);

  const activeAbortRef = useRef<AbortController | null>(null);
  const requestedNodeIdRef = useRef<string | null>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Capture currently focused element to return focus when closed
  useEffect(() => {
    if (nodeId) {
      previousFocusedElementRef.current = document.activeElement as HTMLElement;
    }
  }, [nodeId]);

  // Handle Escape key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        previousFocusedElementRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch node details with stale response protection
  const fetchDetails = useCallback(
    async (targetNodeId: string) => {
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
      }
      const controller = new AbortController();
      activeAbortRef.current = controller;
      requestedNodeIdRef.current = targetNodeId;

      setIsLoading(true);
      setError(null);
      setIs404(false);

      try {
        const details = await api.getNodeDetails(projectId, targetNodeId, controller.signal);

        // Ignore response if user switched to another node
        if (requestedNodeIdRef.current !== targetNodeId || controller.signal.aborted) {
          return;
        }

        setData(details);
        setIsLoading(false);
      } catch (err: unknown) {
        if (controller.signal.aborted || requestedNodeIdRef.current !== targetNodeId) {
          return;
        }

        setIsLoading(false);
        if (err instanceof ApiClientError && err.status === 404) {
          setIs404(true);
        } else {
          setError(getFriendlyErrorMessage(err));
        }
      }
    },
    [projectId]
  );

  useEffect(() => {
    if (nodeId) {
      fetchDetails(nodeId);
    } else {
      setData(null);
      setIsLoading(false);
      setError(null);
      setIs404(false);
    }
  }, [nodeId, fetchDetails]);

  if (!nodeId) return null;

  const handleClose = () => {
    onClose();
    previousFocusedElementRef.current?.focus();
  };

  const isSensitive = Boolean(
    data?.node.language === 'Environment' ||
      data?.node.path.includes('.env') ||
      (typeof data?.node.meta_json === 'string' && data?.node.meta_json.includes('sensitive'))
  );

  const nodeType = (data?.node.type as NodeType) || 'backend';
  const shapeInfo = NODE_SHAPE_DESCRIPTIONS[nodeType] || {
    shape: 'Circle',
    colorVar: 'var(--node-module)',
  };

  const handleExpand = () => {
    if (!data) return;
    const clampedDepth = Math.max(1, Math.min(3, selectedDepth));
    onExpand(data.node.id, data.node.type, clampedDepth);
  };

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Node details"
      data-testid="node-details-panel"
      className={`fixed md:absolute inset-0 md:inset-y-0 md:right-0 md:left-auto w-full md:w-96 bg-theme-surface border-l border-theme-border shadow-2xl z-40 flex flex-col overflow-hidden ${className}`}
    >
      {/* Top Header */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-theme-border bg-theme-surface/90">
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 32 32" aria-hidden="true">
            <NodeShape type={nodeType} cx={16} cy={16} r={12} />
          </svg>
          <div className="flex flex-col min-w-0">
            <h2 className="text-sm font-heading font-bold text-theme-text truncate">
              {data?.node.label || 'Node Details'}
            </h2>
            <span className="text-[10px] text-theme-text-muted capitalize">
              {nodeType} ({shapeInfo.shape})
            </span>
          </div>
        </div>

        <button
          type="button"
          data-testid="close-details-btn"
          aria-label="Close details"
          onClick={handleClose}
          className="p-1 rounded-lg text-theme-text-muted hover:text-theme-text hover:bg-theme-surface-active transition-colors"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {isLoading && (
          <div data-testid="details-loading" className="space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        )}

        {is404 && !isLoading && (
          <div
            data-testid="details-404"
            className="flex flex-col items-center justify-center p-6 text-center space-y-2 border border-theme-border rounded-xl bg-theme-surface-active"
          >
            <AlertCircle className="w-6 h-6 text-theme-text-muted" aria-hidden="true" />
            <p className="font-medium text-theme-text">This node is not in the selected project</p>
            <button
              type="button"
              onClick={onBackToLevel1}
              className="text-theme-primary font-semibold hover:underline"
            >
              Back to Level 1
            </button>
          </div>
        )}

        {error && !isLoading && !is404 && (
          <div
            data-testid="details-error"
            className="flex flex-col items-center justify-center p-6 text-center space-y-2 border border-theme-border rounded-xl bg-theme-surface-active"
          >
            <AlertCircle className="w-6 h-6 text-theme-text-muted" aria-hidden="true" />
            <p className="text-theme-text">{error}</p>
            <button
              type="button"
              onClick={() => nodeId && fetchDetails(nodeId)}
              className="flex items-center gap-1 text-theme-primary font-semibold hover:underline"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && !is404 && data && (
          <>
            {/* Monospace Path Block */}
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wider">
                File Path
              </span>
              <div
                data-testid="details-path"
                className="font-mono text-[11px] bg-theme-surface-active px-2.5 py-1.5 rounded-lg border border-theme-border break-all select-all text-theme-text"
              >
                {data.node.path}
              </div>
            </div>

            {/* Sensitive File Redaction */}
            {isSensitive ? (
              <div
                data-testid="sensitive-file-note"
                className="flex items-start gap-2.5 p-3 rounded-xl border border-theme-border bg-theme-surface-active text-theme-text-muted"
              >
                <ShieldAlert className="w-4 h-4 text-theme-text-muted flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-theme-text">Sensitive configuration file</p>
                  <p className="text-[11px]">
                    Environment variables and configuration file details are protected. Source and metadata are redacted.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Line Numbers & Source Notice */}
                <div className="p-3 rounded-xl border border-theme-border bg-theme-surface-active/50 space-y-1">
                  <div className="font-mono text-xs text-theme-text font-medium">
                    {data.lineRange?.start
                      ? `Lines ${data.lineRange.start}${
                          data.lineRange.end && data.lineRange.end !== data.lineRange.start
                            ? ` – ${data.lineRange.end}`
                            : ''
                        }`
                      : 'Entire file'}
                  </div>
                  <p className="text-[11px] text-theme-text-muted italic">
                    Source code is not displayed in Phase 1
                  </p>
                </div>

                {/* Parent Module */}
                {data.parentModule && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wider">
                      Parent Module
                    </span>
                    <div>
                      <button
                        type="button"
                        data-testid="parent-module-link"
                        onClick={() => onNavigateNode(data.parentModule!.id)}
                        className="text-theme-primary hover:underline font-medium text-xs text-left"
                      >
                        {data.parentModule.label} ({data.parentModule.path})
                      </button>
                    </div>
                  </div>
                )}

                {/* Incoming Edges */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wider">
                    Incoming Connections ({data.incomingEdges.length})
                  </span>
                  {data.incomingEdges.length === 0 ? (
                    <p className="text-theme-text-muted italic text-[11px]">No incoming connections</p>
                  ) : (
                    <ul className="space-y-1" data-testid="incoming-edges-list">
                      {data.incomingEdges.map((edge) => (
                        <li
                          key={edge.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-theme-surface-active/60 border border-theme-border/60"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[10px] font-medium text-theme-text-muted uppercase">
                              {edge.relation}
                            </span>
                            <span className="text-theme-text-muted">←</span>
                            <button
                              type="button"
                              onClick={() => onNavigateNode(edge.otherNode.id)}
                              className="text-theme-primary font-medium hover:underline truncate max-w-[140px] text-left"
                            >
                              {edge.otherNode.label}
                            </button>
                          </div>
                          <span className="text-[10px] text-theme-text-muted capitalize flex-shrink-0">
                            {edge.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Outgoing Edges */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wider">
                    Outgoing Connections ({data.outgoingEdges.length})
                  </span>
                  {data.outgoingEdges.length === 0 ? (
                    <p className="text-theme-text-muted italic text-[11px]">No outgoing connections</p>
                  ) : (
                    <ul className="space-y-1" data-testid="outgoing-edges-list">
                      {data.outgoingEdges.map((edge) => (
                        <li
                          key={edge.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-theme-surface-active/60 border border-theme-border/60"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[10px] font-medium text-theme-text-muted uppercase">
                              {edge.relation}
                            </span>
                            <span className="text-theme-text-muted">→</span>
                            <button
                              type="button"
                              onClick={() => onNavigateNode(edge.otherNode.id)}
                              className="text-theme-primary font-medium hover:underline truncate max-w-[140px] text-left"
                            >
                              {edge.otherNode.label}
                            </button>
                          </div>
                          <span className="text-[10px] text-theme-text-muted capitalize flex-shrink-0">
                            {edge.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Related Findings */}
                <div className="space-y-2">
                  <span className="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wider">
                    Related Findings ({data.relatedFindings.length})
                  </span>

                  {data.relatedFindings.length === 0 ? (
                    <div data-testid="no-findings-banner" className="p-3 rounded-xl border border-theme-border bg-theme-surface-active/40 space-y-1">
                      <p className="font-semibold text-theme-text">
                        No findings for this node from the 6 automated checks
                      </p>
                      <p className="text-[11px] text-theme-text-muted">
                        No findings does not mean no problems: Phase 1 runs only 6 static checks and executes no code.
                      </p>
                    </div>
                  ) : (
                    <ul className="space-y-2" data-testid="findings-list">
                      {data.relatedFindings.map((finding) => (
                        <li
                          key={finding.id}
                          data-testid={`finding-item-${finding.id}`}
                          className="p-2.5 rounded-xl border border-theme-border bg-theme-surface-active/50 space-y-1.5"
                        >
                          <Link
                            to={`/app/investigations?finding=${finding.id}`}
                            className="font-medium text-theme-text hover:text-theme-primary transition-colors block text-xs"
                          >
                            {finding.title}
                          </Link>

                          {/* 3 Separate Badges: Severity, Confidence, Verification */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <SeverityBadge severity={finding.severity} size="sm" />
                            <ConfidenceBadge confidence={finding.confidence} size="sm" />
                            <VerificationBadge verification={finding.verification} size="sm" />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Footer Controls: Expand & Back to Level 1 */}
      {!isLoading && !is404 && data && (
        <div className="flex-shrink-0 p-4 border-t border-theme-border bg-theme-surface/90 flex flex-col gap-2.5">
          {/* Depth Selector for level 3 */}
          {data.node.type !== 'module' && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-theme-text-muted">Neighbourhood depth:</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDepth(d)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
                      selectedDepth === d
                        ? 'bg-theme-primary text-theme-primary-foreground border-theme-primary'
                        : 'bg-theme-surface border-theme-border text-theme-text-muted hover:text-theme-text'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="expand-node-btn"
              onClick={handleExpand}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-theme-primary text-theme-primary-foreground font-semibold text-xs hover:opacity-90 transition-opacity"
            >
              <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
              {data.node.type === 'module' ? 'Expand module' : `Expand neighbourhood (depth ${selectedDepth})`}
            </button>

            <button
              type="button"
              data-testid="panel-back-to-l1-btn"
              onClick={onBackToLevel1}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-theme-border bg-theme-surface hover:bg-theme-surface-active text-theme-text text-xs font-medium transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Level 1
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
