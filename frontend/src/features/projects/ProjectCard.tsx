import React, { useState, useRef, useEffect } from 'react';
import {
  FolderGit2,
  Calendar,
  HardDrive,
  Clock,
  MoreVertical,
  Trash2,
  RefreshCw,
  ExternalLink,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import type { Project, ProjectSummary } from '../../../../shared/types.js';
import { formatBytes, formatDate } from '../../lib/format.js';
import { SeverityBadge } from '../../components/ui/SeverityBadge.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';

export interface ProjectSummaryState {
  data?: ProjectSummary;
  loading: boolean;
  error: boolean;
}

export interface ProjectCardProps {
  project: Project;
  summaryState?: ProjectSummaryState;
  onOpen: (project: Project) => void;
  onRescan: (project: Project) => Promise<void>;
  onDelete: (project: Project) => Promise<void>;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  summaryState,
  onOpen,
  onRescan,
  onDelete,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close dropdown menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  // Focus trap and Escape listener for Delete confirmation dialog
  useEffect(() => {
    if (!isConfirmOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeConfirmDialog();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Initial focus on the cancel button for safety
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const cancelBtn = dialogRef.current.querySelector<HTMLElement>(
          '[data-testid="cancel-delete-button"]'
        );
        cancelBtn?.focus();
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isConfirmOpen]);

  const closeConfirmDialog = () => {
    setIsConfirmOpen(false);
    if (deleteTriggerRef.current) {
      deleteTriggerRef.current.focus();
    }
  };

  const handleOpenConfirm = () => {
    setIsMenuOpen(false);
    setIsConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(project);
    } finally {
      setIsDeleting(false);
      setIsConfirmOpen(false);
    }
  };

  const handleRescanClick = async () => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      await onRescan(project);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <Card
      data-testid={`project-card-${project.id}`}
      className="p-5 flex flex-col justify-between hover:border-theme-border/90 transition-shadow duration-150 motion-reduce:transition-none"
    >
      <div className="space-y-4">
        {/* Card Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-forest/10 dark:bg-lime/10 text-forest dark:text-lime flex items-center justify-center shrink-0">
              <FolderGit2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="font-heading font-semibold text-base text-theme-text truncate" title={project.name}>
                {project.name}
              </h3>
              <p className="text-xs text-theme-text-muted flex items-center gap-1.5 mt-0.5">
                <Calendar className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{formatDate(project.created_at)}</span>
                <span aria-hidden="true">•</span>
                <HardDrive className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{formatBytes(project.size_bytes)}</span>
              </p>
            </div>
          </div>

          {/* Menu with Delete */}
          <div ref={menuRef} className="relative shrink-0">
            <button
              ref={deleteTriggerRef}
              type="button"
              data-testid={`project-menu-button-${project.id}`}
              aria-label={`Project options for ${project.name}`}
              aria-haspopup="true"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="p-1.5 rounded-lg text-theme-text-muted hover:bg-cream dark:hover:bg-slate-green/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime"
            >
              <MoreVertical className="w-4 h-4" aria-hidden="true" />
            </button>

            {isMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-44 rounded-xl border border-theme-border bg-theme-surface shadow-lg z-30 py-1"
              >
                <button
                  type="button"
                  role="menuitem"
                  data-testid={`project-delete-trigger-${project.id}`}
                  onClick={handleOpenConfirm}
                  className="w-full text-left px-3 py-2 text-xs text-severity-critical flex items-center gap-2 hover:bg-severity-critical/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-severity-critical"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Delete project</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Languages as chips */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium text-theme-text-muted uppercase tracking-wider">Languages</span>
          <div className="flex flex-wrap gap-1.5" aria-label="Languages">
            {project.languages && project.languages.length > 0 ? (
              project.languages.map((lang) => (
                <span
                  key={lang}
                  data-testid="language-chip"
                  className="px-2 py-0.5 rounded-full text-xs font-medium bg-theme-border/40 text-theme-text-muted border border-theme-border"
                >
                  {lang}
                </span>
              ))
            ) : (
              <span className="text-xs text-theme-text-muted">None detected</span>
            )}
          </div>
        </div>

        {/* Last scan status */}
        <div className="flex items-center gap-1.5 text-xs text-theme-text-muted">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Last scan: {project.last_scan_at ? formatDate(project.last_scan_at) : 'Not scanned yet'}</span>
        </div>

        {/* Findings / Severity Badges from Summary */}
        <div className="pt-2 border-t border-theme-border/60 space-y-1.5">
          <span className="text-[11px] font-medium text-theme-text-muted uppercase tracking-wider">Findings summary</span>
          {summaryState?.loading ? (
            <div data-testid="summary-skeleton" className="flex items-center gap-2 py-1">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          ) : summaryState?.error ? (
            <div data-testid="summary-unavailable" className="py-1">
              <span className="text-xs text-theme-text-muted italic">Summary unavailable</span>
            </div>
          ) : summaryState?.data ? (
            <div data-testid="summary-badges" className="flex flex-wrap items-center gap-1.5" aria-label="Findings severity">
              <SeverityBadge severity="critical" size="sm" label={`${summaryState.data.bySeverity.critical} critical`}>
                {summaryState.data.bySeverity.critical}
              </SeverityBadge>
              <SeverityBadge severity="high" size="sm" label={`${summaryState.data.bySeverity.high} high`}>
                {summaryState.data.bySeverity.high}
              </SeverityBadge>
              <SeverityBadge severity="medium" size="sm" label={`${summaryState.data.bySeverity.medium} medium`}>
                {summaryState.data.bySeverity.medium}
              </SeverityBadge>
              <SeverityBadge severity="low" size="sm" label={`${summaryState.data.bySeverity.low} low`}>
                {summaryState.data.bySeverity.low}
              </SeverityBadge>
            </div>
          ) : (
            <div data-testid="summary-skeleton" className="flex items-center gap-2 py-1">
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          )}
        </div>
      </div>

      {/* Card Actions */}
      <div className="mt-5 pt-3 border-t border-theme-border flex items-center justify-between gap-2">
        <Button
          variant="secondary"
          size="sm"
          data-testid={`rescan-button-${project.id}`}
          disabled={isScanning}
          onClick={handleRescanClick}
          aria-label={isScanning ? 'Scanning project' : `Re-scan ${project.name}`}
        >
          {isScanning ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" aria-hidden="true" />
              Scanning...
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
              Re-scan
            </>
          )}
        </Button>

        <Button
          variant="primary"
          size="sm"
          data-testid={`open-project-button-${project.id}`}
          onClick={() => onOpen(project)}
          aria-label={`Open ${project.name}`}
        >
          Open
          <ExternalLink className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
        </Button>
      </div>

      {/* Accessible Delete Confirmation Dialog */}
      {isConfirmOpen && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`delete-title-${project.id}`}
          aria-describedby={`delete-desc-${project.id}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-text/40 backdrop-blur-xs"
        >
          <div
            ref={dialogRef}
            className="w-full max-w-md rounded-2xl border border-theme-border bg-theme-surface shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none text-theme-text"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-severity-critical/10 text-severity-critical flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id={`delete-title-${project.id}`} className="font-heading font-bold text-lg text-theme-text">
                  Delete project
                </h3>
                <p id={`delete-desc-${project.id}`} className="mt-1 text-xs sm:text-sm text-theme-text-muted">
                  Are you sure you want to delete <strong className="text-theme-text">{project.name}</strong>? The project's stored files and findings will be removed permanently. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                size="sm"
                data-testid="cancel-delete-button"
                disabled={isDeleting}
                onClick={closeConfirmDialog}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                data-testid="confirm-delete-button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
              >
                {isDeleting ? 'Deleting...' : 'Delete project'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
