/**
 * server/models/GitHubIntegration.js
 * NEXUSFLOW V4 — GitHub Repository Integration with Encrypted Token Storage
 *
 * Enforces:
 *   - Exactly one active repository connection per workspace (projectId)
 *   - Isolated connection state per workspace
 *   - Encrypted token storage (AES-256-CBC, never returned in standard queries)
 *   - Incremental indexing metadata, error tracking, and audit trail
 */

import mongoose from "mongoose";

const GitHubIntegrationSchema = new mongoose.Schema(
  {
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    teamId:       { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    projectId:    { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },

    githubLogin:  { type: String, default: "" },
    repoId:       { type: String, default: "" },
    repoOwner:    { type: String, default: "" },
    repoName:     { type: String, default: "" },
    repoFullName: { type: String, default: "" },
    repoUrl:      { type: String, default: "" },
    defaultBranch:{ type: String, default: "main" },
    selectedBranch:{ type: String, default: "main" },
    visibility:   { type: String, enum: ["public", "private", "internal", "unknown"], default: "unknown" },

    connectionStatus: {
      type: String,
      enum: ["connected", "disconnected", "syncing", "error", "stale"],
      default: "connected",
      index: true,
    },

    // AES-256-CBC encrypted GitHub access token — never returned in queries
    encryptedToken: { type: String, select: false },

    // Synchronization & Indexing metadata
    lastSyncAt:          { type: Date, default: null },
    lastSyncCommitSha:   { type: String, default: "" },
    lastAttemptedSyncAt: { type: Date, default: null },
    lastSyncError:       { type: String, default: "" },
    syncErrorDetails:    { type: mongoose.Schema.Types.Mixed, default: null },
    indexingVersion:     { type: String, default: "4.0.0" },
    isStale:             { type: Boolean, default: false },

    // Cached summary from GitHub REST API
    cachedSummary: {
      openIssues:        { type: Number, default: 0 },
      openPRs:           { type: Number, default: 0 },
      recentCommits:     { type: Number, default: 0 },
      contributors:      [{ login: String, contributions: Number, avatarUrl: String, profileUrl: String }],
      lastFetchedAt:     { type: Date },
      lastCommitAt:      { type: Date, default: null },
      recentCommitsList: [{ sha: String, message: String, author: String, date: Date, url: String }],
      pullRequestsList:  [{ number: Number, title: String, state: String, author: String, url: String, draft: Boolean, updatedAt: Date }],
      openIssuesList:    [{ number: Number, title: String, url: String, labels: [String] }],
      branches:          [String],
    },
    cacheExpiresAt: { type: Date },
    isActive:       { type: Boolean, default: true, index: true },

    // Audit and disconnection lifecycle
    disconnectedAt: { type: Date, default: null },
    disconnectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// Database-level constraint: exactly one active repository connection per workspace/project
GitHubIntegrationSchema.index(
  { projectId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

GitHubIntegrationSchema.index({ teamId: 1, isActive: 1 });
GitHubIntegrationSchema.index({ userId: 1, isActive: 1 });

export default mongoose.model("GitHubIntegration", GitHubIntegrationSchema);
