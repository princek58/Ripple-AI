import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, FolderGit2, AlertCircle } from 'lucide-react';
import { useProjects } from '../../lib/projectContext.js';
import { api } from '../../lib/api.js';
import { ProjectCard, ProjectSummaryState } from './ProjectCard.js';
import { UploadFlow } from './UploadFlow.js';
import { Button } from '../../components/ui/Button.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import type { Project, ProjectSummary } from '../../../../shared/types.js';

// Concurrency pool with maximum concurrent tasks limit
async function asyncPool<T, R>(
  poolLimit: number,
  array: T[],
  iteratorFn: (item: T) => Promise<R>
): Promise<R[]> {
  const ret: Promise<R>[] = [];
  const executing = new Set<Promise<R>>();
  for (const item of array) {
    const p: Promise<R> = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= poolLimit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(ret);
}

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { projects, isLoading, error, refresh, setSelectedProjectId } = useProjects();

  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, ProjectSummaryState>>({});
  const uploadButtonRef = useRef<HTMLButtonElement>(null);

  // Fetch summaries with concurrency limit 3
  const fetchSummariesForProjects = useCallback(async (projectList: Project[]) => {
    if (projectList.length === 0) return;

    // Set loading state for all projects initially
    setSummaries((prev) => {
      const next = { ...prev };
      for (const p of projectList) {
        if (!next[p.id] || next[p.id].error) {
          next[p.id] = { loading: true, error: false };
        }
      }
      return next;
    });

    await asyncPool(3, projectList, async (p) => {
      try {
        const data: ProjectSummary = await api.getSummary(p.id);
        setSummaries((prev) => ({
          ...prev,
          [p.id]: { data, loading: false, error: false },
        }));
      } catch {
        setSummaries((prev) => ({
          ...prev,
          [p.id]: { loading: false, error: true },
        }));
      }
    });
  }, []);

  useEffect(() => {
    if (projects.length > 0) {
      fetchSummariesForProjects(projects);
    }
  }, [projects, fetchSummariesForProjects]);

  // Client-side filter by name
  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, searchQuery]);

  const handleOpenProject = (project: Project) => {
    setSelectedProjectId(project.id);
    navigate('/app/overview');
  };

  const handleRescanProject = async (project: Project) => {
    await api.scanProject(project.id);
    await refresh();
    // Refetch summary for this specific project
    try {
      setSummaries((prev) => ({
        ...prev,
        [project.id]: { loading: true, error: false },
      }));
      const data = await api.getSummary(project.id);
      setSummaries((prev) => ({
        ...prev,
        [project.id]: { data, loading: false, error: false },
      }));
    } catch {
      setSummaries((prev) => ({
        ...prev,
        [project.id]: { loading: false, error: true },
      }));
    }
  };

  const handleDeleteProject = async (project: Project) => {
    await api.deleteProject(project.id);
    await refresh();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-theme-text tracking-tight">
            Projects
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-theme-text-muted">
            Manage your analyzed repositories, inspect findings, and initiate new code scans.
          </p>
        </div>

        <Button
          ref={uploadButtonRef}
          variant="primary"
          size="md"
          data-testid="upload-project-header-button"
          onClick={() => setIsUploadOpen(true)}
        >
          <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
          Upload project
        </Button>
      </div>

      {/* Search Input Bar (when not in full error state) */}
      {!error && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-theme-text-muted">
              <Search className="w-4 h-4" aria-hidden="true" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects by name..."
              aria-label="Search projects by name"
              data-testid="project-search-input"
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-theme-border bg-theme-surface text-theme-text placeholder:text-theme-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime"
            />
          </div>
        </div>
      )}

      {/* 1. Loading State: Skeletons */}
      {isLoading && (
        <div data-testid="projects-loading-skeletons" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-5 rounded-xl border border-theme-border bg-theme-surface space-y-4"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-lg" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-5 w-2/3 rounded-full" />
              <div className="pt-3 border-t border-theme-border flex justify-between">
                <Skeleton className="h-7 w-20 rounded-lg" />
                <Skeleton className="h-7 w-16 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. Error State */}
      {!isLoading && error && (
        <ErrorState
          title="Failed to load projects"
          message={error}
          onRetry={refresh}
        />
      )}

      {/* 3. Empty State (no projects exist) */}
      {!isLoading && !error && projects.length === 0 && (
        <EmptyState
          title="Upload your first project"
          description="Get started by uploading your project repository as a plain ZIP archive to analyze its architectural dependencies and security findings."
          icon={<FolderGit2 className="w-7 h-7 text-theme-text-muted" aria-hidden="true" />}
          action={
            <Button
              variant="primary"
              size="md"
              data-testid="upload-first-project-button"
              onClick={() => setIsUploadOpen(true)}
            >
              <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Upload project
            </Button>
          }
        />
      )}

      {/* 4. Filter empty state (search query returned 0 matches) */}
      {!isLoading && !error && projects.length > 0 && filteredProjects.length === 0 && (
        <div
          role="region"
          aria-label="No projects found"
          className="p-8 rounded-xl border border-dashed border-theme-border text-center space-y-2 bg-theme-surface/50"
        >
          <AlertCircle className="w-6 h-6 mx-auto text-theme-text-muted" aria-hidden="true" />
          <h3 className="font-heading font-medium text-sm text-theme-text">
            No projects match &quot;{searchQuery}&quot;
          </h3>
          <p className="text-xs text-theme-text-muted">
            Try adjusting your search query or clear the filter.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setSearchQuery('')}>
            Clear search
          </Button>
        </div>
      )}

      {/* 5. Projects Grid */}
      {!isLoading && !error && filteredProjects.length > 0 && (
        <div data-testid="projects-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              summaryState={summaries[project.id]}
              onOpen={handleOpenProject}
              onRescan={handleRescanProject}
              onDelete={handleDeleteProject}
            />
          ))}
        </div>
      )}

      {/* Upload Flow Dialog */}
      <UploadFlow
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        triggerRef={uploadButtonRef}
      />
    </div>
  );
};
