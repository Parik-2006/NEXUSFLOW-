import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import { getItem, setItem, deleteItem } from "../utils/storage";
import { API_BASE_URL } from "../utils/api";
import { disconnectSocket } from "../services/socket";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { parseNativeCallback, base64UrlFromBytes, base64ToBase64Url, NATIVE_CALLBACK_PATH } from "../utils/googleNativeAuth";

const NATIVE_SCHEME = "nexusflow"; // app.json "scheme"; must match GOOGLE_NATIVE_REDIRECT_SCHEME

const API = API_BASE_URL;
const TOKEN_KEY = "nf_jwt";
const GOOGLE_VERIFIER_KEY = "nf_google_verifier";

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

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
  /** Starts Google sign-in (web): stores a one-time verifier and navigates to the server. */
  startGoogleSignIn: (redirectPath?: string) => Promise<void>;
  /** Completes Google sign-in by exchanging the one-time code (never a JWT in the URL). */
  completeGoogleSignIn: (code: string) => Promise<string>;
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
    disconnectSocket(); // never let the next user reuse this session's socket
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

  // ── Google sign-in (Phase 2): PKCE-style verifier + one-time exchange code ──
  const startGoogleSignIn = useCallback(async (redirectPath: string = "/") => {
    if (Platform.OS !== "web") {
      // Phase 4 native flow (iOS / Android development or production builds):
      // CSPRNG verifier (expo-crypto) kept in SecureStore; auth session returns
      // only to <scheme>://auth/callback; the code is redeemed with the verifier.
      const verifier = base64UrlFromBytes(Crypto.getRandomBytes(32));
      const challenge = base64ToBase64Url(
        await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 })
      );
      await setItem(GOOGLE_VERIFIER_KEY, verifier);
      const q = new URLSearchParams({ client_challenge: challenge, redirect: redirectPath, platform: "native" });
      const result = await WebBrowser.openAuthSessionAsync(`${API}/api/auth/google?${q.toString()}`, `${NATIVE_SCHEME}://${NATIVE_CALLBACK_PATH}`);
      if (result.type !== "success") {
        await deleteItem(GOOGLE_VERIFIER_KEY);
        throw new Error("Google sign-in was cancelled.");
      }
      const parsed = parseNativeCallback(result.url, NATIVE_SCHEME);
      if (parsed.kind === "code") {
        await completeGoogleSignIn(parsed.code);
        return;
      }
      await deleteItem(GOOGLE_VERIFIER_KEY);
      throw new Error(parsed.kind === "error" ? `Google sign-in failed (${parsed.error}).` : "Google sign-in returned an unexpected response.");
    }
    const subtle = (globalThis as any).crypto?.subtle;
    if (!subtle || typeof window === "undefined") {
      throw new Error("Google sign-in is not supported in this browser.");
    }
    const bytes = new Uint8Array(32);
    (globalThis as any).crypto.getRandomValues(bytes);
    const verifier = base64Url(bytes);
    const digest = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    await setItem(GOOGLE_VERIFIER_KEY, verifier);
    const q = new URLSearchParams({ client_challenge: base64Url(digest), redirect: redirectPath });
    window.location.href = `${API}/api/auth/google?${q.toString()}`;
  }, []);

  const completeGoogleSignIn = useCallback(async (code: string): Promise<string> => {
    const verifier = await getItem(GOOGLE_VERIFIER_KEY);
    await deleteItem(GOOGLE_VERIFIER_KEY);
    if (!verifier) throw new Error("This sign-in did not start in this browser. Please try again.");
    const res = await fetch(`${API}/api/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, verifier }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Google sign-in failed. Please try again.");
    await setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    return data.redirectPath || "/";
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    const res = await fetch(`${API}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    const data = await res.json().catch(() => ({}));
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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to reset password.");
    }
    // Phase 2: a reset revokes every session; the user signs in again.
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, loading, signIn, signUp, signOut, updateProfile, refreshProfile, startGoogleSignIn, completeGoogleSignIn, forgotPassword, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

