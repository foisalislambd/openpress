'use client';

// Admin API client. The session lives in httpOnly cookies on the API origin.
// The CSRF token is returned in JSON (the web origin cannot read the API cookie)
// and echoed on mutating requests.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const CSRF_KEY = 'op_csrf';
const SESSION_KEY = 'op_signed_in';

let csrfMemory: string | null = null;
let migrated = false;

function rememberCsrf(token: string | undefined) {
  if (!token) return;
  csrfMemory = token;
  sessionStorage.setItem(CSRF_KEY, token);
}

function currentCsrf() {
  if (csrfMemory) return csrfMemory;
  if (typeof window === 'undefined') return null;
  csrfMemory = sessionStorage.getItem(CSRF_KEY);
  return csrfMemory;
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(SESSION_KEY) === '1' ? 'cookie' : null;
}

export function setTokens(accessToken?: string, refreshToken?: string) {
  void accessToken;
  void refreshToken;
  sessionStorage.setItem(SESSION_KEY, '1');
  localStorage.removeItem('op_token');
  localStorage.removeItem('op_refresh');
}

export async function clearTokens() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(CSRF_KEY);
  localStorage.removeItem('op_token');
  localStorage.removeItem('op_refresh');
  const csrf = csrfMemory;
  csrfMemory = null;
  await fetch(`${API_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-OpenPress-Client': 'web',
      ...(csrf ? { 'X-OpenPress-CSRF': csrf } : {}),
    },
  }).catch(() => undefined);
}

async function ensureCsrf() {
  const existing = currentCsrf();
  if (existing) return existing;
  const res = await fetch(`${API_URL}/api/auth/csrf`, {
    credentials: 'include',
    headers: { 'X-OpenPress-Client': 'web' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { csrfToken?: string };
  rememberCsrf(data.csrfToken);
  return data.csrfToken ?? null;
}

async function migrateLocalTokens() {
  if (migrated || typeof window === 'undefined') return;
  migrated = true;
  const refresh = localStorage.getItem('op_refresh');
  localStorage.removeItem('op_token');
  localStorage.removeItem('op_refresh');
  if (!refresh) return;
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-OpenPress-Client': 'web' },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!res.ok) return;
  const data = (await res.json()) as { csrfToken?: string };
  rememberCsrf(data.csrfToken);
  sessionStorage.setItem(SESSION_KEY, '1');
}

async function tryRefresh(): Promise<boolean> {
  const csrf = await ensureCsrf();
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-OpenPress-Client': 'web',
      ...(csrf ? { 'X-OpenPress-CSRF': csrf } : {}),
    },
    body: '{}',
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { csrfToken?: string };
  rememberCsrf(data.csrfToken);
  sessionStorage.setItem(SESSION_KEY, '1');
  return true;
}

export async function apiFetch(path: string, options: RequestInit = {}, retried = false): Promise<Response> {
  await migrateLocalTokens();
  const method = (options.method ?? 'GET').toUpperCase();
  const csrf = method === 'GET' || method === 'HEAD' ? currentCsrf() : await ensureCsrf();
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    'X-OpenPress-Client': 'web',
    ...(csrf && method !== 'GET' && method !== 'HEAD' ? { 'X-OpenPress-CSRF': csrf } : {}),
    ...(typeof window !== 'undefined' && localStorage.getItem('op_site')
      ? { 'X-OpenPress-Site': localStorage.getItem('op_site') as string }
      : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${API_URL}/api${path}`, { ...options, headers, credentials: 'include' });
  if ((res.status === 401 || res.status === 403) && !retried && path !== '/auth/refresh' && (await tryRefresh())) {
    return apiFetch(path, options, true);
  }
  return res;
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (body && typeof body === 'object' && typeof (body as { csrfToken?: unknown }).csrfToken === 'string') {
    rememberCsrf((body as { csrfToken: string }).csrfToken);
    if ((body as { cookie?: boolean }).cookie) sessionStorage.setItem(SESSION_KEY, '1');
  }
  if (!res.ok) {
    throw new Error(
      Array.isArray(body.message) ? body.message.join(', ') : body.message || `Request failed (${res.status})`,
    );
  }
  if (res.status === 204) return undefined as T;
  return body as T;
}
