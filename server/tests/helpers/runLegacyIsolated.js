/**
 * server/tests/helpers/runLegacyIsolated.js
 * Runs the legacy DB test scripts against a throw-away in-memory MongoDB via
 * MONGO_URI_TEST (enforced by scripts/_testDbGuard.js). AI/OAuth keys are
 * blanked so no external provider is contacted. Each script gets a fresh
 * database name. Prints a PASS/FAIL/TIMEOUT/BLOCKED line per script.
 *
 * Usage: node tests/helpers/runLegacyIsolated.js [concurrency]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { assertSafeTestUri } from "./dbTargetGuard.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, "..", "..");
const scriptsDir = path.join(serverDir, "scripts");
const concurrency = Number(process.argv[2] || 3);

const scripts = fs
  .readdirSync(scriptsDir)
  .filter((f) => f.endsWith(".js") && fs.readFileSync(path.join(scriptsDir, f), "utf8").includes("_testDbGuard.js") && f !== "_testDbGuard.js")
  .filter((f) => process.argv.length <= 3 || process.argv.slice(3).includes(f))
  .sort();

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const blank = Object.fromEntries(
  ["GEMINI_API_KEY", "GEMINI_KEY", "GROQ_API_KEY", "GROQ_KEY", "OPENROUTER_API_KEY", "OPENROUTER_KEY", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OPENAI_API_KEY"].map((k) => [k, ""])
);

function run(file, idx) {
  const uri = replSet.getUri(`legacy_test_${idx}`);
  assertSafeTestUri(uri, { productionUri: "" });
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(scriptsDir, file)], {
      cwd: serverDir,
      env: { ...process.env, ...blank, MONGO_URI_TEST: uri, NEXUSFLOW_TEST_SERVER: "" },
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
      const tail = process.env.LEGACY_DETAIL === "1"
        ? lines.filter((l) => /✗|\[FAIL\]|FAIL:|AssertionError|Error:|expected|actual|message:/i.test(l)).slice(0, 12).join("\n      ")
        : lines.slice(-3).join(" | ").slice(0, 300);
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
await replSet.stop();
const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\nLEGACY SUMMARY: ${results.length} scripts — PASS ${count("PASS")}, FAIL ${count("FAIL")}, TIMEOUT ${count("TIMEOUT")}, BLOCKED ${count("BLOCKED")}`);
process.exit(0);
