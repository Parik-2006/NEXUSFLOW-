/**
 * server/scripts/_testDbGuard.js
 * NEXUSFLOW Phase 1 (Task 10 / D-13) — production-safety guard for the legacy
 * test / audit scripts in this folder.
 *
 * Imported as the FIRST import of every database-touching legacy script. It:
 *   1. wraps mongoose.connect / createConnection so that, whatever URI the
 *      script passes (usually process.env.MONGO_URI from .env), the connection
 *      is redirected to MONGO_URI_TEST — and only after MONGO_URI_TEST passes
 *      assertSafeTestUri (local host, "test" database name, ≠ MONGO_URI);
 *   2. refuses HTTP calls to a locally running API server (which may itself be
 *      connected to the production database) unless NEXUSFLOW_TEST_SERVER=1 is
 *      set to confirm that server was started against the test database.
 *
 * If MONGO_URI_TEST is missing or unsafe the script exits BEFORE connecting,
 * so no mutation can reach a non-test database.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import http from "node:http";
import https from "node:https";
import { assertSafeTestUri } from "../tests/helpers/dbTargetGuard.js";

dotenv.config();

function refuse(reason) {
  console.error(`\n[test-db-guard] BLOCKED: ${reason}`);
  console.error("[test-db-guard] Set MONGO_URI_TEST to a LOCAL disposable database, e.g.");
  console.error("[test-db-guard]   MONGO_URI_TEST=mongodb://127.0.0.1:27017/nexusflow_test");
  console.error("[test-db-guard] or use the isolated suites: npm run test:phase1\n");
  process.exit(2);
}

function safeTestUri() {
  try {
    assertSafeTestUri(process.env.MONGO_URI_TEST);
    return process.env.MONGO_URI_TEST;
  } catch (e) {
    refuse(e.message);
  }
}

const originalConnect = mongoose.connect.bind(mongoose);
const originalCreateConnection = mongoose.createConnection.bind(mongoose);

mongoose.connect = function guardedConnect(_ignoredUri, options) {
  return originalConnect(safeTestUri(), options);
};
mongoose.createConnection = function guardedCreateConnection(_ignoredUri, options) {
  return originalCreateConnection(safeTestUri(), options);
};

// Block calls to a live local API server unless explicitly confirmed — via the
// http/https modules as well as fetch (some legacy scripts use http.request).
const LIVE_API_PORTS = new Set(["4000", String(process.env.PORT || "4000")]);
function guardNodeHttp(mod) {
  for (const fn of ["request", "get"]) {
    const original = mod[fn].bind(mod);
    mod[fn] = function guardedHttp(...args) {
      const a = args[0];
      const host = typeof a === "string" || a instanceof URL ? new URL(String(a)).hostname : a?.hostname || a?.host || "";
      const port = typeof a === "string" || a instanceof URL ? new URL(String(a)).port : String(a?.port ?? "");
      if (/^(localhost|127\.0\.0\.1)$/i.test(String(host)) && LIVE_API_PORTS.has(String(port)) && process.env.NEXUSFLOW_TEST_SERVER !== "1") {
        refuse("this script calls a running API server over HTTP; start that server against a test database and set NEXUSFLOW_TEST_SERVER=1");
      }
      return original(...args);
    };
  }
}
guardNodeHttp(http);
guardNodeHttp(https);

const originalFetch = globalThis.fetch;
if (typeof originalFetch === "function") {
  globalThis.fetch = function guardedFetch(input, init) {
    const url = String(typeof input === "string" ? input : input?.url || "");
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\//i.test(url) && process.env.NEXUSFLOW_TEST_SERVER !== "1") {
      refuse("this script calls a running API server; start that server with MONGO_URI pointing at a test database and set NEXUSFLOW_TEST_SERVER=1");
    }
    return originalFetch(input, init);
  };
}
