import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2, RefreshCw } from 'lucide-react';
import { api, getFriendlyErrorMessage } from '../../lib/api.js';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';
import type {
  GraphNode,
  NodeType,
  FindingSeverity,
  FindingVerification,
} from '../../../../shared/types.js';

export interface GraphSearchFiltersProps {
  projectId: string;
  onSelectResult: (node: GraphNode) => void;
  className?: string;
}

const NODE_TYPES: NodeType[] = [
  'frontend',
  'backend',
  'database',
  'api',
  'config',
  'test',
  'module',
  'project',
];

const SEVERITIES: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'unknown'];

const VERIFICATIONS: FindingVerification[] = [
  'not_tested',
  'reproduced',
  'fix_proposed',
  'fix_verified',
];

export const GraphSearchFilters: React.FC<GraphSearchFiltersProps> = ({
  projectId,
  onSelectResult,
  className = '',
}) => {
  const [query, setQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<NodeType | ''>('');
  const [selectedSeverity, setSelectedSeverity] = useState<FindingSeverity | ''>('');
  const [selectedVerification, setSelectedVerification] = useState<FindingVerification | ''>('');

  const [results, setResults] = useState<GraphNode[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const activeAbortRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Clear search and abort in-flight requests on project switch
  useEffect(() => {
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setQuery('');
    setSelectedType('');
    setSelectedSeverity('');
    setSelectedVerification('');
    setResults(null);
    setIsLoading(false);
    setError(null);
    setIsOpen(false);
  }, [projectId]);

  // Execute search API call
  const executeSearch = useCallback(
    async (
      q: string,
      type: NodeType | '',
      sev: FindingSeverity | '',
      ver: FindingVerification | ''
    ) => {
      // Abort previous in-flight request
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
      }

      // If all inputs are blank, close results
      if (!q.trim() && !type && !sev && !ver) {
        setResults(null);
        setIsLoading(false);
        setError(null);
        setIsOpen(false);
        return;
      }

      const controller = new AbortController();
      activeAbortRef.current = controller;

      setIsLoading(true);
      setError(null);
      setIsOpen(true);

      try {
        const response = await api.searchGraph(
          projectId,
          {
            q: q.trim() || undefined,
            type: (type as NodeType) || undefined,
            severity: (sev as FindingSeverity) || undefined,
            verification: (ver as FindingVerification) || undefined,
            limit: 25,
          },
          controller.signal
        );

        if (!controller.signal.aborted) {
          setResults(response.items);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setIsLoading(false);
        setError(getFriendlyErrorMessage(err));
      }
    },
    [projectId]
  );

  // Debounced search trigger (300 ms)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!query.trim() && !selectedType && !selectedSeverity && !selectedVerification) {
      setResults(null);
      setIsLoading(false);
      setIsOpen(false);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      executeSearch(query, selectedType, selectedSeverity, selectedVerification);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, selectedType, selectedSeverity, selectedVerification, executeSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  const handleClearFilters = () => {
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    setQuery('');
    setSelectedType('');
    setSelectedSeverity('');
    setSelectedVerification('');
    setResults(null);
    setIsLoading(false);
    setError(null);
    setIsOpen(false);
  };

  const handleSelect = (node: GraphNode) => {
    setIsOpen(false);
    onSelectResult(node);
  };

  const hasActiveFilters =
    Boolean(query) ||
    Boolean(selectedType) ||
    Boolean(selectedSeverity) ||
    Boolean(selectedVerification);

  return (
    <div ref={containerRef} className={`relative flex flex-col gap-2 ${className}`}>
      {/* Search Input and Filter Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Text Search Input */}
        <div className="relative flex-1 min-w-[150px] sm:min-w-[200px] max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            aria-label="Search nodes"
            placeholder="Search nodes (name, path)..."
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              if (results || isLoading || error) {
                setIsOpen(true);
              }
            }}
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-theme-surface border border-theme-border rounded-lg text-theme-text placeholder-theme-text-muted focus:outline-none focus:ring-1 focus:ring-theme-primary transition-colors"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search input"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-text-muted hover:text-theme-text transition-colors"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Filter: Node Type */}
        <select
          aria-label="Filter by type"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as NodeType | '')}
          className="text-xs bg-theme-surface border border-theme-border rounded-lg px-2.5 py-1.5 text-theme-text focus:outline-none focus:ring-1 focus:ring-theme-primary capitalize"
        >
          <option value="">All types</option>
          {NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {/* Filter: Finding Severity */}
        <select
          aria-label="Filter by severity"
          value={selectedSeverity}
          onChange={(e) => setSelectedSeverity(e.target.value as FindingSeverity | '')}
          className="text-xs bg-theme-surface border border-theme-border rounded-lg px-2.5 py-1.5 text-theme-text focus:outline-none focus:ring-1 focus:ring-theme-primary capitalize"
        >
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Filter: Finding Verification */}
        <select
          aria-label="Filter by verification"
          value={selectedVerification}
          onChange={(e) =>
            setSelectedVerification(e.target.value as FindingVerification | '')
          }
          className="text-xs bg-theme-surface border border-theme-border rounded-lg px-2.5 py-1.5 text-theme-text focus:outline-none focus:ring-1 focus:ring-theme-primary capitalize"
        >
          <option value="">All verifications</option>
          {VERIFICATIONS.map((v) => (
            <option key={v} value={v}>
              {v.replace('_', ' ')}
            </option>
          ))}
        </select>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <button
            type="button"
            data-testid="clear-filters-btn"
            onClick={handleClearFilters}
            className="flex items-center gap-1 text-xs text-theme-text-muted hover:text-theme-text px-2 py-1.5 rounded-lg border border-theme-border hover:bg-theme-surface-active transition-colors"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            Clear filters
          </button>
        )}
      </div>

      {/* Floating Results Dropdown */}
      {isOpen && (
        <div
          data-testid="search-results-dropdown"
          className="absolute top-full left-0 mt-1 w-full max-w-lg max-h-80 overflow-y-auto bg-theme-surface border border-theme-border rounded-xl shadow-lg z-30 p-2 space-y-1"
        >
          {isLoading && (
            <div
              data-testid="search-loading"
              className="flex items-center justify-center p-4 text-xs text-theme-text-muted gap-2"
            >
              <Loader2 className="w-4 h-4 animate-spin text-theme-primary" aria-hidden="true" />
              <span>Searching...</span>
            </div>
          )}

          {error && !isLoading && (
            <div
              data-testid="search-error"
              className="flex items-center justify-between p-3 rounded-lg bg-theme-surface-active border border-theme-border text-xs text-theme-text"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() =>
                  executeSearch(query, selectedType, selectedSeverity, selectedVerification)
                }
                className="flex items-center gap-1 font-semibold text-theme-primary hover:underline ml-2"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Retry
              </button>
            </div>
          )}

          {!isLoading && !error && results && results.length === 0 && (
            <div
              data-testid="no-matching-nodes"
              className="p-4 text-center text-xs text-theme-text-muted"
            >
              No matching nodes
            </div>
          )}

          {!isLoading && !error && results && results.length > 0 && (
            <ul role="listbox" aria-label="Search results" className="space-y-1">
              {results.map((node) => (
                <li
                  key={node.id}
                  role="option"
                  tabIndex={0}
                  aria-selected={false}
                  data-testid={`search-result-${node.id}`}
                  onClick={() => handleSelect(node)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSelect(node);
                    }
                  }}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-theme-surface-active focus:bg-theme-surface-active focus:outline-none cursor-pointer transition-colors"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-medium text-theme-text truncate">
                        {node.label}
                      </span>
                      <span className="text-[10px] text-theme-text-muted capitalize flex-shrink-0">
                        {node.type}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-theme-text-muted truncate">
                      {node.path}
                    </span>
                  </div>

                  {node.findingCount && node.findingCount > 0 && node.maxSeverity ? (
                    <SeverityBadge
                      severity={node.maxSeverity}
                      size="sm"
                      label={`${node.findingCount}`}
                      className="flex-shrink-0"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
