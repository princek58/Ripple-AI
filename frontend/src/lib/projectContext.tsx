import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api, getFriendlyErrorMessage } from './api.js';
import type { Project } from '../../../shared/types.js';

export const STORAGE_KEY = 'ripple_selected_project_id';

export interface ProjectContextValue {
  projects: Project[];
  selectedProject: Project | null;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

function getStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors (private mode, quota exceeded, etc.)
  }
}

export interface ProjectProviderProps {
  children: React.ReactNode;
  initialProjectId?: string | null;
}

export const ProjectProvider: React.FC<ProjectProviderProps> = ({
  children,
  initialProjectId,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(
    () => initialProjectId !== undefined ? initialProjectId : getStoredId()
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const setSelectedProjectId = useCallback((id: string | null) => {
    setSelectedProjectIdState(id);
    setStoredId(id);
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getProjects();
      setProjects(data);

      setSelectedProjectIdState((prevId) => {
        const idToCheck = prevId ?? getStoredId();
        if (idToCheck && data.some((p) => p.id === idToCheck)) {
          setStoredId(idToCheck);
          return idToCheck;
        }

        // Fall back to newest project (first in list) or null
        const fallbackId = data.length > 0 ? data[0].id : null;
        setStoredId(fallbackId);
        return fallbackId;
      });
    } catch (err: unknown) {
      const friendly = getFriendlyErrorMessage(err);
      setError(friendly);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return projects.find((p) => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      selectedProject,
      selectedProjectId,
      setSelectedProjectId,
      isLoading,
      error,
      refresh,
    }),
    [projects, selectedProject, selectedProjectId, setSelectedProjectId, isLoading, error, refresh]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export function useProjects(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjects must be used within a ProjectProvider');
  }
  return context;
}

export function useProjectsOptional(): ProjectContextValue | null {
  return useContext(ProjectContext);
}
