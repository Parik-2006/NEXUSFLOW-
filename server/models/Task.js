import mongoose from "mongoose";
import { archivePlugin } from "../utils/archivePlugin.js";
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
    project:   { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null, index: true },
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
    priorityLabel: { type: String, enum: ["critical", "high", "medium", "low", "CRITICAL", "HIGH", "MEDIUM", "LOW", null], default: null }, // explicit tier (overrides derived)
    category:      { type: String, default: "General" }, // AI project-decomposition group (Planning / Backend / …)
    phase:         { type: String, default: "requirements" }, // Waterfall phase (requirements, design, implementation, testing, deployment, maintenance)
    requirementId: { type: String, default: null }, // Link to SRS requirement ID (REQ-001)
    executionOrder: { type: Number, default: null }, // Deterministic sequential order in Waterfall phase
    sourceArtifact: { type: String, default: "" }, // Provenance link to source artifact document
    reminderAt:    { type: Date, default: null },         // user-set reminder timestamp

    // ── Greedy Scheduler inputs ───────────────────────────────────────────────
    urgency:         { type: Number, min: 1, max: 5, default: 1 },
    impact:          { type: Number, min: 1, max: 5, default: 1 },
    // Phase 3 (D-21): both counts are DERIVED by services/taskGraphService.js
    // from the persisted graph (edge A → B: A must finish before B).
    dependencyCount: { type: Number, min: 0, default: 0 }, // distinct active prerequisites (in-degree)
    dependentCount:  { type: Number, min: 0, default: 0 }, // distinct active dependents (out-degree) — greedy input

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
    assignedName:   { type: String, default: null },
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

// ── pre('save'): versioning & recompute priorityScore ─────────────────────────
TaskSchema.pre("save", function (next) {
  if (this.isNew) {
    if (!this.stateVersion || this.stateVersion === 0) this.stateVersion = 1;
    if (!this.greedyVersion || this.greedyVersion === 0) this.greedyVersion = 1;
    if (!this.planningVersion || this.planningVersion === 0) this.planningVersion = 1;
  } else {
    this.stateVersion = (this.stateVersion || 0) + 1;
  }

  if (this.status === "done" && !this.completedAt) {
    this.completedAt = new Date();
  }

  // Full document state is available here, so the greedy score is exact.
  if (this.isNew || this.isModified("urgency") || this.isModified("impact") || this.isModified("dependentCount")) {
    this.priorityScore = computePriorityScore({
      urgency: this.urgency,
      impact: this.impact,
      dependentCount: this.dependentCount,
    });
  }
  this.$locals.graphDirty = this.isNew || this.isModified("dependencies") || this.isModified("archivedAt") || this.isModified("teamId");
  next();
});

TaskSchema.post("save", async function (doc) {
  if (doc.$locals?.graphDirty && doc.teamId) {
    doc.$locals.graphDirty = false;
    const { recomputeForTeams } = await import("../services/taskGraphService.js");
    await recomputeForTeams([doc.teamId]);
  }
});

// ── pre('updateOne'): versioning ──────────────────────────────────────────────
TaskSchema.pre("updateOne", function (next) {
  const update = this.getUpdate();
  if (update && !Array.isArray(update)) {
    if (update.stateVersion !== undefined) {
      update.$set = update.$set || {};
      update.$set.stateVersion = update.stateVersion;
      delete update.stateVersion;
    }
    if (update.greedyVersion !== undefined) {
      update.$set = update.$set || {};
      update.$set.greedyVersion = update.greedyVersion;
      delete update.greedyVersion;
    }
    if (update.planningVersion !== undefined) {
      update.$set = update.$set || {};
      update.$set.planningVersion = update.planningVersion;
      delete update.planningVersion;
    }

    const set = update.$set || update;
    if (set.stateVersion === undefined && !update.$inc?.stateVersion) {
      if (update.$inc) {
        update.$inc.stateVersion = 1;
      } else {
        update.$inc = { stateVersion: 1 };
      }
    }
  }
  next();
});

// ── pre('findOneAndUpdate'): versioning ──────────────────────────────────────
// Phase 3 (D-20): this hook used to recompute priorityScore from the update
// payload alone, substituting DEFAULTS (urgency 1, impact 1, deps 0) for every
// field the update did not mention. Priority is now recomputed after the write
// from the persisted document (see priority/graph hooks below).
TaskSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (update && !Array.isArray(update)) {
    if (update.stateVersion !== undefined) {
      update.$set = update.$set || {};
      update.$set.stateVersion = update.stateVersion;
      delete update.stateVersion;
    }
    const set = update.$set ?? update;
    if (set.stateVersion === undefined && !update.$inc?.stateVersion) {
      if (update.$inc) update.$inc.stateVersion = 1;
      else update.$inc = { stateVersion: 1 };
    }
  }
  next();
});

// ── Phase 3: priority + dependency-graph maintenance for query writes ────────
const PRIORITY_INPUTS = new Set(["urgency", "impact", "dependentCount"]);
const GRAPH_INPUTS = new Set(["dependencies", "archivedAt", "teamId"]);

function touchedFields(update) {
  const keys = new Set();
  if (!update || Array.isArray(update)) return keys;
  for (const [k, v] of Object.entries(update)) {
    if (k.startsWith("$")) {
      if (v && typeof v === "object") for (const f of Object.keys(v)) keys.add(f.split(".")[0]);
    } else keys.add(k.split(".")[0]);
  }
  return keys;
}

async function captureAffected(query, kind) {
  const opts = query.getOptions?.() ?? {};
  if (opts.__skipPriorityHook) return;
  let priority = false, graph = false;
  if (kind === "delete") graph = true;
  else {
    const keys = touchedFields(query.getUpdate());
    priority = [...keys].some((k) => PRIORITY_INPUTS.has(k));
    graph = [...keys].some((k) => GRAPH_INPUTS.has(k));
  }
  if (!priority && !graph) return;
  const docs = await query.model
    .find(query.getFilter(), { _id: 1, teamId: 1 }, { includeArchived: true })
    .limit(kind === "one" ? 1 : 0)
    .lean();
  query.$locals = query.$locals || {};
  query._phase3 = { priority, graph, ids: docs.map((d) => d._id), teams: docs.map((d) => d.teamId) };
}

async function applyAffected(query, res) {
  const st = query._phase3;
  if (!st) return;
  query._phase3 = null;
  const svc = await import("../services/taskGraphService.js");
  if (st.graph) {
    // teamId may have changed: include the post-update workspace as well.
    const after = st.ids.length
      ? await query.model.find({ _id: { $in: st.ids } }, { teamId: 1 }, { includeArchived: true }).lean()
      : [];
    await svc.recomputeForTeams([...st.teams, ...after.map((d) => d.teamId)]);
  }
  if (st.priority && st.ids.length) await svc.recomputePriorityScores({ _id: { $in: st.ids } });
  // findOneAndUpdate returns the document as written by the update itself;
  // refresh the derived fields so callers never see a stale score.
  if (res && typeof res === "object" && res._id && (st.priority || st.graph)) {
    const fresh = await query.model
      .findOne({ _id: res._id }, { priorityScore: 1, dependencyCount: 1, dependentCount: 1 }, { includeArchived: true })
      .lean();
    if (fresh) for (const k of ["priorityScore", "dependencyCount", "dependentCount"]) {
      if (typeof res.set === "function") res.set(k, fresh[k]); else res[k] = fresh[k];
    }
  }
}

for (const op of ["updateOne", "findOneAndUpdate"]) {
  TaskSchema.pre(op, async function () { await captureAffected(this, "one"); });
  TaskSchema.post(op, async function (res) { await applyAffected(this, res); });
}
TaskSchema.pre("updateMany", async function () { await captureAffected(this, "many"); });
TaskSchema.post("updateMany", async function () { await applyAffected(this); });
for (const op of ["deleteOne", "findOneAndDelete"]) {
  TaskSchema.pre(op, { document: false, query: true }, async function () { await captureAffected(this, "delete"); });
  TaskSchema.post(op, { document: false, query: true }, async function () { await applyAffected(this); });
}
TaskSchema.pre("deleteMany", async function () { await captureAffected(this, "delete"); });
TaskSchema.post("deleteMany", async function () { await applyAffected(this); });
TaskSchema.post("insertMany", async function (docs) {
  const list = Array.isArray(docs) ? docs : [docs];
  if (!list.length) return;
  const svc = await import("../services/taskGraphService.js");
  await svc.recomputePriorityScores({ _id: { $in: list.map((d) => d._id) } });
  await svc.recomputeForTeams(list.map((d) => d.teamId));
});

// ── Compound indexes for frequent query patterns across methodologies ─────────
TaskSchema.index({ teamId: 1, status: 1 });
TaskSchema.index({ projectId: 1, status: 1 });
TaskSchema.index({ teamId: 1, priorityScore: -1, createdAt: 1 });
TaskSchema.index({ projectId: 1, priorityScore: -1, createdAt: 1 });
TaskSchema.index({ sprintId: 1, status: 1 });

// Phase 2: recoverable archive — archived documents are hidden from ordinary queries.
TaskSchema.plugin(archivePlugin);

export default mongoose.model("Task", TaskSchema);
