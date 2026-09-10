/**
 * server/models/Sprint.js
 * ============================================================================
 * SPRINT — Core Scrum time-boxed iteration entity for NexusFlow V4.
 *
 * WHY SEPARATE COLLECTION (not embedded in Project):
 *   - Sprints have independent lifecycle and history
 *   - Need efficient querying (active sprint, historical sprints)
 *   - Carry-over references across sprints require stable IDs
 *   - Retrospective and Review link to specific sprints
 *   - Historical sprint data must never be destroyed
 *
 * LIFECYCLE:
 *   PLANNING → ACTIVE → REVIEW → COMPLETED
 *                  ↘ CANCELLED
 *
 * SAFETY RULES:
 *   - DONE work in a sprint is historical truth — never rewrite
 *   - IN_PROGRESS work is protected from automatic replanning
 *   - TODO/PLANNED work may be recommended for replanning
 *   - Sprint Goal changes require explicit authorization
 *   - Sprint completion preserves all history
 * ============================================================================
 */

import mongoose from "mongoose";

// ── Carry-Over Item Record ────────────────────────────────────────────────────
const CarryOverItemSchema = new mongoose.Schema(
  {
    taskId:       { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
    fromSprintId: { type: mongoose.Schema.Types.ObjectId, ref: "Sprint", required: true },
    reason:       { type: String, default: "incomplete" }, // "incomplete" | "blocked" | "deprioritized" | "scope_change"
    originalEstimate: { type: Number, default: null },
    remainingWork:    { type: Number, default: null },
    carriedAt:    { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── Sprint Lifecycle Event ────────────────────────────────────────────────────
const SprintEventSchema = new mongoose.Schema(
  {
    action:     { type: String, required: true }, // "CREATED" | "STARTED" | "SCOPE_CHANGED" | "CAPACITY_CHANGED" | "GOAL_CHANGED" | "REVIEWED" | "COMPLETED" | "CANCELLED"
    actorId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorName:  { type: String, default: "System" },
    reason:     { type: String, default: "" },
    previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue:      { type: mongoose.Schema.Types.Mixed, default: null },
    timestamp:  { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── Sprint Review Record ──────────────────────────────────────────────────────
const SprintReviewSchema = new mongoose.Schema(
  {
    goalAchieved:     { type: String, enum: ["FULLY_ACHIEVED", "PARTIALLY_ACHIEVED", "NOT_ACHIEVED"], default: "NOT_ACHIEVED" },
    completedItems:   { type: [mongoose.Schema.Types.ObjectId], ref: "Task", default: [] },
    incompleteItems:  { type: [mongoose.Schema.Types.ObjectId], ref: "Task", default: [] },
    acceptedItems:    { type: [mongoose.Schema.Types.ObjectId], ref: "Task", default: [] },
    rejectedItems:    { type: [mongoose.Schema.Types.ObjectId], ref: "Task", default: [] },
    demoNotes:        { type: String, default: "" },
    stakeholderFeedback: { type: String, default: "" },
    teacherFeedback:  { type: String, default: "" },
    followUpItems:    { type: [String], default: [] }, // descriptions of new backlog items
    reviewedBy:       { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt:       { type: Date, default: null },
  },
  { _id: false }
);

// ── Main Sprint Schema ───────────────────────────────────────────────────────
const SprintSchema = new mongoose.Schema(
  {
    // ── Ownership ──────────────────────────────────────────────────────
    projectId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Project",
      required: true,
      index:    true,
    },
    teamId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Team",
      required: true,
      index:    true,
    },

    // ── Sprint Identity ────────────────────────────────────────────────
    sprintNumber: { type: Number, required: true, min: 1 },
    name:         { type: String, required: true }, // e.g. "Sprint 3"
    goal:         { type: String, default: "" },    // Sprint Goal

    // ── Time Box ───────────────────────────────────────────────────────
    startDate:    { type: Date, default: null },
    endDate:      { type: Date, default: null },
    durationDays: { type: Number, default: 14, min: 1 }, // default 2 weeks

    // ── Lifecycle ──────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    ["PLANNING", "ACTIVE", "REVIEW", "COMPLETED", "CANCELLED"],
      default: "PLANNING",
      index:   true,
    },

    // ── Capacity ───────────────────────────────────────────────────────
    totalCapacityHours:     { type: Number, default: 0, min: 0 },
    allocatedHours:         { type: Number, default: 0, min: 0 },
    remainingCapacityHours: { type: Number, default: 0, min: 0 },

    // ── Velocity & Metrics ─────────────────────────────────────────────
    plannedStoryPoints:   { type: Number, default: 0, min: 0 },
    completedStoryPoints: { type: Number, default: 0, min: 0 },
    plannedTaskCount:     { type: Number, default: 0, min: 0 },
    completedTaskCount:   { type: Number, default: 0, min: 0 },
    plannedHours:         { type: Number, default: 0, min: 0 },
    actualHours:          { type: Number, default: 0, min: 0 },

    // ── Health Indicators ──────────────────────────────────────────────
    healthScore:    { type: Number, default: 100, min: 0, max: 100 },
    riskLevel:      { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "LOW" },
    blockedCount:   { type: Number, default: 0, min: 0 },
    atRiskItems:    { type: Number, default: 0, min: 0 },

    // ── Carry-Over ─────────────────────────────────────────────────────
    carryOverItems: { type: [CarryOverItemSchema], default: [] },

    // ── Review ─────────────────────────────────────────────────────────
    review: { type: SprintReviewSchema, default: null },

    // ── Retrospective Link ─────────────────────────────────────────────
    retrospectiveId: { type: mongoose.Schema.Types.ObjectId, ref: "Retrospective", default: null },

    // ── Lifecycle Audit Trail ──────────────────────────────────────────
    history: { type: [SprintEventSchema], default: [] },

    // ── Member Capacity Allocation ─────────────────────────────────────
    memberCapacities: [
      {
        userId:         { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        userName:       { type: String, default: "" },
        role:           { type: String, default: "developer" }, // "product_owner" | "scrum_master" | "developer"
        availableHours: { type: Number, default: 0, min: 0 },
        allocatedHours: { type: Number, default: 0, min: 0 },
        skills:         { type: [String], default: [] },
      },
    ],
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
SprintSchema.index({ projectId: 1, sprintNumber: -1 });
SprintSchema.index({ projectId: 1, status: 1 });
SprintSchema.index({ teamId: 1, status: 1 });

export default mongoose.model("Sprint", SprintSchema);
