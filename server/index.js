import dotenv from "dotenv";
dotenv.config({ override: true });

import mongoose from "mongoose";
import { assertAuthConfig, AuthConfigError } from "./auth.js";
import { logger } from "./utils/logger.js";

// ── Fail closed on unsafe authentication configuration (Phase 1 / D-1) ───────
try {
  assertAuthConfig();
} catch (err) {
  const reason = err instanceof AuthConfigError ? err.message : "Invalid authentication configuration.";
  console.error(`[startup] Refusing to start: ${reason} Set a strong JWT_SECRET (>= 32 random bytes) in server/.env.`);
  process.exit(1);
}

// Phase 4 (D-14): never queue queries indefinitely while disconnected —
// database-dependent requests fail fast (and the HTTP guard answers 503).
mongoose.set("bufferCommands", false);

const { server, io } = await import("./app.js");
const { connectWithRetry, markStartupComplete, gracefulShutdown } = await import("./utils/appLifecycle.js");

export { getFrontendUrl } from "./app.js";

const PORT = process.env.PORT ?? 4000;
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/nexusflow";
const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
const CONNECT_ATTEMPTS = num(process.env.MONGO_CONNECT_ATTEMPTS, 5, 1, 20);
const CONNECT_TIMEOUT_MS = num(process.env.MONGO_CONNECT_TIMEOUT_MS, 10_000, 1_000, 60_000);
const SHUTDOWN_TIMEOUT_MS = num(process.env.SHUTDOWN_TIMEOUT_MS, 10_000, 1_000, 60_000);

logger.info("NexusFlow server initializing", { phase: "startup" });
{
  const { isMailerConfigured } = await import("./utils/mailer.js");
  if (!isMailerConfigured()) {
    logger.warn("mailer:not_configured", { effect: "password reset e-mails are disabled until SMTP_* is set" });
  }
}

// Runtime connectivity is reported (sanitised); the driver reconnects itself.
mongoose.connection.on("disconnected", () => logger.warn("db:disconnected", {}));
mongoose.connection.on("reconnected", () => logger.info("db:reconnected", {}));

// Bind early so hosting health checks get an answer; until readiness only
// /health/* responds 200 (live) and API requests receive 503.
server.listen(PORT, () => logger.info("http:listening", { port: Number(PORT), ready: false }));

let purgeTimer = null;
const ok = await connectWithRetry(
  () => mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS }),
  { attempts: CONNECT_ATTEMPTS }
);
if (!ok) {
  // Documented strategy: exit non-zero so the host restarts the service
  // instead of serving an app that can never become ready.
  logger.error("startup:database_unavailable", { attempts: CONNECT_ATTEMPTS, action: "exit" });
  await gracefulShutdown({ server, io, timeoutMs: 3_000 });
  process.exit(1);
}
{
  // Phase 2: opt-in expired-archive purge (LIFECYCLE_AUTO_PURGE=true).
  const { startPurgeScheduler } = await import("./services/lifecycleService.js");
  purgeTimer = startPurgeScheduler();
}
markStartupComplete();
logger.info("startup:ready", { port: Number(PORT) });

let stopping = false;
async function onSignal(signal) {
  if (stopping) return;
  stopping = true;
  logger.info("shutdown:signal", { signal });
  const { stopAiBackground } = await import("./services/omniRoute.js");
  const { clean } = await gracefulShutdown({
    server, io, timeoutMs: SHUTDOWN_TIMEOUT_MS,
    extraClosers: [() => purgeTimer && clearInterval(purgeTimer), () => stopAiBackground()],
  });
  process.exit(clean ? 0 : 1);
}
process.on("SIGTERM", () => onSignal("SIGTERM"));
process.on("SIGINT", () => onSignal("SIGINT"));
