import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, ApiClientError, api } from '../lib/api.js';

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
  });
});
