import { useEffect } from "react";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function Index() {
  const { refreshProfile } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");

    if (google === "1") {
      // Google OAuth callback — token is now in HTTP-only cookie
      // Clean URL and refresh profile from cookie
      window.history.replaceState({}, "", "/");
      refreshProfile().catch(() => {
        // fallback: redirect to login
      });
    }
  }, [refreshProfile]);

  return <Redirect href="/(auth)/login" />;
}
