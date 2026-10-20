/**
 * server/models/RepositoryIndex.js
 * NEXUSFLOW V4 — Persistent Repository Code Intelligence & File Index
 *
 * Persists structured, searchable code intelligence extracted from a connected GitHub repository:
 *   - File trees, code snippets, and module summaries
 *   - Commit delta history and changed files
 *   - Architectural components (auth, routes, models, tests)
 *   - Cross-links to project tasks and requirements
 */

import mongoose from "mongoose";

const FileIndexEntrySchema = new mongoose.Schema(
  {
    path:                 { type: String, required: true },
    name:                 { type: String, required: true },
    type:                 { type: String, enum: ["file", "dir"], default: "file" },
    size:                 { type: Number, default: 0 },
    sha:                  { type: String, default: "" },
    summary:              { type: String, default: "" },
    language:             { type: String, default: "" },
    contentSnippet:       { type: String, default: "" }, // Bounded snippet (e.g. up to 2KB)
    relatedTaskIds:       { type: [String], default: [] },
    relatedRequirements:  { type: [String], default: [] },
    lastModifiedCommit:   { type: String, default: "" },
    isRemoved:            { type: Boolean, default: false },
  },
  { _id: false }
);

const CommitIndexEntrySchema = new mongoose.Schema(
  {
    sha:          { type: String, required: true },
    message:      { type: String, default: "" },
    author:       { type: String, default: "" },
    date:         { type: Date, default: null },
    filesChanged: { type: [String], default: [] },
    url:          { type: String, default: "" },
  },
  { _id: false }
);

const PullRequestIndexEntrySchema = new mongoose.Schema(
  {
    number:    { type: Number, required: true },
    title:     { type: String, default: "" },
    state:     { type: String, default: "open" },
    author:    { type: String, default: "" },
    url:       { type: String, default: "" },
    draft:     { type: Boolean, default: false },
    updatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const IssueIndexEntrySchema = new mongoose.Schema(
  {
    number: { type: Number, required: true },
    title:  { type: String, default: "" },
    url:    { type: String, default: "" },
    labels: { type: [String], default: [] },
  },
  { _id: false }
);

const RepositoryIndexSchema = new mongoose.Schema(
  {
    projectId:            { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    teamId:               { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    repoFullName:         { type: String, required: true },
    defaultBranch:        { type: String, default: "main" },
    selectedBranch:       { type: String, default: "main" },
    lastIndexedCommitSha: { type: String, default: "" },
    lastIndexedAt:        { type: Date, default: null },
    status: {
      type: String,
      enum: ["indexed", "syncing", "error", "stale"],
      default: "indexed",
      index: true,
    },
    errorMessage:         { type: String, default: "" },
    architectureSummary:  { type: String, default: "" },
    techStack:            { type: [String], default: [] },
    keyModuleLocations: {
      auth:       { type: [String], default: [] },
      api:        { type: [String], default: [] },
      models:     { type: [String], default: [] },
      services:   { type: [String], default: [] },
      components: { type: [String], default: [] },
      tests:      { type: [String], default: [] },
      config:     { type: [String], default: [] },
    },
    files:        [FileIndexEntrySchema],
    commits:      [CommitIndexEntrySchema],
    pullRequests: [PullRequestIndexEntrySchema],
    openIssues:   [IssueIndexEntrySchema],
    branches:     { type: [String], default: [] },
    totalFiles:   { type: Number, default: 0 },
    indexingVersion: { type: String, default: "4.0.0" },
    isActive:     { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Unique index: exactly one active repository index per workspace
RepositoryIndexSchema.index(
  { projectId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

export default mongoose.model("RepositoryIndex", RepositoryIndexSchema);
