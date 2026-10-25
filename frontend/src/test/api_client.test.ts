import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, ApiClientError, api, getFriendlyErrorMessage } from '../lib/api.js';
import impactNoticeServiceFixture from './fixtures/api/impact_notice_service.json';
import impactModule400Fixture from './fixtures/api/impact_module_node_400.json';
import impactUnscanned409Fixture from './fixtures/api/impact_unscanned_project_409.json';
import impactUnknown404Fixture from './fixtures/api/impact_unknown_node_404.json';

describe('API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns data successfully when response is { data: ... }', async () => {
    const mockData = { id: 'p1', name: 'Project 1' };
    const mockResponse = {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse as unknown as Response);

    const result = await apiFetch<{ id: string; name: string }>('/api/projects/p1');
    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/projects/p1',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('throws ApiClientError with clear message when response contains { error: ... }', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue({ data: null, error: 'Project not found', code: 'NOT_FOUND' }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse as unknown as Response);

    await expect(apiFetch('/api/projects/p999')).rejects.toThrow('Project not found');

    try {
      await apiFetch('/api/projects/p999');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiClientError);
      const apiErr = err as ApiClientError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe('NOT_FOUND');
    }
  });

  it('throws ApiClientError when response is invalid JSON', async () => {
    const mockResponse = {
      ok: false,
      status: 502,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockRejectedValue(new Error('SyntaxError: Unexpected token')),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse as unknown as Response);

    await expect(apiFetch('/api/projects')).rejects.toThrow(
      'Invalid JSON response from server (502)'
    );
  });

  it('handles timeout using AbortController and throws timeout error', async () => {
    global.fetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });

    await expect(apiFetch('/api/slow', { timeoutMs: 50 })).rejects.toThrow(
      'Request timeout after 50ms'
    );
  });

  it('api helper methods call expected endpoints', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: vi.fn().mockResolvedValue({ data: [], error: null }),
    };

    global.fetch = vi.fn().mockResolvedValue(mockResponse as unknown as Response);

    await api.getProjects();
    expect(global.fetch).toHaveBeenCalledWith('/api/projects', expect.anything());

    await api.getProject('test-id');
    expect(global.fetch).toHaveBeenCalledWith('/api/projects/test-id', expect.anything());

    await api.getScans('test-id');
    expect(global.fetch).toHaveBeenCalledWith('/api/projects/test-id/scans', expect.anything());

    await api.getFindings('test-id', { severity: 'critical' });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/projects/test-id/findings?severity=critical',
      expect.anything()
    );

    await api.getFinding('finding-123');
    expect(global.fetch).toHaveBeenCalledWith('/api/findings/finding-123', expect.anything());

    await api.getFixes('test-id', 'proposed');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/projects/test-id/fixes?status=proposed',
      expect.anything()
    );

    await api.getTests('test-id');
    expect(global.fetch).toHaveBeenCalledWith('/api/projects/test-id/tests', expect.anything());

    await api.getReports('test-id');
    expect(global.fetch).toHaveBeenCalledWith('/api/projects/test-id/reports', expect.anything());

    await api.importGithubProject('https://github.com/octocat/Hello-World');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/projects/import-github',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://github.com/octocat/Hello-World' }),
      })
    );
  });

  it('getFriendlyErrorMessage returns friendly messages for GitHub error codes', () => {
    expect(
      getFriendlyErrorMessage(new ApiClientError('Invalid link [GITHUB_URL_INVALID]', 400, 'GITHUB_URL_INVALID'))
    ).toBe('Invalid GitHub repository link');

    expect(
      getFriendlyErrorMessage(new ApiClientError('Not found [GITHUB_REPO_NOT_FOUND]', 404, 'GITHUB_REPO_NOT_FOUND'))
    ).toBe('Repository does not exist or is private (only public repositories are supported)');

    expect(
      getFriendlyErrorMessage(new ApiClientError('Too large [GITHUB_REPO_TOO_LARGE]', 413, 'GITHUB_REPO_TOO_LARGE'))
    ).toBe('Repository is too large (maximum 50 MB)');

    expect(
      getFriendlyErrorMessage(new ApiClientError('Unavailable [GITHUB_UNAVAILABLE]', 502, 'GITHUB_UNAVAILABLE'))
    ).toBe('GitHub is busy or rate limited, please try again shortly');

    expect(
      getFriendlyErrorMessage(new ApiClientError('Unreachable [GITHUB_UNREACHABLE]', 502, 'GITHUB_UNREACHABLE'))
    ).toBe('Unable to reach GitHub. Please check your internet connection.');

    expect(
      getFriendlyErrorMessage(new ApiClientError('Blocked [GITHUB_REDIRECT_BLOCKED]', 502, 'GITHUB_REDIRECT_BLOCKED'))
    ).toBe('GitHub download was redirected to an untrusted address');
  });

  it('getFriendlyErrorMessage returns friendly message for PROJECT_FILES_MISSING', () => {
    const errorWithCode = new ApiClientError(
      'Project files are missing. Upload the ZIP again [PROJECT_FILES_MISSING]',
      409,
      'PROJECT_FILES_MISSING'
    );
    expect(getFriendlyErrorMessage(errorWithCode)).toBe(
      'The stored files of this project are missing. Please upload the ZIP again.'
    );

    const errorWithMessageOnly = new ApiClientError(
      'Project files are missing [PROJECT_FILES_MISSING]',
      409
    );
    expect(getFriendlyErrorMessage(errorWithMessageOnly)).toBe(
      'The stored files of this project are missing. Please upload the ZIP again.'
    );
  });

  describe('api.getImpact', () => {
    it('fetches impact data successfully using real fixture', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: vi.fn().mockResolvedValue(impactNoticeServiceFixture),
      } as unknown as Response);

      const result = await api.getImpact('proj-123', 'node-abc', { depth: 3, maxNodes: 50 });

      expect(result).toEqual(impactNoticeServiceFixture.data);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/proj-123/impact?node=node-abc&depth=3&maxNodes=50',
        expect.anything()
      );
    });

    it('maps 400 IMPACT_NODE_UNSUPPORTED to friendly message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: { get: () => 'application/json' },
        json: vi.fn().mockResolvedValue(impactModule400Fixture),
      } as unknown as Response);

      await expect(api.getImpact('proj-123', 'mod-node')).rejects.toThrow(
        'Impact works for files, API endpoints and config items. Choose one inside the module.'
      );
    });

    it('maps 409 SCAN_REQUIRED to friendly message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        headers: { get: () => 'application/json' },
        json: vi.fn().mockResolvedValue(impactUnscanned409Fixture),
      } as unknown as Response);

      await expect(api.getImpact('proj-123', 'node-abc')).rejects.toThrow('Scan the project first');
    });

    it('maps 404 to friendly message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        json: vi.fn().mockResolvedValue(impactUnknown404Fixture),
      } as unknown as Response);

      await expect(api.getImpact('proj-123', 'node-unknown')).rejects.toThrow(
        'This item is not in the selected project'
      );
    });

    it('maps network failure to friendly message', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(api.getImpact('proj-123', 'node-abc')).rejects.toThrow(
        'Backend is not reachable'
      );
    });
  });
});
