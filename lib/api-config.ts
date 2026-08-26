'use client';

// Single source of truth for which backend server the web app talks to.
// Defaults to the same live server the mobile app uses, but can be
// overridden via the Settings modal on the login page (stored in
// localStorage) -- useful for pointing at a staging server later without
// having to edit and redeploy code.

const DEFAULT_API_URL = 'https://raireports-api.duckdns.org/api';
const API_URL_STORAGE_KEY = 'raiports-api-url';

// SAFETY NET: the page is always served over HTTPS, so any http://
// backend URL gets blocked by the browser as mixed content before the
// request even leaves the tab. This forces http:// -> https:// on read,
// so a stale/incorrectly-saved value (or a future paste into the
// Settings modal) can never silently break every fetch on the page again.
function enforceHttps(url: string): string {
  if (url.startsWith('http://')) {
    return 'https://' + url.slice('http://'.length);
  }
  return url;
}

export function getApiUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_API_URL;
  const stored = localStorage.getItem(API_URL_STORAGE_KEY);
  const resolved = stored && stored.trim() ? stored.trim().replace(/\/$/, '') : DEFAULT_API_URL;
  return enforceHttps(resolved);
}

export function setApiUrl(url: string) {
  const trimmed = enforceHttps(url.trim().replace(/\/$/, ''));
  if (trimmed) {
    localStorage.setItem(API_URL_STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(API_URL_STORAGE_KEY);
  }
}

export function resetApiUrl() {
  localStorage.removeItem(API_URL_STORAGE_KEY);
}

export function getDefaultApiUrl(): string {
  return DEFAULT_API_URL;
}

// Human-friendly host for display, e.g. "raireports-api.duckdns.org"
export function getApiHost(url: string = getApiUrl()): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------
// TENANT (company database) selection
// ---------------------------------------------------------------------
// Same X-Tenant header mechanism the mobile app's axiosInstance.ts already
// uses (backend routes requests to the matching company database via
// api.db_router.TenantRouter). Web defaults to "easyeats", matching
// mobile's own default in SettingsScreen.tsx. Keep TENANTS in sync with
// mobile's COMPANIES list in SettingsScreen.tsx if a new tenant is added.

const TENANT_STORAGE_KEY = 'raiports-tenant';
const DEFAULT_TENANT = 'easyeats';

export const TENANTS = [
  { key: 'easyeats', label: 'EasyEats', dbName: 'live_easyeats' },
  { key: 'seanagro', label: 'SeaNagro', dbName: 'live_seanagro' },
  { key: 'sublet', label: 'Sublet', dbName: 'live_sublet' },
] as const;

export function getTenant(): string {
  if (typeof window === 'undefined') return DEFAULT_TENANT;
  const stored = localStorage.getItem(TENANT_STORAGE_KEY);
  return stored && stored.trim() ? stored.trim() : DEFAULT_TENANT;
}

export function getStoredTenantOrNull(): string | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(TENANT_STORAGE_KEY);
  return stored && stored.trim() ? stored.trim() : null;
}

export function setTenant(tenant: string) {
  const trimmed = tenant.trim();
  if (trimmed) {
    localStorage.setItem(TENANT_STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(TENANT_STORAGE_KEY);
  }
}

export function resetTenant() {
  localStorage.removeItem(TENANT_STORAGE_KEY);
}

export function getDefaultTenant(): string {
  return DEFAULT_TENANT;
}

export function getTenantLabel(key: string = getTenant()): string {
  return TENANTS.find((t) => t.key === key)?.label || key;
}

// ---------------------------------------------------------------------
// "uid@tenant" login convention
// ---------------------------------------------------------------------
export function parseUidAndTenant(rawInput: string): {
  uid: string;
  tenantKey: string | null;
  error: string | null;
} {
  const trimmed = rawInput.trim();
  const atIndex = trimmed.indexOf('@');

  if (atIndex === -1) {
    return { uid: trimmed, tenantKey: null, error: null };
  }

  const uidPart = trimmed.slice(0, atIndex);
  const tenantPart = trimmed.slice(atIndex + 1).toLowerCase();

  if (!uidPart) {
    return {
      uid: '',
      tenantKey: null,
      error: 'Enter your User ID before the @ symbol.',
    };
  }

  const validKeys = TENANTS.map((t) => t.key);
  if (!validKeys.includes(tenantPart as (typeof validKeys)[number])) {
    return {
      uid: uidPart,
      tenantKey: null,
      error: `Unknown company "${tenantPart}". Check with your admin for your company code.`,
    };
  }

  return { uid: uidPart, tenantKey: tenantPart, error: null };
}