import React, { useEffect, useState, useRef } from 'react';
import { ChevronsUpDown, Check, FolderGit2, AlertTriangle, RefreshCw } from 'lucide-react';
import { api, ApiClientError } from '../../lib/api.js';
import type { Project } from '../../../../shared/types.js';

export interface ProjectSwitcherProps {
  selectedProjectId?: string;
  onSelectProject?: (project: Project) => void;
  className?: string;
}

export const ProjectSwitcher: React.FC<ProjectSwitcherProps> = ({
  selectedProjectId,
  onSelectProject,
  className = '',
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchProjects = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getProjects();
      setProjects(data);
      if (data.length > 0) {
        const found = selectedProjectId
          ? data.find((p) => p.id === selectedProjectId) || data[0]
          : data[0];
        setSelected(found);
        if (onSelectProject && !selectedProjectId) {
          onSelectProject(found);
        }
      } else {
        setSelected(null);
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to load projects');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [selectedProjectId]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard escape
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // 1. Loading state
  if (isLoading) {
    return (
      <div
        data-testid="project-switcher-loading"
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-theme-border bg-theme-surface text-theme-text-muted text-xs animate-pulse motion-reduce:animate-none ${className}`}
      >
        <FolderGit2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate max-w-[120px]">Loading projects...</span>
      </div>
    );
  }

  // 2. Error state (backend down or API error)
  if (error) {
    return (
      <div
        data-testid="project-switcher-error"
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-severity-critical/40 bg-theme-surface text-severity-critical text-xs ${className}`}
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate max-w-[120px]">Backend error</span>
        <button
          type="button"
          onClick={fetchProjects}
          aria-label="Retry loading projects"
          className="p-1 rounded hover:bg-cream dark:hover:bg-slate-green/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-forest dark:focus-visible:ring-lime"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>
    );
  }

  // 3. Empty state (no projects)
  if (projects.length === 0) {
    return (
      <div
        data-testid="project-switcher-empty"
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-theme-border bg-theme-surface text-theme-text-muted text-xs ${className}`}
      >
        <FolderGit2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate max-w-[150px] font-medium">Upload your first project</span>
      </div>
    );
  }

  // 4. List state (with dropdown)
  return (
    <div
      ref={dropdownRef}
      onKeyDown={handleKeyDown}
      className={`relative inline-block text-left ${className}`}
    >
      <button
        type="button"
        data-testid="project-switcher-button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-theme-border bg-theme-surface text-theme-text text-xs sm:text-sm font-medium hover:bg-cream dark:hover:bg-slate-green/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime transition-colors duration-150 motion-reduce:transition-none"
      >
        <FolderGit2 className="w-4 h-4 text-theme-text-muted shrink-0" aria-hidden="true" />
        <span className="truncate max-w-[140px] sm:max-w-[200px]" data-testid="selected-project-name">
          {selected?.name || 'Select project'}
        </span>
        <ChevronsUpDown className="w-3.5 h-3.5 text-theme-text-muted shrink-0" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Projects"
          className="absolute left-0 mt-1.5 w-60 rounded-xl border border-theme-border bg-theme-surface shadow-lg z-50 py-1.5 overflow-hidden"
        >
          <div className="px-3 py-1.5 text-xs font-semibold text-theme-text-muted uppercase tracking-wider border-b border-theme-border">
            Projects ({projects.length})
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {projects.map((proj) => {
              const isCurrent = selected?.id === proj.id;
              return (
                <button
                  key={proj.id}
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => {
                    setSelected(proj);
                    if (onSelectProject) {
                      onSelectProject(proj);
                    }
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-cream dark:hover:bg-slate-green/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-forest dark:focus-visible:ring-lime transition-colors duration-150 motion-reduce:transition-none ${
                    isCurrent ? 'font-semibold text-theme-text bg-cream/60 dark:bg-slate-green/30' : 'text-theme-text-muted'
                  }`}
                >
                  <span className="truncate mr-2">{proj.name}</span>
                  {isCurrent && <Check className="w-3.5 h-3.5 shrink-0 text-theme-text" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
