'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

// Same permission keys the mobile app's authStore.UserPermissions uses,
// and the same keys UserPermissionsScreen writes on the backend. Optional
// fields since older/legacy accounts may not have every key populated.
type UserPermissions = {
  approve_purchase_orders?: boolean;
  approve_petty_cash?: boolean;
  approve_journal_entries?: boolean;
  approve_expense_requests?: boolean;
  approve_disbursement_voucher?: boolean;
  approve_direct_purchase?: boolean;
  approve_stock_transfer?: boolean;
  override_approval?: boolean;
  view_dashboard?: boolean;
  view_reports?: boolean;
  view_inventory?: boolean;
  view_transactions?: boolean;
  manage_users?: boolean;
  manage_system_settings?: boolean;
  manage_database_backup?: boolean;
  [key: string]: any;
};

type User = {
  id: string;
  email: string;
  name?: string;
  fullName?: string;
  department?: string;
  company?: string;
  role?: string;
  branch?: string;
  // NEW: same approve_* permission flags mobile stores after login, so
  // web can gate Approve/Disapprove the same way instead of relying on a
  // hardcoded category list.
  permissions?: UserPermissions;
  // NEW: WEB-ONLY module access list (rssys.user_module_access). Fully
  // separate from `permissions` above -- this controls which top-level
  // sections (Dashboard, Sales, Car Rent, Accounting, Reports, History)
  // this user's sidebar shows, not what they can approve/edit within a
  // section. The desktop app never reads this; it's purely a web-side
  // gate. Defaults to an empty array (nothing shown) rather than
  // undefined, so a user with no rows here doesn't accidentally get
  // treated as "unrestricted" by any `!modules.length` check.
  modules?: string[];
};

// Raw company object from the API -- keeping it as a loose bag of fields
// (rather than picking out just comp_name like before) so we have access
// to whatever else comes back (logo, address, etc.) once we confirm the
// real field names against the mobile app's version.
type Company = {
  comp_name?: string;
  [key: string]: any;
};

type SignupData = {
  email: string;
  password: string;
  name?: string;
};

type LoginData = {
  email: string;
  password: string;
};

type UpdateProfileData = {
  fullName?: string;
  department?: string;
  company?: string;
  role?: string;
};

type AuthContextType = {
  user: User | null;
  company: Company | null;
  loading: boolean;
  isAuthenticated: boolean;
  signup: (data: SignupData) => Promise<{ success: boolean; message?: string }>;
  login: (data: LoginData) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  updateProfile: (data: UpdateProfileData) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CURRENT_USER_KEY = 'raiports-current-user';
const CURRENT_COMPANY_KEY = 'raiports-current-company';
const ACCESS_TOKEN_KEY = 'raiports-access-token';
const REFRESH_TOKEN_KEY = 'raiports-refresh-token';

import { getApiUrl, setTenant, parseUidAndTenant, getStoredTenantOrNull } from './api-config';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem(CURRENT_USER_KEY);
      const savedCompany = localStorage.getItem(CURRENT_COMPANY_KEY);

      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
      if (savedCompany) {
        setCompany(JSON.parse(savedCompany));
      }
    } catch (error) {
      console.error('Failed to load auth user:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const signup = async (): Promise<{ success: boolean; message?: string }> => {
    return {
      success: false,
      message: 'Signup is not available yet.',
    };
  };

  // NEW: attempts login against ONE specific tenant. Returns the raw fetch
  // result rather than throwing, so the caller (login, below) can try the
  // next tenant on a credentials failure instead of stopping at the first
  // miss. A non-2xx here just means "wrong tenant or wrong password" --
  // login() below is the one that decides what that means.
  const attemptLoginForTenant = async (
    uid: string,
    password: string,
    tenant: string
  ) => {
    const API_URL = getApiUrl();
    const res = await fetch(`${API_URL}/auth/login/uid/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant': tenant,
      },
      body: JSON.stringify({ uid, password }),
    });
    const result = await res.json().catch(() => null);
    return { ok: res.ok, result };
  };

  const login = async (
    data: LoginData
  ): Promise<{ success: boolean; message?: string }> => {
    // NOTE: The login form's field is labeled "User ID" even though the
    // variable is historically called "email" -- we send it as `uid` to
    // match the same /auth/login/uid/ endpoint the mobile app uses.
    const rawUid = data.email.trim();
    const password = data.password.trim();
    const API_URL = getApiUrl();

    // CHANGED: "uid@tenant" is required the FIRST time this browser logs
    // into a company (or any time someone wants to switch company). Once
    // a tenant has been saved once via an explicit "@company", a bare UID
    // on later logins falls back to that saved default automatically --
    // so "GERALD@EASYEATS" once, then just "GERALD" from then on. Typing
    // "@company" again always overrides whatever default was saved. The
    // old multi-tenant auto-detect loop (trying every tenant until one
    // matched) is gone -- only ever one named tenant is attempted.
    const { uid: parsedUid, tenantKey: explicitTenant, error: tenantError } =
      parseUidAndTenant(rawUid);

    if (tenantError) {
      return { success: false, message: tenantError };
    }

    // NEW: an explicit "@company" always wins. Otherwise fall back to
    // whatever tenant was saved from a previous explicit login on this
    // browser -- only a browser that has NEVER had an explicit "@company"
    // login gets rejected outright below.
    const tenant = explicitTenant || getStoredTenantOrNull();

    if (!tenant) {
      return {
        success: false,
        // CHANGED: no longer names the real tenants — a stranger poking
        // at the login form shouldn't learn the actual company codes
        // from a validation error.
        message: 'Include your company code in the User ID, e.g. 12345@yourcompany.',
      };
    }

    const uid = parsedUid;

    let accessToken = '';
    let refreshTokenValue = '';
    let apiUser: any = {};
    let apiCompany: Company = {};
    let apiModules: string[] = [];

    try {
      const { ok, result } = await attemptLoginForTenant(uid, password, tenant);

      if (!ok || !result?.access) {
        return { success: false, message: result?.error || 'Invalid credentials.' };
      }

      accessToken = result.access;
      refreshTokenValue = result.refresh || '';
      apiUser = result.user || {};
      apiCompany = result.company || {};
      // NEW: web-only module access list returned directly by the login
      // endpoint (added alongside 'company' in the backend response) --
      // no separate request needed, unlike permissions below.
      apiModules = Array.isArray(result.modules) ? result.modules : [];
    } catch (error) {
      console.error(`Login attempt failed for tenant "${tenant}":`, error);
      return { success: false, message: 'Could not reach the server. Please try again.' };
    }

    const matchedTenant = tenant;

    // Remember which tenant this login used, so it's available for any
    // other API call this session that still reads getTenant() directly.
    // This also doubles as saving the default for next time -- it's only
    // overwritten again when someone explicitly logs in with a new
    // "@company" suffix.
    setTenant(matchedTenant);

    try {
      // NEW: fetch this user's approve_* permissions right after login,
      // same call and same response shape mobile's LoginScreen uses
      // ( { status, data: { role, permissions } } ). If this fails for any
      // reason, permissions is just left undefined rather than blocking
      // login -- Approve/Disapprove will simply stay hidden until it's
      // available, same conservative fallback mobile has.
      let permissions: UserPermissions | undefined;
      try {
        const permsRes = await fetch(
          `${API_URL}/users/${apiUser.uid}/permissions/`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'X-Tenant': matchedTenant,
            },
          }
        );
        const permsJson = await permsRes.json();
        permissions = permsJson?.data?.permissions;
      } catch (permsError) {
        console.error('Failed to fetch permissions:', permsError);
      }

      const safeUser: User = {
        id: apiUser.uid || uid,
        email: apiUser.email || '',
        name: apiUser.firstname || apiUser.uid || uid,
        fullName: `${apiUser.firstname || ''} ${apiUser.lastname || ''}`.trim(),
        company: apiCompany?.comp_name || '',
        role: apiUser.account_type || '',
        branch: apiUser.branch || '',
        permissions,
        modules: apiModules,
      };

      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(safeUser));
      localStorage.setItem(CURRENT_COMPANY_KEY, JSON.stringify(apiCompany));
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshTokenValue);

      setUser(safeUser);
      setCompany(apiCompany);

      return { success: true };
    } catch (error) {
      console.error('Login request failed:', error);
      return {
        success: false,
        message: 'Could not reach the server. Please try again.',
      };
    }
  };

  const logout = () => {
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(CURRENT_COMPANY_KEY);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setUser(null);
    setCompany(null);
  };

  const updateProfile = async (data: UpdateProfileData): Promise<void> => {
    if (!user) {
      throw new Error('Not authenticated');
    }

    const updatedUser: User = {
      ...user,
      ...data,
    };

    setUser(updatedUser);
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
  };

  const value = useMemo(
    () => ({
      user,
      company,
      loading,
      isAuthenticated: !!user,
      signup,
      login,
      logout,
      updateProfile,
    }),
    [user, company, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}