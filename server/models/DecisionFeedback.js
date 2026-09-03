/**
 * server/models/DecisionFeedback.js
 * ============================================================================
 * NEXUSFLOW 3.0 — Fix 2: Structured feedback for Decision Engine results.
 *
 * WHY THIS MODEL EXISTS:
 *   Pressing "Helpful", "Not Helpful", or "Save Decision" used to be a dead-
 *   end UI action. We now persist them so future AI explanations and
 *   recommendations can use the project's historical context without
 *   retroactively mutating deterministic DAA scores.
 *
 * SCOPE / PRIVACY:
 *   - Scoped by projectId (and implicitly by team via Project lookup).
 *   - Optionally carries userId for per-user contribution accounting.
 *   - DAA scoring remains deterministic; this table only records human
 *     feedback signals for AI explanation enrichment.
 *
 * NEVER USED TO:
 *   - Modify a saved Decision's score
 *   - Override a Greedy/0/1-Knapsack computation
 *   - Mutate the real Sprint
 * ============================================================================
 */

import mongoose from "mongoose";

const DecisionFeedbackSchema = new mongoose.Schema(
  {
    // ── Ownership ────────────────────────────────────────────────────────────
    projectId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Project",
      required: true,
      index:    true,
    },
    teamId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Team",
      required: true,
      index:    true,
    },
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      default:  null,
      index:    true,
    },

    // ── Decision Context (what was being evaluated) ──────────────────────────
    decisionType: {
      type:    String,
      enum:    ["technology", "task-priority", "sprint", "assignment"],
      default: "technology",
    },
    question:   { type: String, default: "" },
    options:    { type: [String], default: [] },
    selected:   { type: String, default: "" },
    score:      { type: Number, default: null },
    factors:    { type: mongoose.Schema.Types.Mixed, default: null },
    tradeoffs:  { type: mongoose.Schema.Types.Mixed, default: null },
    risks:      { type: mongoose.Schema.Types.Mixed, default: null },
    reason:     { type: String, default: "" },

    // ── Feedback Signal ──────────────────────────────────────────────────────
    feedback: {
      type:    String,
      enum:    ["helpful", "not_helpful", "saved"],
      required: true,
    },
    comment: { type: String, default: "" },

    // ── Optional link to a saved Decision document (for "saved" feedback) ────
    linkedDecisionId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Decision",
      default:  null,
    },
  },
  { timestamps: true }
);

DecisionFeedbackSchema.index({ projectId: 1, createdAt: -1 });
DecisionFeedbackSchema.index({ teamId: 1, createdAt: -1 });

export default mongoose.model("DecisionFeedback", DecisionFeedbackSchema);