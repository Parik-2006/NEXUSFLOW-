/**
 * server/services/scrumCapacityEngine.js
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM CAPACITY & LOAD BALANCING ENGINE
 *
 * Deterministic capacity optimization for Sprint planning.
 * Integrates with Branch & Bound for allocation optimization.
 *
 * CAPABILITIES:
 *   - Team member Sprint capacity calculation
 *   - Skill-aware capacity planning
 *   - Workload distribution analysis
 *   - Overload detection with recommendations
 *   - Allocation optimization
 *
 * RULES:
 *   - Never silently reassign teammates
 *   - Recommendations require explicit user/team decision
 *   - Preserve existing assignments
 *   - Skill verification remains user-owned
 * ============================================================================
 */

import Sprint from "../models/Sprint.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";

/**
 * Calculate detailed capacity analysis for a Sprint.
 */
export function calculateSprintCapacity(sprint, tasks, team) {
  const members = team?.members || [];
  const sprintIdStr = sprint?._id?.toString();
  const sprintTasks = sprintIdStr
    ? tasks.filter((t) => t.sprintId && t.sprintId.toString() === sprintIdStr)
    : [];

  const memberAnalysis = members.map((m) => {
    const userId = (m.userId?._id || m.userId)?.toString();
    const memberTasks = sprintTasks.filter((t) => (t.assignedTo?._id || t.assignedTo)?.toString() === userId);

    const allocatedHours = memberTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
    const completedHours = memberTasks
      .filter((t) => t.scrumStatus === "DONE" || t.status === "done")
      .reduce((sum, t) => sum + (t.actualHours || t.estimatedHours || 0), 0);
    const remainingHours = memberTasks
      .filter((t) => t.scrumStatus !== "DONE" && t.status !== "done")
      .reduce((sum, t) => sum + (t.estimatedHours || 0), 0);

    const capacity = m.capacity || 30;
    const utilization = capacity > 0 ? Math.round((allocatedHours / capacity) * 100) : 0;

    // Extract verified skills (skills with level >= 5)
    const verifiedSkills = Object.entries(m.skills || {})
      .filter(([, level]) => (level || 0) >= 5)
      .map(([name, level]) => ({ name, level }));

    return {
      userId,
      userName: m.name || "Member",
      role: m.role || "member",
      capacity,
      allocatedHours,
      completedHours,
      remainingHours,
      utilization,
      isOverloaded: utilization > 100,
      isUnderutilized: utilization < 50 && sprintTasks.length > 0,
      taskCount: memberTasks.length,
      completedCount: memberTasks.filter((t) => t.scrumStatus === "DONE" || t.status === "done").length,
      blockedCount: memberTasks.filter((t) => t.scrumStatus === "BLOCKED").length,
      verifiedSkills,
      tasks: memberTasks.map((t) => ({
        id: t._id,
        title: t.title,
        status: t.scrumStatus || t.status,
        estimatedHours: t.estimatedHours,
        requiredSkills: t.requiredSkills,
      })),
    };
  });

  // Team-level summary
  const totalCapacity = members.reduce((sum, m) => sum + (m.capacity || 30), 0);
  const totalAllocated = sprintTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
  const totalRemaining = sprintTasks
    .filter((t) => t.scrumStatus !== "DONE" && t.status !== "done")
    .reduce((sum, t) => sum + (t.estimatedHours || 0), 0);

  const overloadedMembers = memberAnalysis.filter((m) => m.isOverloaded);
  const underutilizedMembers = memberAnalysis.filter((m) => m.isUnderutilized);

  // Skill gap analysis
  const requiredSkillsSet = new Set();
  sprintTasks.forEach((t) => (t.requiredSkills || []).forEach((s) => requiredSkillsSet.add(s.toLowerCase())));
  const teamSkillsSet = new Set();
  members.forEach((m) => {
    Object.entries(m.skills || {})
      .filter(([, level]) => (level || 0) >= 5)
      .forEach(([name]) => teamSkillsSet.add(name.toLowerCase()));
  });
  const missingSkills = [...requiredSkillsSet].filter((s) => !teamSkillsSet.has(s));

  return {
    members: memberAnalysis,
    summary: {
      totalCapacity,
      totalAllocated,
      totalRemaining,
      utilization: totalCapacity > 0 ? Math.round((totalAllocated / totalCapacity) * 100) : 0,
      capacityExceeded: totalAllocated > totalCapacity,
      excessHours: Math.max(0, totalAllocated - totalCapacity),
      overloadedMembers: overloadedMembers.length,
      underutilizedMembers: underutilizedMembers.length,
      totalTasks: sprintTasks.length,
      unassignedTasks: sprintTasks.filter((t) => !t.assignedTo).length,
      missingSkills,
    },
    recommendations: generateCapacityRecommendations(memberAnalysis, sprintTasks, totalCapacity, totalAllocated),
  };
}

/**
 * Generate capacity-based recommendations.
 * NEVER automatically applies changes — recommendations only.
 */
function generateCapacityRecommendations(memberAnalysis, tasks, totalCapacity, totalAllocated) {
  const recommendations = [];

  // Capacity exceeded
  if (totalAllocated > totalCapacity) {
    const excess = totalAllocated - totalCapacity;
    recommendations.push({
      type: "CAPACITY_EXCEEDED",
      severity: "high",
      message: `Sprint capacity exceeded by ${excess}h (${totalAllocated}h allocated / ${totalCapacity}h capacity)`,
      suggestions: [
        "Remove lower-priority items from Sprint",
        "Split large items into smaller deliverables",
        "Increase team availability if possible",
        "Move non-critical items to next Sprint",
      ],
    });
  }

  // Overloaded members
  const overloaded = memberAnalysis.filter((m) => m.isOverloaded);
  for (const member of overloaded) {
    const excess = member.allocatedHours - member.capacity;
    const compatible = memberAnalysis.filter(
      (m) => !m.isOverloaded && m.utilization < 80 && m.userId !== member.userId
    );

    recommendations.push({
      type: "MEMBER_OVERLOADED",
      severity: "medium",
      message: `${member.userName} is overloaded by ${excess}h (${member.allocatedHours}h / ${member.capacity}h)`,
      suggestions: [
        ...(compatible.length > 0
          ? [`Consider reassigning to: ${compatible.map((m) => m.userName).join(", ")}`]
          : []),
        `Reduce ${member.userName}'s Sprint scope by ${excess}h`,
        "Defer lower-priority tasks to next Sprint",
      ],
    });
  }

  // Unassigned tasks
  const unassigned = tasks.filter((t) => !t.assignedTo);
  if (unassigned.length > 0) {
    recommendations.push({
      type: "UNASSIGNED_TASKS",
      severity: "medium",
      message: `${unassigned.length} task(s) have no assignee`,
      suggestions: [
        "Assign tasks based on skill match and availability",
        "Use team capacity view to identify best-fit members",
      ],
    });
  }

  // Skill gaps
  const allRequiredSkills = new Set();
  tasks.forEach((t) => (t.requiredSkills || []).forEach((s) => allRequiredSkills.add(s)));
  if (allRequiredSkills.size > 0) {
    const coveredSkills = new Set();
    memberAnalysis.forEach((m) => m.verifiedSkills.forEach((s) => coveredSkills.add(s.name.toLowerCase())));
    const gaps = [...allRequiredSkills].filter((s) => !coveredSkills.has(s.toLowerCase()));
    if (gaps.length > 0) {
      recommendations.push({
        type: "SKILL_GAP",
        severity: "high",
        message: `Missing verified skills: ${gaps.join(", ")}`,
        suggestions: [
          "Verify team skills through the Skill Verification workflow",
          "Consider pairing experienced members with those learning",
          "Identify if external help is needed",
        ],
      });
    }
  }

  return recommendations;
}

/**
 * Find optimal task allocation using deterministic scoring.
 * Considers capacity, skills, workload, and dependencies.
 *
 * Returns RECOMMENDATIONS — does NOT auto-assign.
 */
export function suggestAllocation(tasks, members, context = {}) {
  const suggestions = [];

  for (const task of tasks) {
    if (task.assignedTo && !context.includeAssigned) continue; // skip already assigned unless requested

    const requiredSkills = Array.isArray(task.requiredSkills)
      ? task.requiredSkills.map((s) => String(s).toLowerCase().trim())
      : [];
    if (requiredSkills.length === 0 && task.skillWeights) {
      Object.entries(task.skillWeights || {}).forEach(([k, v]) => {
        if ((v || 0) >= 5) requiredSkills.push(k.toLowerCase().trim());
      });
    }
    const taskHours = Number(task.estimatedHours) || (task.storyPoints ? task.storyPoints * 2 : 4);

    const candidates = members
      .map((m) => {
        const userId = (m.userId?._id || m.userId || m.id)?._id?.toString() || (m.userId?._id || m.userId || m.id)?.toString();
        let memberSkills = [];
        const rawSkills = m.skills && typeof m.skills === "object"
          ? (typeof m.skills.toObject === "function" ? m.skills.toObject() : m.skills)
          : {};
        if (rawSkills && typeof rawSkills === "object" && !Array.isArray(rawSkills)) {
          memberSkills = Object.entries(rawSkills)
            .filter(([k, v]) => !k.startsWith("$") && !k.startsWith("_") && (v || 0) >= 5)
            .map(([k]) => k.toLowerCase().trim());
        } else if (Array.isArray(m.skills)) {
          memberSkills = m.skills.map((s) => String(s).toLowerCase().trim());
        }
        const vSkills = m.verifiedSkills || m.userId?.verifiedSkills || m.user?.verifiedSkills;
        if (Array.isArray(vSkills)) {
          vSkills.forEach((s) => memberSkills.push(String(s).toLowerCase().trim()));
        }

        const skillAliases = {
          "node.js": "backend",
          node: "backend",
          nodejs: "backend",
          mongodb: "backend",
          mongo: "backend",
          express: "backend",
          database: "backend",
          architecture: "backend",
          react: "frontend",
          vue: "frontend",
          css: "frontend",
          html: "frontend",
          docker: "devops",
          k8s: "devops",
          kubernetes: "devops",
          ci: "devops",
          jest: "testing",
          cypress: "testing",
          qa: "testing",
        };

        // Skill match score
        const matchedSkills = requiredSkills.filter((s) => {
          if (memberSkills.includes(s)) return true;
          const mapped = skillAliases[s];
          return mapped && memberSkills.includes(mapped);
        });
        const skillMatch = requiredSkills.length > 0
          ? matchedSkills.length / requiredSkills.length
          : 0.6; // baseline general capability

        // Capacity fit score
        const memberCapacity = Number(m.capacity || m.capacityHours) || 40;
        const assignedLoad = context.memberLoads?.[userId] ?? context[userId] ?? (m.committedHours || m.assignedHours || m.assignedLoad || 0);
        const remaining = memberCapacity - assignedLoad;
        const capacityFit = remaining >= taskHours ? 1 : remaining > 0 ? remaining / taskHours : 0.1;

        // Workload balance score
        const utilization = memberCapacity > 0 ? assignedLoad / memberCapacity : 1;
        const balanceScore = Math.max(0, 1 - utilization);

        const totalScore = Math.round((skillMatch * 0.45 + capacityFit * 0.35 + balanceScore * 0.20) * 100);

        return {
          userId,
          userName: m.name || m.userName || m.userId?.name || "Member",
          skillMatch: Math.round(skillMatch * 100),
          matchedSkills,
          capacityFit: Math.round(capacityFit * 100),
          balanceScore: Math.round(balanceScore * 100),
          totalScore: Math.max(15, Math.min(99, totalScore)),
          remainingCapacity: remaining,
          hoursBefore: assignedLoad,
          hoursAfter: assignedLoad + taskHours,
          capacity: memberCapacity,
        };
      })
      .filter((c) => c.totalScore > 10)
      .sort((a, b) => b.totalScore - a.totalScore);

    if (candidates.length > 0) {
      const top = candidates[0];
      suggestions.push({
        taskId: task._id?.toString() || task._id,
        taskTitle: task.title,
        requiredSkills: task.requiredSkills || [],
        estimatedHours: taskHours,
        storyPoints: task.storyPoints || 1,
        currentAssigneeId: task.assignedTo || null,
        recommendedMemberId: top.userId,
        recommendedMemberName: top.userName,
        fitScore: top.totalScore,
        fitCost: 100 - top.totalScore,
        skillEvidence: top.matchedSkills?.length > 0
          ? `Verified skill match: ${top.matchedSkills.join(", ")}`
          : "Available capacity match with general team development capability",
        capacityImpact: {
          hoursBefore: top.hoursBefore,
          hoursAfter: top.hoursAfter,
          capacity: top.capacity,
        },
        topCandidate: top,
        alternatives: candidates.slice(1, 3).map((alt) => ({
          userId: alt.userId,
          name: alt.userName,
          fitScore: alt.totalScore,
          costDifference: top.totalScore - alt.totalScore,
        })),
        reason: `Best fit: ${top.userName} (${top.totalScore}% Fit Score, ${top.skillMatch}% skill alignment, ${top.hoursBefore}h → ${top.hoursAfter}h load)`,
      });
    }
  }

  return suggestions;
}
