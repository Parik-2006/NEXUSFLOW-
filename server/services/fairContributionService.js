/**
 * server/services/fairContributionService.js
 * ============================================================================
 * NEXUSFLOW V4 — FAIR CONTRIBUTION ANALYSIS SERVICE (Prompt 15)
 *
 * Implements objective, multidimensional contribution intelligence for teams.
 *
 * CORE PRINCIPLES:
 *   - NEVER uses naive commit counts or simple task counts as proof of effort
 *   - Weights tasks by complexity, criticality, and estimated hours
 *   - Attributes requirement coverage and attached evidence
 *   - Uses real ProjectEvent logs for timeline consistency
 *   - Formula and weights are 100% transparent and explainable
 *   - Strictly non-punitive: no public leaderboards or character judgments
 *   - Provides a dispute workflow for attribution review
 * ============================================================================
 */

import mongoose from "mongoose";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import ProjectEvent from "../models/ProjectEvent.js";
import ContributionDispute from "../models/ContributionDispute.js";
import { recordProjectEvent } from "./eventService.js";

// Transparent dimensional weights
export const CONTRIBUTION_WEIGHTS = {
  taskWorkload: 0.40,        // Completed tasks weighted by hours & complexity
  requirementCoverage: 0.25, // Tasks delivering approved project requirements
  evidenceContribution: 0.20,// Evidence artifacts & test verification
  processConsistency: 0.15,  // Sustained activity across project events
};

/**
 * Perform multidimensional contribution analysis for a project.
 */
export async function calculateProjectContribution(projectId, options = {}) {
  if (!mongoose.isValidObjectId(projectId)) {
    throw new Error("Invalid project ID.");
  }

  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found.");

  const team = await Team.findById(project.teamId).lean();
  const members = team?.members || [];

  const [tasks, events, disputes] = await Promise.all([
    Task.find({ projectId }).lean(),
    ProjectEvent.find({ projectId }).lean(),
    ContributionDispute.find({ projectId }).lean(),
  ]);

  if (members.length === 0) {
    return {
      projectId: projectId.toString(),
      status: "INSUFFICIENT_EVIDENCE",
      message: "No team members found for contribution analysis.",
      weights: CONTRIBUTION_WEIGHTS,
      members: [],
      disputes: [],
      analyzedAt: new Date().toISOString(),
    };
  }

  const requirements = project.requirements || [];

  // Group events by actor
  const eventsByActor = new Map();
  events.forEach(e => {
    if (e.actorId) {
      const key = e.actorId.toString();
      if (!eventsByActor.has(key)) eventsByActor.set(key, []);
      eventsByActor.get(key).push(e);
    }
  });

  // Calculate raw metrics per member
  const memberMetrics = members.map(member => {
    const memberId = (member.userId?._id || member.userId)?.toString();
    const memberName = member.name || "Member";

    // Tasks assigned to this member
    const memberTasks = tasks.filter(t => {
      const assignedId = (t.assignedTo?._id || t.assignedTo)?.toString();
      return assignedId === memberId;
    });

    const completedTasks = memberTasks.filter(t => t.status === "done");
    const inProgressTasks = memberTasks.filter(t => t.status === "in_progress");

    // Task workload (hours * priority/complexity multiplier)
    const completedWorkloadHours = completedTasks.reduce((sum, t) => {
      const hours = t.estimatedHours || 8;
      const complexityMultiplier = t.priorityLabel === "critical" ? 1.5 :
                                   t.priorityLabel === "high" ? 1.25 : 1.0;
      return sum + (hours * complexityMultiplier);
    }, 0);

    // Requirements covered: tasks completed that belong to requirements
    const coveredReqIds = new Set();
    completedTasks.forEach(t => {
      requirements.forEach(r => {
        if ((r.taskIds || []).includes(t._id.toString()) || (r.taskIds || []).includes(t.title)) {
          coveredReqIds.add(r.reqId || r._id.toString());
        }
      });
    });

    // Evidence records attributed to member's tasks
    let evidenceCount = 0;
    requirements.forEach(r => {
      if (coveredReqIds.has(r.reqId || r._id.toString())) {
        evidenceCount += (r.implementationEvidence?.length || 0) + (r.testEvidence?.length || 0);
      }
    });

    // Activity consistency from events
    const memberEvents = eventsByActor.get(memberId) || [];
    const eventDays = new Set(memberEvents.map(e => new Date(e.timestamp).toDateString()));

    return {
      memberId,
      name: memberName,
      role: member.role || "member",
      assignedTasksCount: memberTasks.length,
      completedTasksCount: completedTasks.length,
      inProgressTasksCount: inProgressTasks.length,
      completedWorkloadHours: Math.round(completedWorkloadHours * 10) / 10,
      coveredRequirementsCount: coveredReqIds.size,
      coveredRequirementIds: Array.from(coveredReqIds),
      evidenceCount,
      eventCount: memberEvents.length,
      activeDaysCount: eventDays.size,
      completedTaskTitles: completedTasks.map(t => t.title),
    };
  });

  // Calculate team totals for relative dimensional scoring
  const totalHours = memberMetrics.reduce((sum, m) => sum + m.completedWorkloadHours, 0) || 1;
  const totalReqs = memberMetrics.reduce((sum, m) => sum + m.coveredRequirementsCount, 0) || 1;
  const totalEv = memberMetrics.reduce((sum, m) => sum + m.evidenceCount, 0) || 1;
  const totalDays = memberMetrics.reduce((sum, m) => sum + m.activeDaysCount, 0) || 1;

  // Compute composite score per member
  const analyzedMembers = memberMetrics.map(m => {
    const workloadShare = m.completedWorkloadHours / totalHours;
    const reqShare = m.coveredRequirementsCount / totalReqs;
    const evShare = m.evidenceCount / totalEv;
    const consistencyShare = m.activeDaysCount / totalDays;

    const compositeScore = Math.round(
      (workloadShare * CONTRIBUTION_WEIGHTS.taskWorkload +
       reqShare * CONTRIBUTION_WEIGHTS.requirementCoverage +
       evShare * CONTRIBUTION_WEIGHTS.evidenceContribution +
       consistencyShare * CONTRIBUTION_WEIGHTS.processConsistency) * 100
    );

    // Factual explainable evidence narrative — NO subjective judgments
    const factualSummary = `${m.name} completed ${m.completedTasksCount} tasks (${m.completedWorkloadHours} workload hours), contributed to ${m.coveredRequirementsCount} requirements with ${m.evidenceCount} verified evidence items across ${m.activeDaysCount} active days.`;

    return {
      ...m,
      compositeScore,
      dimensionalShares: {
        taskWorkload: Math.round(workloadShare * 100),
        requirementCoverage: Math.round(reqShare * 100),
        evidenceContribution: Math.round(evShare * 100),
        processConsistency: Math.round(consistencyShare * 100),
      },
      factualSummary,
    };
  });

  return {
    projectId: projectId.toString(),
    status: "COMPUTED",
    weights: CONTRIBUTION_WEIGHTS,
    formulaExplanation: "Composite Score = 40% Workload Hours + 25% Requirement Coverage + 20% Evidence Items + 15% Active Consistency",
    members: analyzedMembers,
    disputes: disputes.map(d => ({
      id: d._id.toString(),
      studentId: d.studentId.toString(),
      studentName: d.studentName,
      category: d.disputeCategory,
      description: d.description,
      status: d.status,
      resolutionNotes: d.resolutionNotes,
    })),
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Filter contribution data for a specific student's self-inspection view.
 */
export async function getStudentContributionView(projectId, studentId) {
  const fullAnalysis = await calculateProjectContribution(projectId);
  const student = (fullAnalysis.members || []).find(m => m.memberId === studentId.toString());

  const studentDisputes = (fullAnalysis.disputes || []).filter(
    d => d.studentId === studentId.toString()
  );

  return {
    projectId,
    student: student || null,
    weights: fullAnalysis.weights,
    formulaExplanation: fullAnalysis.formulaExplanation,
    disputes: studentDisputes,
    isPersonalView: true,
  };
}

/**
 * Create a contribution dispute record.
 */
export async function createContributionDispute({
  projectId,
  studentId,
  studentName = "Student",
  disputeCategory,
  description,
  evidenceUrls = [],
}) {
  if (!projectId || !studentId || !description) {
    throw new Error("projectId, studentId, and description are required.");
  }

  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");

  const dispute = await ContributionDispute.create({
    projectId,
    teamId: project.teamId,
    studentId,
    studentName,
    disputeCategory: disputeCategory || "MISSING_ACTIVITY",
    description,
    evidenceUrls,
    status: "PENDING",
  });

  await recordProjectEvent({
    projectId,
    teamId: project.teamId,
    actorId: studentId,
    actorName: studentName,
    eventType: "CONTRIBUTION_DISPUTE_FILED",
    entityType: "contribution",
    entityId: dispute._id.toString(),
    title: `Contribution dispute filed by ${studentName}`,
    description: `Category: ${dispute.disputeCategory} — ${description.slice(0, 80)}`,
    source: "user",
  });

  return dispute;
}

/**
 * Resolve a contribution dispute.
 */
export async function resolveContributionDispute(
  disputeId,
  { status, resolutionNotes },
  resolverId,
  resolverName = "Faculty"
) {
  const dispute = await ContributionDispute.findById(disputeId);
  if (!dispute) throw new Error("Contribution dispute not found.");

  dispute.status = status || "RESOLVED";
  dispute.resolutionNotes = resolutionNotes || "";
  dispute.resolvedBy = resolverId;
  dispute.resolvedAt = new Date();
  await dispute.save();

  await recordProjectEvent({
    projectId: dispute.projectId,
    teamId: dispute.teamId,
    actorId: resolverId,
    actorName: resolverName,
    eventType: "CONTRIBUTION_DISPUTE_RESOLVED",
    entityType: "contribution",
    entityId: dispute._id.toString(),
    title: `Contribution dispute ${dispute.status}`,
    description: resolutionNotes || `Resolved by ${resolverName}`,
    source: "teacher",
  });

  return dispute;
}
