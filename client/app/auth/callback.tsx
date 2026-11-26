/**
 * Native deep-link landing for Google sign-in (Phase 4, Task 14):
 * nexusflow://auth/callback?auth_code=… | ?auth_error=…
 * Normally the auth session returns the URL directly to startGoogleSignIn;
 * this screen covers the case where the OS reopens the app via the link.
 * The code is redeemed only with the verifier stored by THIS app instance.
 */
import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { colors, spacing } from "@/theme";

const CODE_RE = /^[A-Za-z0-9_-]{20,128}$/;

export default function GoogleNativeCallback() {
  const { auth_code, auth_error } = useLocalSearchParams<{ auth_code?: string; auth_error?: string }>();
  const { completeGoogleSignIn } = useAuth();
  const router = useRouter();
  const [message, setMessage] = useState("Completing Google sign-in…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (auth_error || !auth_code || !CODE_RE.test(String(auth_code))) {
        router.replace({ pathname: "/login", params: { auth_error: String(auth_error || "invalid_callback").slice(0, 40) } });
        return;
      }
      try {
        const next = await completeGoogleSignIn(String(auth_code));
        if (!cancelled) router.replace(next && next.startsWith("/") ? (next as never) : "/");
      } catch (e: any) {
        if (!cancelled) setMessage(e?.message || "Google sign-in failed. Please try again.");
      }
    })();
    return () => { cancelled = true; };
  }, [auth_code, auth_error]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.bg, padding: spacing.lg }}>
      <ActivityIndicator color={colors.primary} />
      <Text style={{ color: colors.textMuted, textAlign: "center" }}>{message}</Text>
    </View>
  );
}
