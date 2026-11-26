/**
 * App lifecycle, health and database-availability handling (Phase 4, D-14).
 *
 *   GET /health/live   200 while the process can respond (no dependencies)
 *   GET /health/ready  200 only when startup completed, MongoDB is connected
 *                      and the server is not shutting down; otherwise 503
 *   GET /health        alias of /health/ready (hosting health checks)
 *
 * Responses are sanitised: status words only — no URIs, hosts, versions,
 * keys or stack traces. AI providers and GitHub are OPTIONAL dependencies and
 * never make the application unready.
 */
import express from "express";
import mongoose from "mongoose";
import { logger } from "./logger.js";

const state = { startupComplete: false, shuttingDown: false, startedAt: new Date() };
const DB_STATES = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };

export function markStartupComplete() { state.startupComplete = true; }
export function markShuttingDown() { state.shuttingDown = true; }
export function resetLifecycleForTests() { state.startupComplete = false; state.shuttingDown = false; }
export function lifecycleSnapshot() { return { ...state }; }

export function dbState() {
  return DB_STATES[mongoose.connection.readyState] ?? "unknown";
}

export function readiness() {
  const database = dbState();
  const ready = state.startupComplete && !state.shuttingDown && database === "connected";
  return {
    ready,
    body: {
      status: ready ? "ready" : "not_ready",
      checks: {
        startup: state.startupComplete ? "complete" : "pending",
        database,
        shutdown: state.shuttingDown ? "in_progress" : "no",
      },
    },
  };
}

export const healthRouter = express.Router();
healthRouter.get("/health/live", (req, res) => {
  res.set("Cache-Control", "no-store").json({ status: state.shuttingDown ? "shutting_down" : "alive" });
});
const readyHandler = async (req, res) => {
  const r = readiness();
  let optional;
  try {
    const { providerConfigured } = await import("../services/omniRoute.js");
    optional = { ai: ["gemini", "groq", "openrouter"].some(providerConfigured) ? "configured" : "not_configured" };
  } catch { optional = { ai: "unknown" }; }
  res.set("Cache-Control", "no-store").status(r.ready ? 200 : 503).json({ ...r.body, optional });
};
healthRouter.get("/health/ready", readyHandler);
healthRouter.get("/health", readyHandler);

/**
 * dbAvailabilityGuard — rejects database-dependent API requests promptly
 * (503 + Retry-After) while MongoDB is not connected or the server is shutting
 * down, instead of letting them hang on Mongoose command buffering.
 */
export function dbAvailabilityGuard(req, res, next) {
  if (state.shuttingDown) {
    res.set("Retry-After", "5");
    return res.status(503).json({ error: "The server is restarting. Please retry shortly.", code: "SHUTTING_DOWN", requestId: req.requestId });
  }
  if (mongoose.connection.readyState !== 1) {
    res.set("Retry-After", "5");
    return res.status(503).json({ error: "Service temporarily unavailable. Please retry shortly.", code: "DATABASE_UNAVAILABLE", requestId: req.requestId });
  }
  next();
}

/** Final sanitised error handler: no stack traces or internal messages to clients. */
export function sanitizedErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = Number.isInteger(err?.status || err?.statusCode) && (err.status || err.statusCode) >= 400 && (err.status || err.statusCode) < 600 ? (err.status || err.statusCode) : 500;
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body.", code: "INVALID_JSON", requestId: req.requestId });
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request body too large.", code: "PAYLOAD_TOO_LARGE", requestId: req.requestId });
  const dbDown = /buffering timed out|MongoNotConnectedError|MongoServerSelectionError|topology was destroyed/i.test(`${err?.name} ${err?.message}`);
  logger.error("http:unhandled_error", { requestId: req.requestId, category: dbDown ? "database_unavailable" : "internal", name: err?.name });
  if (dbDown) return res.status(503).json({ error: "Service temporarily unavailable. Please retry shortly.", code: "DATABASE_UNAVAILABLE", requestId: req.requestId });
  res.status(status).json({ error: status >= 500 ? "Internal server error." : (err?.expose ? err.message : "Request failed."), code: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED", requestId: req.requestId });
}

/**
 * connectWithRetry(connect, { attempts, baseDelayMs, sleep }) — bounded startup
 * connection attempts with exponential backoff. Returns true on success.
 * The driver's own reconnection handles runtime outages afterwards (no second
 * reconnection loop is created).
 */
export async function connectWithRetry(connect, { attempts = 5, baseDelayMs = 2000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await connect();
      logger.info("db:connected", { attempt: i });
      return true;
    } catch (err) {
      // Sanitised: error class only, never the URI or driver message.
      logger.warn("db:connect_failed", { attempt: i, of: attempts, category: err?.name || "Error" });
      if (i < attempts) await sleep(Math.min(baseDelayMs * 2 ** (i - 1), 30_000));
    }
  }
  return false;
}

/**
 * gracefulShutdown({ server, io, extraClosers, timeoutMs }) — stop accepting
 * work, close sockets, let in-flight requests finish (bounded), then close the
 * database. Resolves with { clean: boolean }.
 */
export async function gracefulShutdown({ server, io, extraClosers = [], timeoutMs = 10_000 } = {}) {
  markShuttingDown();
  logger.info("shutdown:begin", { timeoutMs });
  let timer;
  const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve("timeout"), timeoutMs); timer.unref?.(); });
  const work = (async () => {
    if (io) await new Promise((r) => io.close(() => r()));
    if (server?.listening) await new Promise((r) => server.close(() => r()));
    for (const close of extraClosers) { try { await close(); } catch { /* best effort */ } }
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    return "clean";
  })();
  const outcome = await Promise.race([work, deadline]);
  clearTimeout(timer);
  logger.info("shutdown:end", { outcome });
  return { clean: outcome === "clean" };
}
