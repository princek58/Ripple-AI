import React from 'react';
import { GitPullRequest, CheckCircle2, XCircle, ChevronLeft, ChevronRight, FileCode } from 'lucide-react';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';
import { Button } from '../../components/ui/Button.js';
import { statusLabel } from './fixesPure.js';
import type { FixStatus, ProjectFixItem } from './fixesTypes.js';
import type { FindingSeverity } from '../../../../shared/types.js';

export interface FixListProps {
  items: ProjectFixItem[];
  total: number;
  page: number;
  pageSize?: number;
  selectedFixId?: string;
  statusFilter?: FixStatus | '';
  onStatusChange: (status: FixStatus | '') => void;
  onPageChange: (page: number) => void;
  onSelectFix: (fixId: string) => void;
  isLoading?: boolean;
}

const STATUS_TABS: Array<{ id: FixStatus | ''; label: string }> = [
  { id: '', label: 'All' },
  { id: 'proposed', label: 'Proposed' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

export const FixList: React.FC<FixListProps> = ({
  items,
  total,
  page,
  pageSize = 25,
  selectedFixId,
  statusFilter = '',
  onStatusChange,
  onPageChange,
  onSelectFix,
  isLoading = false,
}) => {
  // Calculate showing X to Y of Z
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Keyboard navigation for tablist
  const handleKeyDown = (e: React.KeyboardEvent, currentIdx: number) => {
    let nextIdx = currentIdx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIdx = (currentIdx + 1) % STATUS_TABS.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIdx = (currentIdx - 1 + STATUS_TABS.length) % STATUS_TABS.length;
    }
    if (nextIdx !== currentIdx) {
      onStatusChange(STATUS_TABS[nextIdx].id);
      const nextBtn = document.getElementById(`fix-status-tab-${STATUS_TABS[nextIdx].id || 'all'}`);
      nextBtn?.focus();
    }
  };

  const renderStatusIcon = (status: FixStatus) => {
    switch (status) {
      case 'proposed':
        return <GitPullRequest className="w-3.5 h-3.5 text-severity-medium shrink-0" aria-hidden="true" />;
      case 'approved':
        return <CheckCircle2 className="w-3.5 h-3.5 text-severity-low shrink-0" aria-hidden="true" />;
      case 'rejected':
        return <XCircle className="w-3.5 h-3.5 text-severity-high shrink-0" aria-hidden="true" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-theme-surface border border-theme-border rounded-xl overflow-hidden">
      {/* Header with Status Filter Radiogroup / Tabs */}
      <div className="p-3 border-b border-theme-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-semibold text-sm text-theme-text">Suggested Changes</h2>
          <span className="text-xs text-theme-text-muted">{total} total</span>
        </div>

        {/* Status Filter Tablist */}
        <div
          role="tablist"
          aria-label="Filter fixes by status"
          className="flex p-0.5 rounded-lg bg-theme-bg border border-theme-border/60"
        >
          {STATUS_TABS.map((tab, idx) => {
            const isSelected = statusFilter === tab.id;
            return (
              <button
                key={tab.id || 'all'}
                id={`fix-status-tab-${tab.id || 'all'}`}
                role="tab"
                type="button"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onStatusChange(tab.id)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                className={`flex-1 py-1 px-2 text-xs font-medium rounded-md transition-all text-center focus:outline-none focus:ring-2 focus:ring-theme-primary ${
                  isSelected
                    ? 'bg-theme-surface text-theme-text shadow-sm font-semibold border border-theme-border/50'
                    : 'text-theme-text-muted hover:text-theme-text'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Fix Items List */}
      <div className="flex-1 overflow-y-auto divide-y divide-theme-border/40" role="list">
        {items.length === 0 ? (
          <div className="p-8 text-center text-theme-text-muted text-xs">
            {statusFilter ? 'No fixes in this status' : 'No suggested changes yet'}
          </div>
        ) : (
          items.map((item) => {
            const isSelected = item.id === selectedFixId;
            const findingTitle = item.finding_title || 'Suggested change';
            const severity = (item.finding_severity || 'unknown') as FindingSeverity;
            const statusInfo = statusLabel(item.status);

            return (
              <div
                key={item.id}
                role="listitem"
                data-testid={`fix-row-${item.id}`}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => onSelectFix(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectFix(item.id);
                  }
                }}
                tabIndex={0}
                className={`p-3.5 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-theme-primary ${
                  isSelected
                    ? 'bg-theme-bg border-l-4 border-l-theme-primary font-medium'
                    : 'hover:bg-theme-bg/50 border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-theme-text line-clamp-2">
                    {findingTitle}
                  </span>
                  <SeverityBadge severity={severity} size="sm" />
                </div>

                {/* Status icon + text */}
                <div className="flex items-center space-x-1.5 text-xs text-theme-text-muted mb-2">
                  {renderStatusIcon(item.status)}
                  <span>{statusInfo.label}</span>
                </div>

                {/* Affected files */}
                {item.files && item.files.length > 0 && (
                  <div className="flex items-center space-x-1.5 text-[11px] text-theme-text-muted font-mono truncate">
                    <FileCode className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.files.join(', ')}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      <div className="p-2.5 border-t border-theme-border flex items-center justify-between text-xs text-theme-text-muted bg-theme-surface">
        <span>
          Showing {startItem} to {endItem} of {total}
        </span>
        <div className="flex items-center space-x-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || isLoading}
            aria-label="Previous page"
            className="p-1 h-7 w-7"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="px-1 text-xs">
            {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages || isLoading}
            aria-label="Next page"
            className="p-1 h-7 w-7"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
