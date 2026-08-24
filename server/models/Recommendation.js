/**
 * server/models/Recommendation.js
 * ============================================================================
 * RECOMMENDATION — Stores suggestions the system (or AI advisors) makes to
 * the student/team about technologies, approaches, tools, and resources.
 *
 * WHY THIS MODEL EXISTS:
 * NEXUSFLOW 2.0 must eventually tell students things like:
 *   "For your computer vision requirement, consider YOLOv8 (PyTorch)"
 *   "For your IoT hardware, ESP32 is better than Raspberry Pi for this use case"
 *   "For your UI, React Native gives you iOS + Android from one codebase"
 *   "For your database, MongoDB suits your sensor data schema"
 *
 * Currently, zero recommendations are persisted. The recommendation pipeline
 * (5-phase DAA) runs and its output is sent over socket — then forgotten.
 * In NEXUSFLOW 2.0, recommendations need to:
 *   - Be persisted so the student can revisit them
 *   - Have lifecycle states (pending → accepted → applied / rejected)
 *   - Link to specific tasks so "accepted" turns into work
 *   - Feed the Decision model when accepted ("We accepted recommendation X
 *     → creating Decision Y: 'Use PyTorch for computer vision'")
 *
 * WHY REFERENCED (not embedded in Project):
 * - A project can receive dozens of recommendations from multiple advisors
 * - Each recommendation has an independent lifecycle
 * - Recommendations may link to Tasks, Decisions, or ArchitectureComponents
 * - Future: recommendation quality tracking (was it helpful? accepted rate?)
 *
 * NOTE: The existing 5-phase recommendation PIPELINE (BFS → Greedy → Knapsack
 * → Merge → Topo) continues to work unchanged. This model stores AI ADVISOR
 * recommendations about WHAT to build, not TASK ORDERING recommendations.
 * ============================================================================
 */

import mongoose from "mongoose";

const RecommendationSchema = new mongoose.Schema(
  {
    // ── Ownership ────────────────────────────────────────────────────────────
    projectId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Project",
      required: true,
      index:    true,
    },

    // ── What Type of Recommendation Is This? ────────────────────────────────
    // Allows filtering and UI grouping: "show me all technology recommendations"
    recommendationType: {
      type:    String,
      enum:    [
        "technology",      // "Use React Native for the mobile app"
        "framework",       // "Use Express.js for the REST API"
        "library",         // "Use TensorFlow Lite for edge inference"
        "ai_model",        // "Use YOLOv8 for object detection"
        "hardware",        // "Use ESP32 for the microcontroller"
        "database",        // "Use MongoDB for flexible document storage"
        "api",             // "Use OpenWeatherMap for weather data"
        "dataset",         // "Use PlantVillage dataset for plant disease detection"
        "architecture",    // "Use microservices for this scale"
        "cloud_service",   // "Use AWS IoT Core for device management"
        "tool",            // "Use Docker for containerization"
        "research_paper",  // "Read this paper before implementing X"
        "process",         // "Use Agile sprints for this team size"
        "other",
      ],
      default: "technology",
    },

    // ── The Recommendation Content ───────────────────────────────────────────
    // What is being recommended?
    // e.g. "PyTorch" or "ESP32" or "OpenWeatherMap API"
    recommendedItem: { type: String, required: true },

    // What technical category does this item belong to?
    // e.g. "AI/ML Framework", "Microcontroller", "Weather Service"
    category: { type: String, default: "" },

    // Why is this recommended for THIS specific project?
    // e.g. "PyTorch has excellent support for custom LSTM networks which
    //       your soil moisture prediction model will need. It also runs
    //       on Python, matching your backend stack."
    reason: { type: String, default: "" },

    // How confident is the system in this recommendation? (0.0 to 1.0)
    confidence: { type: Number, min: 0, max: 1, default: null },

    // Where does this recommendation come from?
    // "ai_advisor" = specialist AI | "daa_pipeline" = existing 5-phase algorithm
    // "user" = student added it | "system" = rule-based logic
    source: {
      type:    String,
      enum:    ["ai_advisor", "daa_pipeline", "user", "system"],
      default: "system",
    },

    // Alternative options if the team cannot use the recommended item
    // e.g. ["TensorFlow", "Keras", "scikit-learn"] as alternatives to PyTorch
    alternatives: { type: [String], default: [] },

    // ── Cross-References ─────────────────────────────────────────────────────
    // Which task does this recommendation relate to? (optional)
    // e.g. "Implement ML Model Training" task triggered this recommendation
    relatedTaskId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Task",
      default: null,
    },

    // ── Recommendation Lifecycle ─────────────────────────────────────────────
    status: {
      type:    String,
      enum:    [
        "pending",   // Awaiting student review
        "accepted",  // Student accepted — may become a Decision
        "rejected",  // Student rejected with optional reason
        "applied",   // The recommended item is now in use
        "deferred",  // Noted but not acting on it right now
      ],
      default: "pending",
    },

    // Optional reason if the student rejected the recommendation
    rejectionReason: { type: String, default: "" },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// All recommendations for a project, newest first
RecommendationSchema.index({ projectId: 1, createdAt: -1 });

// Filter by status: "what recommendations are still pending?"
RecommendationSchema.index({ projectId: 1, status: 1 });

// Filter by type: "show all hardware recommendations"
RecommendationSchema.index({ projectId: 1, recommendationType: 1 });

export default mongoose.model("Recommendation", RecommendationSchema);
