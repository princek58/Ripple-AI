import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { Button } from '../../components/ui/Button.js';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';
import { ConfidenceBadge } from '../../components/ui/ConfidenceBadge.js';
import { VerificationBadge } from '../../components/ui/VerificationBadge.js';
import {
  ruleLabel,
  formatEvidence,
  VALID_SEVERITIES,
  VALID_CONFIDENCES,
  VALID_VERIFICATIONS,
  KNOWN_RULES,
} from './investigationsUrl.js';
import type {
  Finding,
  FindingSeverity,
  FindingConfidence,
  FindingVerification,
} from '../../../../shared/types.js';

export interface FindingListProps {
  findings: Finding[];
  total: number;
  page: number;
  pageSize: number;
  selectedFindingId?: string;
  onSelectFinding: (id: string) => void;
  severityFilter?: FindingSeverity;
  onSeverityChange: (sev?: FindingSeverity) => void;
  confidenceFilter?: FindingConfidence;
  onConfidenceChange: (conf?: FindingConfidence) => void;
  verificationFilter?: FindingVerification;
  onVerificationChange: (ver?: FindingVerification) => void;
  ruleFilter?: string;
  onRuleChange: (rule?: string) => void;
  searchQuery?: string;
  onSearchChange: (q: string) => void;
  onClearFilters: () => void;
  onPageChange: (newPage: number) => void;
  isLoading?: boolean;
  hasActiveFilters: boolean;
}

export const FindingList: React.FC<FindingListProps> = ({
  findings,
  total,
  page,
  pageSize,
  selectedFindingId,
  onSelectFinding,
  severityFilter,
  onSeverityChange,
  confidenceFilter,
  onConfidenceChange,
  verificationFilter,
  onVerificationChange,
  ruleFilter,
  onRuleChange,
  searchQuery = '',
  onSearchChange,
  onClearFilters,
  onPageChange,
  isLoading = false,
  hasActiveFilters,
}) => {
  // Local debounced text search state (300 ms)
  const [localSearch, setLocalSearch] = useState<string>(searchQuery);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local search when parent prop changes (e.g. URL update or clear filters)
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    setLocalSearch(nextVal);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onSearchChange(nextVal);
    }, 300);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Pagination calculation
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <div
      className="flex flex-col h-full bg-theme-surface border border-theme-border rounded-xl shadow-sm overflow-hidden"
      data-testid="finding-list-container"
    >
      {/* Search and Filters Header */}
      <div className="p-4 border-b border-theme-border bg-theme-surface/70 space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <label htmlFor="findings-search" className="sr-only">
            Search findings
          </label>
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-text-muted"
            aria-hidden="true"
          />
          <input
            id="findings-search"
            type="search"
            value={localSearch}
            onChange={handleSearchInput}
            placeholder="Search findings (e.g. fees, JWT)..."
            aria-label="Search findings by text"
            className="w-full pl-9 pr-8 py-1.5 text-sm rounded-lg bg-theme-bg border border-theme-border text-theme-text placeholder:text-theme-text-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime"
          />
          {localSearch && (
            <button
              type="button"
              onClick={() => {
                setLocalSearch('');
                onSearchChange('');
              }}
              aria-label="Clear search input"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-text-muted hover:text-theme-text p-0.5 rounded"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {/* Severity */}
          <div>
            <label htmlFor="filter-severity" className="sr-only">
              Filter by Severity
            </label>
            <select
              id="filter-severity"
              value={severityFilter ?? ''}
              onChange={(e) =>
                onSeverityChange(
                  e.target.value ? (e.target.value as FindingSeverity) : undefined
                )
              }
              aria-label="Filter findings by severity"
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-theme-border bg-theme-surface text-theme-text focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime cursor-pointer"
            >
              <option value="">All Severities</option>
              {VALID_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Confidence */}
          <div>
            <label htmlFor="filter-confidence" className="sr-only">
              Filter by Confidence
            </label>
            <select
              id="filter-confidence"
              value={confidenceFilter ?? ''}
              onChange={(e) =>
                onConfidenceChange(
                  e.target.value ? (e.target.value as FindingConfidence) : undefined
                )
              }
              aria-label="Filter findings by confidence"
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-theme-border bg-theme-surface text-theme-text focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime cursor-pointer"
            >
              <option value="">All Confidences</option>
              {VALID_CONFIDENCES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Verification */}
          <div>
            <label htmlFor="filter-verification" className="sr-only">
              Filter by Verification
            </label>
            <select
              id="filter-verification"
              value={verificationFilter ?? ''}
              onChange={(e) =>
                onVerificationChange(
                  e.target.value ? (e.target.value as FindingVerification) : undefined
                )
              }
              aria-label="Filter findings by verification"
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-theme-border bg-theme-surface text-theme-text focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime cursor-pointer"
            >
              <option value="">All Verifications</option>
              {VALID_VERIFICATIONS.map((v) => (
                <option key={v} value={v}>
                  {v === 'not_tested'
                    ? 'Not tested'
                    : v === 'reproduced'
                      ? 'Reproduced'
                      : v === 'fix_proposed'
                        ? 'Fix proposed'
                        : 'Fix verified'}
                </option>
              ))}
            </select>
          </div>

          {/* Rule */}
          <div>
            <label htmlFor="filter-rule" className="sr-only">
              Filter by Rule
            </label>
            <select
              id="filter-rule"
              value={ruleFilter ?? ''}
              onChange={(e) => onRuleChange(e.target.value || undefined)}
              aria-label="Filter findings by rule check"
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-theme-border bg-theme-surface text-theme-text focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime cursor-pointer"
            >
              <option value="">All Checks (6)</option>
              {Object.keys(KNOWN_RULES).map((r) => (
                <option key={r} value={r}>
                  {ruleLabel(r)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Clear Filters & Count Header */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-theme-text-muted">Filters applied</span>
            <button
              type="button"
              onClick={onClearFilters}
              className="text-xs font-medium text-forest dark:text-lime hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime rounded"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Findings List Rows */}
      <div
        className="flex-1 overflow-y-auto divide-y divide-theme-border/60 min-h-0"
        role="region"
        aria-label="Findings list"
      >
        {findings.length === 0 ? (
          <div className="p-8 text-center text-theme-text-muted" data-testid="findings-empty-state">
            {hasActiveFilters ? (
              <div className="space-y-3">
                <Filter className="w-8 h-8 mx-auto text-theme-text-muted/60" aria-hidden="true" />
                <p className="text-sm font-medium text-theme-text">No findings match these filters</p>
                <p className="text-xs text-theme-text-muted">
                  Try adjusting or clearing your search and filter criteria.
                </p>
                <Button variant="secondary" size="sm" onClick={onClearFilters}>
                  Clear filters
                </Button>
              </div>
            ) : (
              <p className="text-sm">No findings available</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-theme-border/60" role="list">
            {findings.map((f) => {
              const isSelected = f.id === selectedFindingId;
              const evidenceLoc = formatEvidence(f.evidence?.[0]);

              return (
                <div
                  key={f.id}
                  id={`finding-row-${f.id}`}
                  data-testid={`finding-row-${f.id}`}
                  role="button"
                  tabIndex={0}
                  aria-current={isSelected ? 'true' : undefined}
                  onClick={() => onSelectFinding(f.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectFinding(f.id);
                    }
                  }}
                  className={`p-3.5 text-left transition-colors cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime ${
                    isSelected
                      ? 'border-l-4 border-l-forest dark:border-l-lime bg-theme-surface-active font-semibold'
                      : 'border-l-4 border-l-transparent hover:bg-theme-surface-active/50'
                  }`}
                >
                  {/* Top line: Rule label & Evidence location */}
                  <div className="flex items-center justify-between text-xs text-theme-text-muted mb-1 gap-2">
                    <span className="font-medium text-theme-text/80 truncate">
                      {ruleLabel(f.rule_id)}
                    </span>
                    {evidenceLoc && (
                      <span className="font-code text-[11px] shrink-0 text-theme-text-muted truncate max-w-[180px]">
                        {evidenceLoc}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3
                    className={`text-sm tracking-tight leading-snug mb-2 line-clamp-2 ${
                      isSelected ? 'text-theme-text font-bold' : 'text-theme-text font-medium'
                    }`}
                  >
                    {f.title}
                  </h3>

                  {/* Three Separate Badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SeverityBadge severity={f.severity} size="sm" />
                    <ConfidenceBadge confidence={f.confidence} size="sm" />
                    <VerificationBadge verification={f.verification} size="sm" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      <div className="p-3 border-t border-theme-border bg-theme-surface/80 flex items-center justify-between text-xs text-theme-text-muted shrink-0">
        <span data-testid="pagination-info" className="font-medium">
          Showing {startItem} to {endItem} of {total} findings
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={!hasPrevious || isLoading}
            aria-label="Previous page"
            className="px-2 py-1"
          >
            <ChevronLeft className="w-3.5 h-3.5 mr-0.5" aria-hidden="true" />
            Prev
          </Button>
          <span className="px-2 text-theme-text font-medium">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNext || isLoading}
            aria-label="Next page"
            className="px-2 py-1"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5 ml-0.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
};
