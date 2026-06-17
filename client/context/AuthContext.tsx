import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { setItem, deleteItem } from "../utils/storage";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const TOKEN_KEY = "nf_jwt";

type User = { id: string; email: string; name: string };

type AuthState = {
  token: string | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Always start signed out: clear any cached session so the login screen
  // appears on every fresh page load. The session lives only in memory for
  // the current visit (cleared on reload).
  useEffect(() => {
    deleteItem(TOKEN_KEY).catch(() => {});
    setLoading(false);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error("Login failed");
    const data = await res.json();
    await setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    await deleteItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
