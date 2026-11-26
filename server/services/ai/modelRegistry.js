/**
 * server/services/ai/modelRegistry.js — NEXUSFLOW Phase 4 (Task 1, D-27)
 * ============================================================================
 * Single source of truth for which provider/model routes OmniRoute may use.
 *
 * Every entry records its verification status against OFFICIAL provider
 * documentation (see report §D for URLs). Verification date: 2026-11-26.
 *
 *   status        VERIFIED_AVAILABLE | CONDITIONALLY_AVAILABLE | VERIFIED_RETIRED
 *                 | FREE_ELIGIBILITY_UNVERIFIED | UNVERIFIED
 *   freeEligible  true only when official docs list the model on a no-billing
 *                 free tier / zero-priced endpoint. Never inferred from the
 *                 provider merely offering a free tier for SOME models.
 *   enabled       default routing state. A route is usable only if
 *                 enabled && freeEligible && status ∈ ROUTABLE_STATUSES.
 *
 * Operators can only NARROW the set (AI_DISABLED_MODELS), or add OpenRouter
 * ":free" variants (OPENROUTER_FREE_MODELS) — the documented zero-price
 * suffix. There is no switch that enables a retired, paid or unverified model.
 */

export const VERIFIED_ON = "2026-11-26";

export const CAPABILITIES = Object.freeze([
  "chat", "json", "decomposition", "planning", "code", "research", "long_context", "classification", "explanation",
]);

const ALL_TEXT = ["chat", "json", "decomposition", "planning", "code", "research", "classification", "explanation"];

export const ROUTABLE_STATUSES = new Set(["VERIFIED_AVAILABLE", "CONDITIONALLY_AVAILABLE"]);

const SRC = {
  geminiPricing: "https://ai.google.dev/gemini-api/docs/pricing",
  geminiDeprecations: "https://ai.google.dev/gemini-api/docs/deprecations",
  geminiChangelog: "https://ai.google.dev/gemini-api/docs/changelog",
  groqModels: "https://console.groq.com/docs/models",
  groqDeprecations: "https://console.groq.com/docs/deprecations",
  groqRateLimits: "https://console.groq.com/docs/rate-limits",
  orVariants: "https://openrouter.ai/docs/guides/routing/model-variants/overview",
  orFree: "https://openrouter.ai/collections/free-models",
};

/** Base registry (order = routing preference within a provider). */
const BASE = [
  // ── Google Gemini (Developer API / AI Studio key, no billing account linked) ──
  { provider: "gemini", model: "gemini-2.5-flash", status: "CONDITIONALLY_AVAILABLE", freeEligible: true, enabled: true,
    capabilities: [...ALL_TEXT, "long_context"], maxInputChars: 60000, maxOutputTokens: 2048, timeoutMs: 12000,
    note: "Free tier listed on the pricing page. Release notes restrict 2.5 access to projects that used it before; free tier ends if a billing account is linked.",
    sources: [SRC.geminiPricing, SRC.geminiChangelog] },
  { provider: "gemini", model: "gemini-2.5-flash-lite", status: "CONDITIONALLY_AVAILABLE", freeEligible: true, enabled: true,
    capabilities: [...ALL_TEXT], maxInputChars: 40000, maxOutputTokens: 2048, timeoutMs: 10000,
    note: "Free tier listed on the pricing page; same 2.5-access condition as above.",
    sources: [SRC.geminiPricing, SRC.geminiChangelog] },
  { provider: "gemini", model: "gemini-3.1-flash-lite", status: "FREE_ELIGIBILITY_UNVERIFIED", freeEligible: false, enabled: false,
    capabilities: [...ALL_TEXT], maxInputChars: 40000, maxOutputTokens: 2048, timeoutMs: 10000,
    note: "Named as a replacement on the deprecations page; free-tier pricing not verified.", sources: [SRC.geminiDeprecations] },
  { provider: "gemini", model: "gemini-2.0-flash", status: "VERIFIED_RETIRED", freeEligible: false, enabled: false,
    capabilities: [], note: "Shut down 2026-06-01.", sources: [SRC.geminiChangelog, SRC.geminiDeprecations] },
  { provider: "gemini", model: "gemini-1.5-flash", status: "VERIFIED_RETIRED", freeEligible: false, enabled: false,
    capabilities: [], note: "Shut down 2025-09-29.", sources: [SRC.geminiChangelog] },
  { provider: "gemini", model: "gemini-1.5-flash-8b", status: "VERIFIED_RETIRED", freeEligible: false, enabled: false,
    capabilities: [], note: "Shut down 2025-09-29.", sources: [SRC.geminiChangelog] },

  // ── Groq (free/base plan: no billing; documented base rate limits) ──────────
  { provider: "groq", model: "openai/gpt-oss-20b", status: "VERIFIED_AVAILABLE", freeEligible: true, enabled: true,
    capabilities: [...ALL_TEXT, "long_context"], maxInputChars: 30000, maxOutputTokens: 2048, timeoutMs: 10000,
    note: "Production model; base-plan limits apply (published figures conflict between pages).", sources: [SRC.groqModels, SRC.groqRateLimits] },
  { provider: "groq", model: "openai/gpt-oss-120b", status: "VERIFIED_AVAILABLE", freeEligible: true, enabled: true,
    capabilities: [...ALL_TEXT, "long_context"], maxInputChars: 30000, maxOutputTokens: 2048, timeoutMs: 12000,
    note: "Production model; recommended replacement for Llama 3.3 70B.", sources: [SRC.groqModels, SRC.groqDeprecations] },
  { provider: "groq", model: "qwen/qwen3.8-27b", status: "UNVERIFIED", freeEligible: false, enabled: false,
    capabilities: [...ALL_TEXT], note: "Official pages disagree on the Qwen model ID (3.6 vs 3.8); not routed.", sources: [SRC.groqDeprecations] },
  { provider: "groq", model: "llama-3.3-70b-versatile", status: "VERIFIED_RETIRED", freeEligible: false, enabled: false,
    capabilities: [], note: "Deprecation scheduled 2026-08-16 (date passed).", sources: [SRC.groqDeprecations] },
  { provider: "groq", model: "llama-3.1-8b-instant", status: "VERIFIED_RETIRED", freeEligible: false, enabled: false,
    capabilities: [], note: "Deprecation scheduled 2026-08-16 (date passed); models page still lists it — conflict noted.", sources: [SRC.groqDeprecations, SRC.groqModels] },
  { provider: "groq", model: "gemma2-9b-it", status: "VERIFIED_RETIRED", freeEligible: false, enabled: false,
    capabilities: [], note: "Deprecated 2025-10-08.", sources: [SRC.groqDeprecations] },
  { provider: "groq", model: "mixtral-8x7b-32768", status: "VERIFIED_RETIRED", freeEligible: false, enabled: false,
    capabilities: [], note: "Removed 2025.", sources: [SRC.groqDeprecations] },
  { provider: "groq", model: "llama-3.1-70b-versatile", status: "VERIFIED_RETIRED", freeEligible: false, enabled: false,
    capabilities: [], note: "Retired 2024-12-20 (auto-upgraded alias).", sources: [SRC.groqDeprecations] },

  // ── OpenRouter ──────────────────────────────────────────────────────────────
  { provider: "openrouter", model: "openrouter/free", status: "UNVERIFIED", freeEligible: false, enabled: false,
    capabilities: [], note: "No official documentation of this router's pricing/selection was found; disabled (could not prove it never selects a paid endpoint).", sources: [SRC.orVariants] },
];

/** OpenRouter ":free" variant IDs: provider/model:free, conservative charset. */
const OR_FREE_ID = /^[a-z0-9][a-z0-9._-]{0,63}\/[a-z0-9][a-z0-9._-]{0,95}:free$/;

function parseList(v) {
  return String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Build the effective registry from env (pure; env injectable for tests). */
export function buildRegistry(env = process.env) {
  const disabled = new Set(parseList(env.AI_DISABLED_MODELS).map((s) => s.toLowerCase()));
  const entries = BASE.map((e) => ({ ...e, verifiedOn: VERIFIED_ON }));
  for (const id of parseList(env.OPENROUTER_FREE_MODELS)) {
    const lower = id.toLowerCase();
    if (!OR_FREE_ID.test(lower) || entries.some((e) => e.provider === "openrouter" && e.model === lower)) continue;
    entries.push({
      provider: "openrouter", model: lower, status: "CONDITIONALLY_AVAILABLE", freeEligible: true, enabled: true,
      capabilities: [...ALL_TEXT], maxInputChars: 24000, maxOutputTokens: 1536, timeoutMs: 12000,
      note: "Operator-approved ':free' variant (zero-priced per OpenRouter docs; 20 RPM / 50 RPD account caps). Never stripped of its suffix.",
      sources: [SRC.orVariants, SRC.orFree], verifiedOn: VERIFIED_ON, operatorApproved: true,
    });
  }
  for (const e of entries) if (disabled.has(e.model.toLowerCase()) || disabled.has(`${e.provider}:${e.model}`.toLowerCase())) e.enabled = false;
  return Object.freeze(entries.map((e) => Object.freeze(e)));
}

let REGISTRY = buildRegistry();
export function getRegistry() { return REGISTRY; }
/** Test hook: rebuild from a synthetic env. */
export function setRegistryForTests(env) { REGISTRY = buildRegistry(env ?? process.env); }

export function findModel(provider, model) {
  if (typeof provider !== "string" || typeof model !== "string") return null;
  const p = provider.toLowerCase().trim(), m = model.toLowerCase().trim();
  return REGISTRY.find((e) => e.provider === p && e.model.toLowerCase() === m) || null;
}

export function isRoutable(entry) {
  return Boolean(entry && entry.enabled && entry.freeEligible && ROUTABLE_STATUSES.has(entry.status));
}

/** Routable models supporting `capability`, in preference order. */
export function routableModels(capability = "chat") {
  return REGISTRY.filter((e) => isRoutable(e) && (e.capabilities || []).includes(capability));
}

/** Sanitised inventory for diagnostics / reports (no keys). */
export function inventory() {
  return REGISTRY.map(({ provider, model, status, freeEligible, enabled, capabilities, note, sources, verifiedOn }) => ({
    provider, model, status, freeEligible, enabled, routable: isRoutable({ enabled, freeEligible, status }), capabilities, note, sources, verifiedOn,
  }));
}
