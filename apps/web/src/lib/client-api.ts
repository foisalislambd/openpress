'use client';

// Client-side API helper for the admin panel (JWT in localStorage).

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('op_token');
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('op_token', accessToken);
  localStorage.setItem('op_refresh', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('op_token');
  localStorage.removeItem('op_refresh');
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem('op_refresh');
  if (!refreshToken) return false;
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData
      ? {}
      : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${API_URL}/api${path}`, { ...options, headers });

  if (res.status === 401 && !retried && (await tryRefresh())) {
    return api<T>(path, options, true);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      Array.isArray(body.message) ? body.message.join(', ') : body.message || `Request failed (${res.status})`,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
