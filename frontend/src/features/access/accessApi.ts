import { API_BASE_URL } from '../../lib/api.js';

export interface AccessStatusResponse {
  required: boolean;
  authenticated: boolean;
}

export async function fetchAccessStatus(signal?: AbortSignal): Promise<AccessStatusResponse> {
  const res = await fetch(`${API_BASE_URL}/api/access/status`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Failed to check access status (${res.status})`);
  }
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error);
  }
  return json.data;
}

export async function submitAccessCode(
  code: string,
  signal?: AbortSignal
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/api/access`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code }),
    signal,
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401) {
      return { success: false, error: 'Incorrect access code' };
    }
    if (res.status === 429) {
      return {
        success: false,
        error: 'Too many attempts. Please wait a minute and try again.',
      };
    }
    if (res.status === 503) {
      return {
        success: false,
        error: 'Access gate is not configured on the server.',
      };
    }
    return {
      success: false,
      error: json?.error || 'Verification failed. Please try again.',
    };
  }

  return { success: true };
}

export async function submitLogout(signal?: AbortSignal): Promise<void> {
  await fetch(`${API_BASE_URL}/api/access/logout`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    signal,
  });
}
