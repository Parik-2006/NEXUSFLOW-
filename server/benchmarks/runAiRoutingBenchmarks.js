/**
 * Phase 4 — MOCKED AI routing measurements (Section I). No network, no keys:
 * every provider response is synthetic and every latency is injected, so the
 * numbers characterise OmniRoute's routing logic (attempt counts, deadline
 * enforcement, breaker / cache / coalescing behaviour), NOT real provider
 * inference times.  Usage: node benchmarks/runAiRoutingBenchmarks.js
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

process.env.GEMINI_API_KEY = "bench-gemini";
process.env.GROQ_API_KEY = "bench-groq";
delete process.env.OPENROUTER_API_KEY;
const R = await import("../services/omniRoute.js");
const here = path.dirname(fileURLToPath(import.meta.url));

const respond = (text) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }], choices: [{ message: { content: text } }] }), text: async () => "" });
const fail = (status, body = "") => ({ ok: false, status, headers: { get: () => null }, json: async () => ({}), text: async () => body });
const hang = (signal) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(signal.reason), { once: true }));
const modelOf = (url, init) => (url.includes("generativelanguage") ? decodeURIComponent(url.split("/models/")[1].split(":")[0]) : JSON.parse(init.body).model);

async function scenario(name, behave, opts = {}, { reset = true } = {}) {
  if (reset) R.resetAiRoutingState({ env: { AI_REQUEST_DEADLINE_MS: String(opts.deadlineMs ?? 25000) } });
  const calls = [];
  R.aiDeps.fetch = async (url, init) => { const m = modelOf(url, init); calls.push(m); return behave(m, init); };
  const t0 = performance.now();
  const r = await R.omniRouteGenerate({ prompt: "benchmark", ...opts });
  return { scenario: name, status: r.status, providerAttempts: calls.length, attemptedModels: calls, elapsedMs: Math.round(performance.now() - t0), servedBy: r.content ? `${r.provider}/${r.model}` : null };
}

const results = [];
results.push(await scenario("healthy first model", () => respond("ok")));
results.push(await scenario("first model 503 → next eligible model", (m) => (m === "gemini-2.5-flash" ? fail(503) : respond("ok"))));
results.push(await scenario("provider-wide quota exhausted → skip provider", (m) => (m.startsWith("gemini") ? fail(429, "quota exceeded per day") : respond("ok"))));
results.push(await scenario("permanent auth failure (401) → provider skipped", (m) => (m.startsWith("gemini") ? fail(401) : respond("ok"))));
results.push(await scenario("every attempt hangs (deadline 2 s, scaled)", (m, init) => hang(init.signal), { deadlineMs: 2000 }));
// Circuit breaker: Gemini fails 3x, then the next request does not call it.
R.resetAiRoutingState();
for (let i = 0; i < 3; i++) await scenario(`warm-up failure ${i}`, (m) => (m.startsWith("gemini") ? fail(503) : respond("ok")), {}, { reset: false });
results.push(await scenario("after repeated Gemini failures (circuits open)", (m) => (m.startsWith("gemini") ? fail(503) : respond("ok")), {}, { reset: false }));
// Duplicate suppression + cache
R.resetAiRoutingState();
let providerCalls = 0;
R.aiDeps.fetch = async () => { providerCalls++; await new Promise((r) => setTimeout(r, 50)); return respond("ok"); };
const dupOpts = { prompt: "same", scope: { teamId: "bench-ws" }, cache: { input: "same", contextRevision: "r1" } };
const t0 = performance.now();
await Promise.all(Array.from({ length: 10 }, () => R.omniRouteGenerate(dupOpts)));
const coalescedMs = Math.round(performance.now() - t0);
const t1 = performance.now();
const hit = await R.omniRouteGenerate(dupOpts);
results.push({ scenario: "10 identical concurrent requests (same scope)", providerAttempts: providerCalls, elapsedMs: coalescedMs, status: "ok" });
results.push({ scenario: "repeat after completion (cache)", providerAttempts: 0, elapsedMs: Math.round(performance.now() - t1), status: hit.meta.cache });

const oldWorstCaseMs = 5 * 12000 + 8 * 15000 + 1 * 14000; // pre-Phase-4 configured per-model timeouts, sequential
const out = {
  generatedAt: new Date().toISOString(),
  kind: "MOCKED provider responses — routing logic only, not live inference latency",
  environment: { node: process.version, platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model?.trim() },
  previousTheoreticalWorstCaseMs: oldWorstCaseMs,
  currentDeadlineMs: R.aiConfig().deadlineMs,
  currentMaxAttempts: R.aiConfig().maxAttempts,
  results,
};
fs.mkdirSync(path.join(here, "results"), { recursive: true });
fs.writeFileSync(path.join(here, "results", "phase4-ai-routing.json"), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
R.stopAiBackground();
