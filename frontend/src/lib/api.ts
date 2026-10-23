import type { Project, Finding, Fix, TestRun, Report, ApiResponse } from '../../../shared/types.js';

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

export async function apiFetch<T>(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { timeoutMs = 10000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
    });

    clearTimeout(timeoutId);

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
      throw new ApiClientError(
        json.error || `Request failed with status ${res.status}`,
        res.status,
        json.code
      );
    }

    return json.data as T;
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if (err instanceof ApiClientError) {
      throw err;
    }

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new ApiClientError(`Request timeout after ${timeoutMs}ms`, 408, 'TIMEOUT');
      }
      throw new ApiClientError(err.message);
    }

    throw new ApiClientError('Unknown network error occurred');
  }
}

export const api = {
  getProjects(): Promise<Project[]> {
    return apiFetch<Project[]>('/api/projects');
  },

  getProject(id: string): Promise<Project> {
    return apiFetch<Project>(`/api/projects/${id}`);
  },

  getFindings(projectId: string, query?: Record<string, string | number | undefined>): Promise<{ items: Finding[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          searchParams.set(key, String(value));
        }
      }
    }
    const qs = searchParams.toString();
    return apiFetch<{ items: Finding[]; total: number }>(`/api/projects/${projectId}/findings${qs ? `?${qs}` : ''}`);
  },

  getFixes(projectId: string, status?: string): Promise<{ items: Fix[]; total: number }> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return apiFetch<{ items: Fix[]; total: number }>(`/api/projects/${projectId}/fixes${qs}`);
  },

  getTests(projectId: string): Promise<{ items: TestRun[]; counts: Record<string, number>; note: string }> {
    return apiFetch<{ items: TestRun[]; counts: Record<string, number>; note: string }>(`/api/projects/${projectId}/tests`);
  },

  getReports(projectId: string): Promise<Report[]> {
    return apiFetch<Report[]>(`/api/projects/${projectId}/reports`);
  },

  getReport(id: string, format?: 'md'): Promise<Report | string> {
    const qs = format === 'md' ? '?format=md' : '';
    return apiFetch<Report | string>(`/api/reports/${id}${qs}`);
  },
};
