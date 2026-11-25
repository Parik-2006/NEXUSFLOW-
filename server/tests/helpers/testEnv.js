/**
 * server/tests/helpers/testEnv.js
 * NEXUSFLOW Phase 1 — isolated integration-test environment.
 *
 *  - Boots a throw-away in-memory MongoDB replica set (mongodb-memory-server,
 *    free) and verifies the target with assertSafeTestUri BEFORE connecting.
 *  - Never reads or uses the runtime MONGO_URI for connections.
 *  - Uses a random per-run JWT secret (no real secrets).
 *  - Blanks AI provider keys and blocks all non-local outbound HTTP, so no
 *    real AI / GitHub / OAuth provider can be contacted (no quota, no cost).
 *  - Starts the real Express + Socket.IO app (server/app.js) on a random port.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { assertSafeTestUri } from "./dbTargetGuard.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function runtimeMongoUriFromDotenv() {
  try {
    const parsed = dotenv.parse(fs.readFileSync(path.join(here, "..", "..", ".env")));
    return parsed.MONGO_URI || "";
  } catch {
    return "";
  }
}

export function prepareProcessEnv() {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex");
  // Pre-set (empty) so any module-level dotenv.config() cannot load real keys.
  for (const k of [
    "GEMINI_API_KEY", "GEMINI_KEY", "GROQ_API_KEY", "GROQ_KEY", "OPENROUTER_API_KEY", "OPENROUTER_KEY",
    "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OPENAI_API_KEY",
  ]) process.env[k] = "";
  process.env.MONGO_URI = ""; // runtime URI is never used by tests
  process.env.FRONTEND_URL = "http://localhost:8081";
}

/** Reject every outbound request that is not to this machine. */
export function blockExternalNetwork() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(typeof input === "string" ? input : input?.url || "");
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url)) {
      throw new Error(`[test] external network blocked: ${url.split("?")[0]}`);
    }
    return realFetch(input, init);
  };
}

export async function startTestEnvironment() {
  const productionUri = runtimeMongoUriFromDotenv();
  prepareProcessEnv();
  blockExternalNetwork();

  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri("nexusflow_test");
  assertSafeTestUri(uri, { productionUri }); // throws before any connection
  await mongoose.connect(uri);

  const appModule = await import("../../app.js");
  const { server, io } = appModule;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  async function stop() {
    await new Promise((resolve) => io.close(() => resolve()));
    await new Promise((resolve) => (server.listening ? server.close(() => resolve()) : resolve()));
    await mongoose.disconnect();
    await replSet.stop();
  }

  return { baseUrl, io, server, uri, stop };
}

/** Minimal JSON HTTP client for tests. */
export function makeClient(baseUrl) {
  return async function request(method, url, { token, body } = {}) {
    const res = await fetch(baseUrl + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    const text = await res.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  };
}
