/**
 * OPT-IN live AI smoke test (Phase 4, 15.8 / Section K). NEVER run automatically.
 *
 *   AI_LIVE_SMOKE=1 node scripts/aiLiveSmokeTest.js
 *
 * • exactly ONE request, synthetic non-sensitive prompt, ≤ 5 output tokens
 * • only registry-approved free models via the zero-cost policy (no override)
 * • uses whatever free-tier key the operator configured; the operator is
 *   responsible for keeping that provider account on its free tier
 * • prints provider / model / status only — never keys or project data
 */
import dotenv from "dotenv";

if (process.env.AI_LIVE_SMOKE !== "1") {
  console.log("Skipped: set AI_LIVE_SMOKE=1 to run the single live free-tier smoke request.");
  process.exit(0);
}
dotenv.config();
const { omniRouteGenerate, stopAiBackground } = await import("../services/omniRoute.js");
const r = await omniRouteGenerate({ prompt: "Reply with the single word OK.", maxTokens: 5, operation: "live_smoke", deadlineMs: 20000 });
console.log(JSON.stringify({ status: r.status, provider: r.provider, model: r.model, attempts: r.meta?.attempts, elapsedMs: r.meta?.elapsedMs, gotText: Boolean(r.content) }));
stopAiBackground();
process.exit(r.content ? 0 : 1);
