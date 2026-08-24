import mongoose from "mongoose";
import { computePriorityScore } from "../algorithms/greedyScheduler.js";

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
    reminderAt:    { type: Date, default: null },         // user-set reminder timestamp

    // ── Greedy Scheduler inputs ───────────────────────────────────────────────
    urgency:         { type: Number, min: 1, max: 5, default: 1 },
    impact:          { type: Number, min: 1, max: 5, default: 1 },
    dependencyCount: { type: Number, min: 0, default: 0 },

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
  },
  { timestamps: true }
);

// Compound indexes (existing — teamId-scoped, unchanged)
TaskSchema.index({ teamId: 1, priorityScore: -1 }); // greedy sort by team
TaskSchema.index({ teamId: 1, topoOrder: 1 });       // topo sort by team

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

export default mongoose.model("Task", TaskSchema);
