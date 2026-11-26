/**
 * Native Google sign-in helpers (Phase 4, Task 14). Pure functions so the
 * security-relevant parsing is unit-testable without a device.
 *
 * Flow: app creates a random verifier (expo-crypto), stores it in SecureStore,
 * opens /api/auth/google?platform=native&client_challenge=SHA256(verifier) in
 * an auth session; the server redirects ONLY to <scheme>://auth/callback with a
 * single-use, short-lived exchange code that is useless without the verifier.
 */
export const NATIVE_CALLBACK_PATH = "auth/callback";

export type NativeCallbackResult =
  | { kind: "code"; code: string }
  | { kind: "error"; error: string }
  | { kind: "invalid"; reason: string };

const CODE_RE = /^[A-Za-z0-9_-]{20,128}$/;
const ERR_RE = /^[a-z_]{1,40}$/;

/**
 * Accept only <expectedScheme>://auth/callback?auth_code=… | ?auth_error=…
 * (no other hosts / paths / schemes, no JWT-looking values).
 */
export function parseNativeCallback(url: string, expectedScheme: string): NativeCallbackResult {
  if (typeof url !== "string" || url.length > 2048) return { kind: "invalid", reason: "malformed" };
  const prefix = `${expectedScheme}://${NATIVE_CALLBACK_PATH}`;
  if (!url.startsWith(prefix)) return { kind: "invalid", reason: "unexpected_destination" };
  const rest = url.slice(prefix.length);
  if (rest && !rest.startsWith("?")) return { kind: "invalid", reason: "unexpected_destination" };
  const params = new URLSearchParams(rest.slice(1));
  const code = params.get("auth_code");
  const error = params.get("auth_error");
  if (params.get("token")) return { kind: "invalid", reason: "token_in_url_refused" };
  if (code && CODE_RE.test(code)) return { kind: "code", code };
  if (error && ERR_RE.test(error)) return { kind: "error", error };
  return { kind: "invalid", reason: "missing_code" };
}

export function base64UrlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Convert a base64 digest (expo-crypto) to base64url. */
export function base64ToBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
