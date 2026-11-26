/**
 * Legacy-test preload (Phase 4, 15.8): deterministic MOCKED AI provider.
 * Intercepts ONLY Gemini / Groq / OpenRouter hosts and returns a synthetic,
 * clearly-labelled completion that echoes the request's own context (so
 * "grounded" checks exercise application logic, not a real model). Results
 * obtained with this preload are "PASS (mocked provider)", never live.
 */
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "mock-gemini-key";
const AI_HOSTS = ["generativelanguage.googleapis.com", "api.groq.com", "openrouter.ai"];
const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init = {}) => {
  const url = String(input?.url ?? input);
  if (!AI_HOSTS.some((h) => url.includes(h))) return realFetch(input, init);
  let body = {};
  try { body = JSON.parse(init.body || "{}"); } catch { /* ignore */ }
  const sys = body.systemInstruction?.parts?.map((p) => p.text).join(" ") || (body.messages || []).filter((m) => m.role === "system").map((m) => m.content).join(" ");
  const user = (body.contents || body.messages || []).map((m) => m.parts?.map((p) => p.text).join(" ") || m.content || "").join(" ");
  const wantsJson = body.generationConfig?.responseMimeType === "application/json" || body.response_format?.type === "json_object";
  // Structured (JSON) requests are answered as "provider unavailable" so the
  // application exercises its deterministic fallbacks exactly as without AI;
  // only conversational requests receive the synthetic text.
  if (wantsJson) return new Response(JSON.stringify({ error: { message: "mock: structured output not simulated" } }), { status: 503 });
  const text = `[mocked provider] Synthetic response grounded in the supplied context. Question: ${user.slice(0, 300)} Context: ${sys.slice(0, 1200)}`;
  const payload = url.includes("generativelanguage")
    ? { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 } }
    : { model: body.model, choices: [{ message: { content: text } }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
};
