// Shared fetch wrapper for all authenticated API calls.
//
// Mirrors what mobile's axiosInstance.ts does via interceptors: every
// request automatically gets the Bearer token (if logged in) and the
// X-Tenant header (so the backend's TenantRouter queries the right
// company database). Use this instead of raw fetch() anywhere the app
// talks to the backend, so a request never silently goes out
// tenant-blind again (which is what caused dashboard data to come back
// empty after switching tenants -- login/auth-context.tsx already sent
// X-Tenant, but the dashboard's own fetch() calls didn't).

import { getApiUrl, getTenant } from './api-config';

const ACCESS_TOKEN_KEY = 'raiports-access-token';

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const API_URL = getApiUrl();
  const tenant = getTenant();
  const token =
    typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;

  const headers = new Headers(options.headers || {});
  headers.set('X-Tenant', tenant);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (
    !headers.has('Content-Type') &&
    options.body &&
    typeof options.body === 'string'
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const url = path.startsWith('http') ? path : `${API_URL}${path}`;

  return fetch(url, { ...options, headers });
}

// Convenience wrapper for the common case: fetch + parse JSON + throw on
// non-2xx, so call sites don't all repeat the same res.ok / res.json()
// boilerplate.
export async function apiFetchJson<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await apiFetch(path, options);
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      (data && (data.data || data.message || data.error)) ||
      `Request failed with status ${res.status}`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }

  return data as T;
}