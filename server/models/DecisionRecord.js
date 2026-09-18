/**
 * server/models/DecisionRecord.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAM 23: EXPLAINABLE DECISION INTELLIGENCE MODEL
 *
 * Generic structured explanation record for deterministic and advisory decisions.
 * Every decision answers:
 * WHAT happened -> WHY -> WHICH factors mattered -> WHAT evidence supports it -> WHAT would change it.
 *
 * Invariant: DAA remains deterministic. AI summarizes, never overrides facts.
 * ============================================================================
 */

import mongoose from "mongoose";

const FactorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    weight: { type: Number, default: 1.0 },
    rawValue: { type: mongoose.Schema.Types.Mixed },
    normalizedValue: { type: Number, default: 0 },
    contribution: { type: Number, default: 0 },
    explanation: { type: String, default: "" },
  },
  { _id: false }
);

const EvidenceItemSchema = new mongoose.Schema(
  {
    type: { type: String, default: "metric" },
    referenceId: { type: String },
    description: { type: String, required: true },
    metrics: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const ConstraintSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    satisfied: { type: Boolean, default: true },
    threshold: { type: mongoose.Schema.Types.Mixed },
    actual: { type: mongoose.Schema.Types.Mixed },
    impact: { type: String, default: "" },
  },
  { _id: false }
);

const AlternativeSchema = new mongoose.Schema(
  {
    option: { type: String, required: true },
    score: { type: Number, default: 0 },
    costDifference: { type: Number, default: 0 },
    reasonNotChosen: { type: String, default: "" },
  },
  { _id: false }
);

const CounterfactualSchema = new mongoose.Schema(
  {
    parameter: { type: String, required: true },
    originalValue: { type: mongoose.Schema.Types.Mixed },
    modifiedValue: { type: mongoose.Schema.Types.Mixed },
    projectedOutcome: { type: mongoose.Schema.Types.Mixed },
    delta: { type: String, default: "" },
  },
  { _id: false }
);

const DecisionRecordSchema = new mongoose.Schema(
  {
    decisionId: {
      type: String,
      required: true,
      unique: true,
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
      index: true,
    },
    decisionType: {
      type: String,
      enum: [
        "TASK_PRIORITY",
        "BRANCH_AND_BOUND_ASSIGNMENT",
        "REACTIVE_GREEDY_PLANNING",
        "METHODOLOGY_RECOMMENDATION",
        "ADAPTIVE_METHODOLOGY",
        "RISK_ASSESSMENT",
        "DEPENDENCY_SCHEDULING",
        "WORKFLOW_CONFORMANCE",
        "PROJECT_HEALTH",
        "CAPABILITY_GAP",
        "WHAT_IF_SIMULATION",
        "DIGITAL_TWIN",
        "LEARNING_LOOP",
      ],
      required: true,
      index: true,
    },
    subjectType: {
      type: String,
      default: "task",
    },
    subjectId: {
      type: String,
      index: true,
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    factors: [FactorSchema],
    evidence: [EvidenceItemSchema],
    constraints: [ConstraintSchema],
    alternatives: [AlternativeSchema],
    counterfactuals: [CounterfactualSchema],
    explanation: {
      what: { type: String, default: "" },
      why: { type: String, default: "" },
      factorsSummary: { type: String, default: "" },
      evidenceSummary: { type: String, default: "" },
      constraintsSummary: { type: String, default: "" },
      alternativesSummary: { type: String, default: "" },
      whatWouldChange: { type: String, default: "" },
    },
    classification: {
      type: String,
      enum: ["DETERMINISTIC", "ADVISORY"],
      default: "DETERMINISTIC",
    },
    source: {
      type: String,
      default: "DAA Engine",
    },
    aiSummary: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes
DecisionRecordSchema.index({ projectId: 1, decisionType: 1, createdAt: -1 });
DecisionRecordSchema.index({ projectId: 1, subjectId: 1 });

export default mongoose.model("DecisionRecord", DecisionRecordSchema);
