/**
 * server/services/taskStatsService.js
 * NEXUSFLOW Phase 2 (Tasks 8 & 9) — authoritative task counters and the
 * dashboard summary, computed from persisted records (stored Team.taskCount /
 * doneCount counters are kept for compatibility but never trusted).
 *
 * Eligible task: belongs to an accessible ACTIVE workspace; not archived
 * (archive plugin); not Scrum-CANCELLED; either team-level (projectId null) or
 * bound to an ACTIVE project of that workspace (orphaned/archived-project
 * tasks are excluded). Scrum workspaces use the canonical Scrum backlog
 * eligibility (getScrumTaskQuery). Each task document is counted exactly once
 * (single aggregation over the Task collection).
 *
 * Normalized state (precedence done > blocked > in_progress > open):
 *   done        status "done" | scrumStatus DONE | kanbanStatus DONE | workflowColumn "done"
 *   blocked     scrumStatus BLOCKED | kanbanStatus BLOCKED | an unresolved blocker
 *   in_progress status "in_progress" | scrum/kanban IN_PROGRESS or IN_REVIEW
 *   open        everything else
 * completion% = round(done / total × 100); 0 when total = 0 (UI shows an empty state).
 */
import mongoose from "mongoose";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import Sprint from "../models/Sprint.js";
import User from "../models/User.js";
import { getScrumTaskQuery } from "../routes/scrum.js";

const isScrum = (t) => t.methodology === "SCRUM" || t.methodology === "Scrum";
const oid = (v) => new mongoose.Types.ObjectId(String(v));

const STATE_EXPR = {
  $switch: {
    branches: [
      {
        case: {
          $or: [
            { $eq: ["$status", "done"] },
            { $eq: ["$scrumStatus", "DONE"] },
            { $eq: ["$kanbanStatus", "DONE"] },
            { $eq: ["$workflowColumn", "done"] },
          ],
        },
        then: "done",
      },
      {
        case: {
          $or: [
            { $eq: ["$scrumStatus", "BLOCKED"] },
            { $eq: ["$kanbanStatus", "BLOCKED"] },
            {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: { $ifNull: ["$blockers", []] },
                      as: "b",
                      cond: { $in: ["$$b.status", ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"]] },
                    },
                  },
                },
                0,
              ],
            },
          ],
        },
        then: "blocked",
      },
      {
        case: {
          $or: [
            { $eq: ["$status", "in_progress"] },
            { $in: ["$scrumStatus", ["IN_PROGRESS", "IN_REVIEW"]] },
            { $in: ["$kanbanStatus", ["IN_PROGRESS", "IN_REVIEW"]] },
          ],
        },
        then: "in_progress",
      },
    ],
    default: "open",
  },
};

export function emptyStats() {
  return { total: 0, done: 0, open: 0, inProgress: 0, blocked: 0, unassigned: 0, completionPercentage: 0 };
}

function finalize(s) {
  s.open = Math.max(0, s.total - s.done - s.inProgress - s.blocked);
  s.completionPercentage = s.total ? Math.min(100, Math.round((s.done / s.total) * 100)) : 0;
  return s;
}

/**
 * @param {Array} teams  lean ACTIVE Team docs the caller may access
 * @returns {Promise<Map<string, object>>} teamId → stats
 */
export async function computeTeamTaskStats(teams) {
  const result = new Map(teams.map((t) => [String(t._id), emptyStats()]));
  if (!teams.length) return result;
  const teamIds = teams.map((t) => t._id);
  const projects = await Project.find({ teamId: { $in: teamIds } }).select("_id teamId").lean(); // archived excluded
  const activeByTeam = new Map(teamIds.map((id) => [String(id), []]));
  for (const p of projects) activeByTeam.get(String(p.teamId))?.push(p._id);

  const branches = [];
  for (const t of teams) {
    const tid = oid(t._id);
    const projectScope = { $or: [{ projectId: null }, { projectId: { $in: activeByTeam.get(String(t._id)) } }] };
    if (isScrum(t)) {
      const activeProject = t.activeProjectId && activeByTeam.get(String(t._id)).some((p) => String(p) === String(t.activeProjectId)) ? oid(t.activeProjectId) : null;
      branches.push({ $and: [{ teamId: tid }, projectScope, getScrumTaskQuery(activeProject, tid)] });
    } else {
      branches.push({ $and: [{ teamId: tid }, projectScope, { scrumStatus: { $ne: "CANCELLED" } }] });
    }
  }

  const rows = await Task.aggregate([
    { $match: { $or: branches } },
    { $project: { teamId: 1, state: STATE_EXPR, unassigned: { $cond: [{ $ifNull: ["$assignedTo", false] }, 0, 1] } } },
    { $group: { _id: { team: "$teamId", state: "$state" }, n: { $sum: 1 }, unassigned: { $sum: "$unassigned" } } },
  ]);
  for (const r of rows) {
    const s = result.get(String(r._id.team));
    if (!s) continue;
    s.total += r.n;
    if (r._id.state === "done") s.done += r.n;
    else if (r._id.state === "in_progress") s.inProgress += r.n;
    else if (r._id.state === "blocked") s.blocked += r.n;
    if (r._id.state !== "done") s.unassigned += r.unassigned;
  }
  for (const s of result.values()) finalize(s);
  return result;
}

const READY_WATERFALL = ["PLAN_FINALIZED", "TASKS_GENERATED", "IN_EXECUTION", "COMPLETED"];
const READY_SCRUM = ["PLAN_FINALIZED", "SPRINT_ACTIVE"];

/** Dashboard summary for the caller's accessible ACTIVE workspaces. */
export async function buildDashboardSummary(teams) {
  const teamIds = teams.map((t) => t._id);
  const statsByTeam = await computeTeamTaskStats(teams);
  const totals = emptyStats();
  for (const s of statsByTeam.values()) {
    totals.total += s.total; totals.done += s.done; totals.inProgress += s.inProgress;
    totals.blocked += s.blocked; totals.unassigned += s.unassigned;
  }
  finalize(totals);

  // Unique REGISTERED members (immutable ids that exist in User); placeholders separate.
  const ids = new Set();
  let placeholderCount = 0;
  for (const t of teams) {
    if (t.ownerId) ids.add(String(t.ownerId));
    for (const m of t.members || []) {
      if (m.placeholder) placeholderCount++;
      else if (m.userId) ids.add(String(m.userId));
    }
  }
  const registered = ids.size ? await User.countDocuments({ _id: { $in: [...ids].map(oid) } }) : 0;

  const activeProjects = teamIds.length ? await Project.find({ teamId: { $in: teamIds } }).select("_id methodology waterfallPlanLifecycle.status scrumPlanLifecycle.status").lean() : [];
  const activeProjectIds = activeProjects.map((p) => p._id);
  const activeSprintCount = activeProjectIds.length
    ? await Sprint.countDocuments({ teamId: { $in: teamIds }, projectId: { $in: activeProjectIds }, status: "ACTIVE" })
    : 0;
  let waterfallPlans = 0;
  let scrumPlans = 0;
  for (const p of activeProjects) {
    if (READY_WATERFALL.includes(p.waterfallPlanLifecycle?.status)) waterfallPlans++;
    else if (READY_SCRUM.includes(p.scrumPlanLifecycle?.status)) scrumPlans++;
  }

  return {
    workspaceCount: teams.length,
    totalTasks: totals.total,
    openTasks: totals.total - totals.done,
    completedTasks: totals.done,
    inProgressTasks: totals.inProgress,
    blockedTasks: totals.blocked,
    unassignedTasks: totals.unassigned,
    completionPercentage: totals.completionPercentage,
    uniqueMemberCount: registered,
    placeholderMemberCount: placeholderCount,
    activeSprintCount,
    aiPlansReady: waterfallPlans + scrumPlans,
    plansReadyBreakdown: { waterfall: waterfallPlans, scrum: scrumPlans },
    workspaces: teams.map((t) => ({ teamId: String(t._id), ...statsByTeam.get(String(t._id)) })),
    lastUpdatedAt: new Date().toISOString(),
  };
}
