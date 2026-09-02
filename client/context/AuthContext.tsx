import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getItem, setItem, deleteItem } from "../utils/storage";
import { API_BASE_URL } from "../utils/api";

const API = API_BASE_URL;
const TOKEN_KEY = "nf_jwt";

export type User = {
  id: string;
  _id?: string;
  email: string;
  name: string;
  avatar?: string;
  bio?: string;
  role?: string;
  experience?: string;
  skills?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type AuthState = {
  token: string | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, confirmPassword?: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<User>;
  refreshProfile: () => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string, confirmPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore authenticated session on app launch / page reload
  const restoreSession = useCallback(async () => {
    try {
      const savedToken = await getItem(TOKEN_KEY);
      if (savedToken) {
        const res = await fetch(`${API}/api/me`, {
          headers: { Authorization: `Bearer ${savedToken}` },
        });
        if (res.ok) {
          const userData = await res.json();
          setToken(savedToken);
          setUser(userData);
        } else {
          // Token expired or invalid
          await deleteItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
        }
      }
    } catch (e) {
      console.warn("[Auth] Failed to restore session:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Login failed. Please check your credentials.");
    }
    await setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string, confirmPassword?: string) => {
    const res = await fetch(`${API}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        confirmPassword,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Registration failed. Please check the form.");
    }
    await setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    await deleteItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (data: Partial<User>): Promise<User> => {
    if (!token) throw new Error("Not authenticated");
    const res = await fetch(`${API}/api/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error ?? "Failed to update profile");
    }
    const updated = result.user || result;
    setUser(updated);
    return updated;
  }, [token]);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
      }
    } catch (e) {
      console.warn("[Auth] Failed to refresh profile:", e);
    }
  }, [token]);

  const signInWithGoogle = useCallback(async (idToken: string) => {
    await setItem(TOKEN_KEY, idToken);
    setToken(idToken);
    try {
      const res = await fetch(`${API}/api/me`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
      }
    } catch (e) {
      console.warn("[Auth] Failed to fetch profile after Google sign-in:", e);
    }
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    const res = await fetch(`${API}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to send reset link.");
    }
  }, []);

  const resetPassword = useCallback(async (token: string, password: string, confirmPassword: string) => {
    const res = await fetch(`${API}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password, confirmPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to reset password.");
    }
    await setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, loading, signIn, signUp, signOut, updateProfile, refreshProfile, signInWithGoogle, forgotPassword, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

