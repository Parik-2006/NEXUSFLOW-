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
    if (!token && !inAuthGroup) router.replace("/(auth)/login");
    else if (token && inAuthGroup) router.replace("/(tabs)/dashboard");
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
