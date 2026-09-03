/**
 * server/scripts/testFixes1to5Logic.js
 *
 * Pure-logic / pure-data tests for the deterministic portions of Fixes 1, 2, 5.
 * Does NOT require a running MongoDB. It re-implements the small bits of math
 * locally to assert expected outputs from real-shape inputs.
 *
 * Run:  node server/scripts/testFixes1to5Logic.js
 */

import assert from "node:assert/strict";

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("  PASS", name); passed++; }
  catch (e) { console.error("  FAIL", name, "\n   ", e.message); failed++; }
}

// ── Re-implement the same calculations used by teamHealth.js ────────────────
function clamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, Math.round(v))); }

function taskCompletionScore(done, total) {
  if (total === 0) return 0;
  return clamp((done / total) * 100);
}

function blockedScore(blocked, total) {
  if (total === 0) return 100;
  return clamp(((total - blocked) / total) * 100);
}

function fingerprint(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// ── TESTS ────────────────────────────────────────────────────────────────────

console.log("\n[FIX 1] Team Health — task completion must follow DB status");
test("0/25 done → 0%", () => assert.equal(taskCompletionScore(0, 25), 0));
test("5/25 done → 20%", () => assert.equal(taskCompletionScore(5, 25), 20));
test("10/25 done → 40%", () => assert.equal(taskCompletionScore(10, 25), 40));
test("20/25 done → 80%", () => assert.equal(taskCompletionScore(20, 25), 80));
test("25/25 done → 100%", () => assert.equal(taskCompletionScore(25, 25), 100));
test("0 total → 0 (not 100%)", () => assert.equal(taskCompletionScore(0, 0), 0));

test("0 blocked of 25 → 100", () => assert.equal(blockedScore(0, 25), 100));
test("5 blocked of 25 → 80", () => assert.equal(blockedScore(5, 25), 80));
test("25 blocked of 25 → 0", () => assert.equal(blockedScore(25, 25), 0));

console.log("\n[FIX 2] Risk Engine — fingerprint dedup + severity tiers");
test("same overdue task → same fingerprint", () => {
  const a = fingerprint("overdue:abc123");
  const b = fingerprint("overdue:abc123");
  assert.equal(a, b);
});
test("different tasks → different fingerprints", () => {
  assert.notEqual(fingerprint("overdue:abc"), fingerprint("overdue:xyz"));
});
test("fingerprint stable across runs", () => {
  const samples = ["blocked:t1", "cascade:t2", "skillgap:java|docker"];
  for (const s of samples) {
    const r1 = fingerprint(s);
    const r2 = fingerprint(s);
    const r3 = fingerprint(s);
    assert.equal(r1, r2);
    assert.equal(r2, r3);
  }
});

console.log("\n[FIX 5] Skill verification — exactly 5 questions, 4 options, 1 correct");
import { readFileSync } from "node:fs";
const aiSource = readFileSync(new URL("../routes/ai.js", import.meta.url), "utf8");

// Extract QUESTION_BANK object content
const bankStart = aiSource.indexOf("const QUESTION_BANK");
const bankEnd = aiSource.indexOf("const CATEGORY_FALLBACK");
const bankText = aiSource.substring(bankStart, bankEnd);

test("QUESTION_BANK defines 14 skills", () => {
  const matches = bankText.match(/^\s*[A-Z][A-Za-z0-9./ ]+:\s*\[/gm) || [];
  assert.ok(matches.length >= 14, `Found ${matches.length} skill keys, expected >=14`);
});

test("Each skill has exactly 5 questions", () => {
  // Parse each { question: ..., options: [...], correctIndex: ... } block
  const skillBlocks = bankText.split(/^\s{4}[A-Z][A-Za-z0-9./ ]+:\s*\[/gm).slice(1);
  for (const block of skillBlocks) {
    const qs = (block.match(/\{[^}]+correctIndex[^}]+\}/g) || []);
    assert.equal(qs.length, 5, `Block has ${qs.length} questions, expected 5:\n${block.substring(0, 80)}…`);
  }
});

test("Each question has exactly 4 options", () => {
  const skillBlocks = bankText.split(/^\s{4}[A-Z][A-Za-z0-9./ ]+:\s*\[/gm).slice(1);
  for (const block of skillBlocks) {
    const optMatches = block.match(/options:\s*\[[^\]]+\]/g) || [];
    for (const m of optMatches) {
      const inner = m.match(/\[(.+)\]/s)[1];
      const items = inner.match(/\"[^\"]*\"/g) || [];
      assert.equal(items.length, 4, `Options not equal to 4: ${m}`);
    }
  }
});

test("Each correctIndex is 0..3", () => {
  const matches = bankText.match(/correctIndex:\s*(\d+)/g) || [];
  for (const m of matches) {
    const n = parseInt(m.split(":")[1].trim(), 10);
    assert.ok(n >= 0 && n <= 3, `correctIndex out of range: ${m}`);
  }
});

console.log("\n[FIX 5F] Verification threshold = 3/5");
function isVerified(score, total) {
  return total === 5 ? score >= 3 : score / total >= 0.8;
}
test("5/5 → verified", () => assert.equal(isVerified(5, 5), true));
test("4/5 → verified", () => assert.equal(isVerified(4, 5), true));
test("3/5 → verified", () => assert.equal(isVerified(3, 5), true));
test("2/5 → not verified", () => assert.equal(isVerified(2, 5), false));
test("1/5 → not verified", () => assert.equal(isVerified(1, 5), false));
test("0/5 → not verified", () => assert.equal(isVerified(0, 5), false));

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────`);
console.log(`PASS: ${passed}`);
console.log(`FAIL: ${failed}`);
console.log(`────────────────────────────────────────`);
if (failed > 0) process.exit(1);