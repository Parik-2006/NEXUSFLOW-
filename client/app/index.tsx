import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@/theme";

export default function Index() {
  const { token: activeToken, signInWithGoogle, refreshProfile } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") {
      setChecking(false);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    const token = params.get("token");

    if (token) {
      window.history.replaceState({}, "", "/");
      signInWithGoogle(token)
        .catch(() => {})
        .finally(() => setChecking(false));
    } else if (google === "1") {
      window.history.replaceState({}, "", "/");
      refreshProfile()
        .catch(() => {})
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, [signInWithGoogle, refreshProfile]);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (activeToken) {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  return <Redirect href="/(auth)/login" />;
}
