/**
 * server/models/ArchitectureComponent.js
 * ============================================================================
 * ARCHITECTURE COMPONENT — Represents one part of the technical architecture
 * for a project (e.g., "Frontend React Native App", "Node.js REST API",
 * "MongoDB Database", "ESP32 Sensor Node", "PyTorch ML Pipeline").
 *
 * WHY THIS MODEL EXISTS:
 * Every software project has an architecture — a set of components that work
 * together to deliver the product. Currently, NEXUSFLOW has NO representation
 * of architecture. Everything lives as flat tasks.
 *
 * The problem:
 *   A student who enters "Build an AI irrigation system" gets 30 tasks.
 *   But WHERE do those tasks belong? Which part of the system does
 *   "Implement Soil Moisture Data API" belong to? Backend? IoT? Both?
 *
 * With ArchitectureComponent:
 *   Backend Component → "REST API" → Tasks: ["Design schema", "Implement routes"]
 *   Hardware Component → "ESP32 Node" → Tasks: ["Flash firmware", "Wire sensors"]
 *   AI Component → "ML Pipeline" → Tasks: ["Train model", "Deploy inference"]
 *
 * This model enables:
 *   - Phase 2+: Architecture Builder shows how components connect
 *   - Phase 2+: Tasks can be scoped to a component (clearer assignment)
 *   - Phase 5+: Knowledge Graph: components become nodes, dependencies become edges
 *
 * WHY REFERENCED (not embedded in Project):
 * - A project can have 5-15 architecture components
 * - Components have their own status and technology fields
 * - Components can depend on each other (component-level DAG, like task-level deps)
 * - Tasks reference components, so components need their own _id
 * ============================================================================
 */

import mongoose from "mongoose";

const ArchitectureComponentSchema = new mongoose.Schema(
  {
    // ── Ownership ────────────────────────────────────────────────────────────
    projectId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Project",
      required: true,
      index:    true,
    },

    // ── Component Identity ────────────────────────────────────────────────────
    // What type of architectural tier is this?
    // Drives visualization grouping and specialist advisor routing in Phase 2+
    componentType: {
      type:    String,
      enum:    [
        "frontend",      // Web UI, Mobile App, Desktop App
        "backend",       // REST API, GraphQL, microservice
        "database",      // Primary DB, cache, search engine
        "ai_ml",         // ML pipeline, model serving, data processing
        "hardware",      // Microcontrollers, sensors, actuators, gateways
        "iot_gateway",   // MQTT broker, edge computing node
        "auth",          // Authentication & authorization service
        "api_gateway",   // Load balancer, reverse proxy
        "messaging",     // Message queue, pub/sub (RabbitMQ, Kafka)
        "storage",       // File storage, CDN, object store
        "monitoring",    // Logging, metrics, alerting
        "deployment",    // CI/CD pipeline, container orchestration
        "external_api",  // Third-party APIs the project consumes
        "other",
      ],
      required: true,
    },

    // Human-readable name for this component
    // e.g. "React Native Mobile App", "FastAPI ML Inference Server"
    name: { type: String, required: true },

    // What does this component do in the system?
    // e.g. "Receives sensor readings via MQTT, stores to MongoDB,
    //       exposes REST endpoints for the mobile dashboard"
    description: { type: String, default: "" },

    // ── Technology & Stack ────────────────────────────────────────────────────
    // The primary technology used in this component
    // e.g. "React Native", "Node.js + Express", "PyTorch", "MongoDB"
    technology: { type: String, default: "" },

    // Supporting libraries, frameworks, or tools
    // e.g. ["Expo", "Redux", "React Navigation", "Socket.io-client"]
    supportingTools: { type: [String], default: [] },

    // ── Component Architecture Dependencies ──────────────────────────────────
    // Which OTHER components does this component depend on?
    // e.g. "Frontend" depends on "Backend API"
    //      "ML Pipeline" depends on "Database" (for training data)
    // This creates a COMPONENT-LEVEL dependency graph (separate from task DAG)
    dependsOn: [{ type: mongoose.Schema.Types.ObjectId, ref: "ArchitectureComponent" }],

    // ── Task Association ─────────────────────────────────────────────────────
    // Which tasks belong to building this component?
    // NOTE: In Phase 1, this is a convenience array of task IDs.
    // In Phase 5+ (Knowledge Graph), this becomes graph edges.
    // Optional — tasks can exist without being scoped to a component.
    relatedTaskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],

    // ── Configuration (Phase 2+) ──────────────────────────────────────────────
    // Free-form configuration hints for this component
    // e.g. { "port": 4000, "region": "us-east-1", "replicaSet": false }
    // Using Mixed type for maximum flexibility in Phase 1
    configuration: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ── Component Status ──────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    ["planned", "in_progress", "completed", "deprecated"],
      default: "planned",
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// All components for a project
ArchitectureComponentSchema.index({ projectId: 1, componentType: 1 });

export default mongoose.model("ArchitectureComponent", ArchitectureComponentSchema);
