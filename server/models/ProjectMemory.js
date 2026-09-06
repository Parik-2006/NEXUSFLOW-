/**
 * server/models/ProjectMemory.js
 * ============================================================================
 * PROJECT MEMORY — Structured persistent memory for NEXUSFLOW 4.0.
 *
 * WHY THIS MODEL EXISTS:
 * The Project.copilotMemory array is limited and lacks proper lifecycle
 * management. ProjectMemory provides a full CRUD model with:
 *   - 11 structured memory categories
 *   - Persistent vs temporary scope separation
 *   - Archive/restore lifecycle
 *   - Author attribution and confidence scoring
 *   - Queryable by category, scope, and project
 *
 * MEMORY CATEGORIES:
 *   DECISION           — Architectural and technical choices
 *   TEACHER_FEEDBACK   — Feedback from teachers/instructors
 *   REQUIREMENT        — Extracted or stated requirements
 *   ARCHITECTURE_DECISION — System design and component choices
 *   METHODOLOGY_EVENT  — Methodology-related events and changes
 *   MAJOR_CHANGE       — Significant project changes
 *   RISK_LESSON        — Lessons learned from risks
 *   LESSON_LEARNED     — General lessons learned
 *   MILESTONE          — Project milestones
 *   IMPORTANT_ARTIFACT — Key project artifacts
 *   PROJECT_NOTE       — General project notes
 *
 * WHY SEPARATE FROM Project.copilotMemory:
 * - copilotMemory is a flat key-value store with limited categories
 * - ProjectMemory supports rich metadata, lifecycle, and querying
 * - Memory entries can be archived/restored without deletion
 * - Proper authorization and project isolation enforcement
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
];

const MEMORY_SCOPE = ["persistent", "temporary"];
const MEMORY_STATUS = ["active", "archived", "restored"];

const ProjectMemorySchema = new mongoose.Schema(
  {
    // ── Ownership ──────────────────────────────────────────────────────
    // Every memory entry belongs to a project
    projectId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Project",
      required: true,
      index:    true,
    },

    // ── Memory Classification ──────────────────────────────────────────
    // What type of memory this is
    category: {
      type:    String,
      enum:    MEMORY_CATEGORIES,
      required: true,
      index:   true,
    },

    // ── Memory Content ─────────────────────────────────────────────────
    // The memory title — short, descriptive label
    title: { type: String, required: true, maxlength: 200 },

    // The full memory content — detailed description or record
    content: { type: String, required: true, default: "" },

    // ── Scope ──────────────────────────────────────────────────────────
    // persistent = retained across sessions, included in context
    // temporary  = short-lived, may be excluded from long-term context
    scope: {
      type:    String,
      enum:    MEMORY_SCOPE,
      default: "persistent",
      index:   true,
    },

    // ── Status Lifecycle ───────────────────────────────────────────────
    // active   = currently in use
    // archived = preserved but not included in active context
    // restored = was archived, now active again
    status: {
      type:    String,
      enum:    MEMORY_STATUS,
      default: "active",
      index:   true,
    },

    // ── Source & Attribution ───────────────────────────────────────────
    // Where did this memory come from?
    source: {
      type:    String,
      enum:    ["ai", "manual", "teacher", "system", "copilot"],
      default: "manual",
    },

    // Who created this memory record?
    createdBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },

    // ── Confidence & Relevance ─────────────────────────────────────────
    // How confident is the system in this memory? (0.0 to 1.0)
    confidence: { type: Number, min: 0, max: 1, default: 1.0 },

    // When was this memory last relevant or verified?
    lastVerifiedAt: { type: Date, default: null },

    // ── Metadata ───────────────────────────────────────────────────────
    // Optional tags for filtering and search
    tags: { type: [String], default: [] },

    // Related entity references (e.g., task IDs, decision IDs)
    relatedEntityIds: { type: [String], default: [] },

    // ── Evidence ───────────────────────────────────────────────────────
    // URLs or references supporting this memory
    evidence: { type: [String], default: [] },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────
// Primary lookup: all memories for a project, newest first
ProjectMemorySchema.index({ projectId: 1, createdAt: -1 });

// Filter by category: "show me all DECISION memories"
ProjectMemorySchema.index({ projectId: 1, category: 1 });

// Filter by scope: "show only persistent memories"
ProjectMemorySchema.index({ projectId: 1, scope: 1 });

// Filter by status: "show only active memories"
ProjectMemorySchema.index({ projectId: 1, status: 1 });

// Composite: project + category + scope for efficient retrieval
ProjectMemorySchema.index({ projectId: 1, category: 1, scope: 1, status: 1 });

export { MEMORY_CATEGORIES, MEMORY_SCOPE, MEMORY_STATUS };
export default mongoose.model("ProjectMemory", ProjectMemorySchema);
