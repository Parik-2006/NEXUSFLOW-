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

    generatedBy:    { type: String, enum: ["ai", "deterministic"], default: "deterministic" },
    acknowledgedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

RetrospectiveSchema.index({ projectId: 1, createdAt: -1 });

export default mongoose.model("Retrospective", RetrospectiveSchema);
