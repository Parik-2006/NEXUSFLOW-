import dotenv from "dotenv";
dotenv.config({ override: true });

import mongoose from "mongoose";
import { assertAuthConfig, AuthConfigError } from "./auth.js";
import { logger } from "./utils/logger.js";

// ── Fail closed on unsafe authentication configuration (Phase 1 / D-1) ───────
// Validate BEFORE the app (routes, sockets) is even loaded, so no request can
// ever be served with a missing / weak / placeholder JWT_SECRET.
try {
  assertAuthConfig();
} catch (err) {
  const reason = err instanceof AuthConfigError ? err.message : "Invalid authentication configuration.";
  console.error(`[startup] Refusing to start: ${reason} Set a strong JWT_SECRET (>= 32 random bytes) in server/.env.`);
  process.exit(1);
}

const { server } = await import("./app.js");

export { getFrontendUrl } from "./app.js";

const PORT = process.env.PORT ?? 4000;
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/nexusflow";

// Log server startup info (no sensitive data)
logger.info("NexusFlow server initializing", { phase: "startup" });
{
  const { isMailerConfigured } = await import("./utils/mailer.js");
  if (!isMailerConfigured()) {
    logger.warn("mailer:not_configured", { effect: "password reset e-mails are disabled until SMTP_* is set" });
  }
}

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected");
    // Phase 2: opt-in expired-archive purge (LIFECYCLE_AUTO_PURGE=true).
    const { startPurgeScheduler } = await import("./services/lifecycleService.js");
    startPurgeScheduler();
    server.listen(PORT, () => console.log(`NexusFlow server on :${PORT}`));
  })
  .catch((err) => {
    console.error("Mongo connection failed:", err.message);
    // Still start the HTTP/socket server so the app boots in dev.
    server.listen(PORT, () => console.log(`NexusFlow server on :${PORT} (no DB)`));
  });
