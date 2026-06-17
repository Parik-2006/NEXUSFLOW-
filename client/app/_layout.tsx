import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/context/AuthContext";
import AuthGate from "@/components/AuthGate";
import { FeedbackProvider } from "@/components/feedback";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <FeedbackProvider>
          <AuthGate>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(auth)/login" />
              <Stack.Screen name="team/[teamId]" options={{ headerShown: false }} />
              <Stack.Screen name="daa-insights" options={{ headerShown: false }} />
            </Stack>
          </AuthGate>
        </FeedbackProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
