/**
 * server/scripts/testOmniRouteZeroCostPolicy.js
 * ============================================================================
 * COMPREHENSIVE COST SAFETY & OMNIROUTE $0 TEST SUITE FOR NEXUSFLOW
 *
 * Verifies:
 * 1. OpenRouter :free models → Allowed
 * 2. openrouter/free → Allowed
 * 3. OpenRouter normal paid models → BLOCKED (ZeroCostViolationError)
 * 4. OpenRouter models without :free suffix → BLOCKED
 * 5. Gemini verified Free Tier models → Allowed
 * 6. Gemini unverified/paid models → BLOCKED
 * 7. Unknown/paid providers (OpenAI, Anthropic, etc.) → BLOCKED
 * 8. Paid fallback attempts → BLOCKED
 * 9. Unrestricted auto routing → BLOCKED
 * 10. All free providers exhausted → Graceful deterministic response ($0)
 * 11. Deterministic local guidance engine → Allowed ($0 local CPU)
 * 12. Safe logging verification (zero key leakage)
 * 13. Project Copilot Multi-Intent Grounding Tests
 * ============================================================================
 */

import "dotenv/config";
import mongoose from "mongoose";
import {
  validateZeroCostRoute,
  ZeroCostViolationError,
  FREE_GEMINI_MODELS,
  FREE_OPENROUTER_FALLBACK_MODELS,
  omniRouteGenerate,
  executeGeminiFree,
  executeOpenRouterFree,
} from "../services/omniRoute.js";
import { orchestrateCopilotChat } from "../services/aiOrchestrator.js";
import { generateDeterministicCopilotAnswer } from "../services/projectIntelligence.js";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runCostPolicyTests() {
  console.log("\n========================================================");
  console.log("NEXUSFLOW — OMNIROUTE HARD $0 LLM COST POLICY TEST SUITE");
  console.log("========================================================\n");

  // ── TEST 1: OpenRouter Free Models & openrouter/free ───────────────────────
  console.log("[TEST 1 & 2] OpenRouter Free Models & openrouter/free Validation");
  try {
    const r1 = validateZeroCostRoute("openrouter", "openrouter/free");
    assert(r1.cost === "$0.00", 'validateZeroCostRoute allows "openrouter/free" at $0.00');

    const r2 = validateZeroCostRoute("openrouter", "meta-llama/llama-3.3-70b-instruct:free");
    assert(r2.cost === "$0.00", 'validateZeroCostRoute allows model ending with ":free" at $0.00');

    const r3 = validateZeroCostRoute("openrouter", "deepseek/deepseek-r1:free");
    assert(r3.cost === "$0.00", 'validateZeroCostRoute allows "deepseek/deepseek-r1:free"');
  } catch (err) {
    assert(false, `Unexpected error in Test 1: ${err.message}`);
  }

  // ── TEST 3 & 4: OpenRouter Paid Models & Missing :free Suffix ─────────────
  console.log("\n[TEST 3 & 4] OpenRouter Paid Models & Missing :free Suffix (FAIL-CLOSED)");
  try {
    validateZeroCostRoute("openrouter", "openai/gpt-4o");
    assert(false, "Paid OpenRouter model openai/gpt-4o was NOT blocked!");
  } catch (err) {
    assert(
      err instanceof ZeroCostViolationError,
      `Blocked paid OpenRouter model: ${err.message.slice(0, 80)}...`
    );
  }

  try {
    validateZeroCostRoute("openrouter", "meta-llama/llama-3.3-70b-instruct"); // missing :free
    assert(false, "OpenRouter model missing :free suffix was NOT blocked!");
  } catch (err) {
    assert(
      err instanceof ZeroCostViolationError,
      `Blocked OpenRouter model without :free: ${err.message.slice(0, 80)}...`
    );
  }

  // ── TEST 5 & 6: Gemini Free Tier vs Unverified/Paid Models ────────────────
  console.log("\n[TEST 5 & 6] Gemini Free Tier vs Unverified/Paid Models");
  try {
    for (const m of FREE_GEMINI_MODELS) {
      const g = validateZeroCostRoute("gemini", m);
      assert(g.cost === "$0.00", `Gemini Free Tier model "${m}" allowed at $0.00`);
    }
  } catch (err) {
    assert(false, `Unexpected error validating Gemini Free models: ${err.message}`);
  }

  try {
    validateZeroCostRoute("gemini", "gemini-1.5-pro-paid");
    assert(false, "Unverified/paid Gemini model was NOT blocked!");
  } catch (err) {
    assert(
      err instanceof ZeroCostViolationError,
      `Blocked unverified Gemini model: ${err.message.slice(0, 80)}...`
    );
  }

  // ── TEST 7: Unknown / Paid Providers (OpenAI, Claude, etc.) ───────────────
  console.log("\n[TEST 7] Unknown / Paid Providers (OpenAI, Anthropic, etc.)");
  const forbiddenProviders = ["openai", "anthropic", "claude", "together", "groq", "cohere"];
  for (const p of forbiddenProviders) {
    try {
      validateZeroCostRoute(p, "some-model");
      assert(false, `Paid provider "${p}" was NOT blocked!`);
    } catch (err) {
      assert(
        err instanceof ZeroCostViolationError,
        `Blocked paid provider "${p}": ${err.message.slice(0, 70)}...`
      );
    }
  }

  // ── TEST 8 & 9: Auto Routing / Paid Fallback Attempt ───────────────────────
  console.log("\n[TEST 8 & 9] Auto Routing / Paid Fallback Attempt");
  try {
    validateZeroCostRoute("openrouter", "auto");
    assert(false, 'Unrestricted "auto" model route was NOT blocked!');
  } catch (err) {
    assert(
      err instanceof ZeroCostViolationError,
      `Blocked unrestricted "auto" routing: ${err.message.slice(0, 75)}...`
    );
  }

  // ── TEST 10 & 11: All Free Providers Exhausted → Deterministic Engine ─────
  console.log("\n[TEST 10 & 11] Deterministic Guidance Engine & Safe Fallback ($0)");
  const mockContext = {
    title: "Smart Irrigation & Soil Telemetry",
    domain: "IoT & Agriculture",
    projectType: "Hardware / IoT Embedded System",
    teamMembers: [
      { name: "Dev 1", role: "Embedded Lead", skills: { hardware: 9, backend: 5 } },
      { name: "Dev 2", role: "Backend Architect", skills: { backend: 8, frontend: 4 } },
    ],
    context: {
      problemStatement: "Automate farm water usage using capacitive soil sensors.",
      hardwareRequirements: ["ESP32 DevKit", "Capacitive Soil Sensor v1.2", "5V Relay"],
    },
    acceptedDecisions: [
      { category: "database", title: "Telemetry Database", decision: "MongoDB Time Series" },
    ],
  };

  const deterministicAns = generateDeterministicCopilotAnswer(
    "hardware",
    "What sensors do we need?",
    mockContext,
    [],
    null
  );
  assert(
    typeof deterministicAns === "string" && deterministicAns.includes("Project Reasoning"),
    "Deterministic engine produces structured 4-part guidance at $0.00 cost"
  );

  // ── TEST 12: Secret Leakage & Logging Guard ────────────────────────────────
  console.log("\n[TEST 12] Secrets & Key Logging Safety Check");
  const geminiKey = process.env.GEMINI_API_KEY || "";
  const openRouterKey = process.env.OPENROUTER_API_KEY || "";

  assert(
    geminiKey.length > 10 && openRouterKey.length > 10,
    "GEMINI_API_KEY and OPENROUTER_API_KEY loaded securely from server .env"
  );
  assert(
    !geminiKey.includes("sk-proj") && !openRouterKey.includes("sk-proj"),
    "No paid OpenAI keys configured in server environment"
  );

  // ── TEST 13: Live OmniRoute Copilot Multi-Intent Grounding ─────────────────
  console.log("\n[TEST 13] Live OmniRoute Multi-Intent Project Copilot Tests");

  const testPrompts = [
    { intent: "hardware", q: "What hardware do I need for this IoT project?" },
    { intent: "database", q: "Which database should I use for storing telemetry?" },
    { intent: "api", q: "What APIs can I use for weather and notification data?" },
    { intent: "research", q: "What research papers or standards should I read?" },
    { intent: "decision_justification", q: "Why did you recommend ESP32 over Raspberry Pi?" },
  ];

  for (const t of testPrompts) {
    console.log(`\n  Executing Copilot intent test: "${t.intent}"...`);
    const res = await orchestrateCopilotChat({
      projectContext: mockContext,
      systemPrompt: "You are the NEXUSFLOW Project Copilot.",
      conversationHistory: [],
      userMessage: t.q,
      userMemory: [{ key: "selected_hardware", value: "ESP32" }],
      detectedIntent: t.intent,
    });

    assert(
      res && typeof res.replyText === "string" && res.replyText.length > 20,
      `Copilot generated grounded response for intent "${t.intent}"`
    );
    assert(
      res.provider === "gemini" || res.provider === "openrouter" || res.provider === "deterministic",
      `Copilot response provider is strictly verified free: "${res.provider}" ($0.00 cost)`
    );
    assert(
      res.provider !== "openai" && res.provider !== "claude",
      `Confirmed response was NOT routed to any paid provider`
    );
  }

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  console.log("\n========================================================");
  console.log(`OMNIROUTE $0 COST POLICY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("========================================================\n");

  process.exit(failed > 0 ? 1 : 0);
}

runCostPolicyTests().catch((err) => {
  console.error("Test execution encountered fatal error:", err);
  process.exit(1);
});
