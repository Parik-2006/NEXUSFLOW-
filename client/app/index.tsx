import { useEffect } from "react";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function Index() {
  const { signInWithGoogle, refreshProfile } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    const token = params.get("token");

    if (token) {
      window.history.replaceState({}, "", "/");
      signInWithGoogle(token).catch(() => {});
    } else if (google === "1") {
      window.history.replaceState({}, "", "/");
      refreshProfile().catch(() => {});
    }
  }, [signInWithGoogle, refreshProfile]);

  return <Redirect href="/(auth)/login" />;
}
