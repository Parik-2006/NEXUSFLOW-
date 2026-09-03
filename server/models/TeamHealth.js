/**
 * server/models/TeamHealth.js
 * NEXUSFLOW 3.0 — Phase 12: Team Health Engine Snapshot Model
 */

import mongoose from "mongoose";

const DimensionSchema = new mongoose.Schema(
  {
    score:       { type: Number, min: 0, max: 100, default: 50 },
    description: { type: String, default: "" },
    details:     { type: String, default: "" },
  },
  { _id: false }
);

const TeamHealthSchema = new mongoose.Schema(
  {
    teamId:    { type: mongoose.Schema.Types.ObjectId, ref: "Team",    required: true, index: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },

    score: { type: Number, min: 0, max: 100, default: 0 },
    grade: { type: String, enum: ["A", "B", "C", "D", "F"], default: "F" },

    dimensions: {
      workloadBalance: { type: DimensionSchema, default: () => ({}) },
      taskCompletion:  { type: DimensionSchema, default: () => ({}) },
      blockedTasks:    { type: DimensionSchema, default: () => ({}) },
      skillCoverage:   { type: DimensionSchema, default: () => ({}) },
      contribution:    { type: DimensionSchema, default: () => ({}) },
      sprintProgress:  { type: DimensionSchema, default: () => ({}) },
      githubActivity:  { type: DimensionSchema, default: () => ({}) },
    },

    strengths:  { type: [String], default: [] },
    warnings:   { type: [String], default: [] },
    advisories: { type: [String], default: [] },

    generatedBy: { type: String, enum: ["deterministic", "ai"], default: "deterministic" },
  },
  { timestamps: true }
);

TeamHealthSchema.index({ projectId: 1, createdAt: -1 });

export default mongoose.model("TeamHealth", TeamHealthSchema);
