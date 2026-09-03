/**
 * server/services/riskEngine.js
 * NEXUSFLOW 3.0 — Phase 13: Deterministic Risk Intelligence Engine ($0 cost)
 *
 * FIX 2 (Combined Fixes 1–5):
 *  - Always scans the LIVE project state — never relies solely on previously
 *    persisted Risk documents.
 *  - Detects 12 deterministic risk categories:
 *      overdue_tasks, approaching_deadline, blocked_tasks,
 *      dependency_cascade, unassigned_high_priority, member_overload,
 *      skill_gap, sprint_capacity, stalled_progress,
 *      high_priority_unfinished, workload_imbalance, github_inactivity.
 *  - Each risk carries a stable `fingerprint` so re-scans don't pile up
 *    duplicate open risks (FIX 2F).
 *  - AI is OPTIONAL. Deterministic rules + descriptions work without it.
 *  - Risk categories expand the model's enum set in models/Risk.js.
 */

import Team from "../models/Team.js";
import Task from "../models/Task.js";
import Risk from "../models/Risk.js";
import User from "../models/User.js";
import { logger } from "../utils/logger.js";

const DEADLINE_DAYS = 5;            // approaching deadline window
const OVERLOAD_RATIO = 1.2;         // 120% of capacity → overload
const STALE_DAYS     = 14;          // stalled-progress window
const SPRINT_CAPACITY_BUFFER = 1.15; // 15% over committed → capacity risk

// Stable hash for a string (FNV-1a, sufficient for fingerprinting)
function fp(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * scanProjectRisks(projectId)
 * - Always reads CURRENT data (live Task, Team, User).
 * - Writes a fingerprint on every Risk so we can update / reuse rather than
 *   duplicate on repeated button presses.
 * - Resolves previously-open risks whose condition is gone (status → resolved).
 */
export async function scanProjectRisks(projectId) {
  const Project = (await import("../models/Project.js")).default;
  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  const team     = await Team.findById(project.teamId).lean();
  if (!team) throw new Error("Team not found");

  const allTasks = await Task.find({ projectId }).lean();
  const now      = Date.now();
  const detected = [];

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isDone = (t) => t.status === "done";
  const hours  = (t) => Number(t.estimatedHours) || 4;

  // ── 1. Overdue tasks ───────────────────────────────────────────────────────
  const overdue = allTasks.filter((t) => {
    if (isDone(t)) return false;
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
      explanation:
        `"${t.title}" is past its due date and is still incomplete. ` +
        `It may delay the work that depends on it.`,
      evidence: `${daysLate} day(s) past due.`,
      affectedArea: t.title,
      category: "overdue_tasks",
      severity: sev,
      recommendation:
        `Complete or re-plan "${t.title}" before continuing dependent work.`,
      fingerprint: fp(`overdue:${t._id}`),
    });
  }

  // ── 2. Approaching deadline ────────────────────────────────────────────────
  const approaching = allTasks.filter((t) => {
    if (isDone(t)) return false;
    const due = t.dueDate || t.deadline;
    if (!due) return false;
    const daysLeft = (new Date(due).getTime() - now) / 86_400_000;
    return daysLeft >= 0 && daysLeft <= DEADLINE_DAYS;
  });
  if (approaching.length > 0) {
    const sample = approaching.slice(0, 3).map((t) => `"${t.title}"`).join(", ");
    detected.push({
      title: `${approaching.length} task(s) due within ${DEADLINE_DAYS} days`,
      explanation:
        `These tasks are due soon and have not been completed yet. ` +
        `There may not be enough time left to finish them.`,
      evidence: `Tasks: ${sample}${approaching.length > 3 ? "…" : ""}`,
      affectedArea: "Sprint deadlines",
      category: "approaching_deadline",
      severity: approaching.length >= 3 ? "high" : "medium",
      recommendation: `Prioritize these tasks immediately or negotiate deadline extensions.`,
      fingerprint: fp("approaching_deadline"),
    });
  }

  // ── 3. Blocked tasks ───────────────────────────────────────────────────────
  const blocked = allTasks.filter((t) => {
    if (isDone(t)) return false;
    const deps = Array.isArray(t.dependencies) ? t.dependencies.length : 0;
    return deps > 0 || (t.dependencyCount || 0) > 0;
  });
  for (const t of blocked) {
    detected.push({
      title: `Blocked: "${t.title}"`,
      explanation:
        `"${t.title}" cannot move forward right now. ` +
        `If it stays blocked, other tasks depending on it may also be delayed.`,
      evidence: `${(t.dependencies?.length || t.dependencyCount || 0)} upstream dependency(ies).`,
      affectedArea: t.title,
      category: "blocked_tasks",
      severity: "medium",
      recommendation: `Resolve the upstream blocker for "${t.title}" or re-sequence the sprint.`,
      fingerprint: fp(`blocked:${t._id}`),
    });
  }

  // ── 4. Dependency cascade ──────────────────────────────────────────────────
  // A task whose upstream is overdue / blocked AND which other tasks depend on.
  const idSet = new Set(allTasks.map((t) => String(t._id)));
  const downstreamCount = (id) =>
    allTasks.filter((t) => (t.dependencies || []).some((d) => String(d) === String(id))).length;
  const cascade = allTasks.filter((t) => {
    if (isDone(t)) return false;
    const due = t.dueDate || t.deadline;
    const late = due && new Date(due).getTime() < now;
    const depsBlocked =
      (t.dependencies || []).length > 0 &&
      (t.dependencies || []).some((d) => {
        const u = allTasks.find((x) => String(x._id) === String(d));
        return u && !isDone(u);
      });
    return (late || depsBlocked) && downstreamCount(t._id) >= 1 && idSet.has(String(t._id));
  });
  for (const t of cascade.slice(0, 5)) {
    const downstream = downstreamCount(t._id);
    detected.push({
      title: `Cascade risk: "${t.title}" affects ${downstream} downstream task(s)`,
      explanation:
        `Several tasks depend on "${t.title}". A delay here could delay ` +
        `the downstream tasks as well.`,
      evidence: `${downstream} downstream task(s) depend on this one.`,
      affectedArea: t.title,
      category: "dependency_cascade",
      severity: downstream >= 3 ? "high" : "medium",
      recommendation: `Stabilise "${t.title}" first or split its scope to unblock downstream work.`,
      fingerprint: fp(`cascade:${t._id}`),
    });
  }

  // ── 5. Unassigned high-priority task ───────────────────────────────────────
  const isHighPri = (t) => {
    const lbl = (t.priorityLabel || "").toLowerCase();
    if (lbl === "critical" || lbl === "high") return true;
    const score = t.priorityScore || 0;
    return score >= 70; // matches Greedy thresholds
  };
  const unassignedHigh = allTasks.filter(
    (t) => !isDone(t) && !t.assignedTo && isHighPri(t)
  );
  for (const t of unassignedHigh.slice(0, 5)) {
    detected.push({
      title: `Unassigned high-priority: "${t.title}"`,
      explanation:
        `This important task has no team member assigned to it yet.`,
      evidence: `Priority ${t.priorityLabel || "high"}, score ${t.priorityScore || 0}.`,
      affectedArea: t.title,
      category: "unassigned_high_priority",
      severity: t.priorityLabel === "critical" ? "high" : "medium",
      recommendation: `Assign "${t.title}" to a member who can pick it up immediately.`,
      fingerprint: fp(`unassigned:${t._id}`),
    });
  }

  // ── 6. Member overload ─────────────────────────────────────────────────────
  const memberLoad = {};
  for (const m of team.members || []) {
    memberLoad[m.userId?.toString()] = {
      name: m.name || m.email || "Member",
      assigned: 0,
      capacity: m.capacity || 40,
    };
  }
  for (const t of allTasks) {
    if (isDone(t)) continue;
    const uid = t.assignedTo?.toString();
    if (uid && memberLoad[uid]) memberLoad[uid].assigned += hours(t);
  }
  for (const [uid, m] of Object.entries(memberLoad)) {
    if (m.assigned > m.capacity * OVERLOAD_RATIO) {
      const memberTasks = allTasks.filter(
        (t) => !isDone(t) && String(t.assignedTo) === uid
      );
      detected.push({
        title: `${m.name} is overloaded (${m.assigned}h vs ${m.capacity}h)`,
        explanation:
          `Member is assigned ${m.assigned}h of work against a ${m.capacity}h ` +
          `capacity. This could create a bottleneck.`,
        evidence: `Active tasks: ${memberTasks.slice(0, 3).map((t) => `"${t.title}"`).join(", ")}.`,
        affectedArea: m.name,
        category: "member_overload",
        severity: m.assigned > m.capacity * 1.5 ? "critical" : "high",
        recommendation: `Redistribute tasks or reduce sprint scope for this member.`,
        fingerprint: fp(`overload:${uid}`),
      });
    }
  }

  // ── 7. Skill gap ───────────────────────────────────────────────────────────
  const requiredSkills = new Set(allTasks.flatMap((t) => t.requiredSkills || []));
  const memberUserIds = (team.members || []).map((m) => m.userId).filter(Boolean);
  const memberUsers = await User.find({ _id: { $in: memberUserIds } })
    .select("skills")
    .lean();
  const teamSkills = new Set(
    memberUsers.flatMap((u) =>
      (u.skills || []).map((s) => String(s).toLowerCase().trim())
    )
  );
  const missing = [...requiredSkills].filter(
    (s) => !teamSkills.has(String(s).toLowerCase().trim())
  );
  if (missing.length > 0) {
    detected.push({
      title: `Skill gap: ${missing.slice(0, 2).join(", ")}`,
      explanation:
        `One or more tasks require skills that no current team member has. ` +
        `If only unverified skills exist, this is treated as a gap.`,
      evidence: `Required skills with no adequate coverage: ${missing.slice(0, 4).join(", ")}.`,
      affectedArea: "Team capabilities",
      category: "skill_gap",
      severity: missing.length >= 3 ? "critical" : "high",
      recommendation: `Upskill team members or bring in a specialist for: ${missing.slice(0, 4).join(", ")}.`,
      fingerprint: fp(`skillgap:${missing.slice().sort().join("|")}`),
    });
  }

  // ── 8. Sprint capacity overload ────────────────────────────────────────────
  const totalActiveHours = allTasks
    .filter((t) => !isDone(t))
    .reduce((s, t) => s + hours(t), 0);
  const totalCapacity = (team.members || []).reduce(
    (s, m) => s + (m.capacity || 40),
    0
  );
  if (totalCapacity > 0 && totalActiveHours > totalCapacity * SPRINT_CAPACITY_BUFFER) {
    detected.push({
      title: `Sprint over capacity (${totalActiveHours}h / ${totalCapacity}h)`,
      explanation:
        `The active sprint commits more work than the team's capacity ` +
        `(with a ${Math.round((SPRINT_CAPACITY_BUFFER - 1) * 100)}% buffer). ` +
        `Completion is at risk.`,
      evidence: `Active hours ${totalActiveHours}, capacity ${totalCapacity}.`,
      affectedArea: "Sprint capacity",
      category: "sprint_capacity",
      severity: totalActiveHours > totalCapacity * 1.5 ? "critical" : "high",
      recommendation: `Trim sprint scope, defer lower-priority tasks, or extend the timeline.`,
      fingerprint: fp("sprint_capacity"),
    });
  }

  // ── 9. Stalled progress ────────────────────────────────────────────────────
  const stalled = allTasks.filter((t) => {
    if (isDone(t)) return false;
    if (!t.updatedAt) return false;
    return (now - new Date(t.updatedAt).getTime()) / 86_400_000 > STALE_DAYS;
  });
  if (stalled.length > 0) {
    detected.push({
      title: `${stalled.length} task(s) stale (>${STALE_DAYS} days)`,
      explanation:
        `Tasks that have not been touched for over ${STALE_DAYS} days may indicate ` +
        `abandonment or unresolved blockers.`,
      evidence: `Stale tasks: ${stalled.slice(0, 3).map((t) => `"${t.title}"`).join(", ")}.`,
      affectedArea: "Task progress",
      category: "stalled_progress",
      severity: "low",
      recommendation: `Review these tasks with the team — close, reassign, or update them.`,
      fingerprint: fp("stalled_progress"),
    });
  }

  // ── 10. High-priority unfinished work ──────────────────────────────────────
  const highUnfinished = allTasks.filter((t) => !isDone(t) && isHighPri(t));
  if (highUnfinished.length > 0) {
    detected.push({
      title: `${highUnfinished.length} high-priority task(s) still open`,
      explanation:
        `Urgent/high-priority tasks remain incomplete. They should be the team's ` +
        `focus before lower-priority work.`,
      evidence: `Examples: ${highUnfinished.slice(0, 3).map((t) => `"${t.title}"`).join(", ")}.`,
      affectedArea: "Priority focus",
      category: "high_priority_unfinished",
      severity: highUnfinished.length >= 3 ? "high" : "medium",
      recommendation: `Triage these tasks first — complete, reassign, or break them down.`,
      fingerprint: fp("high_priority_unfinished"),
    });
  }

  // ── 11. Workload imbalance ─────────────────────────────────────────────────
  if (Object.keys(memberLoad).length > 1) {
    const ratios = Object.values(memberLoad).map((m) => m.assigned / (m.capacity || 40));
    const max = Math.max(...ratios);
    const min = Math.min(...ratios);
    if (max - min > 0.6 && max > 0.5) {
      const heavy = Object.entries(memberLoad).sort(
        (a, b) => b[1].assigned - a[1].assigned
      )[0];
      detected.push({
        title: `Workload imbalance — ${heavy[1].name} is carrying most of the work`,
        explanation:
          `Active work is concentrated on one member. This creates a delivery ` +
          `risk if that member becomes unavailable.`,
        evidence: `${heavy[1].name}: ${heavy[1].assigned}h assigned vs others averaging ${Math.round(min * (heavy[1].capacity || 40))}h.`,
        affectedArea: "Workload distribution",
        category: "workload_imbalance",
        severity: max - min > 1.2 ? "high" : "medium",
        recommendation: `Rebalance active tasks so multiple members carry meaningful load.`,
        fingerprint: fp("workload_imbalance"),
      });
    }
  }

  // ── 12. GitHub inactivity (only if GitHub is connected) ────────────────────
  const GitHubIntegration = (await import("../models/GitHubIntegration.js")).default;
  const ghIntegration = await GitHubIntegration.findOne({
    projectId,
    isActive: true,
  }).lean();
  if (ghIntegration?.cachedSummary?.lastCommitAt) {
    const daysSince = (now - new Date(ghIntegration.cachedSummary.lastCommitAt)) / 86_400_000;
    if (daysSince > 14) {
      detected.push({
        title: `GitHub inactivity — no commits in ${Math.floor(daysSince)} day(s)`,
        explanation:
          `The connected GitHub repository shows no recent commits. ` +
          `Progress may have stalled.`,
        evidence: `Last commit ${new Date(ghIntegration.cachedSummary.lastCommitAt).toLocaleDateString()}.`,
        affectedArea: "GitHub activity",
        category: "github_inactivity",
        severity: daysSince > 30 ? "high" : "medium",
        recommendation: `Verify the team is pushing work and the integration is healthy.`,
        fingerprint: fp("github_inactivity"),
      });
    }
  }

  // ── Persist: dedup via fingerprint, update if changed, resolve if gone ─────
  const existing = await Risk.find({ projectId }).lean();
  const existingByFp = new Map(existing.map((r) => [r.fingerprint, r]));
  const detectedFps = new Set(detected.map((d) => d.fingerprint));

  const ops = [];

  // Upsert / create
  for (const d of detected) {
    const prev = existingByFp.get(d.fingerprint);
    if (prev) {
      // Update fields, keep status if user already acknowledged/resolved
      ops.push({
        updateOne: {
          filter: { _id: prev._id },
          update: {
            $set: {
              title: d.title,
              explanation: d.explanation,
              evidence: d.evidence,
              affectedArea: d.affectedArea,
              category: d.category,
              severity: d.severity,
              recommendation: d.recommendation,
              // If previously resolved, re-open automatically — the
              // condition has resurfaced in a fresh scan.
              ...(prev.status === "resolved" || prev.status === "acknowledged"
                ? { status: "open", resolvedBy: null, resolvedAt: null }
                : {}),
            },
          },
        },
      });
    } else {
      ops.push({
        insertOne: {
          document: {
            ...d,
            projectId,
            teamId: team._id,
            status: "open",
          },
        },
      });
    }
  }

  // Resolve: any previously-open risk whose fingerprint isn't in the fresh
  // scan and whose status is still open gets marked resolved automatically.
  for (const r of existing) {
    if (!detectedFps.has(r.fingerprint) && r.status === "open") {
      ops.push({
        updateOne: {
          filter: { _id: r._id },
          update: {
            $set: {
              status: "resolved",
              resolvedAt: new Date(),
            },
          },
        },
      });
    }
  }

  if (ops.length > 0) {
    try {
      await Risk.bulkWrite(ops, { ordered: false });
    } catch (e) {
      // Fallback to sequential inserts if bulkWrite isn't supported
      logger.warn("[riskEngine] bulkWrite fallback", { err: e.message });
      for (const d of detected) {
        const prev = existingByFp.get(d.fingerprint);
        if (prev) {
          await Risk.updateOne({ _id: prev._id }, {
            $set: {
              title: d.title,
              explanation: d.explanation,
              evidence: d.evidence,
              affectedArea: d.affectedArea,
              category: d.category,
              severity: d.severity,
              recommendation: d.recommendation,
              ...(prev.status === "resolved" || prev.status === "acknowledged"
                ? { status: "open", resolvedBy: null, resolvedAt: null }
                : {}),
            },
          });
        } else {
          await Risk.create({
            ...d,
            projectId,
            teamId: team._id,
            status: "open",
          });
        }
      }
      for (const r of existing) {
        if (!detectedFps.has(r.fingerprint) && r.status === "open") {
          await Risk.updateOne(
            { _id: r._id },
            { $set: { status: "resolved", resolvedAt: new Date() } }
          );
        }
      }
    }
  }

  const result = await Risk.find({ projectId })
    .sort({ severity: 1, createdAt: -1 })
    .lean();

  logger.info("[riskEngine] Risk scan complete", {
    projectId: projectId.toString(),
    detected: detected.length,
    total: result.length,
  });

  return result;
}