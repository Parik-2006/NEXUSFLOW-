import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@/theme";

/**
 * Entry route. Phase 2: completes Google sign-in ONLY through the one-time
 * `auth_code` exchange (a JWT is never accepted from the URL). The code is
 * removed from browser history before it is used.
 */
export default function Index() {
  const { token: activeToken, completeGoogleSignIn } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !window.location) {
      setChecking(false);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const code = params.get("auth_code");
    if (!code) {
      setChecking(false);
      return;
    }
    window.history.replaceState({}, "", "/");
    completeGoogleSignIn(code)
      .then((redirectPath) => {
        if (redirectPath && redirectPath !== "/") router.replace(redirectPath as any);
      })
      .catch((e: any) => {
        router.replace(`/login?auth_error=${encodeURIComponent(e?.message ? "exchange_failed" : "server_error")}` as any);
      })
      .finally(() => setChecking(false));
  }, [completeGoogleSignIn, router]);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.accent} accessibilityLabel="Signing you in" />
      </View>
    );
  }

  if (activeToken) {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  return <Redirect href="/(auth)/login" />;
}
