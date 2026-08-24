/**
 * server/models/Resource.js
 * ============================================================================
 * RESOURCE — A polymorphic inventory of everything the project requires:
 * APIs, AI models, datasets, hardware parts, libraries, cloud services,
 * development tools, documentation, and research papers.
 *
 * WHY THIS MODEL EXISTS:
 * A complete project needs to track WHAT IT NEEDS to exist. Currently,
 * NEXUSFLOW stores tasks (things TO DO) but not resources (things NEEDED).
 *
 * For a smart irrigation project, resources include:
 *   - Hardware: ESP32, soil moisture sensor, water pump, relay module
 *   - APIs: OpenWeatherMap (free tier), Twilio SMS, Firebase notifications
 *   - Datasets: Agricultural sensor dataset from Kaggle
 *   - AI Models: Pre-trained crop yield prediction model (HuggingFace)
 *   - Libraries: TensorFlow Lite, MQTT.js, Mongoose
 *   - Cloud Services: AWS IoT Core, Render (deployment), MongoDB Atlas
 *   - Tools: VS Code, Expo CLI, Arduino IDE
 *
 * WHY ONE COLLECTION (polymorphic) INSTEAD OF SEPARATE COLLECTIONS:
 * Creating 8 separate collections (HardwareResource, ApiResource, etc.)
 * would cause:
 *   - Schema explosion (8 files, all nearly identical)
 *   - Complex queries (can't ask "what does this project need?" in one query)
 *   - Foreign key hell when Tasks reference resources (which type?)
 *
 * Instead, a single `resources` collection with a `resourceType` field
 * acts as a discriminator. Common fields (name, description, url, cost,
 * status) live at the top level. Type-specific fields use the free-form
 * `metadata` field (mongoose.Mixed) so each resource type can store what
 * it needs without over-engineering.
 *
 * FUTURE USES (Phase 2+):
 * - Resource Planner: "Your project needs 3 APIs, estimate cost: $40/month"
 * - Hardware Advisor: "For ESP32, here's where to buy + datasheet"
 * - Phase 4 RAG: embed resource descriptions to find similar resources
 *   across projects (reuse knowledge between student cohorts)
 * ============================================================================
 */

import mongoose from "mongoose";

const ResourceSchema = new mongoose.Schema(
  {
    // ── Ownership ────────────────────────────────────────────────────────────
    projectId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Project",
      required: true,
      index:    true,
    },

    // ── Resource Type (Polymorphic Discriminator) ────────────────────────────
    // What kind of resource is this?
    // This field drives how the resource is displayed and what metadata means
    resourceType: {
      type:    String,
      enum:    [
        "api",             // External API (OpenWeatherMap, Stripe, Twilio)
        "ai_model",        // Pre-trained AI model (HuggingFace, OpenAI)
        "dataset",         // Training or reference dataset (Kaggle, UCI)
        "hardware",        // Physical component (ESP32, sensor, relay)
        "library",         // Software library or package (npm, pip)
        "cloud_service",   // Cloud platform service (AWS S3, Firebase, Render)
        "tool",            // Development tool (VS Code, Postman, Arduino IDE)
        "documentation",   // Reference docs, tutorials, official guides
        "research_paper",  // Academic paper needed for implementation
        "other",
      ],
      required: true,
    },

    // ── Core Identity ────────────────────────────────────────────────────────
    // Human-readable name for this resource
    // e.g. "OpenWeatherMap API", "ESP32 Dev Board", "PlantVillage Dataset"
    name: { type: String, required: true },

    // What does it do / what is it for?
    // e.g. "Provides real-time weather data (temperature, rainfall) for irrigation decisions"
    description: { type: String, default: "" },

    // Where to find or access this resource
    // e.g. "https://openweathermap.org/api", "https://www.espressif.com/ESP32"
    url: { type: String, default: "" },

    // ── Cost & Access ────────────────────────────────────────────────────────
    // How is this resource accessed?
    accessType: {
      type:    String,
      enum:    ["free", "freemium", "paid", "open_source", "purchase", "academic", "unknown"],
      default: "unknown",
    },

    // Estimated monthly or one-time cost in USD (null = unknown)
    estimatedCostUsd: { type: Number, default: null, min: 0 },

    // ── Type-Specific Metadata ────────────────────────────────────────────────
    // Flexible key-value store for type-specific information
    // Examples:
    //   api:         { "apiKeyRequired": true, "rateLimitPerMin": 60 }
    //   hardware:    { "voltage": "3.3V", "quantity": 2, "supplier": "Amazon" }
    //   ai_model:    { "modelId": "bert-base-uncased", "source": "huggingface" }
    //   dataset:     { "rows": 50000, "format": "CSV", "license": "CC BY 4.0" }
    //   library:     { "packageName": "tensorflow-lite", "ecosystem": "pip" }
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ── Resource Status ───────────────────────────────────────────────────────
    // Has the team obtained/set up this resource?
    status: {
      type:    String,
      enum:    [
        "identified",   // We know we need it, haven't obtained it yet
        "evaluating",   // Comparing alternatives before committing
        "obtained",     // We have access / it's been purchased
        "integrated",   // It's connected and working in the project
        "abandoned",    // Tried it, decided not to use it
      ],
      default: "identified",
    },

    // ── Task Cross-Reference ──────────────────────────────────────────────────
    // Which task involves setting up or integrating this resource?
    // e.g. "Integrate OpenWeatherMap API" task → this API resource
    relatedTaskId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Task",
      default: null,
    },

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
// All resources for a project, grouped by type
ResourceSchema.index({ projectId: 1, resourceType: 1 });

// Filter by status: "what resources are still needed?"
ResourceSchema.index({ projectId: 1, status: 1 });

export default mongoose.model("Resource", ResourceSchema);
