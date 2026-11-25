/**
 * tests/helpers/jestCompat.js — Phase 2 (Task 11)
 * Minimal Jest-style globals on top of Node's built-in test runner, so the
 * existing describe/test/it/expect test files run WITHOUT adding Jest.
 * Only the matchers those files use are implemented; unknown matchers throw.
 *
 * Usage: node --test --import ./tests/helpers/jestCompat.js <file>
 */
import { describe, test, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";

function matchers(actual, negate = false) {
  const check = (pass, message) => {
    if (negate ? pass : !pass) assert.fail(negate ? `Expected NOT: ${message}` : message);
  };
  const fmt = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };
  return {
    toBe: (exp) => check(Object.is(actual, exp), `${fmt(actual)} toBe ${fmt(exp)}`),
    toEqual: (exp) => check(isDeepStrictEqual(actual, exp), `${fmt(actual)} toEqual ${fmt(exp)}`),
    toStrictEqual: (exp) => check(isDeepStrictEqual(actual, exp), `${fmt(actual)} toStrictEqual ${fmt(exp)}`),
    toBeTruthy: () => check(Boolean(actual), `${fmt(actual)} toBeTruthy`),
    toBeFalsy: () => check(!actual, `${fmt(actual)} toBeFalsy`),
    toBeNull: () => check(actual === null, `${fmt(actual)} toBeNull`),
    toBeUndefined: () => check(actual === undefined, `${fmt(actual)} toBeUndefined`),
    toBeDefined: () => check(actual !== undefined, `${fmt(actual)} toBeDefined`),
    toBeGreaterThan: (n) => check(actual > n, `${fmt(actual)} > ${n}`),
    toBeGreaterThanOrEqual: (n) => check(actual >= n, `${fmt(actual)} >= ${n}`),
    toBeLessThan: (n) => check(actual < n, `${fmt(actual)} < ${n}`),
    toBeLessThanOrEqual: (n) => check(actual <= n, `${fmt(actual)} <= ${n}`),
    toHaveLength: (n) => check(actual?.length === n, `length ${actual?.length} toHaveLength ${n}`),
    toContain: (item) => check(
      typeof actual === "string" ? actual.includes(item) : Array.isArray(actual) && actual.some((x) => Object.is(x, item)),
      `${fmt(actual)} toContain ${fmt(item)}`
    ),
  };
}

function expect(actual) {
  const m = matchers(actual);
  m.not = matchers(actual, true);
  return m;
}

Object.assign(globalThis, { describe, test, it, expect, beforeAll: before, afterAll: after, beforeEach, afterEach });
