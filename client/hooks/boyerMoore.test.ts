/**
 * Phase 3 (D-32): client Boyer–Moore–Horspool search.
 * Uses the SAME fixture as the server suite (server/tests/fixtures/searchCases.json)
 * so frontend and backend search semantics are verified to be identical.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { boyerMooreSearch, boyerMooreContains, searchTasks, MAX_QUERY_LENGTH } from "../utils/boyerMoore";

type Case = { name: string; text: string; query: string; expected: boolean };
const fixture: { cases: Case[] } = JSON.parse(
  fs.readFileSync(new URL("../../server/tests/fixtures/searchCases.json", import.meta.url), "utf8")
);

test("shared fixture: client matches the server-side expectations for every case", () => {
  assert.ok(fixture.cases.length >= 20);
  for (const c of fixture.cases) {
    assert.equal(boyerMooreContains(c.text, c.query), c.expected, c.name);
  }
});

test("pattern lengths 255/256/257/max terminate and match", () => {
  for (const m of [255, 256, 257, MAX_QUERY_LENGTH]) {
    const pat = "a".repeat(m);
    assert.equal(boyerMooreSearch("x" + "a".repeat(m + 2), pat), 1);
    assert.equal(boyerMooreSearch("b".repeat(2 * m), pat), -1);
  }
});

test("non-ASCII mismatch characters do not skip matches (old Int16Array table did)", () => {
  assert.equal(boyerMooreSearch("xಅಬ", "ಅಬ"), 1);
  assert.equal(boyerMooreSearch("ab🚀cd", "🚀c"), 2);
});

test("seeded random comparison with String.prototype.indexOf", () => {
  let seed = 32 >>> 0;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const alphabet = ["a", "b", "ಅ", "é", "🚀", " "];
  const gen = (n: number) => Array.from({ length: n }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join("");
  for (let k = 0; k < 1500; k++) {
    const text = gen(Math.floor(rnd() * 30));
    const pat = gen(1 + Math.floor(rnd() * 4));
    assert.equal(boyerMooreSearch(text, pat), text.indexOf(pat), JSON.stringify([text, pat]));
  }
});

test("searchTasks reports matched fields and keeps input order", () => {
  const tasks = [
    { title: "Kannada ಪರೀಕ್ಷೆ", description: "" },
    { title: "Other", description: "contains ಪರೀಕ್ಷೆ too" },
    { title: "None", description: "nothing" },
  ];
  const r = searchTasks(tasks, "  ಪರೀಕ್ಷೆ ");
  assert.deepEqual(r.map((x) => x.matchedFields), [["title"], ["description"]]);
  assert.equal(searchTasks(tasks, "").length, 3);
});
