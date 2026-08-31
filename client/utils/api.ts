import { Platform } from "react-native";

/**
 * Resolves the backend API base URL safely across Web, iOS, Android, and dev environments.
 * Avoids dead remote URLs in local dev.
 */
export function getApiBaseUrl(): string {
  // 1. Explicit environment variable if provided
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
    // If running in localhost web browser but env points to dead render url, prefer localhost
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      window.location &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
      envUrl.includes("onrender.com")
    ) {
      return "http://localhost:4000";
    }
    return envUrl.replace(/\/+$/, "");
  }

  // 2. Browser on localhost
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:4000";
    }
    return window.location.origin;
  }

  // 3. Default local backend port
  return "http://localhost:4000";
}

export const API_BASE_URL = getApiBaseUrl();
export default API_BASE_URL;
