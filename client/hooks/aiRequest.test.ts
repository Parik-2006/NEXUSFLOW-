/** Phase 4 (Tasks 4 / 9): client AI request deadline, cancellation and truthful states. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { aiFetch, describeAiStatus, newClientRequestId } from "../utils/aiRequest";

const hang: typeof fetch = ((_: any, init: any) => new Promise((_r, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted"))))) as any;
const ok = (status: number, body: unknown): typeof fetch => (async () => ({ ok: status < 400, status, json: async () => body })) as any;

test("client deadline produces a timeout state (never an answer)", async () => {
  const r = await aiFetch("http://x", { token: "t", body: {}, timeoutMs: 30, fetchImpl: hang });
  assert.equal(r.status, "timeout");
  assert.match(describeAiStatus(r.status), /No answer was generated/);
});
test("user cancellation produces a canceled state", async () => {
  const ctl = new AbortController();
  const p = aiFetch("http://x", { token: "t", body: {}, signal: ctl.signal, fetchImpl: hang, timeoutMs: 5000 });
  ctl.abort();
  assert.equal((await p).status, "canceled");
});
test("HTTP errors and success are distinguished", async () => {
  assert.equal((await aiFetch("http://x", { token: "t", body: {}, fetchImpl: ok(429, { error: "limit" }) })).httpStatus, 429);
  const r = await aiFetch("http://x", { token: "t", body: {}, fetchImpl: ok(200, { success: true }) });
  assert.equal(r.status, "ok");
  assert.equal(r.data.success, true);
});
test("status descriptions are truthful and retry hints use real retry-after", () => {
  assert.match(describeAiStatus("rate_limited", 12_000), /about 12 s/);
  assert.match(describeAiStatus("unavailable"), /Project management features keep working/);
  assert.match(describeAiStatus("quota_exhausted"), /quota/);
});
test("client request ids are valid idempotency keys", () => {
  const id = newClientRequestId();
  assert.match(id, /^[A-Za-z0-9._:-]{8,64}$/);
  assert.notEqual(id, newClientRequestId());
});
