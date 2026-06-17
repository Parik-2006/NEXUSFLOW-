import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Cross-platform key/value storage. expo-secure-store has no web
 * implementation, so on web we fall back to localStorage. On native we
 * use the encrypted SecureStore.
 */
export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* storage unavailable (e.g. private mode) */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* storage unavailable */
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
