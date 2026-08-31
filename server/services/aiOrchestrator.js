/**
 * server/services/aiOrchestrator.js
 * ============================================================================
 * AI ORCHESTRATOR — Central multi-provider orchestration for NEXUSFLOW 2.0.
 *
 * THREE-TIER FALLBACK ARCHITECTURE:
 *   Tier 1: OpenAI (gpt-4o-mini)
 *   Tier 2: Google Gemini (gemini-2.0-flash / gemini-1.5-flash)
 *   Tier 3: Existing Deterministic / Hardcoded Fallback Engine
 *
 * DESIGN PRINCIPLES:
 * 1. ZERO HARDCODED KEYS: All credentials read from environment variables.
 * 2. SERVER-SIDE ONLY: Keys are never exposed to React/Expo clients.
 * 3. GRACEFUL DEGRADATION: If any tier fails, times out, rate-limits, or returns
 *    invalid JSON, the orchestrator immediately waterfalls to the next tier.
 * 4. DETERMINISTIC SAFETY NET: The deterministic engine guarantees 100% uptime
 *    even without internet access or valid API keys.
 * ============================================================================
 */

import { generateDeterministicCopilotAnswer } from "./projectIntelligence.js";

// ── Environment variable resolution ──────────────────────────────────────────
function getOpenAIKey() {
  return process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "";
}

function getGeminiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_KEY ||
    ""
  );
}

// ── 1. Call OpenAI (Tier 1) ──────────────────────────────────────────────────
export async function callOpenAI({
  systemPrompt,
  messages = [],
  responseFormat = null,
  temperature = 0.3,
  maxTokens = 1200,
  timeoutMs = 12000,
}) {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const formattedMessages = [];
  if (systemPrompt) {
    formattedMessages.push({ role: "system", content: systemPrompt });
  }

  for (const m of messages) {
    formattedMessages.push({
      role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
      content: String(m.content || "").trim(),
    });
  }

  const body = {
    model: "gpt-4o-mini",
    messages: formattedMessages,
    temperature,
    max_tokens: maxTokens,
  };

  if (responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
    throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI returned an empty completion");
  }

  return {
    content,
    raw: data,
    tokensUsed: {
      prompt: data.usage?.prompt_tokens ?? null,
      completion: data.usage?.completion_tokens ?? null,
      total: data.usage?.total_tokens ?? null,
    },
  };
}

// ── 2. Call Gemini (Tier 2) ──────────────────────────────────────────────────
export async function callGemini({
  systemPrompt,
  messages = [],
  responseFormat = null,
  temperature = 0.3,
  maxTokens = 1200,
  timeoutMs = 12000,
}) {
  const apiKey = getGeminiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // Format history for Gemini API
  const contents = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
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

  if (systemPrompt) {
    requestPayload.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  if (responseFormat === "json_object") {
    requestPayload.generationConfig.responseMimeType = "application/json";
  }

  // Try primary model gemini-2.0-flash, fallback to gemini-1.5-flash
  const models = ["gemini-2.0-flash", "gemini-1.5-flash"];
  let lastErr = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini ${model} HTTP ${res.status}: ${errText.slice(0, 300)}`);
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      const textPart = candidate?.content?.parts?.[0]?.text?.trim();

      if (!textPart) {
        throw new Error(`Gemini ${model} returned empty response`);
      }

      const usage = data.usageMetadata || {};
      return {
        content: textPart,
        raw: data,
        tokensUsed: {
          prompt: usage.promptTokenCount ?? null,
          completion: usage.candidatesTokenCount ?? null,
          total: usage.totalTokenCount ?? null,
        },
      };
    } catch (err) {
      lastErr = err;
      // Loop to try next model
    }
  }

  throw lastErr || new Error("Gemini generation failed");
}

// ── 3. Memory & Preference Extraction ────────────────────────────────────────
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

// ── 4. 3-Tier Copilot Chat Orchestrator ──────────────────────────────────────
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

  // ── Tier 1: OpenAI ─────────────────────────────────────────────────────────
  if (getOpenAIKey()) {
    try {
      const openAiResult = await callOpenAI({
        systemPrompt: enrichedSystemPrompt,
        messages,
        temperature: 0.3,
        maxTokens: 1200,
        timeoutMs: 10000,
      });

      if (openAiResult.content) {
        return {
          replyText: openAiResult.content,
          provider: "openai",
          tokensUsed: openAiResult.tokensUsed,
        };
      }
    } catch (err) {
      console.warn(`[aiOrchestrator] Tier 1 (OpenAI) failed: ${err.message}. Falling back to Tier 2 (Gemini).`);
    }
  }

  // ── Tier 2: Gemini ─────────────────────────────────────────────────────────
  if (getGeminiKey()) {
    try {
      const geminiResult = await callGemini({
        systemPrompt: enrichedSystemPrompt,
        messages,
        temperature: 0.3,
        maxTokens: 1200,
        timeoutMs: 10000,
      });

      if (geminiResult.content) {
        return {
          replyText: geminiResult.content,
          provider: "gemini",
          tokensUsed: geminiResult.tokensUsed,
        };
      }
    } catch (err) {
      console.warn(`[aiOrchestrator] Tier 2 (Gemini) failed: ${err.message}. Falling back to Tier 3 (Deterministic Fallback).`);
    }
  }

  // ── Tier 3: Deterministic Fallback ─────────────────────────────────────────
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
    tokensUsed: { prompt: null, completion: null, total: null },
  };
}

// ── 5. 3-Tier Project Analysis Orchestrator ──────────────────────────────────
export async function orchestrateProjectAnalysis({
  projectContext,
  systemPrompt,
  userPrompt,
}) {
  const messages = [{ role: "user", content: userPrompt }];

  // ── Tier 1: OpenAI ─────────────────────────────────────────────────────────
  if (getOpenAIKey()) {
    try {
      const openAiResult = await callOpenAI({
        systemPrompt,
        messages,
        responseFormat: "json_object",
        temperature: 0.2,
        maxTokens: 2500,
        timeoutMs: 14000,
      });

      if (openAiResult.content) {
        const parsed = JSON.parse(openAiResult.content);
        return {
          data: parsed,
          provider: "openai",
          tokensUsed: openAiResult.tokensUsed,
        };
      }
    } catch (err) {
      console.warn(`[aiOrchestrator] Analysis Tier 1 (OpenAI) failed: ${err.message}. Trying Tier 2 (Gemini).`);
    }
  }

  // ── Tier 2: Gemini ─────────────────────────────────────────────────────────
  if (getGeminiKey()) {
    try {
      const geminiResult = await callGemini({
        systemPrompt,
        messages,
        responseFormat: "json_object",
        temperature: 0.2,
        maxTokens: 2500,
        timeoutMs: 14000,
      });

      if (geminiResult.content) {
        // Strip markdown fences if present
        let clean = geminiResult.content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(clean);
        return {
          data: parsed,
          provider: "gemini",
          tokensUsed: geminiResult.tokensUsed,
        };
      }
    } catch (err) {
      console.warn(`[aiOrchestrator] Analysis Tier 2 (Gemini) failed: ${err.message}. Trying Tier 3 (Heuristic).`);
    }
  }

  // Tier 3: Heuristic will be invoked by projectIntelligence.js
  return null;
}
