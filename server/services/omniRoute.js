/**
 * server/services/omniRoute.js — NEXUSFLOW OmniRoute (Phase 4)
 * ============================================================================
 * Zero-cost, bounded, fail-closed LLM routing.
 *
 * Request pipeline (callers authorize the workspace BEFORE calling):
 *   input bounds → secret redaction → AI usage limits → cache / coalescing →
 *   capability-aware candidate selection (verified registry) → zero-cost
 *   assertion (before any network call) → circuit breakers → bounded provider
 *   attempt (per-attempt timeout ≤ remaining global deadline, AbortSignal) →
 *   error classification → next eligible model / provider → truthful result.
 *
 * Guarantees enforced in code:
 *   • only registry models that are enabled, free-eligible and not retired;
 *     unknown / paid / retired / client-supplied unsafe models are rejected
 *     before fetch is called; billable request fields are refused
 *   • one global deadline (AI_REQUEST_DEADLINE_MS, default 25 s, 5–120 s)
 *   • ≤ AI_MAX_PROVIDER_ATTEMPTS attempts; each model at most once per request;
 *     provider-wide failures (auth, quota, payment) skip the whole provider
 *   • cancellation (caller AbortSignal) stops further attempts
 *   • per-user / per-workspace windows and concurrency caps
 *   • no fabricated content: unavailable results carry content:null and a
 *     status; deterministic fallbacks are the CALLER's responsibility and must
 *     be labelled as such
 * NOT guaranteed by code: provider-side billing. Operators must keep the
 * provider projects/accounts on free tiers (see Phase 4 report §F).
 */
import crypto from "node:crypto";
import mongoose from "mongoose";
import { routableModels, findModel, getRegistry, inventory, isRoutable } from "./ai/modelRegistry.js";
import {
  assertZeroCostRoute, ZeroCostViolationError, ProviderError, classifyHttpError, classifyThrown,
  CircuitBreakerRegistry, AiUsageLimiter, ScopedAiCache,
} from "./ai/routingPrimitives.js";
import { redactSecrets } from "./ai/contextGuard.js";
import { logger } from "../utils/logger.js";
import { currentAiScope } from "../utils/requestContext.js";

export { ZeroCostViolationError };

// ── Configuration (bounded) ──────────────────────────────────────────────────
const bounded = (v, def, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};
export function aiConfig(env = process.env) {
  return {
    deadlineMs: bounded(env.AI_REQUEST_DEADLINE_MS, 25_000, 5_000, 120_000),
    maxAttempts: bounded(env.AI_MAX_PROVIDER_ATTEMPTS, 4, 1, 8),
    breakerThreshold: bounded(env.AI_CIRCUIT_FAILURE_THRESHOLD, 3, 1, 20),
    breakerCooldownMs: bounded(env.AI_CIRCUIT_COOLDOWN_MS, 60_000, 5_000, 3_600_000),
    limits: {
      userPerMinute: bounded(env.AI_USER_REQUESTS_PER_MINUTE, 10, 1, 600),
      expensivePerMinute: bounded(env.AI_EXPENSIVE_REQUESTS_PER_MINUTE, 3, 1, 120),
      userConcurrent: bounded(env.AI_USER_CONCURRENT_REQUESTS, 2, 1, 20),
      workspaceConcurrent: bounded(env.AI_WORKSPACE_CONCURRENT_REQUESTS, 3, 1, 50),
      workspacePerMinute: bounded(env.AI_WORKSPACE_REQUESTS_PER_MINUTE, 30, 1, 3000),
    },
    cacheTtlMs: bounded(env.AI_CACHE_TTL_MS, 600_000, 0, 86_400_000),
    cacheMaxEntries: bounded(env.AI_CACHE_MAX_ENTRIES, 500, 0, 10_000),
    maxInputChars: bounded(env.AI_MAX_INPUT_CHARS, 60_000, 1_000, 500_000),
  };
}

let CFG = aiConfig();

/** Injectable dependencies (tests replace fetch / clock; never real network in tests). */
export const aiDeps = {
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
};

export const breakers = new CircuitBreakerRegistry({ failureThreshold: CFG.breakerThreshold, cooldownMs: CFG.breakerCooldownMs, now: () => aiDeps.now() });
export const usageLimiter = new AiUsageLimiter({ now: () => aiDeps.now() });
export const aiCache = new ScopedAiCache({ maxEntries: CFG.cacheMaxEntries, ttlMs: CFG.cacheTtlMs, now: () => aiDeps.now() });

const sweeper = setInterval(() => usageLimiter.sweep(), 60_000);
sweeper.unref?.();

/** Test / ops hook: reset all instance-local AI routing state. */
export function resetAiRoutingState({ env } = {}) {
  if (env) CFG = aiConfig(env);
  breakers.reset();
  breakers.failureThreshold = CFG.breakerThreshold;
  breakers.cooldownMs = CFG.breakerCooldownMs;
  usageLimiter.reset();
  aiCache.clear();
  aiCache.ttlMs = CFG.cacheTtlMs;
  aiCache.maxEntries = CFG.cacheMaxEntries;
  usageRing.length = 0;
}
export function stopAiBackground() { clearInterval(sweeper); }

// ── Keys (server-side only; never logged, never returned) ────────────────────
const KEYS = {
  gemini: () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY || "",
  groq: () => process.env.GROQ_API_KEY || process.env.GROQ_KEY || "",
  openrouter: () => process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_KEY || "",
};
export function providerConfigured(provider) { return Boolean(KEYS[provider]?.()); }

// Legacy export names (now derived from the verified registry).
export const FREE_GEMINI_MODELS = Object.freeze(getRegistry().filter((e) => e.provider === "gemini" && isRoutable(e)).map((e) => e.model));
export const FREE_GROQ_MODELS = Object.freeze(getRegistry().filter((e) => e.provider === "groq" && isRoutable(e)).map((e) => e.model));
export const FREE_OPENROUTER_FALLBACK_MODELS = Object.freeze(getRegistry().filter((e) => e.provider === "openrouter" && isRoutable(e)).map((e) => e.model));

/** Backwards-compatible policy check (registry-backed). */
export function validateZeroCostRoute(provider, model, request) {
  const e = assertZeroCostRoute(provider, model, request);
  return { provider: e.provider, model: e.model, cost: "$0.00" };
}

// ── Message normalisation + redaction ────────────────────────────────────────
function normaliseMessages({ systemPrompt, systemInstruction, prompt, messages }) {
  const sys = systemPrompt || systemInstruction || "";
  let msgs = Array.isArray(messages) && messages.length ? messages : (prompt ? [{ role: "user", content: String(prompt) }] : []);
  msgs = msgs.map((m) => ({
    role: m?.role === "assistant" || m?.role === "model" ? "assistant" : m?.role === "system" ? "system" : "user",
    content: redactSecrets(String(m?.content ?? "")).text,
  })).filter((m) => m.content.trim());
  return { system: redactSecrets(String(sys)).text, messages: msgs };
}

// ── Provider adapters (single attempt; throws ProviderError) ─────────────────
async function readBody(res, max = 400) {
  try { return (await res.text()).slice(0, max); } catch { return ""; }
}

function headersOf(res) {
  return { "retry-after": res.headers?.get?.("retry-after") ?? null };
}

async function callProvider(entry, req, signal) {
  const key = KEYS[entry.provider]();
  if (!key) throw new ProviderError("NOT_CONFIGURED", "Provider not configured.", { scope: "provider" });
  const maxTokens = Math.min(req.maxTokens ?? 1200, entry.maxOutputTokens ?? 2048);
  let url, init, extract;
  if (entry.provider === "gemini") {
    const body = {
      contents: req.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { temperature: req.temperature, maxOutputTokens: maxTokens, ...(req.json ? { responseMimeType: "application/json" } : {}) },
    };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
    // Key in the documented header (never in the URL / logs).
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(entry.model)}:generateContent`;
    init = { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal };
    extract = (d) => ({
      content: d?.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("").trim(),
      usage: { prompt: d?.usageMetadata?.promptTokenCount ?? null, completion: d?.usageMetadata?.candidatesTokenCount ?? null, total: d?.usageMetadata?.totalTokenCount ?? null, reported: Boolean(d?.usageMetadata) },
    });
  } else {
    const messages = [...(req.system ? [{ role: "system", content: req.system }] : []), ...req.messages];
    const body = { model: entry.model, messages, temperature: req.temperature, max_tokens: maxTokens, ...(req.json ? { response_format: { type: "json_object" } } : {}) };
    url = entry.provider === "groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
    if (entry.provider === "openrouter") {
      headers["X-Title"] = "NEXUSFLOW";
      // Never let OpenRouter fall back to another (possibly paid) model.
      body.models = undefined;
      body.route = undefined;
      body.provider = { allow_fallbacks: false };
    }
    init = { method: "POST", headers, body: JSON.stringify(body), signal };
    extract = (d) => ({
      content: String(d?.choices?.[0]?.message?.content ?? "").trim(),
      usage: { prompt: d?.usage?.prompt_tokens ?? null, completion: d?.usage?.completion_tokens ?? null, total: d?.usage?.total_tokens ?? null, reported: Boolean(d?.usage) },
      servedModel: d?.model,
    });
  }
  const res = await aiDeps.fetch(url, init);
  if (!res.ok) throw classifyHttpError(res.status, await readBody(res), headersOf(res));
  let data;
  try { data = await res.json(); } catch { throw new ProviderError("INVALID_RESPONSE", "Provider returned invalid JSON.", { scope: "model", retryable: true }); }
  const out = extract(data);
  if (!out.content) throw new ProviderError("INVALID_RESPONSE", "Provider returned an empty completion.", { scope: "model", retryable: true });
  // OpenRouter: refuse any response served by a different model than the approved ":free" ID.
  const base = (id) => String(id).toLowerCase().replace(/:free$/, "");
  if (entry.provider === "openrouter" && out.servedModel && base(out.servedModel) !== base(entry.model)) {
    throw new ProviderError("POLICY", "OpenRouter served a different model than the approved free variant.", { scope: "provider" });
  }
  return out;
}

// ── Usage accounting (metadata only — never prompts or content) ──────────────
const usageRing = [];
const USAGE_RING_MAX = 500;
let UsageModel = null;
async function recordUsage(evt) {
  usageRing.push(evt);
  if (usageRing.length > USAGE_RING_MAX) usageRing.shift();
  try {
    if (mongoose.connection.readyState !== 1) return;
    if (!UsageModel) UsageModel = (await import("../models/AIUsageEvent.js")).default;
    await UsageModel.create(evt);
  } catch { /* accounting must never break a request */ }
}
export function recentUsage() { return usageRing.slice(); }

// ── Main entry ───────────────────────────────────────────────────────────────
const unavailable = (status, message, extra = {}) => ({
  content: null, provider: "none", model: "none", cost: "$0.00", tier: "tier_ai_unavailable",
  available: false, status, message, ...extra,
});

/**
 * omniRouteGenerate(options) — backwards compatible.
 * New optional fields:
 *   operation, capability, signal (AbortSignal), deadlineMs, expensive,
 *   scope { userId, teamId, projectId }, cache { input, contextRevision, templateVersion, scopeUser },
 *   provider + model (client override → must pass the zero-cost policy),
 *   requestId.
 */
export async function omniRouteGenerate(rawOpts = {}) {
  const started = aiDeps.now();
  // HTTP calls inherit the authenticated scope, correlation id and the
  // client-disconnect signal from the request context (explicit options win).
  const ctx = currentAiScope();
  const opts = {
    ...rawOpts,
    scope: rawOpts.scope || (ctx.userId || ctx.teamId ? { userId: ctx.userId, teamId: ctx.teamId, projectId: ctx.projectId } : undefined),
    signal: rawOpts.signal || ctx.signal,
    expensive: rawOpts.expensive ?? ((rawOpts.maxTokens ?? 0) >= 1500),
  };
  const requestId = typeof opts.requestId === "string" && opts.requestId.length <= 64 ? opts.requestId : ctx.requestId || crypto.randomUUID();
  const operation = String(opts.operation || "general").slice(0, 48);
  const json = opts.responseFormat === "json_object";
  const capability = opts.capability || (json ? "json" : "chat");
  const meta = { requestId, operation, source: "unavailable", status: "unavailable", attempts: 0, elapsedMs: 0, cache: "bypass", errorCode: null, retryAfterMs: null };
  const finish = (result) => {
    meta.elapsedMs = aiDeps.now() - started;
    return { ...result, meta: { ...meta } };
  };

  // 1. Client-supplied model override must satisfy the policy BEFORE anything else.
  let candidates;
  try {
    if (opts.provider || opts.model) {
      const e = assertZeroCostRoute(String(opts.provider || ""), String(opts.model || ""), opts);
      candidates = [e];
    } else {
      candidates = routableModels(capability);
      for (const e of candidates) assertZeroCostRoute(e.provider, e.model, opts); // billable request fields
    }
  } catch (err) {
    meta.status = "policy_rejected";
    meta.errorCode = err.code || "ZERO_COST_POLICY";
    logger.warn("ai:policy_rejected", { requestId, operation, code: meta.errorCode });
    if (opts.throwOnPolicyViolation) throw err;
    return finish(unavailable("policy_rejected", "This AI request is not permitted under the zero-cost policy."));
  }

  // 2. Normalise + redact; bound input size.
  const norm = normaliseMessages(opts);
  if (!norm.messages.length) norm.messages.push({ role: "user", content: "Hello" });
  const inputChars = norm.system.length + norm.messages.reduce((s, m) => s + m.content.length, 0);
  if (inputChars > CFG.maxInputChars) {
    meta.status = "invalid_request"; meta.errorCode = "AI_INPUT_TOO_LARGE";
    return finish(unavailable("invalid_request", "The AI request context is too large."));
  }
  candidates = candidates.filter((e) => providerConfigured(e.provider) && inputChars <= (e.maxInputChars ?? CFG.maxInputChars));
  if (!candidates.length) {
    meta.status = "unavailable"; meta.errorCode = "AI_NOT_CONFIGURED";
    return finish(unavailable("unavailable", "AI services are not configured. Deterministic features remain available."));
  }

  // 3. Per-user / per-workspace usage limits (no provider call when limited).
  const scope = opts.scope || {};
  let lease = null;
  if (scope.userId || scope.teamId) {
    const r = usageLimiter.tryAcquire({ userId: scope.userId && String(scope.userId), teamId: scope.teamId && String(scope.teamId), expensive: Boolean(opts.expensive) }, CFG.limits);
    if (!r.ok) {
      meta.status = "rate_limited"; meta.errorCode = r.code; meta.retryAfterMs = r.retryAfterMs;
      return finish(unavailable("rate_limited", r.code === "AI_CONCURRENCY_LIMIT" ? "Too many AI requests in progress. Please wait for the current one to finish." : "AI request limit reached. Please try again shortly.", { retryAfterMs: r.retryAfterMs }));
    }
    lease = r.lease;
  }

  try {
    // 4. Cache / coalescing (only when the caller opts in with a scoped key).
    const cacheable = Boolean(opts.cache && CFG.cacheTtlMs > 0 && CFG.cacheMaxEntries > 0);
    let cacheKey = null;
    if (cacheable) {
      cacheKey = aiCache.key({
        teamId: scope.teamId, projectId: scope.projectId, scopeUser: opts.cache.scopeUser ?? null, operation,
        templateVersion: opts.cache.templateVersion ?? 1, contextRevision: opts.cache.contextRevision ?? null,
        modelConfig: candidates.map((e) => e.model).join(","), input: opts.cache.input ?? norm,
      });
      const hit = aiCache.get(cacheKey);
      if (hit) {
        meta.source = "cache"; meta.status = "ok"; meta.cache = "hit";
        return finish({ ...hit, cached: true });
      }
      const { shared, result } = await aiCache.coalesce(cacheKey, () => runAttempts(candidates, norm, opts, meta, requestId, operation, json));
      meta.cache = shared ? "shared" : "miss";
      if (result.content && !shared) aiCache.set(cacheKey, stripMeta(result), scope.teamId);
      if (shared) { meta.source = result.content ? "provider" : meta.source; meta.status = result.content ? "ok" : result.status; }
      return finish(result);
    }
    return finish(await runAttempts(candidates, norm, opts, meta, requestId, operation, json));
  } finally {
    lease?.release();
  }
}

function stripMeta(r) {
  const { meta, ...rest } = r;
  return rest;
}

async function runAttempts(candidates, norm, opts, meta, requestId, operation, json) {
  const started = aiDeps.now();
  const deadlineMs = bounded(opts.deadlineMs, CFG.deadlineMs, 1_000, 120_000);
  const deadlineAt = started + deadlineMs;
  const external = opts.signal;
  const errors = [];
  const skipProviders = new Set();
  const temperature = Number.isFinite(opts.temperature) ? opts.temperature : 0.3;

  for (const entry of candidates) {
    if (meta.attempts >= CFG.maxAttempts) { meta.errorCode = meta.errorCode || "AI_ATTEMPTS_EXHAUSTED"; break; }
    if (external?.aborted) { meta.status = "canceled"; meta.errorCode = "AI_CANCELED"; break; }
    if (skipProviders.has(entry.provider)) continue;
    const remaining = deadlineAt - aiDeps.now();
    if (remaining < 250) { meta.status = "deadline"; meta.errorCode = "AI_DEADLINE"; break; }

    const pKey = `p:${entry.provider}`, mKey = `m:${entry.provider}:${entry.model}`;
    const pGate = breakers.acquire(pKey);
    if (!pGate.allowed) { skipProviders.add(entry.provider); errors.push({ provider: entry.provider, model: entry.model, kind: "CIRCUIT_OPEN" }); if (pGate.retryAt) meta.retryAfterMs = Math.max(0, pGate.retryAt - aiDeps.now()); continue; }
    const mGate = breakers.acquire(mKey);
    if (!mGate.allowed) { breakers.release(pKey); errors.push({ provider: entry.provider, model: entry.model, kind: "CIRCUIT_OPEN" }); continue; }

    // Re-assert the policy immediately before the network call (fail-closed).
    try { assertZeroCostRoute(entry.provider, entry.model, opts); } catch { breakers.release(pKey); breakers.release(mKey); continue; }

    meta.attempts += 1;
    const attemptCtl = new AbortController();
    const attemptTimeout = Math.max(1, Math.min(entry.timeoutMs ?? 12_000, remaining));
    const timer = setTimeout(() => attemptCtl.abort(new DOMException("attempt timeout", "TimeoutError")), attemptTimeout);
    const onExternal = () => attemptCtl.abort(new DOMException("canceled", "AbortError"));
    external?.addEventListener?.("abort", onExternal, { once: true });
    const t0 = aiDeps.now();
    try {
      const out = await callProvider(entry, { system: norm.system, messages: norm.messages, temperature, maxTokens: opts.maxTokens, json }, attemptCtl.signal);
      if (external?.aborted) throw new ProviderError("CANCELED", "Request canceled.", { scope: "request" }); // late response after cancel
      breakers.success(pKey); breakers.success(mKey);
      meta.source = "provider"; meta.status = "ok";
      recordUsage({ requestId, operation, provider: entry.provider, model: entry.model, outcome: "ok", durationMs: aiDeps.now() - t0, attempt: meta.attempts, tokens: out.usage, at: new Date(aiDeps.now()) });
      return {
        content: out.content, provider: entry.provider, model: entry.model, cost: "$0.00",
        tier: `tier_${entry.provider}_free`, available: true, status: "ok", tokensUsed: out.usage,
      };
    } catch (raw) {
      const err = classifyThrown(raw, { canceled: Boolean(external?.aborted), deadlineHit: aiDeps.now() >= deadlineAt });
      errors.push({ provider: entry.provider, model: entry.model, kind: err.kind });
      recordUsage({ requestId, operation, provider: entry.provider, model: entry.model, outcome: err.kind, durationMs: aiDeps.now() - t0, attempt: meta.attempts, at: new Date(aiDeps.now()) });
      logger.warn("ai:attempt_failed", { requestId, operation, provider: entry.provider, model: entry.model, kind: err.kind });
      if (err.kind === "CANCELED") { breakers.release(pKey); breakers.release(mKey); meta.status = "canceled"; meta.errorCode = "AI_CANCELED"; break; }
      if (err.kind === "DEADLINE") { breakers.release(pKey); breakers.release(mKey); meta.status = "deadline"; meta.errorCode = "AI_DEADLINE"; break; }
      if (err.scope === "provider") { breakers.failure(pKey, err); breakers.release(mKey); skipProviders.add(entry.provider); }
      else { breakers.failure(mKey, err); breakers.release(pKey); }
      if (err.retryAfterMs) meta.retryAfterMs = err.retryAfterMs;
      if (err.scope === "request") { meta.status = "invalid_request"; meta.errorCode = "AI_INVALID_REQUEST"; break; }
      meta.errorCode = `AI_${err.kind}`;
    } finally {
      clearTimeout(timer);
      external?.removeEventListener?.("abort", onExternal);
    }
  }

  const status = meta.status === "canceled" || meta.status === "deadline" || meta.status === "invalid_request" ? meta.status
    : errors.some((e) => e.kind === "QUOTA_EXHAUSTED" || e.kind === "RATE_LIMIT") ? "quota_exhausted" : "unavailable";
  meta.status = status;
  const messages = {
    canceled: "The AI request was canceled.",
    deadline: "The AI request timed out. Please try again.",
    invalid_request: "The AI provider rejected this request.",
    quota_exhausted: "Free AI provider quota is currently exhausted. Please try again later.",
    unavailable: "AI services are currently unavailable across the configured free providers. Deterministic features remain available.",
  };
  return unavailable(status, messages[status], { errors, retryAfterMs: meta.retryAfterMs });
}

/** Sanitised diagnostics: registry + breaker states (no keys, no prompts). */
export function aiDiagnostics() {
  return {
    registry: inventory().map((m) => ({ ...m, providerConfigured: providerConfigured(m.provider) })),
    breakers: breakers.snapshot(),
    config: { deadlineMs: CFG.deadlineMs, maxAttempts: CFG.maxAttempts, limits: CFG.limits },
  };
}

// ── Legacy single-provider helpers (policy-checked; kept for compatibility) ──
async function legacySingle(provider, opts) {
  const model = opts.model;
  validateZeroCostRoute(provider, model, opts); // throws ZeroCostViolationError before any call
  const r = await omniRouteGenerate({ ...opts, provider, model });
  if (!r.content) throw new Error(`${provider} ${model} unavailable (${r.status}).`);
  return r;
}
export const executeGeminiFree = (opts = {}) => legacySingle("gemini", { model: "gemini-2.5-flash", ...opts });
export const executeGroqFree = (opts = {}) => legacySingle("groq", { model: "openai/gpt-oss-20b", ...opts });
export const executeOpenRouterFree = (opts = {}) => legacySingle("openrouter", { model: "openrouter/free", ...opts });
export { findModel };
