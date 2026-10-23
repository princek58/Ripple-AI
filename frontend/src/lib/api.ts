import type { Project, Scan, ProjectSummary, Finding, Fix, TestRun, Report, ApiResponse } from '../../../shared/types.js';

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
}

export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const REASON_CODE_EXPLANATIONS: Record<string, string> = {
  ZIP_UNSAFE_PATH: 'Archive contains unsafe file paths [ZIP_UNSAFE_PATH]',
  ZIP_TOO_MANY_FILES: 'Archive contains too many files [ZIP_TOO_MANY_FILES]',
  ZIP_BOMB: 'Archive compression ratio is suspiciously high [ZIP_BOMB]',
  ZIP_TOO_LARGE: 'Extracted archive size exceeds allowed limit [ZIP_TOO_LARGE]',
};

export function getFriendlyErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.status === 400) {
      return 'This is not a valid ZIP file';
    }
    if (err.status === 413) {
      return 'File is too large';
    }
    if (err.status === 422) {
      const code = err.code || '';
      const msg = err.message || '';
      for (const [reasonCode, explanation] of Object.entries(REASON_CODE_EXPLANATIONS)) {
        if (code === reasonCode || msg.includes(reasonCode)) {
          return explanation;
        }
      }
      return 'Archive could not be processed';
    }
    if (err.status === 429) {
      return 'Too many uploads at once, try again shortly';
    }
    if (err.status === 404) {
      return 'Project not found';
    }
    if (!err.status || err.status === 0 || err.code === 'NETWORK_ERROR' || err.status >= 500) {
      return 'Backend is not reachable';
    }
    return 'Backend is not reachable';
  }

  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.message.includes('abort') || err.message.includes('aborted')) {
      return 'Request cancelled';
    }
    return 'Backend is not reachable';
  }

  return 'Backend is not reachable';
}

export async function apiFetch<T>(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { timeoutMs = 10000, signal: externalSignal, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let onUserAbort: (() => void) | undefined;
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      onUserAbort = () => controller.abort();
      externalSignal.addEventListener('abort', onUserAbort, { once: true });
    }
  }

  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };

  // If body is FormData (e.g. multipart upload), do NOT set Content-Type header manually
  if (fetchOptions.body instanceof FormData) {
    delete headers['Content-Type'];
  } else if (!headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);
    if (externalSignal && onUserAbort) {
      externalSignal.removeEventListener('abort', onUserAbort);
    }

    // Handle non-JSON response (e.g. text/markdown)
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/markdown') || contentType.includes('text/plain')) {
      const text = await res.text();
      if (!res.ok) {
        throw new ApiClientError(text || `Request failed with status ${res.status}`, res.status);
      }
      return text as unknown as T;
    }

    let json: ApiResponse<T> & { code?: string };
    try {
      json = await res.json();
    } catch {
      throw new ApiClientError(`Invalid JSON response from server (${res.status})`, res.status);
    }

    if (!res.ok || json.error) {
      let code = json.code;
      if (!code && json.error) {
        const match = json.error.match(/\[([A-Z0-9_]+)\]/);
        if (match) {
          code = match[1];
        }
      }
      throw new ApiClientError(
        json.error || `Request failed with status ${res.status}`,
        res.status,
        code
      );
    }

    return json.data as T;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (externalSignal && onUserAbort) {
      externalSignal.removeEventListener('abort', onUserAbort);
    }

    if (err instanceof ApiClientError) {
      throw err;
    }

    if (externalSignal?.aborted) {
      throw new ApiClientError('Request aborted', 0, 'ABORTED');
    }

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new ApiClientError(`Request timeout after ${timeoutMs}ms`, 408, 'TIMEOUT');
      }
      // Network failures, connection refused, CORS, DNS failures
      throw new ApiClientError('Backend is not reachable', 0, 'NETWORK_ERROR');
    }

    throw new ApiClientError('Backend is not reachable', 0, 'NETWORK_ERROR');
  }
}

export const api = {
  getProjects(signal?: AbortSignal): Promise<Project[]> {
    return apiFetch<Project[]>('/api/projects', { signal });
  },

  getProject(id: string, signal?: AbortSignal): Promise<Project> {
    return apiFetch<Project>(`/api/projects/${id}`, { signal });
  },

  uploadProject(file: File, signal?: AbortSignal): Promise<Project> {
    const formData = new FormData();
    formData.append('file', file);
    return apiFetch<Project>('/api/projects', {
      method: 'POST',
      body: formData,
      signal,
      timeoutMs: 60000,
    });
  },

  scanProject(id: string, signal?: AbortSignal): Promise<Scan> {
    return apiFetch<Scan>(`/api/projects/${id}/scan`, {
      method: 'POST',
      signal,
      timeoutMs: 60000,
    });
  },

  getSummary(id: string, signal?: AbortSignal): Promise<ProjectSummary> {
    return apiFetch<ProjectSummary>(`/api/projects/${id}/summary`, { signal });
  },

  deleteProject(id: string, signal?: AbortSignal): Promise<void> {
    return apiFetch<void>(`/api/projects/${id}`, {
      method: 'DELETE',
      signal,
    });
  },

  getFindings(projectId: string, query?: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<{ items: Finding[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          searchParams.set(key, String(value));
        }
      }
    }
    const qs = searchParams.toString();
    return apiFetch<{ items: Finding[]; total: number }>(`/api/projects/${projectId}/findings${qs ? `?${qs}` : ''}`, { signal });
  },

  getFixes(projectId: string, status?: string, signal?: AbortSignal): Promise<{ items: Fix[]; total: number }> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return apiFetch<{ items: Fix[]; total: number }>(`/api/projects/${projectId}/fixes${qs}`, { signal });
  },

  getTests(projectId: string, signal?: AbortSignal): Promise<{ items: TestRun[]; counts: Record<string, number>; note: string }> {
    return apiFetch<{ items: TestRun[]; counts: Record<string, number>; note: string }>(`/api/projects/${projectId}/tests`, { signal });
  },

  getReports(projectId: string, signal?: AbortSignal): Promise<Report[]> {
    return apiFetch<Report[]>(`/api/projects/${projectId}/reports`, { signal });
  },

  getReport(id: string, format?: 'md', signal?: AbortSignal): Promise<Report | string> {
    const qs = format === 'md' ? '?format=md' : '';
    return apiFetch<Report | string>(`/api/reports/${id}${qs}`, { signal });
  },
};
