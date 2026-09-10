import mongoose from "mongoose";
import { computePriorityScore } from "../algorithms/greedyScheduler.js";
import { computeTaskPriority } from "../algorithms/taskPriorityEngine.js";

// ── Branch & Bound: skill demand profile ─────────────────────────────────────
const SkillWeightsSchema = new mongoose.Schema(
  {
    frontend: { type: Number, default: 0, min: 0, max: 10 },
    backend:  { type: Number, default: 0, min: 0, max: 10 },
    devops:   { type: Number, default: 0, min: 0, max: 10 },
    design:   { type: Number, default: 0, min: 0, max: 10 },
    ml:       { type: Number, default: 0, min: 0, max: 10 },
    testing:  { type: Number, default: 0, min: 0, max: 10 },
  },
  { _id: false }
);

const TaskSchema = new mongoose.Schema(
  {
    teamId:    { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true, index: true },

    // ── NEXUSFLOW 2.0: Project association (optional, migration-safe) ─────────
    // WHY OPTIONAL: Existing tasks were created before the Project model existed.
    // Making projectId required would immediately break every existing task,
    // every existing API call, and every socket handler that creates tasks.
    //
    // Strategy: projectId starts as null for all legacy tasks.
    // When a new Project is created and tasks are subsequently created for it,
    // they receive a projectId. Legacy tasks are backfilled later via
    // the migration script (server/scripts/migratePhase1.js).
    //
    // The existing `teamId` field remains the primary task grouping key.
    // `projectId` adds a FINER level of scoping (multiple projects per team).
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null, index: true },
    title:     { type: String, required: true },
    description: { type: String, default: "" },   // Boyer-Moore search field
    status:    { type: String, enum: ["todo", "in_progress", "done"], default: "todo" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // ── Merge Sort secondary ordering keys ────────────────────────────────────
    deadline:  { type: Date, default: null },     // EDF comparator (legacy / due date)
    startDate: { type: Date, default: null },     // user-set start date (Deadline view)
    dueDate:   { type: Date, default: null },     // user-set due date (Deadline view)
    completedAt: { type: Date, default: null },   // set when status → done (deadline-success accuracy)
    progress:  { type: Number, default: 0, min: 0, max: 100 }, // progress comparator

    // ── Provenance / display metadata ────────────────────────────────────────
    source:        { type: String, enum: ["ai", "manual"], default: "manual" }, // AI vs Manual badge
    priorityLabel: { type: String, enum: ["critical", "high", "medium", "low", null], default: null }, // explicit tier (overrides derived)
    category:      { type: String, default: "General" }, // AI project-decomposition group (Planning / Backend / …)
    phase:         { type: String, default: "requirements" }, // Waterfall phase (requirements, design, implementation, testing, deployment, maintenance)
    requirementId: { type: String, default: null }, // Link to SRS requirement ID (REQ-001)
    reminderAt:    { type: Date, default: null },         // user-set reminder timestamp

    // ── Greedy Scheduler inputs ───────────────────────────────────────────────
    urgency:         { type: Number, min: 1, max: 5, default: 1 },
    impact:          { type: Number, min: 1, max: 5, default: 1 },
    dependencyCount: { type: Number, min: 0, default: 0 },

    // ── Derived state versioning (Fix 3) ──────────────────────────────────────
    // StateVersion: increments on any task mutation. Clients use this to detect
    // stale derived state (Greedy Result, Planning Result). Updating to n+1
    // invalidates cached results; server recomputes on next read.
    stateVersion:    { type: Number, default: 0, min: 0 },
    greedyVersion:  { type: Number, default: 0, min: 0 },
    planningVersion:{ type: Number, default: 0, min: 0 },

    // ── Greedy Scheduler output (auto-computed by pre-save hook) ─────────────
    priorityScore: { type: Number, min: 0, max: 100, default: 0, index: true },

    // ── Topological Sort / DAG ───────────────────────────────────────────────
    dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task", default: [] }],
    topoOrder:    { type: Number, default: null },

    // ── 0/1 Knapsack Sprint Optimizer ────────────────────────────────────────
    estimatedHours: { type: Number, default: null, min: 0 },
    businessValue:  { type: Number, default: null, min: 0 },
    storyPoints:    { type: Number, default: 1, min: 1 },

    // ── Branch & Bound Assignment ─────────────────────────────────────────────
    skillWeights:   { type: SkillWeightsSchema, default: () => ({}) },
    assignedTo:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    assignmentCost: { type: Number, default: null },

    // ── Skill gap detection (FIX 2) ───────────────────────────────────────────
    // Optional list of skill names a task requires. Used by the Risk
    // Intelligence engine to detect skill gaps. Migration-safe default.
    requiredSkills: { type: [String], default: [] },

    // ── NEXUSFLOW V4 SCRUM: Sprint-Aware Task Fields ──────────────────────────
    // All fields are optional with safe defaults for backward compatibility.
    // Legacy tasks with no sprintId continue working exactly as before.

    // Which Sprint this task belongs to (null = not in any sprint / backlog item)
    sprintId: { type: mongoose.Schema.Types.ObjectId, ref: "Sprint", default: null, index: true },

    // Parent story for story→subtask traceability
    parentStoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Task", default: null },

    // Scrum-specific status (coexists with legacy `status` field for V3 compatibility)
    // BACKLOG → SELECTED_FOR_SPRINT → TODO → IN_PROGRESS → IN_REVIEW → DONE
    // Additional: BLOCKED, CARRIED_OVER, CANCELLED
    scrumStatus: {
      type:    String,
      enum:    ["BACKLOG", "SELECTED_FOR_SPRINT", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED", "CARRIED_OVER", "CANCELLED", null],
      default: null,
    },

    // User Story format: "As a [user], I want [goal], so that [benefit]"
    userStory: { type: String, default: "" },

    // Acceptance criteria for Definition of Done
    acceptanceCriteria: { type: [String], default: [] },

    // Actual hours spent (vs estimatedHours for estimation accuracy tracking)
    actualHours: { type: Number, default: null, min: 0 },

    // Blocked reason (when scrumStatus = BLOCKED)
    blockedReason: { type: String, default: "" },

    // Track carry-over history across sprints
    carryOverHistory: [
      {
        fromSprintId: { type: mongoose.Schema.Types.ObjectId, ref: "Sprint" },
        toSprintId:   { type: mongoose.Schema.Types.ObjectId, ref: "Sprint" },
        reason:       { type: String, default: "incomplete" },
        carriedAt:    { type: Date, default: Date.now },
      },
    ],

    // Scrum-specific priority factors
    technicalUncertainty: { type: Number, default: null, min: 1, max: 10 },
    teacherImportance:    { type: Number, default: null, min: 1, max: 10 },
    milestoneImportance:  { type: Number, default: null, min: 1, max: 10 },
    expectedValue:        { type: Number, default: null, min: 1, max: 10 },
    blockingPotential:    { type: Number, default: null, min: 0, max: 10 }, // how many tasks this blocks

    // ── NEXUSFLOW V4 KANBAN: Continuous Flow Work Item Fields ─────────────────
    // Coexists with legacy and Scrum fields for full backward compatibility
    kanbanStatus: {
      type:    String,
      enum:    ["BACKLOG", "READY", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED", null],
      default: null,
      index:   true,
    },
    workflowColumn: {
      type:    String,
      default: "backlog",
      index:   true,
    },
    classOfService: {
      type:    String,
      enum:    ["standard", "fixed_date", "expedite", "improvement"],
      default: "standard",
      index:   true,
    },

    // Precise timestamps for flow metrics (cycle time, lead time, aging)
    readyAt:           { type: Date, default: null },
    activeStartedAt:   { type: Date, default: null },
    reviewStartedAt:   { type: Date, default: null },
    doneAt:            { type: Date, default: null, index: true },
    blockedAt:         { type: Date, default: null },

    // Cumulative duration tracking in milliseconds
    totalBlockedDurationMs: { type: Number, default: 0 },
    totalActiveDurationMs:  { type: Number, default: 0 },
    totalWaitingDurationMs: { type: Number, default: 0 },
    totalReviewDurationMs:  { type: Number, default: 0 },

    // Blocker lifecycle & intelligence
    isBlocked: { type: Boolean, default: false, index: true },
    blockers: [
      {
        blockerId:       { type: String, required: true },
        title:           { type: String, required: true },
        description:     { type: String, default: "" },
        category:        { type: String, enum: ["technical", "dependency", "external", "review", "resource", "other"], default: "technical" },
        severity:        { type: String, enum: ["low", "medium", "high", "critical"], default: "medium" },
        status:          { type: String, enum: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"], default: "OPEN" },
        createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdByName:   { type: String, default: "Member" },
        createdAt:       { type: Date, default: Date.now },
        resolvedAt:      { type: Date, default: null },
        resolutionNotes: { type: String, default: "" },
      },
    ],

    // WIP Override record if pulled beyond limit
    wipOverride: {
      overriddenBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      overriddenByName: { type: String, default: "" },
      reason:           { type: String, default: "" },
      timestamp:        { type: Date, default: null },
    },

    // Continuous delivery evidence and feedback
    deliveryEvidence: { type: [String], default: [] },
    teacherFeedback:  { type: String, default: "" },
  },
  { timestamps: true }
);

// Compound indexes (existing — teamId-scoped, unchanged)
TaskSchema.index({ teamId: 1, priorityScore: -1 }); // greedy sort by team
TaskSchema.index({ teamId: 1, topoOrder: 1 });       // topo sort by team
TaskSchema.index({ teamId: 1, kanbanStatus: 1 });
TaskSchema.index({ projectId: 1, kanbanStatus: 1 });
TaskSchema.index({ projectId: 1, workflowColumn: 1 });

// NEXUSFLOW 2.0: project-scoped equivalents (for when projectId is present)
// WHY NEEDED: Future endpoints like GET /api/projects/:projectId/tasks
// will query by projectId + sort by priorityScore or topoOrder.
// Without these indexes, those queries would do full collection scans.
// Tasks with projectId=null simply do not appear in projectId-scoped queries.
TaskSchema.index({ projectId: 1, priorityScore: -1 }); // greedy sort by project
TaskSchema.index({ projectId: 1, topoOrder: 1 });       // topo sort by project

// ── pre('save'): recompute priorityScore ─────────────────────────────────────
TaskSchema.pre("save", function (next) {
  if (this.isNew || this.isModified("urgency") || this.isModified("impact") || this.isModified("dependencyCount")) {
    this.priorityScore = computePriorityScore({
      urgency: this.urgency,
      impact: this.impact,
      dependencyCount: this.dependencyCount,
    });
  }
  next();
});

// ── pre('findOneAndUpdate'): recompute when update touches priority inputs ────
TaskSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  const set = update.$set ?? update;

  if (set.urgency !== undefined || set.impact !== undefined || set.dependencyCount !== undefined) {
    const urgency = set.urgency ?? 1;
    const impact  = set.impact  ?? 1;
    const dependencyCount = set.dependencyCount ?? 0;
    const newScore = computePriorityScore({ urgency, impact, dependencyCount });

    if (update.$set) {
      update.$set.priorityScore = newScore;
    } else {
      update.$set = { priorityScore: newScore };
      delete update.urgency;
      delete update.impact;
      delete update.dependencyCount;
    }
  }
  next();
});

// ── Optional enrichment: compute full TaskPriorityEngine result ───────────────
// Call from routes when team-level context (risks, skills, workload) is available.
TaskSchema.statics.enrichPriority = function enrichPriority(taskDoc, context = {}) {
  if (!taskDoc) return null;
  return computeTaskPriority(taskDoc, context);
};

export default mongoose.model("Task", TaskSchema);
