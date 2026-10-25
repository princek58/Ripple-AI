import type {
  Project,
  Scan,
  ProjectSummary,
  GraphResponseData,
  NodeDetailsData,
  GraphSearchResponseData,
  GraphSearchParams,
  FindingDetailData,
  PaginatedFindings,
  FindingsQueryParams,
  Fix,
  Report,
  PaginatedReportsResult,
  ApiResponse,
  ImpactResult,
} from '../../../shared/types.js';
import type { ProjectFixesResult } from '../features/fixes/fixesTypes.js';
import type { ProjectTestsData } from '../features/tests/testsTypes.js';

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
  PROJECT_FILES_MISSING: 'The stored files of this project are missing. Please upload the ZIP again.',
  ZIP_UNSAFE_PATH: 'Archive contains unsafe file paths [ZIP_UNSAFE_PATH]',
  ZIP_TOO_MANY_FILES: 'Archive contains too many files [ZIP_TOO_MANY_FILES]',
  ZIP_BOMB: 'Archive compression ratio is suspiciously high [ZIP_BOMB]',
  ZIP_TOO_LARGE: 'Extracted archive size exceeds allowed limit [ZIP_TOO_LARGE]',
  IMPACT_NODE_UNSUPPORTED: 'Impact works for files, API endpoints and config items. Choose one inside the module.',
  GITHUB_URL_INVALID: 'Invalid GitHub repository link',
  GITHUB_REPO_NOT_FOUND: 'Repository does not exist or is private (only public repositories are supported)',
  GITHUB_REPO_TOO_LARGE: 'Repository is too large (maximum 50 MB)',
  GITHUB_UNAVAILABLE: 'GitHub is busy or rate limited, please try again shortly',
  GITHUB_UNREACHABLE: 'Unable to reach GitHub. Please check your internet connection.',
  GITHUB_REDIRECT_BLOCKED: 'GitHub download was redirected to an untrusted address',
};

export function getFriendlyErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'IMPACT_NODE_UNSUPPORTED' || err.message?.includes('IMPACT_NODE_UNSUPPORTED')) {
      return 'Impact works for files, API endpoints and config items. Choose one inside the module.';
    }
    if (err.code === 'PROJECT_FILES_MISSING' || err.message?.includes('PROJECT_FILES_MISSING')) {
      return 'The stored files of this project are missing. Please upload the ZIP again.';
    }
    if (err.message === 'This item is not in the selected project') {
      return 'This item is not in the selected project';
    }

    // Check specific known reason codes before generic status fallbacks
    const code = err.code || '';
    const msg = err.message || '';
    for (const [reasonCode, explanation] of Object.entries(REASON_CODE_EXPLANATIONS)) {
      if (code === reasonCode || msg.includes(reasonCode)) {
        return explanation;
      }
    }

    if (err.status === 400) {
      return 'This is not a valid ZIP file';
    }
    if (err.status === 413) {
      return 'File is too large';
    }
    if (err.status === 409) {
      if (err.code === 'SCAN_REQUIRED' || err.message?.includes('SCAN_REQUIRED')) {
        return 'Scan the project first';
      }
      return 'This fix was already approved or rejected';
    }
    if (err.status === 422) {
      if (err.code === 'NO_AUTOMATIC_FIX' || err.message?.includes('NO_AUTOMATIC_FIX')) {
        return 'Ripple AI cannot build an automatic change for this finding';
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

  importGithubProject(url: string, signal?: AbortSignal): Promise<Project> {
    return apiFetch<Project>('/api/projects/import-github', {
      method: 'POST',
      body: JSON.stringify({ url }),
      signal,
      timeoutMs: 65000,
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

  getGraph(
    projectId: string,
    query?: { level?: number; focus?: string; depth?: number; maxNodes?: number },
    signal?: AbortSignal
  ): Promise<GraphResponseData> {
    const searchParams = new URLSearchParams();
    if (query) {
      if (query.level !== undefined) searchParams.set('level', String(query.level));
      if (query.focus !== undefined) searchParams.set('focus', query.focus);
      if (query.depth !== undefined) searchParams.set('depth', String(query.depth));
      if (query.maxNodes !== undefined) searchParams.set('maxNodes', String(query.maxNodes));
    }
    const qs = searchParams.toString();
    return apiFetch<GraphResponseData>(
      `/api/projects/${projectId}/graph${qs ? `?${qs}` : ''}`,
      { signal }
    );
  },

  getNodeDetails(
    projectId: string,
    nodeId: string,
    signal?: AbortSignal
  ): Promise<NodeDetailsData> {
    return apiFetch<NodeDetailsData>(
      `/api/projects/${projectId}/graph/nodes/${nodeId}`,
      { signal }
    );
  },

  searchGraph(
    projectId: string,
    params: GraphSearchParams,
    signal?: AbortSignal
  ): Promise<GraphSearchResponseData> {
    const searchParams = new URLSearchParams();
    if (params.q) searchParams.set('q', params.q);
    if (params.type) searchParams.set('type', params.type);
    if (params.severity) searchParams.set('severity', params.severity);
    if (params.verification) searchParams.set('verification', params.verification);
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return apiFetch<GraphSearchResponseData>(
      `/api/projects/${projectId}/graph/search${qs ? `?${qs}` : ''}`,
      { signal }
    );
  },

  deleteProject(id: string, signal?: AbortSignal): Promise<void> {
    return apiFetch<void>(`/api/projects/${id}`, {
      method: 'DELETE',
      signal,
    });
  },

  getScans(projectId: string, signal?: AbortSignal): Promise<Scan[]> {
    return apiFetch<Scan[]>(`/api/projects/${projectId}/scans`, { signal });
  },

  getFindings(
    projectId: string,
    query?: FindingsQueryParams | Record<string, string | number | undefined>,
    signal?: AbortSignal
  ): Promise<PaginatedFindings> {
    const searchParams = new URLSearchParams();
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          searchParams.set(key, String(value));
        }
      }
    }
    const qs = searchParams.toString();
    return apiFetch<PaginatedFindings>(`/api/projects/${projectId}/findings${qs ? `?${qs}` : ''}`, { signal });
  },

  getFinding(findingId: string, signal?: AbortSignal): Promise<FindingDetailData> {
    return apiFetch<FindingDetailData>(`/api/findings/${findingId}`, { signal });
  },

  getFixes(
    projectId: string,
    status?: string,
    signal?: AbortSignal
  ): Promise<ProjectFixesResult> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return apiFetch<ProjectFixesResult>(`/api/projects/${projectId}/fixes${qs}`, { signal });
  },

  getProjectFixes(
    projectId: string,
    query?: { status?: string; page?: number; pageSize?: number },
    signal?: AbortSignal
  ): Promise<ProjectFixesResult> {
    const searchParams = new URLSearchParams();
    if (query?.status) searchParams.set('status', query.status);
    if (query?.page !== undefined) searchParams.set('page', String(query.page));
    if (query?.pageSize !== undefined) searchParams.set('pageSize', String(query.pageSize));
    const qs = searchParams.toString();
    return apiFetch<ProjectFixesResult>(`/api/projects/${projectId}/fixes${qs ? `?${qs}` : ''}`, { signal });
  },

  getFindingFixes(findingId: string, signal?: AbortSignal): Promise<Fix[]> {
    return apiFetch<Fix[]>(`/api/findings/${findingId}/fixes`, { signal });
  },

  createFixForFinding(findingId: string, signal?: AbortSignal): Promise<Fix> {
    return apiFetch<Fix>(`/api/findings/${findingId}/fixes`, {
      method: 'POST',
      signal,
    });
  },

  approveFix(fixId: string, signal?: AbortSignal): Promise<Fix> {
    return apiFetch<Fix>(`/api/fixes/${fixId}/approve`, {
      method: 'POST',
      signal,
    });
  },

  rejectFix(fixId: string, signal?: AbortSignal): Promise<Fix> {
    return apiFetch<Fix>(`/api/fixes/${fixId}/reject`, {
      method: 'POST',
      signal,
    });
  },

  getTests(projectId: string, signal?: AbortSignal): Promise<ProjectTestsData> {
    return apiFetch<ProjectTestsData>(`/api/projects/${projectId}/tests`, { signal });
  },

  getReports(
    projectId: string,
    query?: { page?: number; pageSize?: number },
    signal?: AbortSignal
  ): Promise<PaginatedReportsResult> {
    const searchParams = new URLSearchParams();
    if (query?.page !== undefined) searchParams.set('page', String(query.page));
    if (query?.pageSize !== undefined) searchParams.set('pageSize', String(query.pageSize));
    const qs = searchParams.toString();
    return apiFetch<PaginatedReportsResult>(
      `/api/projects/${projectId}/reports${qs ? `?${qs}` : ''}`,
      { signal }
    );
  },

  createReport(projectId: string, signal?: AbortSignal): Promise<Report> {
    return apiFetch<Report>(`/api/projects/${projectId}/reports`, {
      method: 'POST',
      signal,
    });
  },

  getReport(id: string, format?: 'md', signal?: AbortSignal): Promise<Report | string> {
    const qs = format === 'md' ? '?format=md' : '';
    return apiFetch<Report | string>(`/api/reports/${id}${qs}`, { signal });
  },

  getImpact(
    projectId: string,
    nodeId: string,
    options?: { depth?: number; maxNodes?: number },
    signal?: AbortSignal
  ): Promise<ImpactResult> {
    const searchParams = new URLSearchParams();
    searchParams.set('node', nodeId);
    if (options?.depth !== undefined) searchParams.set('depth', String(options.depth));
    if (options?.maxNodes !== undefined) searchParams.set('maxNodes', String(options.maxNodes));
    const qs = searchParams.toString();
    return apiFetch<ImpactResult>(`/api/projects/${projectId}/impact?${qs}`, { signal }).catch(
      (err: unknown) => {
        if (err instanceof ApiClientError) {
          if (
            err.status === 400 &&
            (err.code === 'IMPACT_NODE_UNSUPPORTED' || err.message?.includes('IMPACT_NODE_UNSUPPORTED'))
          ) {
            throw new ApiClientError(
              'Impact works for files, API endpoints and config items. Choose one inside the module.',
              400,
              'IMPACT_NODE_UNSUPPORTED'
            );
          }
          if (err.status === 409 || err.code === 'SCAN_REQUIRED' || err.message?.includes('SCAN_REQUIRED')) {
            throw new ApiClientError('Scan the project first', 409, 'SCAN_REQUIRED');
          }
          if (err.status === 404) {
            throw new ApiClientError('This item is not in the selected project', 404);
          }
          if (!err.status || err.status === 0 || err.code === 'NETWORK_ERROR' || err.status >= 500) {
            throw new ApiClientError('Backend is not reachable', err.status || 0, 'NETWORK_ERROR');
          }
        }
        throw err;
      }
    );
  },
};
