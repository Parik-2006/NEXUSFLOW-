/**
 * server/models/Decision.js
 * ============================================================================
 * DECISION — Records important architectural and technical choices made during
 * the project lifecycle.
 *
 * WHY THIS MODEL EXISTS:
 * In software projects, students and teams constantly make decisions:
 *   "We chose React Native over Flutter"
 *   "We decided to use MongoDB instead of PostgreSQL"
 *   "We selected ESP32 over Raspberry Pi for the hardware layer"
 *
 * Currently NEXUSFLOW has NO way to remember any of these decisions.
 * Every time the student asks the AI "why did we choose MongoDB?", the system
 * has no answer — because the decision was never stored.
 *
 * WHY REFERENCED (not embedded in Project):
 * - A project can accumulate 20-50+ decisions over its lifecycle
 * - Each decision has its own status lifecycle ("proposed" → "accepted" → "superseded")
 * - Decisions can be queried independently: "What decisions are still pending?"
 * - Decisions may reference specific tasks or architecture components (Phase 2+)
 *
 * FUTURE USES (Phase 2+):
 * - Decision Engine: AI proposes decisions, student accepts/rejects
 * - Learning Engine: Past accepted decisions train recommendations for similar projects
 * - Project Copilot: "You previously decided to use MongoDB — should I generate
 *   schema design tasks for that?"
 * - Risk Intelligence: Flag if a superseded decision has orphaned tasks
 * ============================================================================
 */

import mongoose from "mongoose";

const DecisionSchema = new mongoose.Schema(
  {
    // ── Ownership ────────────────────────────────────────────────────────────
    // Every decision belongs to a project (and transitively, a team)
    // Indexed because the most common query is "all decisions for project X"
    projectId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Project",
      required: true,
      index:    true,
    },

    // ── Decision Identity ────────────────────────────────────────────────────
    // Short, descriptive label for the decision
    // e.g. "Database Technology Selection", "Frontend Framework Choice"
    title: { type: String, required: true },

    // The actual decision statement (what was decided, not why)
    // e.g. "Use MongoDB as the primary database for this project"
    decision: { type: String, required: true, default: "" },

    // ── Decision Context ─────────────────────────────────────────────────────
    // Why was this decision made? What problem does it solve?
    // e.g. "MongoDB's flexible document model suits our evolving sensor data schema.
    //       The team also has prior experience with Mongoose."
    reasoning: { type: String, default: "" },

    // What other options were evaluated before this choice?
    // e.g. ["PostgreSQL", "Firebase Firestore", "SQLite"]
    alternativesConsidered: { type: [String], default: [] },

    // The option that was ultimately selected (often matches `decision` but
    // captured separately for structured querying)
    // e.g. "MongoDB"
    selectedOption: { type: String, default: "" },

    // ── Decision Classification ──────────────────────────────────────────────
    // What category of decision is this?
    // Allows filtering: "show me all technology decisions"
    category: {
      type:    String,
      enum:    [
        "technology",     // Which technology/framework/library to use
        "architecture",   // System design choice (monolith vs microservices)
        "hardware",       // Hardware component selection
        "ai_model",       // Which AI/ML model or provider to use
        "database",       // Database design or storage choice
        "deployment",     // Where/how to deploy
        "security",       // Auth, encryption, privacy decisions
        "process",        // Team workflow, methodology choices
        "other",
      ],
      default: "technology",
    },

    // ── AI Assistance ────────────────────────────────────────────────────────
    // Was this decision proposed by the AI or by the team?
    // "ai" = system suggested it | "manual" = team made it independently
    source: {
      type:    String,
      enum:    ["ai", "manual"],
      default: "manual",
    },

    // How confident is the system (or user) in this decision? (0.0 to 1.0)
    // AI-proposed: confidence from the model
    // Manual: user-rated confidence
    confidence: { type: Number, min: 0, max: 1, default: null },

    // ── Decision Lifecycle ───────────────────────────────────────────────────
    // Current status of the decision
    status: {
      type:    String,
      enum:    ["proposed", "accepted", "rejected", "superseded"],
      default: "proposed",
    },

    // If this decision was superseded, which newer decision replaced it?
    supersededBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Decision",
      default: null,
    },

    // ── Authorship ───────────────────────────────────────────────────────────
    // Who created this decision record?
    // Uses ObjectId (but optional — dev auth uses email, not ObjectId)
    createdBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Most common query: decisions for a project, newest first
DecisionSchema.index({ projectId: 1, createdAt: -1 });

// Filter by status: "show all proposed decisions awaiting review"
DecisionSchema.index({ projectId: 1, status: 1 });

export default mongoose.model("Decision", DecisionSchema);
