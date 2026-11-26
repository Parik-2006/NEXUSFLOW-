/**
 * GitHub credential migration: legacy AES-256-CBC → AES-256-GCM (Phase 4, D-30)
 *
 * planGitHubTokenMigration()  READ-ONLY report (counts + record ids only).
 * applyGitHubTokenMigration() for each legacy value:
 *     decrypt with the EXPLICIT legacy key → encrypt (GCM, bound to the record
 *     owner) → verify round trip → compare-and-swap replacement
 *     ({ _id, encryptedToken: <old value> }), so concurrent changes are never
 *     overwritten and re-runs are idempotent (already-migrated values are
 *     skipped). Undecryptable records are marked for GitHub reconnection.
 * Plaintext tokens never leave this function scope and are never logged.
 * CBC had no integrity protection: migration cannot prove an old ciphertext
 * was not tampered with — it only re-protects whatever it decrypts.
 */
import mongoose from "mongoose";
import {
  isEnvelope, isLegacyCiphertext, decryptLegacy, encryptGitHubToken, decryptGitHubToken, TokenCryptoError,
} from "./githubTokenCrypto.js";

const SOURCES = [
  { model: "GitHubCredential", reconnect: { $set: { reconnectRequired: true } } },
  { model: "GitHubIntegration", reconnect: { $set: { connectionStatus: "reconnect_required" } } },
];

async function models() {
  await import("../models/GitHubCredential.js");
  await import("../models/GitHubIntegration.js");
  return SOURCES.map((s) => ({ ...s, M: mongoose.model(s.model) }));
}

function classifyValue(doc, env) {
  const v = doc.encryptedToken;
  if (!v) return "missing";
  if (isEnvelope(v)) {
    try { decryptGitHubToken(v, { userId: String(doc.userId) }, env); return "current"; } catch { return "current_unreadable"; }
  }
  if (isLegacyCiphertext(v)) {
    try { decryptLegacy(v, env); return "legacy_recoverable"; } catch { return "legacy_unrecoverable"; }
  }
  return "unknown_format";
}

export async function planGitHubTokenMigration({ env = process.env } = {}) {
  const report = {};
  for (const { model, M } of await models()) {
    const counts = {};
    const sample = {};
    for await (const doc of M.find({}).select("+encryptedToken userId").lean().cursor()) {
      const c = classifyValue(doc, env);
      counts[c] = (counts[c] || 0) + 1;
      (sample[c] ||= []).length < 5 && sample[c].push(String(doc._id));
    }
    report[model] = { counts, sampleIds: sample };
  }
  return { mode: "dry-run", report };
}

export async function applyGitHubTokenMigration({ env = process.env } = {}) {
  const result = {};
  for (const { model, M, reconnect } of await models()) {
    const r = { migrated: 0, alreadyCurrent: 0, markedForReconnect: 0, skippedConcurrentChange: 0, missing: 0, errors: 0 };
    for await (const doc of M.find({}).select("+encryptedToken userId").lean().cursor()) {
      const old = doc.encryptedToken;
      if (!old) { r.missing++; continue; }
      if (isEnvelope(old)) { r.alreadyCurrent++; continue; }
      try {
        if (!isLegacyCiphertext(old)) throw new TokenCryptoError("ENVELOPE_INVALID", "unknown format");
        let plain = decryptLegacy(old, env);
        const next = encryptGitHubToken(plain, { userId: String(doc.userId) }, env);
        const verified = decryptGitHubToken(next, { userId: String(doc.userId) }, env) === plain;
        plain = null;
        if (!verified) throw new TokenCryptoError("VERIFY_FAILED", "round trip failed");
        const upd = await M.updateOne({ _id: doc._id, encryptedToken: old }, { $set: { encryptedToken: next } });
        if (upd.modifiedCount === 1) r.migrated++; else r.skippedConcurrentChange++;
      } catch (e) {
        if (e instanceof TokenCryptoError && (e.code === "KEY_MISSING" || e.code === "KEY_INVALID")) throw e; // never partially migrate without a valid new key
        const upd = await M.updateOne({ _id: doc._id, encryptedToken: old }, reconnect).catch(() => null);
        if (upd?.modifiedCount === 1) r.markedForReconnect++; else r.errors++;
      }
    }
    result[model] = r;
  }
  return { mode: "apply", result };
}
