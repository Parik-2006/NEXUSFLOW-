/**
 * server/models/ScrumSprintSnapshot.js
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM SPRINT COMPLETION SNAPSHOT MODEL
 *
 * Persists an immutable point-in-time snapshot when a sprint is completed.
 * Preserves committed/completed tasks, story points, status distribution,
 * team capacity, carry-over items, and velocity metrics for historical analysis.
 * ============================================================================
 */

import mongoose from "mongoose";

const StatusCountSchema = new mongoose.Schema(
  {
    count:      { type: Number, default: 0 },
    storyPoints:{ type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
  },
  { _id: false }
);

const ScrumSprintSnapshotSchema = new mongoose.Schema(
  {
    sprintId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sprint",
      required: true,
      index: true,
    },
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
    sprintNumber: { type: Number, required: true },
    name:         { type: String, required: true },
    goal:         { type: String, default: "" },
    status:       { type: String, default: "COMPLETED" },
    startDate:    { type: Date, default: null },
    endDate:      { type: Date, default: null },
    completedAt:  { type: Date, default: Date.now },

    // Metrics at completion
    totalCommittedStories: { type: Number, default: 0 },
    totalCommittedPoints:  { type: Number, default: 0 },
    completedStories:      { type: Number, default: 0 },
    completedPoints:       { type: Number, default: 0 },
    completionRatePct:     { type: Number, default: 100 },
    carryOverCount:        { type: Number, default: 0 },
    carryOverTaskIds:      { type: [mongoose.Schema.Types.ObjectId], default: [] },
    completedTaskIds:      { type: [mongoose.Schema.Types.ObjectId], default: [] },

    // Task Flow Distribution
    statusDistribution: {
      todo:        { type: StatusCountSchema, default: () => ({}) },
      in_progress: { type: StatusCountSchema, default: () => ({}) },
      in_review:   { type: StatusCountSchema, default: () => ({}) },
      blocked:     { type: StatusCountSchema, default: () => ({}) },
      done:        { type: StatusCountSchema, default: () => ({}) },
    },

    // Capacity & Workload at completion
    capacity: {
      totalCapacityHours:  { type: Number, default: 0 },
      totalCommittedHours: { type: Number, default: 0 },
      utilizationPct:      { type: Number, default: 0 },
    },
    memberWorkloads: [
      {
        userId:         { type: String, default: "" },
        name:           { type: String, default: "" },
        assignedHours:  { type: Number, default: 0 },
        capacityHours:  { type: Number, default: 40 },
        utilizationPct: { type: Number, default: 0 },
      },
    ],

    provenance: { type: String, default: "COMPLETED_SPRINT_SNAPSHOT" },
    createdAt:  { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ScrumSprintSnapshotSchema.index({ projectId: 1, sprintNumber: 1 });
ScrumSprintSnapshotSchema.index({ teamId: 1, createdAt: -1 });

export default mongoose.models.ScrumSprintSnapshot ||
  mongoose.model("ScrumSprintSnapshot", ScrumSprintSnapshotSchema);

