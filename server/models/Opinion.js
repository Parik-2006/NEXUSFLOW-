/**
 * server/models/Opinion.js
 * NEXUSFLOW 3.0 — Phase 14: Opinion Poll & Collaborative Decision Model
 */

import mongoose from "mongoose";

const ResponseSchema = new mongoose.Schema(
  {
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName:    { type: String, default: "" },
    option:      { type: String, required: true },
    reasoning:   { type: String, default: "" },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const AiAnalysisSchema = new mongoose.Schema(
  {
    consensus:      { type: String, default: "" },
    disagreement:   { type: String, default: "" },
    reasoning:      { type: String, default: "" },
    tradeoffs:      { type: String, default: "" },
    recommendation: { type: String, default: "" },
    confidence:     { type: Number, min: 0, max: 1, default: 0.5 },
    provider:       { type: String, default: "deterministic" },
    analyzedAt:     { type: Date },
  },
  { _id: false }
);

const OpinionSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    teamId:    { type: mongoose.Schema.Types.ObjectId, ref: "Team",    required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User",    required: true },

    question:  { type: String, required: true },
    options:   { type: [String], required: true },
    deadline:  { type: Date, default: null },

    responses:   { type: [ResponseSchema], default: [] },
    aiAnalysis:  { type: AiAnalysisSchema, default: null },

    status: {
      type: String,
      enum: ["open", "analyzed", "decided", "closed"],
      default: "open",
    },

    finalDecisionId: { type: mongoose.Schema.Types.ObjectId, ref: "Decision", default: null },
  },
  { timestamps: true }
);

OpinionSchema.index({ projectId: 1, status: 1, createdAt: -1 });

export default mongoose.model("Opinion", OpinionSchema);
