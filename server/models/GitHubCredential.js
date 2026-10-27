/**
 * server/models/GitHubCredential.js
 * NEXUSFLOW V4 — Authorized GitHub User Credential Model
 *
 * Implements:
 *   - User-level GitHub authorization decoupled from individual workspace connections
 *   - Secure AES-256 encrypted token persistence (never returned in default queries)
 *   - Reuse of authorized GitHub account across accessible workspaces without token duplication
 *   - Clear distinction between "Account Authorized" and "Workspace Repository Connected"
 */

import mongoose from "mongoose";

const GitHubCredentialSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    githubLogin: {
      type: String,
      default: "",
      index: true,
    },
    githubId: {
      type: String,
      default: "",
    },
    avatarUrl: {
      type: String,
      default: "",
    },
    encryptedToken: {
      type: String,
      required: true,
      select: false, // Never returned in default queries
    },
    scopes: {
      type: [String],
      default: ["repo", "read:user"],
    },
    authorizedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model("GitHubCredential", GitHubCredentialSchema);
