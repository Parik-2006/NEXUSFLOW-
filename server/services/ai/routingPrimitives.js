/**
 * server/services/ai/routingPrimitives.js — NEXUSFLOW Phase 4 (Tasks 2–5)
 * Zero-cost policy, error classification, circuit breakers, usage limits.
 * All state is instance-local and bounded (multi-server coordination: Phase 5).
 */
import crypto from "node:crypto";
import { findModel, isRoutable } from "./modelRegistry.js";

// ─────────────────────────────────────────────────────────────────────────────
// Zero-cost policy (fail-closed, checked BEFORE any network call)
// ─────────────────────────────────────────────────────────────────────────────
export class ZeroCostViolationError extends Error {
  constructor(message, code = "ZERO_COST_POLICY") {
    super(`[OmniRoute $0 Cost Policy Violation] ${message}`);
    this.name = "ZeroCostViolationError";
    this.code = code;
  }
}

const PAID_ONLY_REQUEST_FIELDS = ["tools", "tool_choice", "googleSearch", "grounding", "webSearch", "plugins", "web_search_options", "searchGrounding"];

/**
 * assertZeroCostRoute(provider, model, request?) — throws unless the route is a
 * registered, enabled, free-eligible, non-retired model and the request uses
 * no billable add-ons. Returns the registry entry.
 */
export function assertZeroCostRoute(provider, model, request = {}) {
  if (typeof provider !== "string" || !provider.trim()) throw new ZeroCostViolationError("Provider must be a valid string.", "INVALID_PROVIDER");
  if (typeof model !== "string" || !model.trim()) throw new ZeroCostViolationError("Model ID must be a valid string.", "INVALID_MODEL");
  const entry = findModel(provider, model);
  if (!entry) throw new ZeroCostViolationError(`Model "${provider}:${model}" is not in the verified registry.`, "UNKNOWN_MODEL");
  if (entry.status === "VERIFIED_RETIRED") throw new ZeroCostViolationError(`Model "${entry.model}" is retired.`, "RETIRED_MODEL");
  if (!entry.freeEligible) throw new ZeroCostViolationError(`Model "${entry.model}" has no verified free-tier eligibility.`, "FREE_ELIGIBILITY_UNVERIFIED");
  if (!isRoutable(entry)) throw new ZeroCostViolationError(`Model "${entry.model}" is disabled.`, "MODEL_DISABLED");
  for (const f of PAID_ONLY_REQUEST_FIELDS) {
    if (request && request[f] !== undefined && request[f] !== null && request[f] !== false) {
      throw new ZeroCostViolationError(`Request field "${f}" may enable billable tools and is not permitted.`, "PAID_FEATURE");
    }
  }
  return entry;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error classification
// ─────────────────────────────────────────────────────────────────────────────
/**
 * kind: AUTH | PERMISSION | MODEL_UNAVAILABLE | INVALID_REQUEST | RATE_LIMIT |
 *       QUOTA_EXHAUSTED | TRANSIENT | TIMEOUT | INVALID_RESPONSE | CANCELED |
 *       DEADLINE | POLICY | NOT_CONFIGURED
 * scope: "model" (skip this model) | "provider" (skip provider) | "request" (stop)
 */
export class ProviderError extends Error {
  constructor(kind, message, { scope = "model", retryable = false, retryAfterMs = null, status = null } = {}) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.scope = scope;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.status = status;
  }
}

export function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined || value === "") return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 3600_000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, Math.min(at - now, 3600_000)) : null;
}

/** Classify an HTTP failure. `body` is a bounded snippet, never logged raw. */
export function classifyHttpError(status, body = "", headers = {}) {
  const text = String(body || "").toLowerCase();
  const retryAfterMs = parseRetryAfter(headers?.["retry-after"] ?? headers?.get?.("retry-after"));
  if (status === 401) return new ProviderError("AUTH", "Provider rejected the API key.", { scope: "provider", status });
  if (status === 403) return new ProviderError("PERMISSION", "Provider denied access.", { scope: "provider", status });
  if (status === 404 || /not found|does not exist|decommission|deprecat|no longer (supported|available)/.test(text)) {
    return new ProviderError("MODEL_UNAVAILABLE", "Model unavailable or retired.", { scope: "model", status });
  }
  if (status === 402 || /insufficient (credits|balance)|payment required|billing/.test(text)) {
    return new ProviderError("POLICY", "Provider requested payment; route refused under the zero-cost policy.", { scope: "provider", status });
  }
  if (status === 429) {
    const quota = /quota|exhausted|per day|daily|resource_exhausted|limit: 0/.test(text);
    return new ProviderError(quota ? "QUOTA_EXHAUSTED" : "RATE_LIMIT", quota ? "Free quota exhausted." : "Rate limited.",
      { scope: quota ? "provider" : "model", retryable: !quota, retryAfterMs, status });
  }
  if (status === 400 || status === 413 || status === 422) return new ProviderError("INVALID_REQUEST", "Provider rejected the request.", { scope: "request", status });
  if (status >= 500) return new ProviderError("TRANSIENT", "Temporary provider failure.", { scope: "model", retryable: true, retryAfterMs, status });
  return new ProviderError("TRANSIENT", `Unexpected provider status ${status}.`, { scope: "model", retryable: true, status });
}

export function classifyThrown(err, { canceled = false, deadlineHit = false } = {}) {
  if (err instanceof ProviderError) return err;
  if (canceled) return new ProviderError("CANCELED", "Request canceled.", { scope: "request" });
  if (deadlineHit) return new ProviderError("DEADLINE", "Request deadline reached.", { scope: "request" });
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return new ProviderError("TIMEOUT", "Provider attempt timed out.", { scope: "model", retryable: true });
  return new ProviderError("TRANSIENT", "Network error contacting provider.", { scope: "provider", retryable: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Circuit breaker (per provider and per model), injectable clock
// ─────────────────────────────────────────────────────────────────────────────
export const BREAKER_STATES = Object.freeze(["HEALTHY", "DEGRADED", "RATE_LIMITED", "CIRCUIT_OPEN", "HALF_OPEN", "DISABLED"]);

export class CircuitBreakerRegistry {
  constructor({ failureThreshold = 3, cooldownMs = 60_000, now = () => Date.now() } = {}) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.state = new Map(); // key -> { state, failures, openUntil, probeInFlight, lastSuccessAt }
  }
  _get(key) {
    let s = this.state.get(key);
    if (!s) { s = { state: "HEALTHY", failures: 0, openUntil: 0, probeInFlight: false, lastSuccessAt: 0 }; this.state.set(key, s); }
    return s;
  }
  /** Returns { allowed, state, retryAt, probe } and reserves a half-open probe slot. */
  acquire(key) {
    const s = this._get(key);
    const t = this.now();
    if (s.state === "DISABLED") return { allowed: false, state: s.state, retryAt: null };
    if (s.state === "CIRCUIT_OPEN" || s.state === "RATE_LIMITED") {
      if (t < s.openUntil) return { allowed: false, state: s.state, retryAt: s.openUntil };
      s.state = "HALF_OPEN";
    }
    if (s.state === "HALF_OPEN") {
      if (s.probeInFlight) return { allowed: false, state: s.state, retryAt: null }; // one probe at a time (no storm)
      s.probeInFlight = true;
      return { allowed: true, state: s.state, probe: true };
    }
    return { allowed: true, state: s.state };
  }
  success(key) {
    const s = this._get(key);
    Object.assign(s, { state: "HEALTHY", failures: 0, openUntil: 0, probeInFlight: false, lastSuccessAt: this.now() });
  }
  /** release a probe slot without recording an outcome (e.g. request canceled). */
  release(key) { this._get(key).probeInFlight = false; }
  failure(key, err) {
    const s = this._get(key);
    s.probeInFlight = false;
    const t = this.now();
    if (err?.kind === "AUTH" || err?.kind === "PERMISSION" || err?.kind === "POLICY") {
      s.state = "DISABLED"; // permanent configuration failure: no retries until restart / reset
      return;
    }
    if (err?.kind === "RATE_LIMIT" || err?.kind === "QUOTA_EXHAUSTED") {
      s.state = "RATE_LIMITED";
      s.openUntil = t + (err.retryAfterMs ?? (err.kind === "QUOTA_EXHAUSTED" ? 10 * this.cooldownMs : this.cooldownMs));
      return;
    }
    if (err?.kind === "MODEL_UNAVAILABLE") { s.state = "DISABLED"; return; }
    s.failures += 1;
    if (s.state === "HALF_OPEN" || s.failures >= this.failureThreshold) {
      s.state = "CIRCUIT_OPEN";
      s.openUntil = t + this.cooldownMs;
    } else {
      s.state = "DEGRADED";
    }
  }
  snapshot() {
    return Object.fromEntries([...this.state.entries()].map(([k, v]) => [k, { state: v.state, failures: v.failures, openUntil: v.openUntil || null }]));
  }
  reset() { this.state.clear(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI usage limits: per user / workspace windows + concurrency (bounded maps)
// ─────────────────────────────────────────────────────────────────────────────
export class AiUsageLimiter {
  constructor({ now = () => Date.now(), maxKeys = 20000 } = {}) {
    this.now = now;
    this.maxKeys = maxKeys;
    this.windows = new Map(); // key -> number[] timestamps
    this.active = new Map(); // key -> count
  }
  _prune(arr, windowMs) {
    const cutoff = this.now() - windowMs;
    let i = 0;
    while (i < arr.length && arr[i] <= cutoff) i++;
    if (i) arr.splice(0, i);
    return arr;
  }
  _evict() {
    if (this.windows.size <= this.maxKeys) return;
    const drop = this.windows.size - this.maxKeys;
    let n = 0;
    for (const k of this.windows.keys()) { this.windows.delete(k); if (++n >= drop) break; }
  }
  /**
   * tryAcquire({ userId, teamId, cost }, limits) → { ok, lease?, code?, retryAfterMs? }
   * limits: { userPerMinute, expensivePerMinute, userConcurrent, workspaceConcurrent, workspacePerMinute }
   */
  tryAcquire({ userId, teamId, expensive = false }, limits) {
    const t = this.now();
    const W = 60_000;
    const checks = [];
    if (userId) checks.push([`u:${userId}`, limits.userPerMinute]);
    if (userId && expensive) checks.push([`ux:${userId}`, limits.expensivePerMinute]);
    if (teamId) checks.push([`w:${teamId}`, limits.workspacePerMinute]);
    for (const [key, max] of checks) {
      const arr = this._prune(this.windows.get(key) || [], W);
      if (arr.length >= max) return { ok: false, code: "AI_RATE_LIMITED", retryAfterMs: Math.max(0, arr[0] + W - t) };
    }
    if (userId && (this.active.get(`u:${userId}`) || 0) >= limits.userConcurrent) return { ok: false, code: "AI_CONCURRENCY_LIMIT", retryAfterMs: null };
    if (teamId && (this.active.get(`w:${teamId}`) || 0) >= limits.workspaceConcurrent) return { ok: false, code: "AI_CONCURRENCY_LIMIT", retryAfterMs: null };
    for (const [key] of checks) {
      const arr = this.windows.get(key) || [];
      arr.push(t);
      this.windows.set(key, arr);
    }
    this._evict();
    const keys = [userId && `u:${userId}`, teamId && `w:${teamId}`].filter(Boolean);
    for (const k of keys) this.active.set(k, (this.active.get(k) || 0) + 1);
    let released = false;
    return {
      ok: true,
      lease: { release: () => {
        if (released) return;
        released = true;
        for (const k of keys) { const v = (this.active.get(k) || 1) - 1; if (v <= 0) this.active.delete(k); else this.active.set(k, v); }
      } },
    };
  }
  sweep() {
    for (const [k, arr] of this.windows) if (!this._prune(arr, 60_000).length) this.windows.delete(k);
  }
  size() { return { windows: this.windows.size, active: this.active.size }; }
  reset() { this.windows.clear(); this.active.clear(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoped response cache with in-flight coalescing (bounded LRU + TTL)
// ─────────────────────────────────────────────────────────────────────────────
export class ScopedAiCache {
  constructor({ maxEntries = 500, ttlMs = 10 * 60_000, now = () => Date.now() } = {}) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.now = now;
    this.map = new Map(); // key -> { value, expiresAt, teamId }
    this.inflight = new Map(); // key -> Promise
    this.epochs = new Map(); // teamId -> epoch (bumped on invalidation)
  }
  static hash(parts) {
    return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  }
  epoch(teamId) { return this.epochs.get(String(teamId ?? "-")) ?? 0; }
  /** Key = scope (workspace epoch, project, user/authz scope) + op + template + input + model config. */
  key({ teamId, projectId, scopeUser, operation, templateVersion, input, contextRevision, modelConfig }) {
    return ScopedAiCache.hash([String(teamId ?? "-"), this.epoch(teamId), String(projectId ?? "-"), String(scopeUser ?? "-"), operation, templateVersion, contextRevision ?? null, modelConfig ?? null, input]);
  }
  get(key) {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expiresAt <= this.now()) { this.map.delete(key); return null; }
    this.map.delete(key); this.map.set(key, e); // LRU touch
    return e.value;
  }
  set(key, value, teamId) {
    this.map.set(key, { value, expiresAt: this.now() + this.ttlMs, teamId: String(teamId ?? "-") });
    while (this.map.size > this.maxEntries) this.map.delete(this.map.keys().next().value);
  }
  /** Coalesce identical concurrent work; only successful results are cached by the caller. */
  async coalesce(key, work) {
    if (this.inflight.has(key)) return { shared: true, result: await this.inflight.get(key) };
    const p = (async () => work())();
    this.inflight.set(key, p);
    try { return { shared: false, result: await p }; } finally { this.inflight.delete(key); }
  }
  invalidateWorkspace(teamId) {
    const t = String(teamId ?? "-");
    this.epochs.set(t, this.epoch(t) + 1);
    for (const [k, e] of this.map) if (e.teamId === t) this.map.delete(k);
  }
  size() { return this.map.size; }
  clear() { this.map.clear(); this.inflight.clear(); this.epochs.clear(); }
}
