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
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
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
OAuthStateSchema.statics.consumeState = async function (state) {
  if (!state || typeof state !== "string") return null;

  const now = new Date();
  return this.findOneAndUpdate(
    {
      state,
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
