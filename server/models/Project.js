/**
 * server/models/Project.js
 * ============================================================================
 * PROJECT — Central context entity for NEXUSFLOW 2.0.
 *
 * WHY THIS MODEL EXISTS:
 * In NEXUSFLOW 1.x, the "project" was just two string fields on Team
 * (projectTitle, projectDescription). That was sufficient when every team
 * had exactly one project and all intelligence was task-centric.
 *
 * NEXUSFLOW 2.0 needs the database to understand:
 *   - WHAT the student wants to build (original prompt, objectives, domain)
 *   - WHO it is for (target users, context)
 *   - HOW CONSTRAINED it is (budget, timeline, preferred technologies)
 *   - WHAT IT NEEDS (hardware, software, AI/ML, cloud services)
 *   - WHAT PHASE it is in (ideation, research, development, deployment)
 *
 * Without a Project entity, none of the planned Phase 2+ features can store
 * their output with proper context:
 *   - AI Advisor recommendations need a project to recommend FOR
 *   - Decisions need to record WHICH project they affect
 *   - Research items need to be scoped to the project problem domain
 *   - Architecture components describe THIS project's architecture, not global
 *   - AI conversations need project context so the Copilot remembers the idea
 *
 * RELATIONSHIP TO TEAM:
 * A Team can have multiple Projects over time (e.g., a student team that
 * builds a different project each semester). The active project is indicated
 * by Team.activeProjectId (optional pointer, not breaking).
 *
 * RELATIONSHIP TO TASK:
 * Existing Tasks have teamId. New tasks can ALSO have projectId (optional).
 * Legacy tasks with no projectId continue working exactly as before.
 *
 * STRUCTURE:
 * Project embeds a ProjectContext (structured understanding of the prompt)
 * because ProjectContext has a strict 1:1 relationship with its Project,
 * is always loaded together with the Project, and needs atomic updates.
 * Embedding avoids an extra DB round-trip every time the AI needs context.
 * ============================================================================
 */

import mongoose from "mongoose";

// ── ProjectContext (Embedded 1:1 inside Project) ─────────────────────────────
//
// WHY EMBEDDED (not a separate collection):
// A ProjectContext only makes sense IN the context of its Project.
// It is always read together with the Project document (every AI request
// needs both the project metadata AND the extracted context). Embedding
// gives us one atomic read and one atomic write — no join required.
//
// PURPOSE: Stores structured understanding extracted from the user's
// original natural-language project prompt/idea. The raw prompt alone is
// not structured enough for algorithm inputs or AI advisor context injection.
// Structured context allows the system to answer "What domain is this?",
// "What hardware does it need?", "What are the constraints?".
//
const ProjectContextSchema = new mongoose.Schema(
  {
    // ── Problem Understanding ───────────────────────────────────────────────
    // What exact problem is the project solving?
    // e.g. "Small farmers waste water due to manual irrigation decisions"
    problemStatement:     { type: String, default: "" },

    // Who will use the product?
    // e.g. ["Small-scale farmers", "Agricultural extension officers"]
    targetUsers:          { type: [String], default: [] },

    // What are the explicit success goals?
    // e.g. ["Reduce water usage by 30%", "Alert farmers via SMS"]
    goals:                { type: [String], default: [] },

    // What limits the project? Time, budget, team size, tech constraints.
    // e.g. ["Must run on ESP32 (no cloud GPU)", "Under $200 hardware budget"]
    constraints:          { type: [String], default: [] },

    // What are the expected deliverables?
    // e.g. ["Mobile dashboard", "REST API", "Trained ML model", "Hardware kit"]
    expectedOutputs:      { type: [String], default: [] },

    // ── Technical Requirements ──────────────────────────────────────────────
    // Hardware the project requires
    // e.g. ["ESP32", "Soil moisture sensor", "Water pump", "Relay module"]
    hardwareRequirements: { type: [String], default: [] },

    // Software components required
    // e.g. ["Node.js backend", "React Native app", "Python ML pipeline"]
    softwareRequirements: { type: [String], default: [] },

    // AI/ML capabilities required
    // e.g. ["Soil moisture prediction model", "Anomaly detection", "Decision rules"]
    aiMlRequirements:     { type: [String], default: [] },

    // External service integrations required
    // e.g. ["OpenWeatherMap API", "Firebase push notifications", "Twilio SMS"]
    integrations:         { type: [String], default: [] },

    // Deployment environment
    // e.g. ["AWS EC2", "Vercel", "Raspberry Pi local server", "Cloud + edge"]
    deploymentRequirements: { type: [String], default: [] },

    // ── Non-Technical Context ───────────────────────────────────────────────
    // Security and privacy considerations
    // e.g. ["Sensor data encrypted in transit", "Farmer data consent required"]
    securityConsiderations: { type: [String], default: [] },

    // Estimated budget in USD (null = not specified by user)
    budgetUsd:            { type: Number, default: null },

    // Estimated total project timeline in days (null = not specified)
    estimatedDurationDays: { type: Number, default: null },

    // Technologies the student/team prefers to use
    // e.g. ["Python", "React Native", "MongoDB", "TensorFlow"]
    preferredStack:       { type: [String], default: [] },

    // Assumptions made during context extraction (for transparency)
    // e.g. ["Assumed team has access to ESP32 hardware", "Assumed WiFi connectivity"]
    assumptions:          { type: [String], default: [] },

    // ── Extraction Metadata ─────────────────────────────────────────────────
    // Was this context extracted by AI or manually filled?
    // "ai" = extracted by GPT from the prompt | "manual" = user-filled form
    extractedBy:          { type: String, enum: ["ai", "manual", "hybrid"], default: "manual" },

    // Confidence that the AI extraction is correct (0.0 to 1.0)
    // Used in Phase 2 to decide when to prompt user to review context
    extractionConfidence: { type: Number, min: 0, max: 1, default: null },
  },
  { _id: false }  // Embedded sub-document — no independent _id
);

// ── Main Project Schema ───────────────────────────────────────────────────────
const ProjectSchema = new mongoose.Schema(
  {
    // ── Ownership & Identity ────────────────────────────────────────────────

    // Which team owns this project?
    // REQUIRED because every project belongs to exactly one team.
    // Indexed for fast lookup: "Give me all projects for team X"
    teamId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Team",
      required: true,
      index:    true,
    },

    // Human-readable project name
    // e.g. "AI Smart Irrigation System"
    title: { type: String, required: true, default: "" },

    // Full natural-language description of what the project does
    // e.g. "A system that monitors soil moisture via ESP32 sensors..."
    description: { type: String, default: "" },

    // ── Original Prompt (Most Important Field) ──────────────────────────────
    // The EXACT original text the student entered to describe their idea.
    // This is the "source of truth" — everything else is derived from this.
    // WHY STORE IT: The AI context extraction may miss details. Storing the
    // original prompt allows re-extraction with better models in later phases.
    // Also useful for showing the user "this is what you originally said".
    originalPrompt: { type: String, default: "" },

    // ── Classification ──────────────────────────────────────────────────────
    // What broad domain does this project belong to?
    // e.g. "IoT", "Web Application", "Mobile App", "AI/ML System"
    // Drives which specialist advisors are activated in Phase 2+
    domain: { type: String, default: "" },

    // More specific project type (within the domain)
    // e.g. "Smart Agriculture", "E-Commerce", "Health Monitoring"
    projectType: { type: String, default: "" },

    // Academic context — why is the student building this?
    // e.g. "Final year project", "Hackathon", "Startup prototype", "Learning"
    academicContext: { type: String, default: "" },

    // ── Project Status & Phase ───────────────────────────────────────────────
    // Current lifecycle status of the project
    // Starts as "ideation", progresses to "active" when team starts tasks
    status: {
      type:    String,
      enum:    ["ideation", "planning", "active", "on_hold", "completed", "cancelled"],
      default: "ideation",
    },

    // Current execution phase (maps to the NEXUSFLOW 2.0 pipeline)
    // This tells the system WHERE in the project lifecycle the team is
    currentPhase: {
      type:    String,
      enum:    [
        "idea",          // User just entered prompt
        "understanding", // System is extracting context
        "research",      // Team is investigating technologies
        "decisions",     // Team is making architectural choices
        "architecture",  // System architecture is being designed
        "development",   // Tasks are being executed
        "testing",       // Integration and QA work
        "deployment",    // Preparing for production
        "completed",     // Project finished
      ],
      default: "idea",
    },

    // ── Structured Context (Embedded) ────────────────────────────────────────
    // WHY EMBEDDED: 1:1 relationship, always read together. See above.
    context: { type: ProjectContextSchema, default: () => ({}) },

    // ── Team & Resource Hints ────────────────────────────────────────────────
    // How many people are working on this project?
    teamSize: { type: Number, default: null, min: 1 },

    // How many sprint weeks are planned?
    // Used by Phase 2+ Sprint Optimizer to tune capacity assumptions
    sprintWeeks: { type: Number, default: null, min: 1 },

    // ── Copilot Learned Memory ──────────────────────────────────────────────
    // Project-level learned decisions, selected technologies, preferences, and constraints
    copilotMemory: [
      {
        key:        { type: String, required: true },
        value:      { type: String, required: true },
        category:   { type: String, default: "general" },
        source:     { type: String, default: "conversation" },
        confidence: { type: Number, default: 1.0 },
        createdAt:  { type: Date, default: Date.now },
      },
    ],

    // ── Denormalized Counters (for dashboard, performance) ──────────────────
    // Mirrors the team-level taskCount but scoped to this project.
    // Incremented/decremented when tasks are created/deleted with this projectId.
    taskCount: { type: Number, default: 0, min: 0 },
    doneCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }  // createdAt, updatedAt auto-managed
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Primary lookup: all projects for a given team, newest first
ProjectSchema.index({ teamId: 1, createdAt: -1 });

// Status filter: "show me all active projects for this team"
ProjectSchema.index({ teamId: 1, status: 1 });

export default mongoose.model("Project", ProjectSchema);
