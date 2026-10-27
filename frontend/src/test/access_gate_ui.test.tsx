import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AccessGate } from '../features/access/AccessGate.js';
import { apiFetch } from '../lib/api.js';

describe('DEP1 Part 2 - Access Gate (Frontend UI)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('1. shows "Enter access code" screen when required and not authenticated', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/access/status')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { required: true, authenticated: false }, error: null }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ data: {}, error: null }) };
    });

    render(
      <AccessGate>
        <div data-testid="app-content">Main Application</div>
      </AccessGate>
    );

    await waitFor(() => {
      expect(screen.getByTestId('access-gate-screen')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /Enter access code/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Access code/i)).toBeInTheDocument();
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });

  it('2. wrong access code shows error message and does not store code', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/access/status')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { required: true, authenticated: false }, error: null }),
        };
      }
      if (url.includes('/api/access') && init?.method === 'POST') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ data: null, error: 'Access denied [ACCESS_DENIED]' }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ data: {}, error: null }) };
    });

    render(
      <AccessGate>
        <div data-testid="app-content">Main Application</div>
      </AccessGate>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Access code/i)).toBeInTheDocument();
    });

    const input = screen.getByLabelText(/Access code/i);
    const submitBtn = screen.getByRole('button', { name: /Unlock/i });

    fireEvent.change(input, { target: { value: 'bad-code' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('access-gate-error')).toBeInTheDocument();
    });

    expect(screen.getByText(/Incorrect access code/i)).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('3. correct code unlocks gate, renders children, and keeps localStorage empty', async () => {
    let authState = false;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/access/status')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { required: true, authenticated: authState }, error: null }),
        };
      }
      if (url.includes('/api/access') && init?.method === 'POST') {
        authState = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { success: true }, error: null }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ data: {}, error: null }) };
    });

    render(
      <AccessGate>
        <div data-testid="app-content">Main Application</div>
      </AccessGate>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Access code/i)).toBeInTheDocument();
    });

    const input = screen.getByLabelText(/Access code/i);
    const submitBtn = screen.getByRole('button', { name: /Unlock/i });

    fireEvent.change(input, { target: { value: 'correct-secret' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('app-content')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('access-gate-screen')).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('4. a 401 AUTH_REQUIRED from an API call returns immediately to access screen', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/access/status')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: { required: true, authenticated: true }, error: null }),
        };
      }
      if (url.includes('/api/projects')) {
        return {
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: null, error: 'Access code required [AUTH_REQUIRED]' }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: {}, error: null }),
      };
    });

    render(
      <AccessGate>
        <div data-testid="app-content">
          Main Application
          <button
            data-testid="trigger-api-call"
            onClick={() => apiFetch('/api/projects').catch(() => {})}
          >
            Fetch Projects
          </button>
        </div>
      </AccessGate>
    );

    await waitFor(() => {
      expect(screen.getByTestId('app-content')).toBeInTheDocument();
    });

    // Fire API call that returns 401 AUTH_REQUIRED
    act(() => {
      screen.getByTestId('trigger-api-call').click();
    });

    // Gate screen must immediately reappear
    await waitFor(() => {
      expect(screen.getByTestId('access-gate-screen')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument();
  });
});
