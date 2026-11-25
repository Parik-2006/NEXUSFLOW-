/**
 * Phase 1 — Task 1 (D-1): JWT authentication hardening.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, "..", "..");
const STRONG = crypto.randomBytes(48).toString("hex");

let auth;
before(async () => {
  process.env.JWT_SECRET = STRONG;
  auth = await import("../../auth.js");
});

const userDoc = () => ({ _id: new mongoose.Types.ObjectId(), email: "u@test.local", name: "U" });

describe("JWT secret validation", () => {
  test("missing secret is rejected", () => {
    assert.equal(auth.validateJwtSecret(undefined).ok, false);
  });
  test("empty / whitespace secret is rejected", () => {
    assert.equal(auth.validateJwtSecret("").ok, false);
    assert.equal(auth.validateJwtSecret("    ").ok, false);
  });
  test("short (weak) secret is rejected", () => {
    assert.equal(auth.validateJwtSecret("abc123XYZ").ok, false);
  });
  test("known insecure defaults are rejected", () => {
    assert.equal(auth.validateJwtSecret("nexusflow-production-jwt-secret-key-2026").ok, false);
    assert.equal(auth.validateJwtSecret("dev-secret-change-me-dev-secret-change-me").ok, false);
  });
  test("low-entropy long secret is rejected", () => {
    assert.equal(auth.validateJwtSecret("a".repeat(64)).ok, false);
  });
  test("strong random secret is accepted", () => {
    assert.equal(auth.validateJwtSecret(STRONG).ok, true);
  });
  test("assertAuthConfig throws when misconfigured and passes when valid", () => {
    const saved = process.env.JWT_SECRET;
    try {
      process.env.JWT_SECRET = "";
      assert.throws(() => auth.assertAuthConfig(), auth.AuthConfigError);
      process.env.JWT_SECRET = STRONG;
      assert.equal(auth.assertAuthConfig(), true);
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });
});

describe("token verification", () => {
  test("valid token round-trips with id/email/name claims", () => {
    const u = userDoc();
    const payload = auth.verify(auth.sign(u));
    assert.equal(payload.id, u._id.toString());
    assert.equal(payload.email, u.email);
  });
  test("expired token is rejected", () => {
    const token = jwt.sign({ id: new mongoose.Types.ObjectId().toString() }, STRONG, { algorithm: "HS256", expiresIn: -10 });
    assert.equal(auth.verify(token), null);
  });
  test("invalid signature is rejected", () => {
    const token = jwt.sign({ id: new mongoose.Types.ObjectId().toString() }, crypto.randomBytes(48).toString("hex"), { algorithm: "HS256" });
    assert.equal(auth.verify(token), null);
  });
  test("unsupported algorithm (HS512) is rejected", () => {
    const token = jwt.sign({ id: new mongoose.Types.ObjectId().toString() }, STRONG, { algorithm: "HS512" });
    assert.equal(auth.verify(token), null);
  });
  test("unsigned alg=none token is rejected", () => {
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const token = `${enc({ alg: "none", typ: "JWT" })}.${enc({ id: new mongoose.Types.ObjectId().toString() })}.`;
    assert.equal(auth.verify(token), null);
  });
  test("token missing the id claim is rejected", () => {
    const token = jwt.sign({ email: "x@test.local" }, STRONG, { algorithm: "HS256" });
    assert.equal(auth.verify(token), null);
  });
  test("legacy email-as-id token is rejected", () => {
    const token = jwt.sign({ id: "x@test.local", email: "x@test.local" }, STRONG, { algorithm: "HS256" });
    assert.equal(auth.verify(token), null);
  });
  test("malformed token string is rejected", () => {
    assert.equal(auth.verify("not.a.jwt"), null);
    assert.equal(auth.verify(""), null);
    assert.equal(auth.verify(null), null);
  });
  test("verification fails closed when the secret becomes invalid", () => {
    const token = auth.sign(userDoc());
    const saved = process.env.JWT_SECRET;
    try {
      process.env.JWT_SECRET = "short";
      assert.equal(auth.verify(token), null);
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });
  test("requireAuth answers 401 without a valid bearer token", () => {
    let status = 0;
    const res = { status(c) { status = c; return this; }, json() { return this; } };
    auth.requireAuth({ headers: {} }, res, () => assert.fail("next() must not run"));
    assert.equal(status, 401);
  });
});

describe("server startup", () => {
  for (const [label, secret] of [["missing", ""], ["weak", "short-secret"], ["placeholder", "nexusflow-production-jwt-secret-key-2026"]]) {
    test(`refuses to start with a ${label} JWT_SECRET`, () => {
      // Run from an empty temp dir so no .env is loaded; exits before DB/listen.
      const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "nf-startup-"));
      const r = spawnSync(process.execPath, [path.join(serverDir, "index.js")], {
        cwd,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, JWT_SECRET: secret, MONGO_URI: "mongodb://127.0.0.1:1/never_test" },
        encoding: "utf8",
        timeout: 30000,
      });
      assert.equal(r.status, 1, `expected exit 1, got ${r.status}: ${r.stderr}`);
      assert.match(r.stderr, /Refusing to start/);
    });
  }
});
