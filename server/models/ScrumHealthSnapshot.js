/**
 * server/models/ScrumHealthSnapshot.js
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM PROJECT HEALTH SNAPSHOT MODEL
 *
 * Persists deterministic Scrum health assessments in MongoDB.
 * Captures overall project health, backlog readiness, sprint delivery health,
 * core component indicators, critical warnings/advisories, and risk summaries.
 * ============================================================================
 */

import mongoose from "mongoose";

const IndicatorSchema = new mongoose.Schema(
  {
    key:          { type: String, required: true },
    name:         { type: String, required: true },
    score:        { type: Number, min: 0, max: 100, default: 0 },
    status:       { type: String, enum: ["healthy", "attention", "warning", "critical", "unavailable"], default: "healthy" },
    desc:         { type: String, default: "" },
    denominator:  { type: String, default: "" },
    unit:         { type: String, default: "%" },
    isAvailable:  { type: Boolean, default: true },
  },
  { _id: false }
);

const WarningSchema = new mongoose.Schema(
  {
    _id:               { type: String, required: true },
    category:          { type: String, default: "GENERAL" },
    severity:          { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "MEDIUM" },
    title:             { type: String, required: true },
    message:           { type: String, default: "" },
    evidence:          { type: mongoose.Schema.Types.Mixed, default: null },
    recommendedAction: { type: String, default: "" },
    relatedItemIds:    { type: [String], default: [] },
  },
  { _id: false }
);

const ScrumHealthSnapshotSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    methodology: {
      type: String,
      default: "SCRUM",
      index: true,
    },
    sprintId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sprint",
      default: null,
      index: true,
    },
    assessmentScope: {
      type: String,
      enum: ["PROJECT_PLANNING", "ACTIVE_SPRINT", "HISTORICAL"],
      default: "PROJECT_PLANNING",
    },

    // Overall Scrum Project Health
    overallScore: { type: Number, min: 0, max: 100, default: 0 },
    grade:        { type: String, enum: ["A+", "A", "B", "C", "D", "F", "INSUFFICIENT_DATA"], default: "C" },
    status:       { type: String, enum: ["HEALTHY", "NEEDS_ATTENTION", "CRITICAL", "PLANNING_READY", "PLANNING_ATTENTION", "PLANNING_BLOCKED", "INSUFFICIENT_DATA"], default: "PLANNING_READY" },
    summary:      { type: String, default: "" },

    // Backlog Readiness Sub-score
    backlogReadiness: {
      score:          { type: Number, min: 0, max: 100, default: 0 },
      totalItems:     { type: Number, default: 0 },
      estimatedCount: { type: Number, default: 0 },
      specifiedCount: { type: Number, default: 0 },
      conflictsCount: { type: Number, default: 0 },
      status:         { type: String, default: "healthy" },
    },

    // Sprint Delivery Sub-score (available only when valid active sprint exists)
    sprintDelivery: {
      hasActiveSprint: { type: Boolean, default: false },
      sprintId:        { type: mongoose.Schema.Types.ObjectId, ref: "Sprint", default: null },
      sprintNumber:    { type: Number, default: null },
      sprintName:      { type: String, default: "" },
      sprintStatus:    { type: String, default: "" },
      score:           { type: Number, min: 0, max: 100, default: null },
      committedPoints: { type: Number, default: 0 },
      completedPoints: { type: Number, default: 0 },
      committedTasks:  { type: Number, default: 0 },
      completedTasks:  { type: Number, default: 0 },
      blockedTasks:    { type: Number, default: 0 },
      overdueTasks:    { type: Number, default: 0 },
      status:          { type: String, default: "unavailable" },
    },

    // Core Health Indicators
    indicators: [IndicatorSchema],

    // Critical Warnings & Advisories
    warnings: [WarningSchema],
    criticalFactors: { type: [String], default: [] },

    // Summary of persisted risks
    riskSummary: {
      total:         { type: Number, default: 0 },
      open:          { type: Number, default: 0 },
      acknowledged:  { type: Number, default: 0 },
      resolved:      { type: Number, default: 0 },
      criticalCount: { type: Number, default: 0 },
      highCount:     { type: Number, default: 0 },
    },

    // Workload & Capacity details
    workloadAndCapacity: {
      totalCommittedHours: { type: Number, default: 0 },
      totalTeamCapacity:   { type: Number, default: 0 },
      utilizationRate:     { type: Number, default: 0 },
      overloadedCount:     { type: Number, default: 0 },
      unassignedCount:     { type: Number, default: 0 },
    },

    calculationVersion: { type: String, default: "4.0" },
    calculatedBy:       { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    calculatedAt:       { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

ScrumHealthSnapshotSchema.index({ projectId: 1, calculatedAt: -1 });
ScrumHealthSnapshotSchema.index({ teamId: 1, calculatedAt: -1 });

export default mongoose.models.ScrumHealthSnapshot ||
  mongoose.model("ScrumHealthSnapshot", ScrumHealthSnapshotSchema);
