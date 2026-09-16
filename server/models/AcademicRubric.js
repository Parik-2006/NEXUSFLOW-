/**
 * server/models/AcademicRubric.js
 * ============================================================================
 * NEXUSFLOW V4 — ACADEMIC EVALUATION & RUBRIC MODEL (Prompt 14)
 *
 * Configurable academic evaluation criteria mapping requirements, tasks,
 * and deliverables to objective evidence.
 *
 * SAFETY INVARIANT:
 *   NO AUTOMATIC GRADING. Final evaluations and scores are strictly teacher-controlled.
 * ============================================================================
 */

import mongoose from "mongoose";

const RubricCriterionSchema = new mongoose.Schema(
  {
    criterionId: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    weight: {
      type: Number,
      default: 20, // percentage weight (e.g. 20%)
      min: 0,
      max: 100,
    },
    mappedRequirementIds: {
      type: [String],
      default: [],
    },
    mappedTaskIds: {
      type: [String],
      default: [],
    },
    requiredEvidenceTypes: {
      type: [String],
      default: ["code", "test", "documentation"],
    },
    reviewedStatus: {
      type: String,
      enum: ["PENDING", "SATISFIED", "NEEDS_REVISION"],
      default: "PENDING",
    },
    teacherScore: {
      type: Number,
      default: null, // Entered by faculty only
    },
    teacherFeedback: {
      type: String,
      default: "",
    },
    evidenceCoverageScore: {
      type: Number,
      default: 0, // Objective deterministic % calculated from real records
    },
  },
  { _id: false }
);

const AcademicRubricSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      unique: true,
      index: true,
    },
    course: {
      type: String,
      default: "Computer Science Capstone",
    },
    semester: {
      type: String,
      default: "Final Semester",
    },
    academicDeadline: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "EVIDENCE_PENDING", "UNDER_REVIEW", "REVIEWED"],
      default: "NOT_STARTED",
      index: true,
    },
    criteria: [RubricCriterionSchema],
    overallEvaluation: {
      teacherRemarks: { type: String, default: "" },
      evaluatedAt: { type: Date, default: null },
      evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      evaluatorName: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

export default mongoose.model("AcademicRubric", AcademicRubricSchema);
