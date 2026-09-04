/**
 * server/services/phaseGateService.js
 * ============================================================================
 * WATERFALL PHASE GATE EVALUATION SERVICE
 *
 * Deterministic phase-gate verification for Waterfall methodology:
 *   Requirements → Design → Implementation → Testing → Deployment → Maintenance
 *
 * Enforces:
 *   - Prerequisite checking without fake hardcoded pass
 *   - Clear blockers and warnings
 *   - Server-side authorization for approvals & overrides
 *   - Audit history & ProjectEvent emission
 * ============================================================================
 */

import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import Risk from "../models/Risk.js";
import ArchitectureComponent from "../models/ArchitectureComponent.js";
import { recordProjectEvent } from "./eventService.js";

export const WATERFALL_PHASES = [
  "requirements",
  "design",
  "implementation",
  "testing",
  "deployment",
  "maintenance",
];

export const PHASE_DISPLAY_NAMES = {
  requirements: "Requirements",
  design: "System Design",
  implementation: "Implementation",
  testing: "Verification & QA",
  deployment: "Deployment",
  maintenance: "Maintenance & Review",
};

/**
 * Evaluate the phase gate for a given project.
 */
export async function evaluateProjectPhaseGate(projectId) {
  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  const currentPhase = project.waterfallPhase || "requirements";
  const phaseIndex = WATERFALL_PHASES.indexOf(currentPhase);
  const isFinalPhase = phaseIndex === WATERFALL_PHASES.length - 1;
  const targetPhase = isFinalPhase ? null : WATERFALL_PHASES[phaseIndex + 1];

  const [tasks, risks, archComponents] = await Promise.all([
    Task.find({ teamId: project.teamId }).lean(),
    Risk.find({ projectId, status: "open" }).lean(),
    ArchitectureComponent.find({ projectId }).lean(),
  ]);

  const reqs = project.requirements || [];
  const artifacts = project.artifacts || [];

  const checks = [];
  const blockers = [];
  const warnings = [];

  // Check if this phase was already overridden by team leader
  const activeOverride = (project.phaseGateOverrides || []).find(
    (o) => o.phase === currentPhase
  );

  let completion = 0;

  switch (currentPhase) {
    case "requirements": {
      // 1. Minimum requirements captured
      const hasReqs = reqs.length >= 1;
      checks.push({
        id: "req_exists",
        label: "Software Requirements Specification (SRS) defined",
        passed: hasReqs,
        details: hasReqs ? `${reqs.length} requirements defined` : "No requirements created yet",
        required: true,
      });
      if (!hasReqs) blockers.push("At least one requirement must be defined in the Plan tab.");

      // 2. Approved requirements ratio
      const approvedCount = reqs.filter((r) => r.status === "approved" || r.status === "verified").length;
      const approvalRatio = reqs.length > 0 ? approvedCount / reqs.length : 0;
      const approvalsPass = approvalRatio >= 0.6 || approvedCount >= 2;
      checks.push({
        id: "req_approved",
        label: "Core requirements reviewed and approved",
        passed: approvalsPass,
        details: `${approvedCount} of ${reqs.length} requirements approved (${Math.round(approvalRatio * 100)}%)`,
        required: true,
      });
      if (hasReqs && !approvalsPass) {
        blockers.push("At least 60% of requirements must be reviewed and marked 'Approved'.");
      }

      // 3. Project context exists
      const hasContext = Boolean(
        project.description ||
        (project.context && project.context.problemStatement) ||
        artifacts.length > 0
      );
      checks.push({
        id: "project_context",
        label: "Project problem statement and scope defined",
        passed: hasContext,
        details: hasContext ? "Project context and scope documented" : "Project problem statement missing",
        required: false,
      });
      if (!hasContext) warnings.push("Project context or problem statement is empty.");

      completion = Math.round(
        ((hasReqs ? 50 : 0) + (approvalsPass ? 35 : 0) + (hasContext ? 15 : 0))
      );
      break;
    }

    case "design": {
      // 1. Design deliverables / Architecture
      const hasArch = archComponents.length > 0;
      const hasDesignArtifacts = artifacts.some(
        (a) => a.artifactType === "diagram" || a.artifactType === "spec" || a.name.toLowerCase().includes("design")
      );
      const designReqs = reqs.filter((r) => r.phase === "design");
      const designPass = hasArch || hasDesignArtifacts || designReqs.length > 0;

      checks.push({
        id: "design_specs",
        label: "System architecture and module specs documented",
        passed: designPass,
        details: hasArch
          ? `${archComponents.length} architecture components defined`
          : hasDesignArtifacts
          ? "Design artifact/diagram uploaded"
          : "Design requirements documented",
        required: true,
      });
      if (!designPass) blockers.push("System design specs or architecture components must be created.");

      // 2. High severity design risks
      const critRisks = risks.filter((r) => r.severity === "critical");
      const risksPass = critRisks.length === 0;
      checks.push({
        id: "design_risks",
        label: "No unresolved critical architecture risks",
        passed: risksPass,
        details: risksPass ? "Zero critical architectural risks" : `${critRisks.length} critical risk(s) open`,
        required: true,
      });
      if (!risksPass) blockers.push("All critical architecture/design risks must be resolved before coding begins.");

      completion = Math.round(((designPass ? 60 : 0) + (risksPass ? 40 : 0)));
      break;
    }

    case "implementation": {
      // 1. Implementation tasks completion
      const implTasks = tasks.filter((t) => !t.phase || t.phase === "implementation");
      const doneImpl = implTasks.filter((t) => t.status === "done").length;
      const implRatio = implTasks.length > 0 ? doneImpl / implTasks.length : 0;
      const implPass = implTasks.length === 0 ? false : implRatio >= 0.7;

      checks.push({
        id: "impl_tasks_done",
        label: "At least 70% of implementation tasks completed",
        passed: implPass,
        details: implTasks.length > 0 ? `${doneImpl}/${implTasks.length} tasks completed (${Math.round(implRatio * 100)}%)` : "No implementation tasks found",
        required: true,
      });
      if (!implPass) blockers.push(`Implementation tasks must reach ≥70% completion (currently ${Math.round(implRatio * 100)}%).`);

      // 2. No blocked tasks with unresolved prerequisites
      const blockedTasks = tasks.filter((t) => t.status === "blocked");
      const noBlocked = blockedTasks.length === 0;
      checks.push({
        id: "no_blocked_tasks",
        label: "No blocked tasks with unresolved dependencies",
        passed: noBlocked,
        details: noBlocked ? "Zero blocked tasks" : `${blockedTasks.length} task(s) currently blocked`,
        required: false,
      });
      if (!noBlocked) warnings.push(`${blockedTasks.length} task(s) are blocked by dependencies.`);

      completion = Math.round(((implPass ? 70 : implRatio * 70) + (noBlocked ? 30 : 0)));
      break;
    }

    case "testing": {
      // 1. QA / Verification tasks
      const qaTasks = tasks.filter((t) => t.phase === "testing");
      const doneQa = qaTasks.filter((t) => t.status === "done").length;
      const qaRatio = qaTasks.length > 0 ? doneQa / qaTasks.length : 1; // if no specific qa tasks, overall done ratio
      const allDone = tasks.filter((t) => t.status === "done").length;
      const overallRatio = tasks.length > 0 ? allDone / tasks.length : 0;
      const qaPass = qaTasks.length > 0 ? qaRatio >= 0.8 : overallRatio >= 0.8;

      checks.push({
        id: "qa_verification",
        label: "Testing verification tasks complete (≥80%)",
        passed: qaPass,
        details: qaTasks.length > 0
          ? `${doneQa}/${qaTasks.length} QA tasks passed`
          : `${allDone}/${tasks.length} total tasks verified (${Math.round(overallRatio * 100)}%)`,
        required: true,
      });
      if (!qaPass) blockers.push("Verification tasks and test criteria must be at least 80% complete.");

      // 2. Zero critical defect risks
      const critRisks = risks.filter((r) => r.severity === "critical");
      const noCritRisks = critRisks.length === 0;
      checks.push({
        id: "no_critical_defects",
        label: "No unresolved critical defects or security risks",
        passed: noCritRisks,
        details: noCritRisks ? "Zero critical defects" : `${critRisks.length} critical defect(s) pending`,
        required: true,
      });
      if (!noCritRisks) blockers.push("All critical defects and risks must be resolved before deployment.");

      completion = Math.round(((qaPass ? 60 : 0) + (noCritRisks ? 40 : 0)));
      break;
    }

    case "deployment": {
      // 1. Overall tasks finished
      const total = tasks.length;
      const done = tasks.filter((t) => t.status === "done").length;
      const deployPass = total === 0 ? false : done / total >= 0.9;

      checks.push({
        id: "deploy_readiness",
        label: "All project deliverables completed (≥90%)",
        passed: deployPass,
        details: total > 0 ? `${done}/${total} tasks finished (${Math.round((done / total) * 100)}%)` : "No tasks created",
        required: true,
      });
      if (!deployPass) blockers.push("At least 90% of total project tasks must be marked Done.");

      completion = Math.round((deployPass ? 100 : total > 0 ? (done / total) * 100 : 0));
      break;
    }

    case "maintenance": {
      checks.push({
        id: "final_phase",
        label: "Project in active maintenance & review",
        passed: true,
        details: "Final phase reached. Project is delivered and operational.",
        required: false,
      });
      completion = 100;
      break;
    }
  }

  const allRequiredPassed = checks.filter((c) => c.required).every((c) => c.passed);
  const isOverridden = Boolean(activeOverride);
  const canAdvance = !isFinalPhase && (allRequiredPassed || isOverridden);

  let status = "BLOCKED";
  if (isFinalPhase) {
    status = "COMPLETED";
  } else if (isOverridden) {
    status = "OVERRIDDEN";
  } else if (allRequiredPassed) {
    status = "READY";
  } else if (blockers.length > 0) {
    status = "BLOCKED";
  } else {
    status = "APPROVAL_REQUIRED";
  }

  return {
    canAdvance,
    currentPhase,
    currentPhaseLabel: PHASE_DISPLAY_NAMES[currentPhase] || currentPhase,
    targetPhase,
    targetPhaseLabel: targetPhase ? PHASE_DISPLAY_NAMES[targetPhase] : null,
    status,
    completion,
    checks,
    blockers,
    warnings,
    requiresApproval: !isFinalPhase && allRequiredPassed,
    isOverridden,
    overrideRecord: activeOverride || null,
    history: project.phaseGateHistory || [],
  };
}

/**
 * Advance project to the next Waterfall phase.
 * Enforces server-side authorization: user must be team leader or owner.
 */
export async function advanceProjectPhase({ projectId, teamId, userId, userName }) {
  const [project, team] = await Promise.all([
    Project.findById(projectId),
    Team.findById(teamId),
  ]);

  if (!project) throw new Error("Project not found");
  if (!team) throw new Error("Team not found");

  // Server-side Authorization check
  const isLeader =
    team.leaderId?.toString() === userId?.toString() ||
    team.members?.some(
      (m) => m.userId?.toString() === userId?.toString() && (m.role === "leader" || m.role === "owner")
    );

  if (!isLeader) {
    const err = new Error("Unauthorized: Only team leaders can approve and advance phase gates.");
    err.statusCode = 403;
    throw err;
  }

  const evaluation = await evaluateProjectPhaseGate(projectId);
  if (!evaluation.canAdvance) {
    const err = new Error(`Cannot advance phase: ${evaluation.blockers.join(" ")}`);
    err.statusCode = 400;
    err.blockers = evaluation.blockers;
    throw err;
  }

  const fromPhase = project.waterfallPhase;
  const toPhase = evaluation.targetPhase;
  if (!toPhase) {
    const err = new Error("Project is already in the final phase.");
    err.statusCode = 400;
    throw err;
  }

  // Update phase
  project.waterfallPhase = toPhase;
  project.derivedVersion = (project.derivedVersion || 1) + 1;
  project.lastCalculatedAt = new Date();

  project.phaseGateHistory.push({
    action: evaluation.isOverridden ? "ADVANCED_WITH_OVERRIDE" : "ADVANCED",
    fromPhase,
    toPhase,
    actorId: userId,
    actorName: userName || "Team Leader",
    reason: evaluation.isOverridden ? `Overridden: ${evaluation.overrideRecord?.reason}` : "Prerequisites verified",
    snapshot: {
      checks: evaluation.checks,
      completion: evaluation.completion,
    },
    timestamp: new Date(),
  });

  await project.save();

  // Record audit event
  await recordProjectEvent({
    projectId: project._id,
    teamId: team._id,
    actorId: userId,
    actorName: userName || "Team Leader",
    eventType: "PHASE_COMPLETED",
    entityType: "phase_gate",
    entityId: fromPhase,
    title: `Phase Gate Cleared: ${PHASE_DISPLAY_NAMES[fromPhase]} → ${PHASE_DISPLAY_NAMES[toPhase]}`,
    description: `Team advanced project from ${PHASE_DISPLAY_NAMES[fromPhase]} to ${PHASE_DISPLAY_NAMES[toPhase]}.`,
    previousValue: fromPhase,
    newValue: toPhase,
    metadata: {
      fromPhase,
      toPhase,
      isOverridden: evaluation.isOverridden,
    },
    source: "phase_gate_engine",
  });

  return {
    success: true,
    fromPhase,
    toPhase,
    waterfallPhase: toPhase,
  };
}

/**
 * Override a blocked phase gate with explicit reason and audit trail.
 * Enforces server-side authorization: user must be team leader.
 */
export async function overrideProjectPhaseGate({
  projectId,
  teamId,
  userId,
  userName,
  phase,
  reason,
}) {
  if (!reason || reason.trim().length < 5) {
    const err = new Error("An explicit override reason (at least 5 characters) is required.");
    err.statusCode = 400;
    throw err;
  }

  const [project, team] = await Promise.all([
    Project.findById(projectId),
    Team.findById(teamId),
  ]);

  if (!project) throw new Error("Project not found");
  if (!team) throw new Error("Team not found");

  // Server-side Authorization check
  const isLeader =
    team.leaderId?.toString() === userId?.toString() ||
    team.members?.some(
      (m) => m.userId?.toString() === userId?.toString() && (m.role === "leader" || m.role === "owner")
    );

  if (!isLeader) {
    const err = new Error("Unauthorized: Only team leaders can override phase gates.");
    err.statusCode = 403;
    throw err;
  }

  const targetPhase = phase || project.waterfallPhase;

  // Add or update override
  const existingIdx = (project.phaseGateOverrides || []).findIndex(
    (o) => o.phase === targetPhase
  );

  const overrideEntry = {
    phase: targetPhase,
    overriddenBy: userId,
    overriddenAt: new Date(),
    reason: reason.trim(),
    previousStatus: "BLOCKED",
  };

  if (existingIdx >= 0) {
    project.phaseGateOverrides[existingIdx] = overrideEntry;
  } else {
    project.phaseGateOverrides.push(overrideEntry);
  }

  project.phaseGateHistory.push({
    action: "OVERRIDDEN",
    fromPhase: targetPhase,
    toPhase: null,
    actorId: userId,
    actorName: userName || "Team Leader",
    reason: reason.trim(),
    snapshot: { targetPhase },
    timestamp: new Date(),
  });

  project.derivedVersion = (project.derivedVersion || 1) + 1;
  project.lastCalculatedAt = new Date();

  await project.save();

  // Record audit event
  await recordProjectEvent({
    projectId: project._id,
    teamId: team._id,
    actorId: userId,
    actorName: userName || "Team Leader",
    eventType: "PHASE_GATE_OVERRIDDEN",
    entityType: "phase_gate",
    entityId: targetPhase,
    title: `Phase Gate Overridden: ${PHASE_DISPLAY_NAMES[targetPhase] || targetPhase}`,
    description: `Leader recorded manual override. Reason: "${reason.trim()}"`,
    previousValue: "BLOCKED",
    newValue: "OVERRIDDEN",
    metadata: {
      phase: targetPhase,
      reason: reason.trim(),
    },
    source: "phase_gate_engine",
  });

  return {
    success: true,
    phase: targetPhase,
    override: overrideEntry,
  };
}
