/**
 * server/models/GitHubIntegration.js
 * NEXUSFLOW 3.0 — Phase 11: GitHub Integration with encrypted token storage
 */

import mongoose from "mongoose";

const GitHubIntegrationSchema = new mongoose.Schema(
  {
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    teamId:      { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    projectId:   { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },

    githubLogin:  { type: String, default: "" },
    repoOwner:    { type: String, default: "" },
    repoName:     { type: String, default: "" },
    repoFullName: { type: String, default: "" },
    repoUrl:      { type: String, default: "" },
    defaultBranch:{ type: String, default: "main" },

    // AES-256-CBC encrypted GitHub access token — never returned in queries
    encryptedToken: { type: String, select: false },

    // 5-minute cached summary from GitHub REST API
    cachedSummary: {
      openIssues:     { type: Number, default: 0 },
      openPRs:        { type: Number, default: 0 },
      recentCommits:  { type: Number, default: 0 },
      contributors:   [{ login: String, contributions: Number }],
      lastFetchedAt:  { type: Date },
    },
    cacheExpiresAt: { type: Date },
    isActive:       { type: Boolean, default: true },
  },
  { timestamps: true }
);

GitHubIntegrationSchema.index({ projectId: 1, isActive: 1 });

export default mongoose.model("GitHubIntegration", GitHubIntegrationSchema);
