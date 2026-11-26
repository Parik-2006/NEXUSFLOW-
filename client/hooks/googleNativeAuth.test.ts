/** Phase 4 (Task 14): native Google callback parsing (simulated — no device). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNativeCallback, base64UrlFromBytes, base64ToBase64Url } from "../utils/googleNativeAuth";

const S = "nexusflow";
const CODE = "A".repeat(43);

test("valid exchange code from the app's own deep link", () => {
  assert.deepEqual(parseNativeCallback(`${S}://auth/callback?auth_code=${CODE}`, S), { kind: "code", code: CODE });
});
test("error and cancellation are surfaced as errors, not codes", () => {
  assert.deepEqual(parseNativeCallback(`${S}://auth/callback?auth_error=cancelled`, S), { kind: "error", error: "cancelled" });
});
test("unauthorized destinations, schemes and paths are rejected", () => {
  for (const url of [
    `https://evil.example/auth/callback?auth_code=${CODE}`,
    `evil://auth/callback?auth_code=${CODE}`,
    `${S}://auth/callbackx?auth_code=${CODE}`,
    `${S}://other?auth_code=${CODE}`,
  ]) assert.equal(parseNativeCallback(url, S).kind, "invalid", url);
});
test("a JWT in the URL is refused; malformed codes are refused", () => {
  assert.equal(parseNativeCallback(`${S}://auth/callback?token=eyJx.eyJy.sig`, S).kind, "invalid");
  assert.equal(parseNativeCallback(`${S}://auth/callback?auth_code=short`, S).kind, "invalid");
  assert.equal(parseNativeCallback(`${S}://auth/callback?auth_code=${"$".repeat(43)}`, S).kind, "invalid");
});
test("base64url encoding helpers", () => {
  assert.equal(base64UrlFromBytes(new Uint8Array([251, 255, 191])), "-_-_");
  assert.equal(base64ToBase64Url("ab+/cd=="), "ab-_cd");
});
