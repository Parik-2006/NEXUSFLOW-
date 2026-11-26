/**
 * server/tests/helpers/runLegacyIsolated.js
 * Runs the legacy DB test scripts against a throw-away in-memory MongoDB via
 * MONGO_URI_TEST (enforced by scripts/_testDbGuard.js). AI/OAuth keys are
 * blanked so no external provider is contacted. Each script gets a fresh
 * database name. Prints a PASS/FAIL/TIMEOUT/BLOCKED line per script.
 *
 * Usage: node tests/helpers/runLegacyIsolated.js [concurrency] [script.js …] [--with-server]
 *
 * --with-server (Phase 2): also starts the real API (app.js) in-process on
 * :4000, connected to ONE shared in-memory test database, and runs scripts
 * sequentially with NEXUSFLOW_TEST_SERVER=1 so live-API scripts can execute.
 * The API process uses the .env JWT secret (so script-signed tokens verify)
 * but never MONGO_URI; AI/OAuth keys are blanked.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { assertSafeTestUri } from "./dbTargetGuard.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, "..", "..");
const scriptsDir = path.join(serverDir, "scripts");
const withServer = process.argv.includes("--with-server");
// Phase 4 (15.8 / 15.9) harness-only switches:
//   --mock-ai                    deterministic mocked AI provider (results are
//                                "PASS (mocked provider)", never live connectivity)
//   --experimental-methodologies enable Kanban/Hybrid in THIS isolated harness only
//                                (non-production channel; production gates untouched)
const mockAi = process.argv.includes("--mock-ai");
const experimental = process.argv.includes("--experimental-methodologies");
const MOCK_AI_PRELOAD = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "mockAiProvider.mjs")).href;
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const concurrency = withServer ? 1 : Number(args[0] || 3);
const only = args.slice(1);

const scripts = fs
  .readdirSync(scriptsDir)
  .filter((f) => f.endsWith(".js") && fs.readFileSync(path.join(scriptsDir, f), "utf8").includes("_testDbGuard.js") && f !== "_testDbGuard.js")
  .filter((f) => !only.length || only.includes(f))
  .sort();

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const blank = Object.fromEntries(
  ["GEMINI_API_KEY", "GEMINI_KEY", "GROQ_API_KEY", "GROQ_KEY", "OPENROUTER_API_KEY", "OPENROUTER_KEY", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OPENAI_API_KEY"].map((k) => [k, ""])
);

let liveServer = null;
let liveUri = null;
if (withServer) {
  const dotenv = (await import("dotenv")).default;
  dotenv.config({ path: path.join(serverDir, ".env") });
  Object.assign(process.env, blank, { MONGO_URI: "", NODE_ENV: "test" });
  // Harness only: legacy scripts create many accounts from 127.0.0.1; lift the
  // per-IP auth limits (dedicated rate-limit tests cover the real defaults).
  for (const k of ["RATE_LIMIT_LOGIN_IP_MAX", "RATE_LIMIT_LOGIN_FAILURES_MAX", "RATE_LIMIT_SIGNUP_IP_MAX", "RATE_LIMIT_FORGOT_IP_MAX", "RATE_LIMIT_FORGOT_ACCOUNT_MAX", "RATE_LIMIT_RESET_IP_MAX", "RATE_LIMIT_OAUTH_IP_MAX"]) {
    process.env[k] = "100000";
  }
  // Harness-only: the isolated test server runs on the development channel so
  // experimental methodologies can be exercised; .env / production untouched.
  if (experimental) Object.assign(process.env, { ENABLE_EXPERIMENTAL_METHODOLOGIES: "true", METHODOLOGY_RELEASE_CHANNEL: "development" });
  if (mockAi) await import(MOCK_AI_PRELOAD);
  liveUri = replSet.getUri("legacy_live_test");
  assertSafeTestUri(liveUri, { productionUri: "" });
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(liveUri);
  ({ server: liveServer } = await import("../../app.js"));
  await new Promise((resolve, reject) => { liveServer.once("error", reject); liveServer.listen(4000, "127.0.0.1", resolve); });
  console.log("[runner] in-process API on :4000 → isolated database legacy_live_test");
}

function run(file, idx) {
  const uri = withServer ? liveUri : replSet.getUri(`legacy_test_${idx}`);
  assertSafeTestUri(uri, { productionUri: "" });
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(scriptsDir, file)], {
      cwd: serverDir,
      env: {
        ...process.env, ...blank, MONGO_URI_TEST: uri, NEXUSFLOW_TEST_SERVER: withServer ? "1" : "",
        ...(withServer ? { TEST_BASE: "http://localhost:4000" } : {}),
        ...(experimental ? { ENABLE_EXPERIMENTAL_METHODOLOGIES: "true", METHODOLOGY_RELEASE_CHANNEL: "development" } : {}),
        ...(mockAi ? { NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import ${MOCK_AI_PRELOAD}`.trim() } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), 180000);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      const status = signal ? "TIMEOUT" : code === 0 ? "PASS" : code === 2 && out.includes("test-db-guard] BLOCKED") ? "BLOCKED" : "FAIL";
      const lines = out.trim().split(/\r?\n/);
      // Phase 3: always surface the failing check / assertion message (the
      // last-3-lines tail previously hid which assertion failed).
      const failing = lines.filter((l) => /✗|❌|\[FAIL\]|FAIL:|AssertionError|message:|expected|actual/i.test(l));
      const tail = process.env.LEGACY_DETAIL === "2" ? lines.join("\n      ") : process.env.LEGACY_DETAIL === "1"
        ? failing.slice(0, 12).join("\n      ")
        : (failing.length ? failing.slice(0, 4).join(" | ") : lines.slice(-3).join(" | ")).slice(0, 500);
      resolve({ file, status, code, secs: Math.round((Date.now() - started) / 1000), tail });
    });
  });
}

const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < scripts.length) {
      const i = next++;
      const r = await run(scripts[i], i);
      results.push(r);
      console.log(`${r.status.padEnd(8)} ${r.file} (${r.secs}s)${r.status === "PASS" ? "" : "  :: " + r.tail}`);
    }
  })
);
if (liveServer) await new Promise((r) => liveServer.close(() => r()));
await replSet.stop();
const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\nLEGACY SUMMARY: ${results.length} scripts — PASS ${count("PASS")}, FAIL ${count("FAIL")}, TIMEOUT ${count("TIMEOUT")}, BLOCKED ${count("BLOCKED")}`);
process.exit(0);
