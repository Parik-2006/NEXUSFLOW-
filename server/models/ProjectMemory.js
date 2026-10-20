/**
 * server/models/ProjectMemory.js
 * ============================================================================
 * PROJECT MEMORY — Structured persistent workspace memory for NEXUSFLOW 4.0.
 *
 * Provides:
 *   - Structured memory categories including architecture, requirements, code intelligence, and decisions
 *   - Persistent vs temporary scope separation
 *   - Lifecycle management (active, archived, restored, superseded)
 *   - Author attribution and confidence scoring
 *   - Traceable source references, commit SHAs, and evidence provenance
 *   - Strict workspace/project isolation
 * ============================================================================
 */

import mongoose from "mongoose";

const MEMORY_CATEGORIES = [
  "DECISION",
  "TEACHER_FEEDBACK",
  "REQUIREMENT",
  "ARCHITECTURE_DECISION",
  "METHODOLOGY_EVENT",
  "MAJOR_CHANGE",
  "RISK_LESSON",
  "LESSON_LEARNED",
  "MILESTONE",
  "IMPORTANT_ARTIFACT",
  "PROJECT_NOTE",
  // V4 SCRUM categories
  "SPRINT_PLANNING",
  "SPRINT_REVIEW",
  "SPRINT_RETROSPECTIVE",
  "CARRY_OVER",
  "SPRINT_LEARNING",
  "VELOCITY_INSIGHT",
  // V4 Repository Intelligence & Code Context
  "CODE_INTELLIGENCE",
  "REPOSITORY_EVIDENCE",
];

const MEMORY_SCOPE = ["persistent", "temporary"];
const MEMORY_STATUS = ["active", "archived", "restored"];

const ProjectMemorySchema = new mongoose.Schema(
  {
    // ── Ownership ──────────────────────────────────────────────────────
    // Every memory entry belongs to a project/workspace
    projectId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Project",
      required: true,
      index:    true,
    },

    // Optional workspace/team reference for fast workspace-scoped queries
    teamId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Team",
      default:  null,
      index:    true,
    },

    // ── Memory Classification ──────────────────────────────────────────
    category: {
      type:    String,
      enum:    MEMORY_CATEGORIES,
      required: true,
      index:   true,
    },

    // ── Memory Content ─────────────────────────────────────────────────
    title: { type: String, required: true, maxlength: 200 },
    content: { type: String, required: true, default: "" },

    // ── Scope ──────────────────────────────────────────────────────────
    scope: {
      type:    String,
      enum:    MEMORY_SCOPE,
      default: "persistent",
      index:   true,
    },

    // ── Status Lifecycle ───────────────────────────────────────────────
    status: {
      type:    String,
      enum:    MEMORY_STATUS,
      default: "active",
      index:   true,
    },

    isStale: { type: Boolean, default: false },

    // Pointer to newer memory that superseded this one
    supersededBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectMemory",
      default: null,
    },

    // ── Source & Attribution ───────────────────────────────────────────
    source: {
      type:    String,
      enum:    ["ai", "manual", "teacher", "system", "copilot", "github"],
      default: "manual",
    },

    // Source version or repository commit SHA
    commitSha:     { type: String, default: "" },
    sourceVersion: { type: String, default: "" },

    // Who created this memory record?
    createdBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },

    // ── Confidence & Relevance ─────────────────────────────────────────
    confidence: { type: Number, min: 0, max: 1, default: 1.0 },
    lastVerifiedAt: { type: Date, default: null },

    // ── Metadata ───────────────────────────────────────────────────────
    tags: { type: [String], default: [] },
    relatedEntityIds: { type: [String], default: [] },

    // ── Evidence ───────────────────────────────────────────────────────
    evidence: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Virtual alias for workspaceId
ProjectMemorySchema.virtual("workspaceId").get(function () {
  return this.projectId;
});

// ── Indexes ────────────────────────────────────────────────────────────
ProjectMemorySchema.index({ projectId: 1, createdAt: -1 });
ProjectMemorySchema.index({ projectId: 1, category: 1 });
ProjectMemorySchema.index({ projectId: 1, scope: 1 });
ProjectMemorySchema.index({ projectId: 1, status: 1 });
ProjectMemorySchema.index({ projectId: 1, category: 1, scope: 1, status: 1 });
ProjectMemorySchema.index({ projectId: 1, tags: 1 });

export { MEMORY_CATEGORIES, MEMORY_SCOPE, MEMORY_STATUS };
export default mongoose.model("ProjectMemory", ProjectMemorySchema);
