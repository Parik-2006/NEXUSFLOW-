/**
 * server/services/requirementReferenceService.js
 * NEXUSFLOW Phase 2 (Task 4) — project-scoped requirement references.
 *
 * Requirements live embedded in Project.requirements. They reference:
 *   - other requirements of the SAME project   (dependencies: reqId / _id strings)
 *   - tasks of the SAME workspace and project  (taskIds: ObjectId strings)
 * Every write path validates ALL references before any mutation; partial
 * unauthorized updates are rejected as a whole.
 */
import mongoose from "mongoose";
import Task from "../models/Task.js";
import Project from "../models/Project.js";

const MAX_DEPENDENCIES = 50;
const MAX_TASK_REFS = 200;

export class RequirementReferenceError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
    this.code = "INVALID_REQUIREMENT_REFERENCE";
  }
}

/** All identifiers by which a requirement of this project may be referenced. */
export function requirementRefSet(project) {
  const set = new Set();
  for (const r of project?.requirements || []) {
    if (r?.reqId) set.add(String(r.reqId));
    if (r?._id) set.add(String(r._id));
  }
  return set;
}

/** Identifier set of one requirement (to forbid self-references). */
function selfIds(requirement) {
  return new Set([requirement?.reqId, requirement?._id].filter(Boolean).map(String));
}

export function validateDependencyRefs(project, dependencies, { self = null, extraIds = [] } = {}) {
  if (dependencies === undefined) return undefined;
  if (!Array.isArray(dependencies) || dependencies.length > MAX_DEPENDENCIES) {
    throw new RequirementReferenceError(`dependencies must be an array of at most ${MAX_DEPENDENCIES} requirement ids.`);
  }
  const known = requirementRefSet(project);
  for (const id of extraIds) known.add(String(id));
  const mine = selfIds(self);
  const out = [];
  for (const raw of dependencies) {
    if (typeof raw !== "string" || !raw.trim()) throw new RequirementReferenceError("Dependency ids must be non-empty strings.");
    const id = raw.trim();
    if (mine.has(id)) throw new RequirementReferenceError("A requirement cannot depend on itself.");
    if (!known.has(id)) throw new RequirementReferenceError(`Dependency "${id.slice(0, 40)}" is not a requirement of this project.`);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** taskIds must be tasks of this project's workspace, unbound or bound to this project. */
export async function validateTaskRefs(project, taskIds) {
  if (taskIds === undefined) return undefined;
  if (!Array.isArray(taskIds) || taskIds.length > MAX_TASK_REFS) {
    throw new RequirementReferenceError(`taskIds must be an array of at most ${MAX_TASK_REFS} task ids.`);
  }
  const ids = [...new Set(taskIds.map((t) => String(t)))];
  if (ids.some((id) => !mongoose.isValidObjectId(id))) throw new RequirementReferenceError("taskIds contains a malformed id.");
  if (!ids.length) return [];
  const found = await Task.countDocuments({
    _id: { $in: ids },
    teamId: project.teamId,
    $or: [{ projectId: project._id }, { projectId: null }],
  });
  if (found !== ids.length) throw new RequirementReferenceError("taskIds must reference existing tasks of this project.");
  return ids;
}

/** For AI / document extraction: keep only dependencies that name requirements in the same batch. */
export function sanitizeExtractedDependencies(requirements) {
  const ids = new Set((requirements || []).flatMap((r) => [r?.reqId, r?._id].filter(Boolean).map(String)));
  return (requirements || []).map((r) => ({
    ...r,
    dependencies: [...new Set((Array.isArray(r?.dependencies) ? r.dependencies : []).map(String).filter((d) => ids.has(d) && d !== String(r.reqId)))],
  }));
}

/** After deleting a requirement, drop references to it from the others. */
export function stripDependencyRefs(requirements, removed) {
  const gone = selfIds(removed);
  for (const r of requirements || []) {
    if (Array.isArray(r.dependencies)) r.dependencies = r.dependencies.filter((d) => !gone.has(String(d)));
  }
  return requirements;
}

/**
 * READ-ONLY integrity audit. Reports counts and requirement/project ids only —
 * never titles or content of other workspaces' tasks.
 */
export async function auditRequirementReferences({ projectFilter = {} } = {}) {
  const projects = await Project.find(projectFilter).setOptions({ includeArchived: true }).select("_id teamId requirements").lean();
  const report = { projectsScanned: projects.length, projectsWithIssues: 0, totals: { invalidIds: 0, orphanedTasks: 0, crossProject: 0, crossWorkspace: 0, duplicateRefs: 0, unknownDependencies: 0, selfDependencies: 0 }, projects: [] };
  for (const p of projects) {
    const issues = { projectId: String(p._id), invalidIds: 0, orphanedTasks: 0, crossProject: 0, crossWorkspace: 0, duplicateRefs: 0, unknownDependencies: 0, selfDependencies: 0, requirementIds: [] };
    const known = requirementRefSet(p);
    for (const r of p.requirements || []) {
      const before = { ...issues };
      const refs = (r.taskIds || []).map(String);
      issues.duplicateRefs += refs.length - new Set(refs).size;
      const valid = [...new Set(refs)].filter((id) => mongoose.isValidObjectId(id));
      issues.invalidIds += new Set(refs).size - valid.length;
      if (valid.length) {
        const tasks = await Task.find({ _id: { $in: valid } }).setOptions({ includeArchived: true }).select("_id teamId projectId").lean();
        issues.orphanedTasks += valid.length - tasks.length;
        for (const t of tasks) {
          if (String(t.teamId) !== String(p.teamId)) issues.crossWorkspace++;
          else if (t.projectId && String(t.projectId) !== String(p._id)) issues.crossProject++;
        }
      }
      for (const d of r.dependencies || []) {
        if (selfIds(r).has(String(d))) issues.selfDependencies++;
        else if (!known.has(String(d))) issues.unknownDependencies++;
      }
      if (Object.keys(before).some((k) => typeof before[k] === "number" && before[k] !== issues[k])) issues.requirementIds.push(String(r.reqId || r._id));
    }
    const count = ["invalidIds", "orphanedTasks", "crossProject", "crossWorkspace", "duplicateRefs", "unknownDependencies", "selfDependencies"].reduce((n, k) => n + issues[k], 0);
    if (count) {
      report.projectsWithIssues++;
      for (const k of Object.keys(report.totals)) report.totals[k] += issues[k];
      report.projects.push(issues);
    }
  }
  return report;
}
