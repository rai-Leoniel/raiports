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

type StoredUser = User & {
  password: string;
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

const DEFAULT_USER: StoredUser = {
  id: 'default-user',
  email: 'admin@test.com',
  password: 'admin123',
  name: 'Admin',
  fullName: 'Admin User',
  role: 'admin',
};

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

const safeGetUsers = (): StoredUser[] => {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    localStorage.removeItem(USERS_KEY);
    return [];
  }
};

const ensureDefaultUser = (): StoredUser[] => {
  const existingUsers = safeGetUsers();

  const usersWithoutDefault = existingUsers.filter(
    (user) => user.email.toLowerCase() !== DEFAULT_USER.email.toLowerCase()
  );

  const updatedUsers = [...usersWithoutDefault, DEFAULT_USER];

  localStorage.setItem(USERS_KEY, JSON.stringify(updatedUsers));

  return updatedUsers;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('AUTH PROVIDER IS RUNNING');

    try {
      ensureDefaultUser();

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
      const existingUsers = ensureDefaultUser();

      const alreadyExists = existingUsers.find(
        (user) => user.email.toLowerCase() === data.email.toLowerCase()
      );

      if (alreadyExists) {
        return { success: false, message: 'Email already exists.' };
      }

      const newUser: StoredUser = {
        id: generateId(),
        email: data.email.trim(),
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
      const users = ensureDefaultUser();

      const inputEmail = data.email.trim().toLowerCase();
      const inputPassword = data.password.trim();

      const matchedUser = users.find(
        (user) =>
          user.email.toLowerCase() === inputEmail &&
          user.password === inputPassword
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

    const existingUsers = ensureDefaultUser();

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