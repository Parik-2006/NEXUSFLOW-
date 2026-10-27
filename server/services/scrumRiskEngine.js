/**
 * server/services/scrumRiskEngine.js
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM RISK INTELLIGENCE ENGINE ($0 cost)
 *
 * Deterministic risk detection tailored to Scrum lifecycle, sprint commitments,
 * team capacity, task dependencies, member skills, and scope contradictions.
 *
 * Persists to MongoDB via models/Risk.js with methodology: "SCRUM".
 * Provides stable fingerprint deduplication, lifecycle preservation (open,
 * acknowledged, resolved), audit trails, and real-time socket broadcasts.
 * ============================================================================
 */

import mongoose from "mongoose";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import Risk from "../models/Risk.js";
import Sprint from "../models/Sprint.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import SkillVerification from "../models/SkillVerification.js";
import { resolveProjectAndTeam } from "./teamHealth.js";
import { logger } from "../utils/logger.js";

const DEADLINE_DAYS = 5;
const OVERLOAD_RATIO = 1.2;
const STALE_DAYS = 14;
const SPRINT_CAPACITY_BUFFER = 1.15;

function fp(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "scrum_" + (h >>> 0).toString(36);
}

export function isTaskDone(t) {
  if (!t) return false;
  const s = String(t.status || "").toLowerCase().trim();
  if (s === "done" || s === "completed" || s === "closed") return true;
  const ss = String(t.scrumStatus || "").toUpperCase().trim();
  if (ss === "DONE") return true;
  if (t.completedAt && s !== "todo" && s !== "in_progress") return true;
  return false;
}

export function isTaskCancelled(t) {
  if (!t) return false;
  const s = String(t.status || "").toLowerCase().trim();
  if (s === "cancelled" || s === "canceled" || s === "archived") return true;
  const ss = String(t.scrumStatus || "").toUpperCase().trim();
  if (ss === "CANCELLED" || ss === "CANCELED") return true;
  return false;
}

/**
 * scanScrumRisks(id, user)
 * Runs deterministic Scrum risk assessment and persists results to MongoDB.
 */
export async function scanScrumRisks(id, io = null) {
  const { project, team, projectId, teamId } = await resolveProjectAndTeam(id);
  const now = Date.now();

  // Fresh Scrum tasks query (strictly methodology-isolated)
  const allTasks = await Task.find({
    $or: [
      { projectId },
      { teamId, methodology: { $in: ["SCRUM", "scrum", null] } },
    ],
    // Exclude Waterfall phase-locked tasks if any exist
    $and: [
      {
        $or: [
          { phase: null },
          { phase: { $exists: false } },
          { scrumStatus: { $ne: null } },
          { sprintId: { $ne: null } },
        ],
      },
    ],
  }).lean();

  const sprints = await Sprint.find({ projectId }).lean();
  const activeSprint = sprints.find((s) => s.status === "ACTIVE") || null;
  const planningSprints = sprints.filter((s) => s.status === "PLANNING");

  const isDone = (t) => isTaskDone(t);
  const isInactive = (t) => isTaskDone(t) || isTaskCancelled(t);
  const hours = (t) => Number(t.estimatedHours) || (Number(t.storyPoints) ? Number(t.storyPoints) * 3 : 4);

  const activeTasks = allTasks.filter((t) => !isInactive(t));
  const activeTaskIds = new Set(activeTasks.map((t) => String(t._id)));
  const sprintTasks = activeSprint
    ? activeTasks.filter((t) => t.sprintId?.toString() === activeSprint._id.toString())
    : [];

  const detected = [];

  // ── 1. Overdue tasks ─────────────────────────────────────────────────────────
  const overdue = activeTasks.filter((t) => {
    const due = t.dueDate || t.deadline;
    if (!due) return false;
    return new Date(due).getTime() < now;
  });
  for (const t of overdue) {
    const due = t.dueDate || t.deadline;
    const daysLate = Math.ceil((now - new Date(due).getTime()) / 86_400_000);
    const sev = daysLate > 7 ? "critical" : daysLate > 2 ? "high" : "medium";
    detected.push({
      title: `Overdue: "${t.title}"`,
      explanation: `"${t.title}" is ${daysLate} day(s) past its due date and remains incomplete.`,
      evidence: `${daysLate} day(s) past due. Due date: ${new Date(due).toLocaleDateString()}`,
      affectedArea: t.title,
      category: "overdue_tasks",
      severity: sev,
      recommendation: `Triage "${t.title}" in the next Daily Scrum: either complete, re-estimate, or adjust sprint scope.`,
      relatedTaskIds: [t._id],
      sprintId: t.sprintId || null,
      fingerprint: fp(`overdue:${t._id}`),
    });
  }

  // ── 2. Approaching deadlines ──────────────────────────────────────────────────
  const approaching = activeTasks.filter((t) => {
    const due = t.dueDate || t.deadline;
    if (!due) return false;
    const daysLeft = (new Date(due).getTime() - now) / 86_400_000;
    return daysLeft >= 0 && daysLeft <= DEADLINE_DAYS;
  });
  if (approaching.length > 0) {
    const sample = approaching.slice(0, 3).map((t) => `"${t.title}"`).join(", ");
    detected.push({
      title: `${approaching.length} task(s) due within ${DEADLINE_DAYS} days`,
      explanation: `These tasks have impending target dates and are not yet completed.`,
      evidence: `Tasks approaching deadline: ${sample}${approaching.length > 3 ? "..." : ""}`,
      affectedArea: "Sprint timeline",
      category: "approaching_deadline",
      severity: approaching.length >= 3 ? "high" : "medium",
      recommendation: "Review remaining effort in daily standup and ensure developers are unblocked.",
      relatedTaskIds: approaching.map((t) => t._id),
      sprintId: activeSprint?._id || null,
      fingerprint: fp("approaching_deadline"),
    });
  }

  // ── 3. Blocked tasks ─────────────────────────────────────────────────────────
  const blocked = activeTasks.filter((t) => {
    const incompleteDeps = (t.dependencies || []).filter((d) => {
      const depId = (typeof d === "object" ? d._id : d)?.toString();
      const u = allTasks.find((x) => String(x._id) === depId);
      return u && !isInactive(u);
    });
    const isExplicitlyBlocked =
      t.isBlocked === true ||
      String(t.scrumStatus || "").toUpperCase() === "BLOCKED" ||
      String(t.status || "").toLowerCase() === "blocked";
    return incompleteDeps.length > 0 || isExplicitlyBlocked;
  });

  for (const t of blocked) {
    const incompleteDeps = (t.dependencies || []).filter((d) => {
      const depId = (typeof d === "object" ? d._id : d)?.toString();
      const u = allTasks.find((x) => String(x._id) === depId);
      return u && !isInactive(u);
    });
    detected.push({
      title: `Blocked: "${t.title}"`,
      explanation: `"${t.title}" cannot proceed because of unresolved dependencies or an explicit blocker.`,
      evidence: incompleteDeps.length > 0
        ? `Waiting on ${incompleteDeps.length} incomplete prerequisite(s): ${incompleteDeps.slice(0, 2).map((d) => String(d._id || d).slice(-4)).join(", ")}`
        : "Item explicitly marked BLOCKED by the development team.",
      affectedArea: t.title,
      category: "blocked_tasks",
      severity: (t.sprintId && activeSprint && String(t.sprintId) === String(activeSprint._id)) ? "high" : "medium",
      recommendation: `Swarm or re-sequence: clear the upstream prerequisite before continuing work on "${t.title}".`,
      relatedTaskIds: [t._id],
      sprintId: t.sprintId || null,
      fingerprint: fp(`blocked:${t._id}`),
    });
  }

  // ── 4. Dependency cascade ────────────────────────────────────────────────────
  const downstreamActiveCount = (id) =>
    activeTasks.filter((t) => (t.dependencies || []).some((d) => String(d?._id || d) === String(id))).length;

  const cascade = activeTasks.filter((t) => {
    const due = t.dueDate || t.deadline;
    const late = due && new Date(due).getTime() < now;
    const hasBlockedDeps = (t.dependencies || []).some((d) => {
      const u = allTasks.find((x) => String(x._id) === String(d?._id || d));
      return u && !isInactive(u);
    });
    return (late || hasBlockedDeps) && downstreamActiveCount(t._id) >= 1 && activeTaskIds.has(String(t._id));
  });

  for (const t of cascade.slice(0, 5)) {
    const downstream = downstreamActiveCount(t._id);
    detected.push({
      title: `Dependency Cascade Risk: "${t.title}" affects ${downstream} downstream item(s)`,
      explanation: `Delay in completing "${t.title}" will directly cascade and delay ${downstream} dependent Scrum tasks.`,
      evidence: `${downstream} downstream item(s) waiting for this prerequisite to finish.`,
      affectedArea: t.title,
      category: "dependency_cascade",
      severity: downstream >= 3 ? "high" : "medium",
      recommendation: `Prioritize "${t.title}" to prevent blocking downstream sprint commitments.`,
      relatedTaskIds: [t._id],
      sprintId: t.sprintId || null,
      fingerprint: fp(`cascade:${t._id}`),
    });
  }

  // ── 5. Cross-Sprint dependencies ─────────────────────────────────────────────
  if (activeSprint) {
    const crossSprintDeps = [];
    for (const st of sprintTasks) {
      for (const d of st.dependencies || []) {
        const depId = String(d?._id || d);
        const prereq = allTasks.find((x) => String(x._id) === depId);
        if (prereq && !isInactive(prereq) && String(prereq.sprintId || "") !== String(activeSprint._id)) {
          crossSprintDeps.push({ task: st, prereq });
        }
      }
    }
    if (crossSprintDeps.length > 0) {
      detected.push({
        title: `${crossSprintDeps.length} Cross-Sprint Dependency Link(s) Active`,
        explanation: `Items in the active sprint depend on prerequisites that belong to other sprints or the unassigned backlog.`,
        evidence: crossSprintDeps.slice(0, 3).map((c) => `"${c.task.title}" depends on "${c.prereq.title}"`).join("; "),
        affectedArea: "Sprint Boundary",
        category: "cross_sprint_dependency",
        severity: "high",
        recommendation: "Pull prerequisite tasks into the current sprint or re-sequence sprint goals.",
        relatedTaskIds: crossSprintDeps.map((c) => c.task._id),
        sprintId: activeSprint._id,
        fingerprint: fp("cross_sprint_dependency"),
      });
    }
  }

  // ── 6. Unassigned Sprint Work & High-Priority Backlog ────────────────────────
  // When an active sprint exists, unassigned committed tasks are a delivery risk.
  // When in planning, unassigned high-priority work is flagged.
  const unassignedSprintItems = activeSprint
    ? sprintTasks.filter((t) => (!t.assignedTo || String(t.assignedTo).trim() === "") && !t.assignedName)
    : [];

  if (unassignedSprintItems.length > 0) {
    detected.push({
      title: `${unassignedSprintItems.length} Committed Sprint Task(s) Unassigned`,
      explanation: `Active sprint contains work committed to the sprint goal with no assigned owner.`,
      evidence: `Unassigned items: ${unassignedSprintItems.slice(0, 3).map((t) => `"${t.title}"`).join(", ")}`,
      affectedArea: "Sprint Ownership",
      category: "unassigned_sprint_work",
      severity: unassignedSprintItems.length >= 3 ? "high" : "medium",
      recommendation: "Assign developers to sprint tasks during Sprint Planning or Daily Scrum.",
      relatedTaskIds: unassignedSprintItems.map((t) => t._id),
      sprintId: activeSprint._id,
      fingerprint: fp("unassigned_sprint_work"),
    });
  } else if (!activeSprint) {
    const isHighPri = (t) => {
      const lbl = String(t.priorityLabel || "").toLowerCase();
      if (lbl === "critical" || lbl === "high") return true;
      return (t.priorityScore || 0) >= 70;
    };
    const unassignedHigh = activeTasks.filter(
      (t) => (!t.assignedTo || String(t.assignedTo).trim() === "") && !t.assignedName && isHighPri(t)
    );
    if (unassignedHigh.length > 0) {
      detected.push({
        title: `${unassignedHigh.length} High-Priority Story/Stories Unassigned`,
        explanation: `Important product backlog items ready for upcoming sprints currently have no designated lead.`,
        evidence: `Items: ${unassignedHigh.slice(0, 3).map((t) => `"${t.title}"`).join(", ")}`,
        affectedArea: "Backlog Planning",
        category: "unassigned_high_priority",
        severity: "medium",
        recommendation: "Assign backlog stories to team members before finalizing the next sprint plan.",
        relatedTaskIds: unassignedHigh.map((t) => t._id),
        sprintId: null,
        fingerprint: fp("unassigned_high_priority"),
      });
    }
  }

  // ── 7. Member Overload & Workload Imbalance ──────────────────────────────────
  const memberLoad = {};
  for (const m of team?.members || []) {
    const uid = (m.userId?._id || m.userId)?.toString();
    if (uid) {
      memberLoad[uid] = {
        name: m.name || "Member",
        assignedHours: 0,
        capacity: Number(m.capacity) || 40,
        taskCount: 0,
      };
    }
  }

  // Use active sprint tasks if active sprint exists, otherwise all active tasks
  const tasksForLoad = sprintTasks.length > 0 ? sprintTasks : activeTasks;
  for (const t of tasksForLoad) {
    const uid = (t.assignedTo?._id || t.assignedTo)?.toString();
    if (uid && memberLoad[uid]) {
      memberLoad[uid].assignedHours += hours(t);
      memberLoad[uid].taskCount += 1;
    }
  }

  for (const [uid, m] of Object.entries(memberLoad)) {
    if (m.assignedHours > m.capacity * OVERLOAD_RATIO) {
      detected.push({
        title: `${m.name} is Overloaded (${m.assignedHours}h vs ${m.capacity}h)`,
        explanation: `${m.name} is assigned ${m.assignedHours}h of work against a ${m.capacity}h weekly capacity limit.`,
        evidence: `Assigned: ${m.assignedHours}h (${m.taskCount} tasks). Stated capacity: ${m.capacity}h.`,
        affectedArea: m.name,
        category: "member_overload",
        severity: m.assignedHours > m.capacity * 1.5 ? "critical" : "high",
        recommendation: `Rebalance sprint tasks across other team members to avoid burnout and delivery delays.`,
        relatedTaskIds: tasksForLoad.filter((t) => String(t.assignedTo?._id || t.assignedTo) === uid).map((t) => t._id),
        sprintId: activeSprint?._id || null,
        fingerprint: fp(`overload:${uid}`),
      });
    }
  }

  if (Object.keys(memberLoad).length > 1) {
    const ratios = Object.values(memberLoad).map((m) => m.assignedHours / (m.capacity || 40));
    const max = Math.max(...ratios);
    const min = Math.min(...ratios);
    if (max - min > 0.6 && max > 0.5) {
      const heavy = Object.entries(memberLoad).sort((a, b) => b[1].assignedHours - a[1].assignedHours)[0];
      detected.push({
        title: `Workload Imbalance: ${heavy[1].name} carries majority load`,
        explanation: `Work is concentrated on one team member, creating single-point-of-failure vulnerability.`,
        evidence: `${heavy[1].name}: ${heavy[1].assignedHours}h assigned vs team average ${Math.round(Object.values(memberLoad).reduce((s, x) => s + x.assignedHours, 0) / Object.keys(memberLoad).length)}h.`,
        affectedArea: "Team Balance",
        category: "workload_imbalance",
        severity: max - min > 1.2 ? "high" : "medium",
        recommendation: "Distribute story cards to pair developers or share ownership of complex tasks.",
        fingerprint: fp("workload_imbalance"),
      });
    }
  }

  // ── 8. Sprint Capacity Overload ──────────────────────────────────────────────
  const totalActiveHours = tasksForLoad.reduce((s, t) => s + hours(t), 0);
  const totalCapacity = (team?.members || []).reduce((s, m) => s + (Number(m.capacity) || 40), 0) || 40;

  if (totalCapacity > 0 && totalActiveHours > totalCapacity * SPRINT_CAPACITY_BUFFER) {
    const overage = Math.round(totalActiveHours - totalCapacity);
    detected.push({
      title: `Sprint Workload Over Capacity (${totalActiveHours}h / ${totalCapacity}h)`,
      explanation: `The proposed workload commits ${totalActiveHours}h against a total team capacity of ${totalCapacity}h.`,
      evidence: `Active workload: ${totalActiveHours}h. Total capacity: ${totalCapacity}h (${overage}h overage).`,
      affectedArea: "Sprint Capacity",
      category: "sprint_capacity",
      severity: totalActiveHours > totalCapacity * 1.5 ? "critical" : "high",
      recommendation: "Trim sprint scope by deferring lower-priority backlog stories to future sprints.",
      sprintId: activeSprint?._id || null,
      fingerprint: fp("sprint_capacity"),
    });
  }

  // ── 9. Skill Gaps for Planned Work ───────────────────────────────────────────
  const requiredSkills = new Set(tasksForLoad.flatMap((t) => t.requiredSkills || []));
  const memberUserIds = (team?.members || []).map((m) => m.userId?._id || m.userId).filter(Boolean);

  const [memberUsers, verifications] = await Promise.all([
    User.find({ _id: { $in: memberUserIds } }).select("skills").lean(),
    SkillVerification.find({ userId: { $in: memberUserIds }, verified: true }).lean().catch(() => []),
  ]);

  const teamSkills = new Set([
    ...memberUsers.flatMap((u) => (u.skills || []).map((s) => String(s).toLowerCase().trim())),
    ...verifications.flatMap((v) => [
      String(v.skill || "").toLowerCase().trim(),
      String(v.skillName || "").toLowerCase().trim(),
    ]).filter(Boolean),
  ]);

  const missing = [...requiredSkills].filter((s) => !teamSkills.has(String(s).toLowerCase().trim()));
  if (missing.length > 0) {
    detected.push({
      title: `Skill Gap: Missing Coverage for ${missing.slice(0, 2).join(", ")}`,
      explanation: `One or more committed tasks require technical skills not possessed or verified by current team members.`,
      evidence: `Uncovered skill requirements: ${missing.slice(0, 4).join(", ")}`,
      affectedArea: "Team Skills",
      category: "skill_gap",
      severity: missing.length >= 3 ? "critical" : "high",
      recommendation: `Pair team members with specialists or arrange cross-training for ${missing.slice(0, 3).join(", ")}.`,
      fingerprint: fp(`skillgap:${missing.slice().sort().join("|")}`),
    });
  }

  // ── 10. Scope Conflicts / Contradictions ─────────────────────────────────────
  const conflicts = project.scrumPlanLifecycle?.conflicts || [];
  const unresolvedConflicts = conflicts.filter((c) => c.status !== "resolved");
  if (unresolvedConflicts.length > 0) {
    detected.push({
      title: `${unresolvedConflicts.length} Unresolved Scope Contradiction(s)`,
      explanation: `Material conflicts were detected between project source documents or requirements that have not been reconciled.`,
      evidence: `Conflicts: ${unresolvedConflicts.slice(0, 2).map((c) => `"${c.title}"`).join("; ")}`,
      affectedArea: "Requirements Scope",
      category: "scope_conflict",
      severity: "high",
      recommendation: "Reconcile contradictory statements in Project Setup & Plan before committing to sprint delivery.",
      fingerprint: fp("scope_conflict"),
    });
  }

  // ── 11. Stalled Progress ─────────────────────────────────────────────────────
  const stalled = activeTasks.filter((t) => {
    if (!t.updatedAt) return false;
    return (now - new Date(t.updatedAt).getTime()) / 86_400_000 > STALE_DAYS;
  });
  if (stalled.length > 0) {
    detected.push({
      title: `${stalled.length} task(s) inactive for >${STALE_DAYS} days`,
      explanation: `Tasks with no updates or activity for over 2 weeks may indicate abandoned scope or hidden blockers.`,
      evidence: `Stalled items: ${stalled.slice(0, 3).map((t) => `"${t.title}"`).join(", ")}`,
      affectedArea: "Task Progress",
      category: "stalled_progress",
      severity: "low",
      recommendation: "Triage inactive tasks in backlog refinement: update, reassign, or archive.",
      relatedTaskIds: stalled.map((t) => t._id),
      fingerprint: fp("stalled_progress"),
    });
  }

  // ── Persist to MongoDB with Stable Fingerprints & Lifecycle Preservation ─────
  const existingRisks = await Risk.find({ projectId, methodology: "SCRUM" }).lean();
  const existingByFp = new Map(existingRisks.map((r) => [r.fingerprint, r]));
  const detectedFps = new Set(detected.map((d) => d.fingerprint));

  const nowDate = new Date();
  for (const d of detected) {
    const prev = existingByFp.get(d.fingerprint);
    if (prev) {
      // If user previously acknowledged, preserve acknowledged status.
      // If user previously resolved, but condition reappeared, re-open and increment reopenCount!
      const isReopening = prev.status === "resolved";
      const statusToSet = prev.status === "acknowledged" ? "acknowledged" : "open";

      const updateFields = {
        title: d.title,
        explanation: d.explanation,
        evidence: d.evidence,
        affectedArea: d.affectedArea,
        category: d.category,
        severity: d.severity,
        recommendation: d.recommendation,
        relatedTaskIds: d.relatedTaskIds || [],
        sprintId: d.sprintId || null,
        status: statusToSet,
        lastDetectedAt: nowDate,
        updatedAt: nowDate,
      };

      const updateOp = { $set: updateFields };
      if (isReopening) {
        updateOp.$inc = { reopenCount: 1 };
      }

      await Risk.updateOne({ _id: prev._id }, updateOp);
    } else {
      await Risk.create({
        projectId,
        teamId,
        methodology: "SCRUM",
        title: d.title,
        explanation: d.explanation,
        evidence: d.evidence,
        affectedArea: d.affectedArea,
        category: d.category,
        severity: d.severity,
        recommendation: d.recommendation,
        relatedTaskIds: d.relatedTaskIds || [],
        sprintId: d.sprintId || null,
        fingerprint: d.fingerprint,
        status: "open",
        firstDetectedAt: nowDate,
        lastDetectedAt: nowDate,
      });
    }
  }

  // Auto-resolve previously open Scrum risks whose condition has cleared
  for (const prev of existingRisks) {
    if (!detectedFps.has(prev.fingerprint) && prev.status === "open") {
      await Risk.updateOne(
        { _id: prev._id },
        {
          $set: {
            status: "resolved",
            resolvedAt: nowDate,
            resolutionReason: "Condition automatically cleared by live Scrum task/sprint state change (auto_cleared)",
            updatedAt: nowDate,
          },
        }
      );
    }
  }

  // Fetch updated records for live counts
  const finalRisks = await Risk.find({ projectId, methodology: "SCRUM" })
    .sort({ severity: 1, createdAt: -1 })
    .lean();

  const counts = {
    open: finalRisks.filter((r) => r.status === "open").length,
    acknowledged: finalRisks.filter((r) => r.status === "acknowledged").length,
    resolved: finalRisks.filter((r) => r.status === "resolved").length,
    all: finalRisks.length,
    total: finalRisks.length,
  };

  if (io && typeof io.to === "function") {
    io.to(`project:${projectId}`).emit("project:risk:updated", { methodology: "SCRUM", count: counts.open });
    io.to(`team:${teamId}`).emit("project:risk:updated", { methodology: "SCRUM", count: counts.open });
  }

  logger.info("[scrumRiskEngine] Risk scan complete", {
    projectId: projectId.toString(),
    detected: detected.length,
    open: counts.open,
    total: counts.all,
  });

  return { success: true, count: finalRisks.length, risks: finalRisks, counts };
}

export async function getScrumRisks(id, statusFilter = "all") {
  const { projectId } = await resolveProjectAndTeam(id);
  const q = { projectId, methodology: "SCRUM" };
  if (statusFilter && statusFilter !== "all") {
    q.status = statusFilter;
  }
  const risks = await Risk.find(q).sort({ severity: 1, createdAt: -1 }).lean();
  const allRisks = await Risk.find({ projectId, methodology: "SCRUM" }).lean();
  const counts = {
    open: allRisks.filter((r) => r.status === "open").length,
    acknowledged: allRisks.filter((r) => r.status === "acknowledged").length,
    resolved: allRisks.filter((r) => r.status === "resolved").length,
    all: allRisks.length,
    total: allRisks.length,
  };
  return { success: true, count: risks.length, risks, counts };
}

export async function updateScrumRiskStatus(id, riskId, newStatus, options = {}) {
  const { projectId } = await resolveProjectAndTeam(id);
  const risk = await Risk.findOne({ _id: riskId, projectId, methodology: "SCRUM" });
  if (!risk) throw new Error("Scrum risk not found");

  const update = {
    status: newStatus,
    updatedAt: new Date(),
  };

  if (newStatus === "acknowledged") {
    update.acknowledgedAt = new Date();
    if (options.userId) update.acknowledgedBy = options.userId;
    if (options.notes) update.notes = options.notes;
  } else if (newStatus === "resolved") {
    update.resolvedAt = new Date();
    if (options.userId) update.resolvedBy = options.userId;
    if (options.notes) update.resolutionReason = options.notes;
  }

  const updated = await Risk.findByIdAndUpdate(riskId, { $set: update }, { new: true });
  return updated;
}

export default {
  scanScrumRisks,
  getScrumRisks,
  updateScrumRiskStatus,
  isTaskDone,
  isTaskCancelled,
};
