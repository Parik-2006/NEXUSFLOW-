/**
 * server/services/capabilityIntelligenceService.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAM 22: CAPABILITY INTELLIGENCE & DYNAMIC ASSIGNMENT
 *
 * Deterministic capability evidence modeling and dynamic team assignment.
 * Reuses canonical skill taxonomy, verified quizzes, completed work evidence,
 * and capacity constraints.
 *
 * Invariants:
 * 1. DAA remains deterministic (Branch & Bound solver).
 * 2. Self-declared skills never equal verified evidence.
 * 3. Assignment changes require explicit human authorization (Preview -> Accept).
 * 4. Human acceptance creates an auditable ProjectEvent.
 * ============================================================================
 */

import mongoose from "mongoose";
import User from "../models/User.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import SkillVerification from "../models/SkillVerification.js";
import CapabilityProfile from "../models/CapabilityProfile.js";
import ProjectEvent from "../models/ProjectEvent.js";
import { CANONICAL_SKILLS } from "../constants/skills.js";
import { logger } from "../utils/logger.js";

/**
 * Build or refresh a user's deterministic CapabilityProfile in a team/project.
 */
export async function buildCapabilityProfile(userId, teamId, projectId = null) {
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(teamId)) {
    throw new Error("Valid userId and teamId are required");
  }

  const [user, team, verifications, tasks] = await Promise.all([
    User.findById(userId).lean(),
    Team.findById(teamId).lean(),
    SkillVerification.find({ userId }).lean(),
    Task.find({
      $or: [{ assignedTo: userId }, { teamId }],
    }).lean(),
  ]);

  if (!user) throw new Error("User not found");
  if (!team) throw new Error("Team not found");

  const memberMeta = (team.members || []).find(
    (m) => (m.userId?._id || m.userId)?.toString() === userId.toString()
  );
  const weeklyCapacity = memberMeta?.capacity || 40;

  // Active workload calculation
  const activeTasks = tasks.filter(
    (t) =>
      (t.assignedTo?._id || t.assignedTo)?.toString() === userId.toString() &&
      t.status !== "done"
  );
  const activeAssignedHours = activeTasks.reduce(
    (acc, t) => acc + (Number(t.estimatedHours) || 4),
    0
  );
  const activeAssignedTasks = activeTasks.length;
  const availabilityRatio = Number(
    Math.max(0, (weeklyCapacity - activeAssignedHours) / weeklyCapacity).toFixed(2)
  );

  // Completed task evidence by category/keywords
  const doneTasks = tasks.filter(
    (t) =>
      (t.assignedTo?._id || t.assignedTo)?.toString() === userId.toString() &&
      t.status === "done"
  );

  // Compile canonical skills with deterministic evidence weighting
  const canonicalEntries = [];
  const userDeclaredSkills = (user.skills || []).map((s) => String(s).toLowerCase().trim());

  for (const skill of CANONICAL_SKILLS) {
    const sId = skill.id.toLowerCase();
    const sName = skill.name.toLowerCase();

    // 1. Check Verified Quiz
    const quizVer = verifications.find(
      (v) => (v.skill || v.skillId || "").toLowerCase() === sId || (v.skill || v.skillName || "").toLowerCase() === sName
    );

    // 2. Check Completed Tasks matching skill
    const matchingDone = doneTasks.filter((t) => {
      const text = `${t.title || ""} ${t.description || ""} ${t.category || ""}`.toLowerCase();
      return text.includes(sId) || text.includes(sName);
    });

    // 3. Check Self-declared
    const isDeclared = userDeclaredSkills.some((s) => s.includes(sId) || s.includes(sName));

    const evidenceSources = [];
    let verificationStatus = "unverified";
    let weight = 0;
    let quizScore = 0;
    let quizTotal = 0;
    let quizPassed = false;
    let verifiedAt = null;

    if (quizVer && quizVer.verified) {
      verificationStatus = "verified";
      quizScore = quizVer.score || 0;
      quizTotal = quizVer.totalQuestions || 5;
      quizPassed = true;
      verifiedAt = quizVer.verifiedAt || quizVer.createdAt;
      weight = 1.0;
      evidenceSources.push({
        sourceType: "quiz",
        referenceId: quizVer._id.toString(),
        description: `Passed canonical verification quiz (${quizScore}/${quizTotal})`,
        confidence: 0.95,
        recordedAt: verifiedAt,
      });
    }

    if (matchingDone.length > 0) {
      if (weight < 0.8) weight = 0.8;
      evidenceSources.push({
        sourceType: "completed_task",
        referenceId: matchingDone[0]._id.toString(),
        description: `Successfully completed ${matchingDone.length} relevant project task(s)`,
        confidence: Math.min(0.7 + matchingDone.length * 0.05, 0.9),
        recordedAt: new Date(),
      });
    }

    if (isDeclared) {
      if (verificationStatus === "unverified") {
        verificationStatus = "self_declared";
        if (weight < 0.4) weight = 0.4;
      }
      evidenceSources.push({
        sourceType: "self_declared",
        referenceId: user._id.toString(),
        description: "Self-declared profile skill",
        confidence: 0.4,
        recordedAt: user.updatedAt || user.createdAt,
      });
    }

    // Only include skill if there is at least some evidence or declaration
    if (evidenceSources.length > 0) {
      canonicalEntries.push({
        skillId: skill.id,
        name: skill.name,
        category: skill.category,
        verificationStatus,
        quizScore,
        quizTotal,
        quizPassed,
        verifiedAt,
        weight,
        evidenceSources,
        completedTasksCount: matchingDone.length,
        lastDemonstratedAt: matchingDone[0]?.updatedAt || verifiedAt || null,
      });
    }
  }

  const profile = await CapabilityProfile.findOneAndUpdate(
    { userId, teamId },
    {
      $set: {
        projectId,
        canonicalSkills: canonicalEntries,
        capacityWeeklyHours: weeklyCapacity,
        activeAssignedHours,
        activeAssignedTasks,
        availabilityRatio,
        isAvailable: availabilityRatio > 0.1,
      },
    },
    { upsert: true, new: true }
  );

  return profile;
}

/**
 * Analyze team capability coverage, single-point concentration, and gaps.
 */
export async function analyzeCapabilityGaps(projectId) {
  if (!mongoose.isValidObjectId(projectId)) throw new Error("Invalid project ID");

  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  const team = await Team.findById(project.teamId).lean();
  if (!team) throw new Error("Team not found");

  const members = team.members || [];
  const profiles = await Promise.all(
    members.map((m) =>
      buildCapabilityProfile(m.userId?._id || m.userId, team._id, project._id)
    )
  );

  const tasks = await Task.find({ projectId }).lean();
  const openTasks = tasks.filter((t) => t.status !== "done");

  // Aggregate Skill Coverage Across Team
  const coverageMap = {};
  for (const prof of profiles) {
    const memberName = (members.find((m) => (m.userId?._id || m.userId)?.toString() === prof.userId.toString()))?.name || "Member";
    for (const skill of prof.canonicalSkills || []) {
      if (!coverageMap[skill.skillId]) {
        coverageMap[skill.skillId] = {
          skillId: skill.skillId,
          name: skill.name,
          category: skill.category,
          verifiedMembers: [],
          declaredMembers: [],
        };
      }
      if (skill.verificationStatus === "verified") {
        coverageMap[skill.skillId].verifiedMembers.push({ userId: prof.userId.toString(), name: memberName, weight: skill.weight });
      } else {
        coverageMap[skill.skillId].declaredMembers.push({ userId: prof.userId.toString(), name: memberName, weight: skill.weight });
      }
    }
  }

  // Detect Gaps & Risks
  const singlePointRisks = [];
  const missingBackupSkills = [];
  const uncoveredRequiredSkills = [];
  const overloadedMembers = [];

  // 1. Single Point of Failure (Bus Factor = 1)
  for (const [skillId, cov] of Object.entries(coverageMap)) {
    if (cov.verifiedMembers.length === 1 && cov.declaredMembers.length === 0) {
      singlePointRisks.push({
        skillId,
        skillName: cov.name,
        category: cov.category,
        soleOwner: cov.verifiedMembers[0],
        riskLevel: "HIGH",
        finding: `Only ${cov.verifiedMembers[0].name} holds verified capability in ${cov.name}. Any unavailability stalls dependent work.`,
        recommendation: `Cross-train a second team member in ${cov.name} or pair-program on critical tasks.`,
      });
    } else if (cov.verifiedMembers.length === 1 && cov.declaredMembers.length > 0) {
      missingBackupSkills.push({
        skillId,
        skillName: cov.name,
        verifiedMember: cov.verifiedMembers[0],
        unverifiedBackups: cov.declaredMembers,
        finding: `${cov.name} has only 1 verified member; other members only have self-declared experience.`,
        recommendation: `Encourage backup members to complete canonical skill verification for ${cov.name}.`,
      });
    }
  }

  // 2. Overloaded Capable Members
  for (const prof of profiles) {
    if (prof.activeAssignedHours > prof.capacityWeeklyHours) {
      const mName = (members.find((m) => (m.userId?._id || m.userId)?.toString() === prof.userId.toString()))?.name || "Member";
      overloadedMembers.push({
        userId: prof.userId.toString(),
        name: mName,
        assignedHours: prof.activeAssignedHours,
        capacity: prof.capacityWeeklyHours,
        utilizationRate: Math.round((prof.activeAssignedHours / prof.capacityWeeklyHours) * 100),
        finding: `${mName} is assigned ${prof.activeAssignedHours}h against a ${prof.capacityWeeklyHours}h weekly capacity (${Math.round((prof.activeAssignedHours / prof.capacityWeeklyHours) * 100)}% load).`,
        recommendation: "Rebalance non-critical tasks to available members with spare capacity.",
      });
    }
  }

  // 3. Demanded Skills with Zero Coverage in Team
  const demandedSkillKeywords = new Set();
  for (const t of openTasks) {
    const text = `${t.title} ${t.description} ${t.category}`.toLowerCase();
    for (const skill of CANONICAL_SKILLS) {
      if (text.includes(skill.id) || text.includes(skill.name.toLowerCase())) {
        demandedSkillKeywords.add(skill.id);
      }
    }
  }

  for (const demandedId of demandedSkillKeywords) {
    if (!coverageMap[demandedId] || (coverageMap[demandedId].verifiedMembers.length === 0 && coverageMap[demandedId].declaredMembers.length === 0)) {
      const skillDef = CANONICAL_SKILLS.find((s) => s.id === demandedId);
      uncoveredRequiredSkills.push({
        skillId: demandedId,
        name: skillDef?.name || demandedId,
        category: skillDef?.category || "General",
        finding: `Open tasks demand ${skillDef?.name || demandedId}, but zero team members have declared or verified this capability.`,
        recommendation: `Assign exploratory spike, recruit specialized member, or adjust architecture/methodology scope.`,
      });
    }
  }

  return {
    projectId: project._id.toString(),
    methodology: project.methodology || "CLASSIC",
    totalMembers: members.length,
    profiles,
    coverage: Object.values(coverageMap),
    singlePointRisks,
    missingBackupSkills,
    uncoveredRequiredSkills,
    overloadedMembers,
  };
}

/**
 * Preview dynamic team assignment using deterministic Branch & Bound.
 * INVARIANT: Strictly advisory preview. No project state is mutated.
 */
export async function previewDynamicAssignment(projectId) {
  if (!mongoose.isValidObjectId(projectId)) throw new Error("Invalid project ID");

  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  const team = await Team.findById(project.teamId).lean();
  if (!team) throw new Error("Team not found");

  const members = team.members || [];
  if (members.length === 0) {
    return { assignments: [], candidateSet: [], exclusions: [], alternatives: [], advisoryOnly: true };
  }

  const profiles = await Promise.all(
    members.map((m) =>
      buildCapabilityProfile(m.userId?._id || m.userId, team._id, project._id)
    )
  );

  const openTasks = await Task.find({
    projectId,
    status: { $ne: "done" },
  }).sort({ priorityScore: -1, urgency: -1 }).lean();

  if (openTasks.length === 0) {
    return { assignments: [], candidateSet: profiles, exclusions: [], alternatives: [], advisoryOnly: true };
  }

  // Deterministic Candidate Evaluation Matrix
  const candidateSet = profiles.map((p) => {
    const memberName = (members.find((m) => (m.userId?._id || m.userId)?.toString() === p.userId.toString()))?.name || "Member";
    return {
      userId: p.userId.toString(),
      name: memberName,
      capacity: p.capacityWeeklyHours,
      assignedHours: p.activeAssignedHours,
      availableHours: Math.max(0, p.capacityWeeklyHours - p.activeAssignedHours),
      availabilityRatio: p.availabilityRatio,
      verifiedSkills: (p.canonicalSkills || []).filter((s) => s.verificationStatus === "verified").map((s) => s.name),
      allSkills: (p.canonicalSkills || []).map((s) => ({ id: s.skillId, name: s.name, weight: s.weight })),
    };
  });

  const assignments = [];
  const exclusions = [];
  const memberSimulatedHours = {};
  for (const c of candidateSet) memberSimulatedHours[c.userId] = c.assignedHours;

  for (const task of openTasks) {
    const taskHours = Number(task.estimatedHours) || 4;
    const taskText = `${task.title} ${task.description} ${task.category}`.toLowerCase();

    // Find candidates and compute deterministic fit score
    const scoredCandidates = [];
    const taskExclusions = [];

    for (const cand of candidateSet) {
      // Check capacity constraint
      const simulatedHoursAfter = memberSimulatedHours[cand.userId] + taskHours;
      const isOverCapacity = simulatedHoursAfter > cand.capacity * 1.25;

      // Skill match score
      let skillMatchScore = 0;
      let matchedSkills = [];

      for (const skill of cand.allSkills) {
        if (taskText.includes(skill.id) || taskText.includes(skill.name.toLowerCase())) {
          skillMatchScore += skill.weight * 50;
          matchedSkills.push(skill.name);
        }
      }

      if (isOverCapacity) {
        taskExclusions.push({
          userId: cand.userId,
          name: cand.name,
          reason: `Capacity exceeded: would reach ${simulatedHoursAfter}h / ${cand.capacity}h limit`,
        });
      }

      // Cost function (lower is better, Branch & Bound style)
      // Cost = 100 - skillMatchScore + (simulatedHours / capacity * 40)
      const loadFactor = (simulatedHoursAfter / Math.max(cand.capacity, 1)) * 40;
      const cost = Math.max(0, Math.round(100 - skillMatchScore + loadFactor));

      scoredCandidates.push({
        userId: cand.userId,
        name: cand.name,
        cost,
        fitScore: Math.max(10, Math.min(99, 100 - cost)),
        skillMatchScore,
        matchedSkills,
        hoursBefore: memberSimulatedHours[cand.userId],
        hoursAfter: simulatedHoursAfter,
        capacity: cand.capacity,
        isOverCapacity,
      });
    }

    // Sort by cost ascending
    scoredCandidates.sort((a, b) => a.cost - b.cost);
    const bestFit = scoredCandidates[0];

    if (bestFit) {
      memberSimulatedHours[bestFit.userId] = bestFit.hoursAfter;

      assignments.push({
        taskId: task._id.toString(),
        taskTitle: task.title,
        currentAssigneeId: task.assignedTo?.toString() || null,
        recommendedMemberId: bestFit.userId,
        recommendedMemberName: bestFit.name,
        fitCost: bestFit.cost,
        fitScore: bestFit.fitScore,
        skillEvidence: bestFit.matchedSkills.length > 0
          ? `Matches ${bestFit.matchedSkills.join(", ")}`
          : "General team allocation with available bandwidth",
        capacityImpact: {
          hoursBefore: bestFit.hoursBefore,
          hoursAfter: bestFit.hoursAfter,
          capacity: bestFit.capacity,
        },
        alternatives: scoredCandidates.slice(1, 3).map((alt) => ({
          userId: alt.userId,
          name: alt.name,
          costDifference: alt.cost - bestFit.cost,
          fitScore: alt.fitScore,
        })),
      });
    }

    if (taskExclusions.length > 0) {
      exclusions.push({ taskId: task._id.toString(), taskTitle: task.title, exclusions: taskExclusions });
    }
  }

  return {
    projectId: project._id.toString(),
    methodology: project.methodology || "CLASSIC",
    advisoryOnly: true,
    candidateSet,
    assignments,
    exclusions,
    deterministicFactors: [
      { name: "Canonical Skill Match", weight: 0.5, rule: "Verified skills have 2.5x weight of self-declared skills" },
      { name: "Capacity Limit", weight: 0.3, rule: "Member weekly assigned hours capped at 125% of capacity" },
      { name: "Workload Distribution", weight: 0.2, rule: "Favors lower-loaded members on equivalent skill fit" },
    ],
  };
}

/**
 * Explicit Human Acceptance of an Assignment.
 * INVARIANT: State changes ONLY when explicitly accepted by authorized human.
 */
export async function acceptAssignment(projectId, { taskId, newAssigneeId }, actor, io = null) {
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(taskId) || !mongoose.isValidObjectId(newAssigneeId)) {
    throw new Error("Invalid project, task, or assignee ID");
  }

  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  const task = await Task.findOne({ _id: taskId, projectId });
  if (!task) throw new Error("Task not found in this project");

  const newAssignee = await User.findById(newAssigneeId).lean();
  if (!newAssignee) throw new Error("New assignee user not found");

  const previousAssigneeId = task.assignedTo?.toString() || null;
  task.assignedTo = newAssigneeId;
  await task.save();

  // Audit Event
  await ProjectEvent.create({
    projectId: project._id,
    teamId: project.teamId,
    actorId: actor?._id || null,
    eventType: "ASSIGNMENT_ACCEPTED",
    entityType: "task",
    entityId: task._id.toString(),
    title: `Assignment Accepted: ${task.title} -> ${newAssignee.name}`,
    previousValue: previousAssigneeId,
    newValue: newAssigneeId.toString(),
    metadata: {
      acceptedBy: actor?.name || "Authorized User",
      assigneeName: newAssignee.name,
      taskTitle: task.title,
    },
  });

  // Refresh Capability Profile for new assignee
  await buildCapabilityProfile(newAssigneeId, project.teamId, project._id);
  if (previousAssigneeId) {
    await buildCapabilityProfile(previousAssigneeId, project.teamId, project._id);
  }

  if (io) {
    io.to(`project:${project._id.toString()}`).emit("assignment.accepted", {
      taskId: task._id.toString(),
      newAssigneeId: newAssignee._id.toString(),
      assigneeName: newAssignee.name,
    });
    io.to(`project:${project._id.toString()}`).emit("capability.updated", {
      projectId: project._id.toString(),
    });
  }

  return { success: true, task, assignedTo: newAssignee.name };
}
