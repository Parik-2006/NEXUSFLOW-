/**
 * server/models/OAuthState.js
 * NEXUSFLOW V4 — Persistent OAuth State Store for Multi-Instance CSRF & Replay Defense
 *
 * Enforces:
 *   - Cryptographically strong one-time state tokens
 *   - Binding to initiating user ID and workspace (projectId / teamId)
 *   - Explicit expiration timestamp + MongoDB TTL index cleanup
 *   - Atomic single-use consumption preventing callback replay attacks
 *   - Multi-process / multi-instance synchronization (Render crash / horizontal scaling safe)
 */

import mongoose from "mongoose";

const OAuthStateSchema = new mongoose.Schema(
  {
    state: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    provider: {
      type: String,
      default: "github",
      index: true,
    },
    // Required for GitHub (account linking); absent for Google login, where no
    // user is authenticated yet.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () { return this.provider !== "google"; },
      index: true,
    },
    // Phase 2 — Google login flow binding (all values hashed or random):
    codeVerifier: { type: String, default: "", select: false }, // PKCE verifier (server ↔ Google)
    nonce: { type: String, default: "" },                        // OIDC nonce bound to the id_token
    browserBindingHash: { type: String, default: "" },           // SHA-256 of the HttpOnly cookie value
    clientChallenge: { type: String, default: "" },
    // Phase 4: where the one-time exchange code is delivered ("web" | "native").
    clientPlatform: { type: String, enum: ["web", "native"], default: "web" },              // client verifier challenge for /exchange
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
      index: true,
    },
    redirectPath: {
      type: String,
      default: "",
    },
    isConsumed: {
      type: Boolean,
      default: false,
      index: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL cleanup
    },
  },
  { timestamps: true }
);

/**
 * Atomically consumes an active, unexpired state record.
 * Guarantees that only one concurrent callback can succeed for a given state token.
 *
 * @param {string} state - The random state string to verify and consume
 * @returns {Promise<Document|null>} The consumed state document or null if invalid/expired/replayed
 */
OAuthStateSchema.statics.consumeState = async function (state, provider = "github") {
  if (!state || typeof state !== "string") return null;

  const now = new Date();
  return this.findOneAndUpdate(
    {
      state,
      provider,
      isConsumed: false,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        isConsumed: true,
        consumedAt: now,
      },
    },
    { new: false } // returns document prior to consumption
  );
};

export default mongoose.model("OAuthState", OAuthStateSchema);
