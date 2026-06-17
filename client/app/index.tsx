import { Redirect } from "expo-router";

// Landing route for "/". Always start at login; AuthGate sends signed-in
// users on to the dashboard.
export default function Index() {
  return <Redirect href="/(auth)/login" />;
}
