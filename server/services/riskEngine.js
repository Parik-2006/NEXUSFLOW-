/**
 * server/services/riskEngine.js
 * NEXUSFLOW 3.0 — Phase 13: Deterministic Risk Intelligence Engine ($0 cost)
 * Detects 7 real-evidence risk categories from live project data.
 */

import Team from "../models/Team.js";
import Task from "../models/Task.js";
import Risk from "../models/Risk.js";
import Retrospective from "../models/Retrospective.js";
import User from "../models/User.js";
import { logger } from "../utils/logger.js";

const DEADLINE_DAYS = 5;
const OVERLOAD_RATIO = 1.2; // 120% of capacity

/**
 * scanProjectRisks(projectId)
 * Runs a fresh deterministic risk scan and returns newly created Risk documents.
 */
export async function scanProjectRisks(projectId) {
  const Project = (await import("../models/Project.js")).default;
  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  const team     = await Team.findById(project.teamId).lean();
  const allTasks = await Task.find({ projectId, status: { $ne: "done" } }).lean();
  const now      = Date.now();
  const detected = [];

  // ── 1. Deadline Proximity ──────────────────────────────────────────────────
  const nearDeadline = allTasks.filter((t) => {
    if (!t.dueDate) return false;
    const daysLeft = (new Date(t.dueDate) - now) / 86_400_000;
    return daysLeft >= 0 && daysLeft <= DEADLINE_DAYS;
  });
  if (nearDeadline.length > 0) {
    detected.push({
      title: `${nearDeadline.length} task(s) due within ${DEADLINE_DAYS} days`,
      explanation: "Tasks approaching their deadline without completion.",
      evidence: `Tasks: ${nearDeadline.map((t) => `"${t.title}"`).join(", ")}`,
      category: "deadline",
      severity: nearDeadline.length >= 3 ? "high" : "medium",
      recommendation: "Prioritize these tasks immediately or negotiate deadline extensions.",
    });
  }

  // ── 2. Member Overload ─────────────────────────────────────────────────────
  const memberLoad = {};
  for (const m of team.members || []) {
    memberLoad[m.userId?.toString()] = { name: m.name, assigned: 0, capacity: m.capacity || 40 };
  }
  for (const t of allTasks) {
    const uid = t.assignedTo?.toString();
    if (uid && memberLoad[uid]) {
      memberLoad[uid].assigned += (t.estimatedHours || 4);
    }
  }
  for (const [, m] of Object.entries(memberLoad)) {
    if (m.assigned > m.capacity * OVERLOAD_RATIO) {
      const assignedTasks = allTasks.filter((t) => {
        const uid = t.assignedTo?.toString();
        return uid && m.name && memberLoad[uid]?.name === m.name;
      });
      detected.push({
        title: `${m.name} is overloaded (${m.assigned}h vs ${m.capacity}h capacity)`,
        explanation: `Member assigned ${m.assigned}h of work against a ${m.capacity}h capacity.`,
        evidence: `Assigned tasks: ${assignedTasks.slice(0, 3).map((t) => `"${t.title}"`).join(", ")}`,
        category: "overload",
        severity: m.assigned > m.capacity * 1.5 ? "critical" : "high",
        recommendation: "Redistribute tasks or reduce sprint scope for this member.",
      });
    }
  }

  // ── 3. Blocked Tasks (tasks with dependencies and not completed) ──────────
  const blockedTasks = allTasks.filter((t) => t.dependencyCount > 0 || (t.dependencies && t.dependencies.length > 0));
  if (blockedTasks.length > 0) {
    detected.push({
      title: `${blockedTasks.length} task(s) blocked by dependencies`,
      explanation: "Tasks marked as blocked that are preventing progress.",
      evidence: `Blocked tasks: ${blockedTasks.map((t) => `"${t.title}"`).join(", ")}`,
      category: "blocked_tasks",
      severity: blockedTasks.length >= 3 ? "high" : "medium",
      recommendation: "Resolve blockers or re-sequence sprint tasks to unblock critical paths.",
    });
  }

  // ── 4. Missing Skill Coverage ─────────────────────────────────────────────
  const requiredSkills = new Set(allTasks.flatMap((t) => t.requiredSkills || []));
  const memberUserIds  = (team.members || []).map((m) => m.userId).filter(Boolean);
  const memberUsers    = await User.find({ _id: { $in: memberUserIds } }).select("skills").lean();
  const teamSkills     = new Set(memberUsers.flatMap((u) => u.skills || []));
  const missing        = [...requiredSkills].filter((s) => !teamSkills.has(s));
  if (missing.length > 0) {
    detected.push({
      title: `Critical skill gap: ${missing.slice(0, 2).join(", ")}`,
      explanation: "Required task skills not covered by any team member.",
      evidence: `Required skills with no adequate coverage: ${missing.join(", ")}`,
      category: "missing_skills",
      severity: missing.length >= 3 ? "critical" : "high",
      recommendation: "Upskill team members or bring in a specialist for: " + missing.join(", "),
    });
  }

  // ── 5. Single Point of Failure ────────────────────────────────────────────
  const taskCountByMember = {};
  for (const t of allTasks) {
    const uid = t.assignedTo?.toString();
    if (uid) taskCountByMember[uid] = (taskCountByMember[uid] || 0) + 1;
  }
  const totalActive = allTasks.length || 1;
  for (const [uid, count] of Object.entries(taskCountByMember)) {
    if (count / totalActive > 0.6 && totalActive > 3) {
      const member = team.members.find((m) => m.userId?.toString() === uid);
      if (member) {
        detected.push({
          title: `${member.name} holds ${count}/${totalActive} active tasks (SPOF risk)`,
          explanation: "Over-reliance on a single team member creates a delivery bottleneck.",
          evidence: `${member.name} owns ${Math.round((count / totalActive) * 100)}% of active tasks.`,
          category: "single_point_of_failure",
          severity: "high",
          recommendation: "Redistribute tasks to reduce single-member dependency.",
        });
      }
    }
  }

  // ── 6. Stale Tasks ────────────────────────────────────────────────────────
  const STALE_DAYS = 14;
  const staleTasks = allTasks.filter((t) => {
    if (!t.updatedAt) return false;
    return (now - new Date(t.updatedAt)) / 86_400_000 > STALE_DAYS;
  });
  if (staleTasks.length > 0) {
    detected.push({
      title: `${staleTasks.length} task(s) not updated in over ${STALE_DAYS} days`,
      explanation: "Tasks that haven't been touched may indicate abandonment or blockers.",
      evidence: `Stale tasks: ${staleTasks.slice(0, 3).map((t) => `"${t.title}"`).join(", ")}`,
      category: "stale_tasks",
      severity: "low",
      recommendation: "Review these tasks with the team to close, reassign, or update.",
    });
  }

  // ── 7. Scope Creep (retro-informed) ───────────────────────────────────────
  const retros = await Retrospective.find({ projectId }).sort({ createdAt: -1 }).limit(2).lean();
  const latestRate = retros[0]?.taskStats?.completionRate ?? null;
  if (latestRate !== null && latestRate < 50 && retros.length >= 2) {
    detected.push({
      title: "Repeated low sprint completion — possible scope creep",
      explanation: "Consistently failing to complete planned sprint work.",
      evidence: `Last 2 sprints averaged ${Math.round(latestRate)}% completion.`,
      category: "scope_creep",
      severity: "medium",
      recommendation: "Use the learning loop insights to recalibrate sprint scope.",
    });
  }

  // ── Persist ────────────────────────────────────────────────────────────────
  if (detected.length === 0) return [];

  const risks = await Risk.insertMany(
    detected.map((r) => ({ ...r, projectId, teamId: team._id, status: "open" }))
  );

  logger.info("[riskEngine] Risk scan complete", {
    projectId: projectId.toString(),
    risksDetected: risks.length,
  });

  return risks;
}
