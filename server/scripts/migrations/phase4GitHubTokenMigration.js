/**
 * server/scripts/migrations/phase4GitHubTokenMigration.js
 * NEXUSFLOW Phase 4 (D-30) — GitHub token re-encryption: AES-256-CBC → AES-256-GCM.
 *
 * DRY RUN BY DEFAULT (counts + record ids only; nothing written):
 *   node scripts/migrations/phase4GitHubTokenMigration.js
 * Apply (requires GITHUB_TOKEN_ENCRYPTION_KEY and GITHUB_TOKEN_LEGACY_KEY):
 *   node scripts/migrations/phase4GitHubTokenMigration.js --apply
 *
 * Idempotent: re-running skips already-migrated values. After a successful
 * apply with zero legacy values remaining, remove GITHUB_TOKEN_LEGACY_KEY.
 * Not executed against any real database during Phase 4.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";

async function main() {
  dotenv.config();
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set.");
  const apply = process.argv.includes("--apply");
  await mongoose.connect(process.env.MONGO_URI);
  const svc = await import("../../services/githubCredentialMigration.js");
  console.log(JSON.stringify(await svc.planGitHubTokenMigration(), null, 2));
  if (apply) console.log(JSON.stringify(await svc.applyGitHubTokenMigration(), null, 2));
  await mongoose.disconnect();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.code || e.name || "Error", e.code ? "" : e.message);
    process.exit(1);
  });
}
