/**
 * server/models/ResearchItem.js
 * ============================================================================
 * RESEARCH ITEM — Stores information the team discovered while investigating
 * technologies, papers, datasets, benchmarks, APIs, and other resources.
 *
 * WHY THIS MODEL EXISTS:
 * Good software projects require research BEFORE coding:
 *   - "Which AI model should we use for soil moisture prediction?"
 *   - "What papers exist on precision irrigation using ML?"
 *   - "Is TensorFlow Lite suitable for ESP32?"
 *   - "What public datasets exist for agricultural sensor data?"
 *
 * Currently, NEXUSFLOW students either:
 *   1. Research externally and never capture findings
 *   2. Write notes in task descriptions (unstructured, lost)
 *   3. Forget what they researched and re-research later
 *
 * A ResearchItem model lets the system:
 *   - Store each piece of evidence with structure (title, source, relevance)
 *   - Attach a student's notes to what they found
 *   - Track research status (found → reading → summarized → applied)
 *   - In Phase 4+: embed vectors for RAG-based retrieval ("find research
 *     items similar to this task description")
 *
 * WHY REFERENCED (not embedded in Project):
 * - One project can have 50-100+ research items
 * - Items have independent status lifecycle
 * - Future: vector embeddings make each item large (~1536 floats × 4 bytes = 6KB each)
 *   — cannot be embedded in the parent document
 * - Items need independent indexing (by topic, by status, by relevance score)
 *
 * WHY NOT A VECTOR DB YET:
 * This phase only stores structured metadata. Embeddings and vector search
 * are explicitly Phase 4 work. The `embeddingVector` field is defined here
 * but left null so Phase 4 can populate it without a schema migration.
 * ============================================================================
 */

import mongoose from "mongoose";

const ResearchItemSchema = new mongoose.Schema(
  {
    // ── Ownership ────────────────────────────────────────────────────────────
    projectId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Project",
      required: true,
      index:    true,
    },

    // ── Item Identity ────────────────────────────────────────────────────────
    // Title of the paper, article, documentation, or resource
    // e.g. "Soil Moisture Prediction using LSTM Networks"
    title: { type: String, required: true },

    // Who wrote or published this?
    // e.g. ["John Smith", "Jane Doe"] or ["Google", "OpenAI"]
    authors: { type: [String], default: [] },

    // Where did this come from?
    // e.g. "https://arxiv.org/abs/2301.12345"
    url: { type: String, default: "" },

    // What kind of source is this?
    source: {
      type:    String,
      enum:    [
        "paper",          // Academic paper (arXiv, IEEE, ACM)
        "documentation",  // Official library/API docs
        "article",        // Blog post, tutorial, news article
        "dataset",        // A dataset (Kaggle, HuggingFace, UCI)
        "benchmark",      // Performance comparison or benchmark
        "api",            // API reference or spec
        "github",         // GitHub repository
        "book",           // Textbook or ebook reference
        "video",          // YouTube tutorial, lecture
        "other",
      ],
      default: "article",
    },

    // ── Content Summary ──────────────────────────────────────────────────────
    // The abstract, summary, or excerpt of the research item
    // e.g. "This paper proposes an LSTM-based approach for predicting
    //       irrigation requirements with 94% accuracy using soil sensor data."
    abstract: { type: String, default: "" },

    // Keywords or topics covered by this item
    // e.g. ["LSTM", "soil moisture", "IoT", "precision agriculture"]
    topics: { type: [String], default: [] },

    // ── Relevance Assessment ─────────────────────────────────────────────────
    // How relevant is this to the project? (1 = barely relevant, 5 = core)
    // Allows sorting research items by priority
    relevance: { type: Number, min: 1, max: 5, default: 3 },

    // Notes the student wrote about this item
    // e.g. "The LSTM architecture from section 3 looks promising for our use case.
    //       We should try replicating with our sensor data."
    notes: { type: String, default: "" },

    // ── Publication Info ─────────────────────────────────────────────────────
    // When was it published? (null if unknown or not applicable)
    publishedAt: { type: Date, default: null },

    // ── Research Status ──────────────────────────────────────────────────────
    // Lifecycle of this research item
    status: {
      type:    String,
      enum:    [
        "found",       // Found the item, haven't read it yet
        "reading",     // Currently being read/reviewed
        "summarized",  // Read and notes written
        "applied",     // Concepts from this were applied to the project
        "irrelevant",  // Reviewed and found not useful
      ],
      default: "found",
    },

    // ── Future Phase Placeholder (Phase 4: RAG) ──────────────────────────────
    // Vector embedding of this research item's abstract + notes.
    // NULL in Phase 1. Will be populated by Phase 4's embedding pipeline.
    // Using a plain array (not a special type) for maximum DB compatibility.
    // WHY DEFINE NOW: Avoids a schema migration when Phase 4 begins.
    embeddingVector: { type: [Number], default: null },

    // ── Authorship ───────────────────────────────────────────────────────────
    addedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// List all research items for a project, newest first
ResearchItemSchema.index({ projectId: 1, createdAt: -1 });

// Filter by relevance: "most relevant research items first"
ResearchItemSchema.index({ projectId: 1, relevance: -1 });

// Filter by status: "what research items are still being read?"
ResearchItemSchema.index({ projectId: 1, status: 1 });

export default mongoose.model("ResearchItem", ResearchItemSchema);
