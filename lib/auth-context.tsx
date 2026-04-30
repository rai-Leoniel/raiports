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

type StoredUser = {
  id: string;
  email: string;
  password: string;
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

const USERS_KEY = 'raiports-users';
const CURRENT_USER_KEY = 'raiports-current-user';
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

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

  const signup = async (
    data: SignupData
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const existingUsers: StoredUser[] = JSON.parse(
        localStorage.getItem(USERS_KEY) || '[]'
      );

      const alreadyExists = existingUsers.find(
        (u) => u.email.toLowerCase() === data.email.toLowerCase()
      );

      if (alreadyExists) {
        return { success: false, message: 'Email already exists.' };
      }

      const newUser: StoredUser = {
        id: generateId(),
        email: data.email,
        password: data.password,
        name: data.name,
        role: 'user',
      };

      const updatedUsers = [...existingUsers, newUser];
      localStorage.setItem(USERS_KEY, JSON.stringify(updatedUsers));

      const safeUser: User = {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      };

      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(safeUser));
      setUser(safeUser);

      return { success: true };
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, message: 'Something went wrong during signup.' };
    }
  };

  const login = async (
    data: LoginData
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const existingUsers: StoredUser[] = JSON.parse(
        localStorage.getItem(USERS_KEY) || '[]'
      );

      const matchedUser = existingUsers.find(
        (u) =>
          u.email.toLowerCase() === data.email.toLowerCase() &&
          u.password === data.password
      );

      if (!matchedUser) {
        return { success: false, message: 'Invalid email or password.' };
      }

      const safeUser: User = {
        id: matchedUser.id,
        email: matchedUser.email,
        name: matchedUser.name,
        fullName: matchedUser.fullName,
        department: matchedUser.department,
        company: matchedUser.company,
        role: matchedUser.role,
      };

      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(safeUser));
      setUser(safeUser);

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Something went wrong during login.' };
    }
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

    const existingUsers: StoredUser[] = JSON.parse(
      localStorage.getItem(USERS_KEY) || '[]'
    );

    const updatedUsers = existingUsers.map((storedUser) =>
      storedUser.id === user.id
        ? {
            ...storedUser,
            ...data,
          }
        : storedUser
    );

    localStorage.setItem(USERS_KEY, JSON.stringify(updatedUsers));
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