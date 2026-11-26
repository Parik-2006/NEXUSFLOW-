import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "(auth)";
    // Phase 4: the native Google deep-link landing must be reachable signed-out.
    const segs = segments as string[];
    const inOAuthCallback = segs[0] === "auth" && segs[1] === "callback";
    if (inOAuthCallback) return;
    if (!token && !inAuthGroup) router.replace("/(auth)/login");
    // A reset link must work even while a session exists (it signs out everywhere).
    else if (token && inAuthGroup && (segments as string[])[1] !== "reset-password") router.replace("/(tabs)/dashboard");
  }, [token, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  return <>{children}</>;
}
