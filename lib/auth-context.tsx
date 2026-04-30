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
      message: 'Signup is disabled for this demo login.',
    };
  };

  const login = async (
    data: LoginData
  ): Promise<{ success: boolean; message?: string }> => {
    const email = data.email.trim().toLowerCase();
    const password = data.password.trim();

    console.log('LOGIN INPUT:', email, password);

    if (email === 'admin@test.com' && password === 'admin123') {
      const safeUser: User = {
        id: 'default-user',
        email: 'admin@test.com',
        name: 'Admin',
        fullName: 'Admin User',
        role: 'admin',
      };

      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(safeUser));
      setUser(safeUser);

      return { success: true };
    }

    return { success: false, message: 'Invalid email or password.' };
  };

  const logout = () => {
    localStorage.removeItem(CURRENT_USER_KEY);
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