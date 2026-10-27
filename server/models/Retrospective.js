/**
 * server/models/Retrospective.js
 * NEXUSFLOW 3.0 — Phase 15: Sprint Retrospective Model
 */

import mongoose from "mongoose";

const ContributionSchema = new mongoose.Schema(
  {
    userId:           { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName:         { type: String },
    tasksCompleted:   { type: Number, default: 0 },
    tasksInProgress:  { type: Number, default: 0 },
    tasksBlocked:     { type: Number, default: 0 },
    totalHoursLogged: { type: Number, default: 0 },
  },
  { _id: false }
);

const AnalysisSchema = new mongoose.Schema(
  {
    wentWell:             { type: [String], default: [] },
    wentPoorly:           { type: [String], default: [] },
    bottlenecks:          { type: [String], default: [] },
    risks:                { type: [String], default: [] },
    recommendations:      { type: [String], default: [] },
    suggestedImprovements:{ type: [String], default: [] },
    summary:              { type: String, default: "" },
  },
  { _id: false }
);

const RetrospectiveSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    teamId:    { type: mongoose.Schema.Types.ObjectId, ref: "Team",    required: true },

    // ── V4 SCRUM: Sprint association for current-Sprint filtering ─────────────
    sprintId:     { type: mongoose.Schema.Types.ObjectId, ref: "Sprint", default: null, index: true },
    sprintNumber: { type: Number, default: null },

    sprintName: { type: String, required: true },
    period: {
      start: { type: Date },
      end:   { type: Date },
    },

    taskStats: {
      total:           { type: Number, default: 0 },
      completed:       { type: Number, default: 0 },
      inProgress:      { type: Number, default: 0 },
      blocked:         { type: Number, default: 0 },
      completionRate:  { type: Number, default: 0 },
    },

    memberContributions: { type: [ContributionSchema], default: [] },
    analysis: { type: AnalysisSchema, default: {} },

    // ── V4 SCRUM: Improvement Action Items (Learning Loop Integration) ───────
    actionItems: [
      {
        action:           { type: String, required: true },
        description:      { type: String, default: "" },
        owner:            { type: String, default: "" },
        ownerId:          { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        dueDate:          { type: Date, default: null },
        status:           { type: String, enum: ["open", "in_progress", "completed", "OPEN", "IN_PROGRESS", "COMPLETED"], default: "OPEN" },
        priority:         { type: String, enum: ["low", "medium", "high", "LOW", "MEDIUM", "HIGH"], default: "MEDIUM" },
        relatedFinding:   { type: String, default: "" },
        relatedTaskIds:   [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
        sourceRationale:  { type: String, default: "" },
        createdBy:        { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        createdByName:    { type: String, default: "" },
        evidence:         { type: String, default: "" },
        verificationNote: { type: String, default: "" },
        createdAt:        { type: Date, default: Date.now },
        updatedAt:        { type: Date, default: Date.now },
      },
    ],

    revision:       { type: Number, default: 1 },
    lifecycleState: { type: String, enum: ["DRAFT", "INTERIM", "FORMAL", "FINALIZED"], default: "DRAFT" },
    teamFeedback:   { type: [String], default: [] },
    generatedBy:    { type: String, enum: ["ai", "deterministic", "live_observation"], default: "deterministic" },
    acknowledgedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

RetrospectiveSchema.index({ projectId: 1, createdAt: -1 });
RetrospectiveSchema.index({ projectId: 1, sprintId: 1 });

export default mongoose.model("Retrospective", RetrospectiveSchema);
