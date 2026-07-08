console.log('BUILD TEST 999 - if you see this the new code is live');
'use client';



import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type User = {
  id: string;
  email: string;
  name?: string;
  fullName?: string;
  department?: string;
  company?: string;
  role?: string;
  branch?: string;
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
  loading: boolean;
  isAuthenticated: boolean;
  signup: (data: SignupData) => Promise<{ success: boolean; message?: string }>;
  login: (data: LoginData) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  updateProfile: (data: UpdateProfileData) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CURRENT_USER_KEY = 'raiports-current-user';
const ACCESS_TOKEN_KEY = 'raiports-access-token';
const REFRESH_TOKEN_KEY = 'raiports-refresh-token';

// Same backend your mobile app already talks to.
const API_URL = 'http://raireports-api.duckdns.org/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem(CURRENT_USER_KEY);

      if (savedUser) {
        setUser(JSON.parse(savedUser));
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

  const login = async (
    data: LoginData
  ): Promise<{ success: boolean; message?: string }> => {
    // NOTE: The login form's field is labeled "User ID" even though the
    // variable is historically called "email" -- we send it as `uid` to
    // match the same /auth/login/uid/ endpoint the mobile app uses.
    const uid = data.email.trim();
    const password = data.password.trim();

    try {
      const res = await fetch(`${API_URL}/auth/login/uid/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, password }),
      });

      const result = await res.json();

      if (!res.ok) {
        return {
          success: false,
          message: result?.error || 'Invalid credentials.',
        };
      }

      const apiUser = result.user || {};
      const company = result.company || null;

      const safeUser: User = {
        id: apiUser.uid || uid,
        email: apiUser.email || '',
        name: apiUser.firstname || apiUser.uid || uid,
        fullName: `${apiUser.firstname || ''} ${apiUser.lastname || ''}`.trim(),
        company: company?.comp_name || '',
        role: apiUser.account_type || '',
        branch: apiUser.branch || '',
      };

      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(safeUser));
      localStorage.setItem(ACCESS_TOKEN_KEY, result.access || '');
      localStorage.setItem(REFRESH_TOKEN_KEY, result.refresh || '');

      setUser(safeUser);

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
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setUser(null);
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
      loading,
      isAuthenticated: !!user,
      signup,
      login,
      logout,
      updateProfile,
    }),
    [user, loading]
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
