/**
 * server/services/aiOrchestrator.js
 * ============================================================================
 * AI ORCHESTRATOR — Central multi-provider orchestration for NEXUSFLOW 2.0.
 *
 * HARD $0 LLM COST POLICY ENFORCED VIA OMNIROUTE:
 *   Tier 1: Google Gemini Free Tier (gemini-2.0-flash / gemini-1.5-flash)
 *   Tier 2: OpenRouter Free Models (openrouter/free / :free models)
 *   Tier 3: Existing Deterministic / Hardcoded Fallback Engine ($0 local CPU)
 *
 * DESIGN PRINCIPLES:
 * 1. HARD $0 SPENDING LIMIT: Total allowed API spending is $0.00.
 * 2. ZERO PAID FALLBACK: Paid models (OpenAI, Claude, paid OpenRouter) are strictly forbidden and blocked.
 * 3. ZERO HARDCODED KEYS: All credentials read from environment variables.
 * 4. SERVER-SIDE ONLY: Keys are never exposed to React/Expo clients.
 * 5. GRACEFUL DEGRADATION: If any free tier fails, rate-limits (429), or is exhausted,
 *    the orchestrator cascades to the next verified free provider, ending in the local
 *    deterministic engine.
 * ============================================================================
 */

import { generateDeterministicCopilotAnswer } from "./projectIntelligence.js";
import {
  omniRouteGenerate,
  executeGeminiFree,
  executeOpenRouterFree,
  validateZeroCostRoute,
  ZeroCostViolationError,
} from "./omniRoute.js";

// Re-export OmniRoute components for consumers
export {
  omniRouteGenerate,
  executeGeminiFree,
  executeOpenRouterFree,
  validateZeroCostRoute,
  ZeroCostViolationError,
};

// ── 1. Memory & Preference Extraction ────────────────────────────────────────
/**
 * Detects user confirmation or selection statements to store in Copilot memory.
 * e.g. "I decided to use ESP32" or "We'll use PostgreSQL" or "I prefer React Native"
 */
export function extractMemoryUpdates(userMessage) {
  const text = String(userMessage || "").trim();
  const updates = [];

  // Hardware selection detection
  if (
    /(?:decided(?:\s+to\s+use|\s+on|\s+upon)?|picked|chosen|selected|using|will use|going with|go with|prefer)\s+.*?(esp32|arduino|raspberry|stm32|microcontroller|sensor|relay|lora|nodemcu)/i.test(text) ||
    /\b(i'?ll use|we'?ll use|i will use|we will use)\s+.*?(esp32|arduino|raspberry|stm32|sensor|relay|lora)/i.test(text)
  ) {
    const hwTerms = text.match(/\b(esp32(?:\s+[a-z0-9_\-]+)*|arduino(?:\s+[a-z0-9_\-]+)*|raspberry\s*pi(?:\s+[a-z0-9_\-]+)*|stm32|nodemcu)\b/i);
    const val = hwTerms ? hwTerms[0].trim() : "ESP32";
    updates.push({
      key: "selected_hardware",
      value: val,
      category: "hardware",
      source: "conversation",
    });
  }

  // Database selection
  if (
    /(?:decided(?:\s+to\s+use|\s+on|\s+upon)?|picked|chosen|selected|using|will use|going with|go with|prefer)\s+.*?(mongodb|postgres|postgresql|mysql|sqlite|redis|firebase|dynamodb|supabase)/i.test(text) ||
    /\b(i'?ll use|we'?ll use|i will use|we will use)\s+.*?(mongodb|postgres|postgresql|mysql|sqlite|redis|firebase|dynamodb|supabase)/i.test(text)
  ) {
    const dbTerms = text.match(/\b(mongodb|postgresql|postgres|mysql|sqlite|redis|firebase|dynamodb|supabase)\b/i);
    const val = dbTerms ? dbTerms[0].trim() : "MongoDB";
    updates.push({
      key: "selected_database",
      value: val,
      category: "database",
      source: "conversation",
    });
  }

  // Framework / Frontend selection
  if (
    /(?:decided(?:\s+to\s+use|\s+on|\s+upon)?|picked|chosen|selected|using|will use|going with|go with|prefer)\s+.*?(react\s*native|react|vue|angular|next\.?js|expo|flutter|fastapi|django|express|node\.?js)/i.test(text) ||
    /\b(i'?ll use|we'?ll use|i will use|we will use)\s+.*?(react\s*native|react|vue|angular|next\.?js|expo|flutter|fastapi|django|express|node\.?js)/i.test(text)
  ) {
    const fwTerms = text.match(/\b(react\s*native|react|vue|angular|next\.?js|expo|flutter|fastapi|django|express|node\.?js)\b/i);
    const val = fwTerms ? fwTerms[0].trim() : "React";
    updates.push({
      key: "selected_framework",
      value: val,
      category: "software",
      source: "conversation",
    });
  }

  return updates;
}

// ── 2. OmniRoute Copilot Chat Orchestration ($0 Cost Policy) ──────────────────
export async function orchestrateCopilotChat({
  projectContext,
  systemPrompt,
  conversationHistory = [],
  userMessage,
  userMemory = [],
  feedbackHistory = [],
  guidanceSnapshot = null,
  detectedIntent = "general_project_question",
}) {
  const messages = [
    ...conversationHistory.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  // Incorporate memory into prompt
  let enrichedSystemPrompt = systemPrompt;
  if (userMemory.length > 0) {
    const memoryLines = userMemory.map((m) => `• ${m.key}: ${m.value}`).join("\n");
    enrichedSystemPrompt += `\n\nCONFIRMED USER CHOICES & MEMORY:\n${memoryLines}`;
  }

  // Incorporate unhelpful feedback context into prompt
  if (feedbackHistory.length > 0) {
    const unhelpfulItems = feedbackHistory
      .filter((f) => f.rating === "unhelpful")
      .map((f) => `• Avoid repeating previously rejected suggestion: "${f.snippet}"`)
      .join("\n");
    if (unhelpfulItems) {
      enrichedSystemPrompt += `\n\nUSER FEEDBACK CONSTRAINTS:\n${unhelpfulItems}`;
    }
  }

  // Execute purely via OmniRoute ($0 Free Tier Cascade)
  const omniResult = await omniRouteGenerate({
    systemPrompt: enrichedSystemPrompt,
    messages,
    temperature: 0.3,
    maxTokens: 1200,
  });

  if (omniResult && omniResult.content) {
    return {
      replyText: omniResult.content,
      provider: omniResult.provider,
      model: omniResult.model,
      tokensUsed: omniResult.tokensUsed,
    };
  }

  // Fallback to local deterministic engine ($0.00 local compute)
  console.log(`[aiOrchestrator] Tier 3 (Deterministic Engine) executing for intent: ${detectedIntent}`);
  const fallbackText = generateDeterministicCopilotAnswer(
    detectedIntent,
    userMessage,
    projectContext,
    conversationHistory,
    guidanceSnapshot
  );

  return {
    replyText: fallbackText,
    provider: "deterministic",
    model: "local_heuristic_engine",
    tokensUsed: { prompt: null, completion: null, total: null },
  };
}

// ── 3. OmniRoute Project Analysis Orchestration ($0 Cost Policy) ─────────────
export async function orchestrateProjectAnalysis({
  projectContext,
  systemPrompt,
  userPrompt,
}) {
  const messages = [{ role: "user", content: userPrompt }];

  const omniResult = await omniRouteGenerate({
    systemPrompt,
    messages,
    responseFormat: "json_object",
    temperature: 0.2,
    maxTokens: 2500,
  });

  if (omniResult && omniResult.content) {
    try {
      let clean = omniResult.content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(clean);
      return {
        data: parsed,
        provider: omniResult.provider,
        model: omniResult.model,
        tokensUsed: omniResult.tokensUsed,
      };
    } catch (parseErr) {
      console.warn("[aiOrchestrator] Failed to parse JSON from OmniRoute response:", parseErr.message);
    }
  }

  // Tier 3: Deterministic heuristic engine in projectIntelligence.js will handle fallback
  return null;
}

