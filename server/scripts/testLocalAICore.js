/**
 * server/scripts/testLocalAICore.js
 * ============================================================================
 * NEXUSFLOW V4 — LOCAL AI CORE & PROVIDER ABSTRACTION TESTS (Workstream 20)
 * ============================================================================
 */

import {
  AIProvider,
  GeminiProvider,
  GroqProvider,
  OpenRouterProvider,
  LocalModelProvider,
  LOCAL_MODEL_REGISTRY,
  executeAiQuery,
} from "../services/aiProviderAbstraction.js";

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n" + "=".repeat(60));
  console.log("NEXUSFLOW V4 — LOCAL AI CORE & PROVIDER ABSTRACTION TESTS");
  console.log("=".repeat(60) + "\n");

  // ── Test 1: Provider Abstraction Hierarchy
  console.log("[TEST 1] AI provider abstraction hierarchy");
  const gemini = new GeminiProvider();
  const groq = new GroqProvider();
  const openrouter = new OpenRouterProvider();
  const local = new LocalModelProvider({ isEnabled: false });

  assert(gemini instanceof AIProvider, "GeminiProvider inherits from AIProvider");
  assert(groq instanceof AIProvider, "GroqProvider inherits from AIProvider");
  assert(openrouter instanceof AIProvider, "OpenRouterProvider inherits from AIProvider");
  assert(local instanceof AIProvider, "LocalModelProvider inherits from AIProvider");

  assert(gemini.isLocal === false, "Gemini marked isLocal=false");
  assert(local.isLocal === true, "LocalModel marked isLocal=true");
  assert(local.isEnabled === false, "Local model disabled by default in production");

  // ── Test 2: Modality Capability Checks
  console.log("\n[TEST 2] Provider modality capability checks");
  // Phase 4 expectation change: no verified free VISION route exists in the
  // model registry, so no provider may claim vision support.
  assert(gemini.supportsModality("vision") === false, "No unverified vision capability is claimed");
  assert(groq.supportsModality("vision") === false, "Groq text model does NOT support vision");
  assert(groq.supportsModality("text") === true, "Groq supports text");
  assert(openrouter.supportsModality("text") === true, "OpenRouter supports text");

  // ── Test 3: Local Model Metadata Registry
  console.log("\n[TEST 3] Candidate model metadata registry inspection");
  const llama = LOCAL_MODEL_REGISTRY["llama-3.2-3b-instruct"];
  assert(Boolean(llama), "Registry contains Llama 3.2 3B metadata");
  assert(llama.parameterCount === "3.21B", "Correct parameter count");
  assert(llama.quantizationOptions.includes("Q4_K_M"), "Specifies Q4_K_M quantization");
  assert(llama.estimatedMemoryRamMb > 0, "Provides RAM memory estimate");
  assert(llama.license.includes("Llama"), "Captures licensing terms");

  const qwen = LOCAL_MODEL_REGISTRY["qwen2.5-coder-7b-instruct"];
  assert(Boolean(qwen), "Registry contains Qwen 2.5 Coder 7B metadata");
  assert(qwen.license === "Apache 2.0", "Captures Apache 2.0 license");

  // ── Test 4: Production Routing Execution ($0 Whitelist)
  console.log("\n[TEST 4] Execute query through production whitelist routing");
  const textExec = await executeAiQuery({
    prompt: "Analyze requirement modularity",
    requiredModalities: ["text"],
  });
  // Phase 4 expectation change: previously "succeeded" without any key because
  // the abstraction FABRICATED provider text. With no key configured the result
  // must be a truthful failure; with a key it must come from an approved route.
  const anyKey = Boolean(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY);
  if (anyKey) {
    assert(textExec.success === true, "Query executed successfully");
    assert(["gemini", "groq", "openrouter"].includes(textExec.telemetry.successfulProvider), "Approved zero-cost provider answered");
  } else {
    assert(textExec.success === false && textExec.error === "AI_UNAVAILABLE", "No AI configured: truthful AI_UNAVAILABLE");
    assert(textExec.telemetry.successfulProvider === null, "No provider claimed when none answered");
  }
  assert(textExec.telemetry.latencyMs >= 0, "Execution latency tracked");

  // ── Test 5: Vision Modality Filtering
  console.log("\n[TEST 5] Vision query automatically filters out text-only providers");
  const visionExec = await executeAiQuery({
    prompt: "Analyze architecture ER diagram",
    requiredModalities: ["text", "vision"],
  });
  assert(visionExec.success === false && visionExec.error === "AI_MODALITY_UNSUPPORTED", "Vision request refused: no verified free vision route");
  assert(visionExec.telemetry.successfulProvider === null, "No provider claimed for an unsupported modality");
  assert(!visionExec.telemetry.chainAttempted.includes("groq"), "Groq correctly excluded from vision attempts");

  // ── Test 6: Controlled Local Provider Execution (When Explicitly Configured)
  console.log("\n[TEST 6] Local provider execution when explicitly configured");
  const enabledLocal = new LocalModelProvider({
    isEnabled: true,
    modelName: "llama-3.2-3b-instruct",
  });
  await enabledLocal.loadModel();
  const localHealth = await enabledLocal.healthCheck();
  assert(localHealth.status === "READY", "Enabled local provider reports READY status");

  const localExec = await executeAiQuery({
    prompt: "Deconstruct offline tasks",
    allowLocal: true,
    localProvider: enabledLocal,
  });
  // Phase 4 expectation change: the local provider never ran a model — it
  // returned invented text. Production routing no longer accepts a local stub.
  assert(localExec.telemetry.successfulProvider !== "local", "Local stub is never reported as having answered");
  let localRefused = false;
  try { await enabledLocal.generate({ prompt: "x" }); } catch { localRefused = true; }
  assert(localRefused, "Local provider refuses instead of fabricating inference output");

  // ── Test 7: Observability & Zero Secret Leakage
  console.log("\n[TEST 7] Observability safety — No API keys or secrets in telemetry");
  const telemetryString = JSON.stringify(textExec.telemetry);
  assert(!telemetryString.includes("key"), "Telemetry contains no 'key' parameter");
  assert(!telemetryString.includes("secret"), "Telemetry contains no 'secret' parameter");
  assert(!telemetryString.includes("Bearer"), "Telemetry contains no Authorization tokens");

  console.log("\n" + "=".repeat(60));
  console.log(`LOCAL AI CORE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60) + "\n");
}

runTests().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
