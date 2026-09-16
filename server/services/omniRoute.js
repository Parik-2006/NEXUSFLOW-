/**
 * server/services/omniRoute.js
 * ============================================================================
 * OMNIROUTE — HARD $0 LLM ROUTING ENGINE FOR NEXUSFLOW
 *
 * STRICT FINANCIAL SAFETY POLICY:
 * Total Allowed API Spending: $0.00
 *
 * ALLOWED PROVIDERS & ROUTES (PRIORITY ORDER):
 * 1. Google Gemini Free Tier (PRIMARY):
 *    - gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.0-flash,
 *      gemini-1.5-flash, gemini-1.5-flash-8b
 *    ($0 input / $0 output on Google AI Studio Free Tier)
 * 2. Groq Free Tier (FIRST FALLBACK):
 *    - llama-3.3-70b-versatile, llama-3.1-8b-instant, gemma2-9b-it,
 *      mixtral-8x7b-32768, llama-3.1-70b-versatile
 *    ($0 on Groq Free Tier — rate-limited, no billing required)
 * 3. OpenRouter Free Models (SECOND FALLBACK):
 *    - openrouter/free   (OpenRouter's official $0 Free Models Router)
 *    - Explicitly free models whose model ID ends with ":free"
 *      (e.g., meta-llama/llama-3.3-70b-instruct:free, deepseek/deepseek-r1:free)
 *
 * IF ALL THREE AI PROVIDERS FAIL OR EXHAUST QUOTA:
 * -> Returns graceful AI-unavailable response ($0.00).
 * -> DAA deterministic engine is NEVER treated as an AI provider or AI fallback.
 *
 * FORBIDDEN (FAIL-CLOSED):
 * - Any model requiring paid billing, prepaid credits, or trials that expire
 * - Any OpenRouter model without ":free" (and not openrouter/free)
 * - OpenAI paid models (gpt-4, gpt-4o, gpt-3.5-turbo)
 * - Anthropic Claude paid models
 * - Unrestricted automatic routing ("model: auto") that could pick paid endpoints
 * - Any paid fallback chain
 *
 * LOGGING SAFETY:
 * - API keys, Authorization headers, and secrets are NEVER logged.
 * ============================================================================
 */

// ── Strict Free-Tier Whitelists ──────────────────────────────────────────────

export const FREE_GEMINI_MODELS = Object.freeze([
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
]);

export const FREE_GROQ_MODELS = Object.freeze([
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gemma2-9b-it",
  "mixtral-8x7b-32768",
  "llama-3.1-70b-versatile",
]);


export const FREE_OPENROUTER_FALLBACK_MODELS = Object.freeze([
  "openrouter/free",
]);

// Custom Error class for $0 Cost Policy Violations
export class ZeroCostViolationError extends Error {
  constructor(message) {
    super(`[OmniRoute $0 Cost Policy Violation] ${message}`);
    this.name = "ZeroCostViolationError";
  }
}

// ── Validation Guard: Fail-Closed Route Verifier ──────────────────────────────
/**
 * Strictly verifies that a given provider and model ID qualify under the $0 cost policy.
 * Throws ZeroCostViolationError if any paid route is detected.
 */
export function validateZeroCostRoute(provider, model) {
  if (!provider || typeof provider !== "string") {
    throw new ZeroCostViolationError("Provider must be a valid string.");
  }
  if (!model || typeof model !== "string") {
    throw new ZeroCostViolationError("Model ID must be a valid string.");
  }

  const p = provider.toLowerCase().trim();
  const m = model.trim();

  if (p === "gemini" || p === "google") {
    // Check against verified Google Free Tier list
    const isFree = FREE_GEMINI_MODELS.some(
      (freeId) => m.toLowerCase() === freeId.toLowerCase()
    );
    if (!isFree) {
      throw new ZeroCostViolationError(
        `Gemini model "${m}" is NOT in the verified Free Tier whitelist. Allowed models: ${FREE_GEMINI_MODELS.join(", ")}`
      );
    }
    return { provider: "gemini", model: m, cost: "$0.00" };
  }

  if (p === "groq") {
    const isFree = FREE_GROQ_MODELS.some(
      (freeId) => m.toLowerCase() === freeId.toLowerCase()
    );
    if (!isFree) {
      throw new ZeroCostViolationError(
        `Groq model "${m}" is NOT in the verified Free Tier whitelist. Allowed models: ${FREE_GROQ_MODELS.join(", ")}`
      );
    }
    return { provider: "groq", model: m, cost: "$0.00" };
  }

  if (p === "openrouter") {
    // Must be "openrouter/free" or end with ":free"
    const isFreeRouter = m.toLowerCase() === "openrouter/free";
    const hasFreeSuffix = m.toLowerCase().endsWith(":free");

    if (!isFreeRouter && !hasFreeSuffix) {
      throw new ZeroCostViolationError(
        `OpenRouter model "${m}" is NOT verified free. OpenRouter models must end with ":free" or use "openrouter/free". Paid models are strictly forbidden.`
      );
    }
    return { provider: "openrouter", model: m, cost: "$0.00" };
  }

  // Any other provider is BLOCKED under the hard $0 rule
  throw new ZeroCostViolationError(
    `Provider "${provider}" is not an approved $0 free-tier provider. Only verified Gemini Free Tier, Groq Free Tier, and OpenRouter Free models are permitted.`
  );
}

// ── Environment Variable Helpers (Server-side Only) ──────────────────────────
function getGeminiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_KEY ||
    ""
  );
}

function getGroqKey() {
  return (
    process.env.GROQ_API_KEY ||
    process.env.GROQ_KEY ||
    ""
  );
}

function getOpenRouterKey() {
  return (
    process.env.OPENROUTER_API_KEY ||
    process.env.OPEN_ROUTER_API_KEY ||
    process.env.OPENROUTER_KEY ||
    ""
  );
}

// ── 1. OmniRoute Provider: Google Gemini Free Tier ───────────────────────────
export async function executeGeminiFree({
  model = "gemini-2.5-flash",
  systemPrompt,
  systemInstruction,
  prompt,
  messages = [],
  responseFormat = null,
  temperature = 0.3,
  maxTokens = 1200,
  timeoutMs = 12000,
}) {
  // Validate $0 cost policy before making outbound call
  validateZeroCostRoute("gemini", model);

  const apiKey = getGeminiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in server environment.");
  }

  console.log(`[OmniRoute] Provider: Gemini | Model: ${model} | Cost Policy: $0.00 (FREE_ONLY)`);

  let effectiveMessages = Array.isArray(messages) && messages.length > 0 ? [...messages] : [];
  if (effectiveMessages.length === 0 && prompt) {
    effectiveMessages = [{ role: "user", content: String(prompt) }];
  }
  if (effectiveMessages.length === 0) {
    effectiveMessages = [{ role: "user", content: "Hello" }];
  }

  const contents = [];
  for (const m of effectiveMessages) {
    const role = m.role === "assistant" || m.role === "model" ? "model" : "user";
    contents.push({
      role,
      parts: [{ text: String(m.content || "").trim() }],
    });
  }

  const requestPayload = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  const effectiveSystemPrompt = systemPrompt || systemInstruction;
  if (effectiveSystemPrompt) {
    requestPayload.systemInstruction = {
      parts: [{ text: effectiveSystemPrompt }],
    };
  }

  if (responseFormat === "json_object") {
    requestPayload.generationConfig.responseMimeType = "application/json";
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPayload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) {
      console.warn(`[OmniRoute] Gemini ${model} Free Tier quota/rate limit reached (HTTP 429).`);
    }
    throw new Error(`Gemini ${model} Free Tier HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const textPart = candidate?.content?.parts?.[0]?.text?.trim();

  if (!textPart) {
    throw new Error(`Gemini ${model} returned empty completion`);
  }

  console.log(`[OmniRoute] Gemini ${model} generation succeeded ($0 cost).`);

  const usage = data.usageMetadata || {};
  return {
    content: textPart,
    provider: "gemini",
    model,
    tokensUsed: {
      prompt: usage.promptTokenCount ?? null,
      completion: usage.candidatesTokenCount ?? null,
      total: usage.totalTokenCount ?? null,
    },
  };
}

// ── 2. OmniRoute Provider: Groq Free Tier (FIRST FALLBACK) ───────────────────
export async function executeGroqFree({
  model = "llama-3.3-70b-versatile",
  systemPrompt,
  systemInstruction,
  prompt,
  messages = [],
  responseFormat = null,
  temperature = 0.3,
  maxTokens = 1200,
  timeoutMs = 15000,
}) {
  // Validate $0 cost policy before making outbound call
  validateZeroCostRoute("groq", model);

  const apiKey = getGroqKey();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured in server environment.");
  }

  console.log(`[OmniRoute] Provider: Groq | Model: ${model} | Cost Policy: $0.00 (FREE_ONLY)`);

  const effectiveSystemPrompt = systemPrompt || systemInstruction;
  const formattedMessages = [];
  if (effectiveSystemPrompt) {
    formattedMessages.push({ role: "system", content: effectiveSystemPrompt });
  }

  let effectiveMessages = Array.isArray(messages) && messages.length > 0 ? [...messages] : [];
  if (effectiveMessages.length === 0 && prompt) {
    effectiveMessages = [{ role: "user", content: String(prompt) }];
  }
  if (effectiveMessages.length === 0) {
    effectiveMessages = [{ role: "user", content: "Hello" }];
  }

  for (const m of effectiveMessages) {
    formattedMessages.push({
      role: m.role === "assistant" || m.role === "model" ? "assistant" : m.role === "system" ? "system" : "user",
      content: String(m.content || "").trim(),
    });
  }

  const body = {
    model,
    messages: formattedMessages,
    temperature,
    max_tokens: maxTokens,
  };

  if (responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) {
      console.warn(`[OmniRoute] Groq ${model} free rate limit reached (HTTP 429).`);
    }
    throw new Error(`Groq ${model} HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error(`Groq ${model} returned empty completion`);
  }

  console.log(`[OmniRoute] Groq ${model} generation succeeded ($0 cost).`);

  return {
    content,
    provider: "groq",
    model,
    tokensUsed: {
      prompt: data.usage?.prompt_tokens ?? null,
      completion: data.usage?.completion_tokens ?? null,
      total: data.usage?.total_tokens ?? null,
    },
  };
}

// ── 3. OmniRoute Provider: OpenRouter Free Models (SECOND FALLBACK) ──────────
export async function executeOpenRouterFree({
  model = "openrouter/free",
  systemPrompt,
  systemInstruction,
  prompt,
  messages = [],
  responseFormat = null,
  temperature = 0.3,
  maxTokens = 1200,
  timeoutMs = 15000,
}) {
  // Validate $0 cost policy before making outbound call
  validateZeroCostRoute("openrouter", model);

  const apiKey = getOpenRouterKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured in server environment.");
  }

  console.log(`[OmniRoute] Provider: OpenRouter | Model: ${model} | Cost Policy: $0.00 (FREE_ONLY)`);

  const effectiveSystemPrompt = systemPrompt || systemInstruction;
  const formattedMessages = [];
  if (effectiveSystemPrompt) {
    formattedMessages.push({ role: "system", content: effectiveSystemPrompt });
  }

  let effectiveMessages = Array.isArray(messages) && messages.length > 0 ? [...messages] : [];
  if (effectiveMessages.length === 0 && prompt) {
    effectiveMessages = [{ role: "user", content: String(prompt) }];
  }
  if (effectiveMessages.length === 0) {
    effectiveMessages = [{ role: "user", content: "Hello" }];
  }

  for (const m of effectiveMessages) {
    formattedMessages.push({
      role: m.role === "assistant" || m.role === "model" ? "assistant" : m.role === "system" ? "system" : "user",
      content: String(m.content || "").trim(),
    });
  }

  const body = {
    model,
    messages: formattedMessages,
    temperature,
    max_tokens: maxTokens,
  };

  if (responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://nexusflow.dev",
      "X-Title": "NEXUSFLOW AI Workspace",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) {
      console.warn(`[OmniRoute] OpenRouter ${model} free rate limit reached (HTTP 429).`);
    }
    throw new Error(`OpenRouter ${model} HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0]?.message;
  const content = (choice?.content || choice?.reasoning || "").trim();

  if (!content) {
    throw new Error(`OpenRouter ${model} returned empty completion`);
  }


  console.log(`[OmniRoute] OpenRouter ${model} generation succeeded ($0 cost).`);

  return {
    content,
    provider: "openrouter",
    model,
    tokensUsed: {
      prompt: data.usage?.prompt_tokens ?? null,
      completion: data.usage?.completion_tokens ?? null,
      total: data.usage?.total_tokens ?? null,
    },
  };
}

// ── 4. OmniRoute Main Multi-Tier $0 Orchestration ────────────────────────────
/**
 * Primary OmniRoute execution function enforcing the exact 3-tier AI chain:
 * Tier 1: Gemini Free Tier (PRIMARY) — gemini-2.5-flash → gemini-2.5-flash-lite → gemini-2.0-flash → gemini-1.5-flash → gemini-1.5-flash-8b
 *   ↓ fail / quota exhausted
 * Tier 2: Groq Free Tier (FIRST FALLBACK) — qwen/qwen3.8-27b → openai/gpt-oss-20b → llama-3.3-70b-versatile → llama-3.1-8b-instant
 *   ↓ fail / quota exhausted
 * Tier 3: OpenRouter Free Models (SECOND FALLBACK) — openrouter/free / :free models
 *   ↓ fail / quota exhausted
 * Graceful AI Failure: Clear AI-unavailable response ($0.00).
 *
 * NOTE: DAA is completely independent and is NEVER treated as an AI provider or AI fallback.
 * NO PAID FALLBACK IS EVER CONFIGURED OR SELECTED.
 */
export async function omniRouteGenerate({
  systemPrompt,
  systemInstruction,
  prompt,
  messages = [],
  responseFormat = null,
  temperature = 0.3,
  maxTokens = 1200,
}) {
  const errors = [];

  // ── Tier 1: Gemini Free Tier (PRIMARY) ─────────────────────────────────────
  if (getGeminiKey()) {
    for (const model of FREE_GEMINI_MODELS) {
      try {
        const result = await executeGeminiFree({
          model,
          systemPrompt,
          systemInstruction,
          prompt,
          messages,
          responseFormat,
          temperature,
          maxTokens,
          timeoutMs: 12000,
        });
        if (result && result.content) {
          return {
            ...result,
            tier: "tier_1_gemini_free",
          };
        }
      } catch (err) {
        errors.push(`Gemini [${model}]: ${err.message}`);
        console.warn(`[OmniRoute] Tier 1 Gemini ${model} failed: ${err.message}. Trying next $0 option.`);
      }
    }
  } else {
    console.log("[OmniRoute] GEMINI_API_KEY not configured, skipping Tier 1.");
  }

  // ── Tier 2: Groq Free Tier (FIRST FALLBACK) ────────────────────────────────
  if (getGroqKey()) {
    for (const model of FREE_GROQ_MODELS) {
      try {
        const result = await executeGroqFree({
          model,
          systemPrompt,
          systemInstruction,
          prompt,
          messages,
          responseFormat,
          temperature,
          maxTokens,
          timeoutMs: 15000,
        });
        if (result && result.content) {
          return {
            ...result,
            tier: "tier_2_groq_free",
          };
        }
      } catch (err) {
        errors.push(`Groq [${model}]: ${err.message}`);
        console.warn(`[OmniRoute] Tier 2 Groq ${model} failed: ${err.message}. Trying next $0 option.`);
      }
    }
  } else {
    console.log("[OmniRoute] GROQ_API_KEY not configured, skipping Tier 2.");
  }

  // ── Tier 3: OpenRouter Free Tier (SECOND FALLBACK) ─────────────────────────
  if (getOpenRouterKey()) {
    for (const model of FREE_OPENROUTER_FALLBACK_MODELS) {
      try {
        const result = await executeOpenRouterFree({
          model,
          systemPrompt,
          systemInstruction,
          prompt,
          messages,
          responseFormat,
          temperature,
          maxTokens,
          timeoutMs: 14000,
        });
        if (result && result.content) {
          return {
            ...result,
            tier: "tier_3_openrouter_free",
          };
        }
      } catch (err) {
        errors.push(`OpenRouter [${model}]: ${err.message}`);
        console.warn(`[OmniRoute] Tier 3 OpenRouter ${model} failed: ${err.message}. Trying next $0 option.`);
      }
    }
  } else {
    console.log("[OmniRoute] OPENROUTER_API_KEY not configured, skipping Tier 3.");
  }

  // ── Graceful AI Failure ($0 Cost Policy Enforced) ──────────────────────────
  console.warn(
    "[OmniRoute] All free-tier AI providers (Gemini, Groq, OpenRouter) are unavailable or exhausted. Graceful AI failure returned."
  );

  return {
    content: null,
    provider: "none",
    model: "none",
    cost: "$0.00",
    tier: "tier_ai_unavailable",
    available: false,
    message: "AI services are currently unavailable across all configured free providers (Gemini, Groq, OpenRouter). Please try again later.",
    errors,
  };
}

