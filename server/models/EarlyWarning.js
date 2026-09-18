/**
 * server/models/EarlyWarning.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAM 24: PROJECT HEALTH 2.0 EARLY WARNING MODEL
 *
 * Deterministic early warning signals with lifecycle and deduplication.
 * Lifecycle: OPEN -> ACKNOWLEDGED -> RESOLVED (or DISMISSED with authorized reason)
 *
 * Invariants:
 * 1. Warnings never automatically mutate tasks, deadlines or assignments.
 * 2. Warnings are deduplicated via stable fingerprints to prevent spam.
 * ============================================================================
 */

import mongoose from "mongoose";

const RelatedEntitySchema = new mongoose.Schema(
  {
    entityType: { type: String, default: "task" },
    entityId: { type: String, required: true },
    title: { type: String, default: "" },
  },
  { _id: false }
);

const EarlyWarningSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      index: true,
    },
    fingerprint: {
      type: String,
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: [
        "SCHEDULE",
        "WORKLOAD",
        "DEPENDENCY",
        "RISK",
        "REQUIREMENTS",
        "PROCESS",
        "CAPACITY",
        "DELIVERY",
        "QUALITY",
        "METHODOLOGY",
      ],
      required: true,
      index: true,
    },
    triggerClass: {
      type: String,
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM",
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    evidence: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    recommendedAction: {
      type: String,
      default: "",
    },
    relatedEntities: [RelatedEntitySchema],
    firstSeen: {
      type: Date,
      default: Date.now,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    occurrenceCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: ["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"],
      default: "OPEN",
      index: true,
    },
    acknowledgedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: { type: String },
      at: { type: Date },
    },
    resolvedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: { type: String },
      at: { type: Date },
      reason: { type: String, default: "" },
    },
    dismissedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: { type: String },
      at: { type: Date },
      reason: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

// Indexes
EarlyWarningSchema.index({ projectId: 1, status: 1, severity: 1 });
EarlyWarningSchema.index({ fingerprint: 1, status: 1 });
EarlyWarningSchema.index({ projectId: 1, fingerprint: 1, status: 1 });
EarlyWarningSchema.index({ projectId: 1, category: 1, createdAt: -1 });

export default mongoose.model("EarlyWarning", EarlyWarningSchema);
