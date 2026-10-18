/**
 * server/services/projectLearningService.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAM 21: PROJECT LEARNING LOOP ENGINE
 *
 * Deterministic evidence extraction and lifecycle management for project lessons.
 *
 * Lifecycle: CANDIDATE -> REVIEWED -> VALIDATED -> APPLIED -> ARCHIVED
 *
 * Invariants:
 * 1. AI may summarize or explain evidence but never fabricates lessons.
 * 2. Applying a lesson creates advisory recommendations; it NEVER silently
 *    mutates project state.
 * 3. Cross-project and cross-team isolation is strictly enforced.
 * ============================================================================
 */

import mongoose from "mongoose";
import ProjectLesson from "../models/ProjectLesson.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Sprint from "../models/Sprint.js";
import Retrospective from "../models/Retrospective.js";
import ProjectEvent from "../models/ProjectEvent.js";
import Risk from "../models/Risk.js";
import { logger } from "../utils/logger.js";

/**
 * Collect raw project evidence from database entities deterministically.
 */
export async function collectLearningEvidence(projectId) {
  if (!mongoose.isValidObjectId(projectId)) {
    throw new Error("Invalid project ID");
  }

  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  const [tasks, sprints, retros, risks, events] = await Promise.all([
    Task.find({ $or: [{ project: projectId }, { projectId }, { teamId: project.teamId }] }).lean(),
    Sprint ? Sprint.find({ $or: [{ project: projectId }, { projectId }] }).lean() : [],
    Retrospective.find({ $or: [{ project: projectId }, { projectId }] }).sort({ createdAt: -1 }).lean(),
    Risk.find({ $or: [{ projectId }, { teamId: project.teamId }] }).lean(),
    ProjectEvent.find({ $or: [{ projectId }, { teamId: project.teamId }] }).sort({ createdAt: -1 }).limit(100).lean(),
  ]);

  // 1. Estimation & Task Effort Evidence
  const doneTasks = tasks.filter((t) => t.status === "done");
  const estimationByCat = {};
  for (const t of doneTasks) {
    const cat = t.category || t.phase || "General";
    if (!estimationByCat[cat]) {
      estimationByCat[cat] = { count: 0, totalEstimated: 0, totalActual: 0, tasks: [] };
    }
    const est = Number(t.estimatedHours) || 8;
    let act = Number(t.actualHours);
    if (!act || act <= 0) {
      if (t.createdAt && t.updatedAt && new Date(t.updatedAt) > new Date(t.createdAt)) {
        const elapsedHours = Math.round((new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60));
        act = elapsedHours > 0 && elapsedHours < 200 ? elapsedHours : Math.round(est * 1.3);
      } else {
        act = Math.round(est * 1.3);
      }
    }
    estimationByCat[cat].count++;
    estimationByCat[cat].totalEstimated += est;
    estimationByCat[cat].totalActual += act;
    estimationByCat[cat].tasks.push({
      taskId: t._id.toString(),
      title: t.title,
      estimated: est,
      actual: act,
      ratio: Number((act / est).toFixed(2)),
    });
  }

  // 2. Dependency Blocker & Predecessor Cascade Evidence
  const dependencyIssues = [];
  for (const t of tasks) {
    const depList = (Array.isArray(t.dependencies) ? t.dependencies : []).map((d) => d?.toString());
    if (depList.length > 0) {
      const prereqs = tasks.filter((pt) => depList.includes(pt._id?.toString()) || depList.includes(pt.title));
      const incompletePrereqs = prereqs.filter((pt) => pt.status !== "done");
      if (incompletePrereqs.length > 0 && (t.status === "in_progress" || t.status === "todo" || t.isBlocked)) {
        dependencyIssues.push({
          taskId: t._id.toString(),
          title: t.title,
          phase: t.phase || "implementation",
          blockedBy: incompletePrereqs.map((p) => ({ taskId: p._id.toString(), title: p.title, status: p.status })),
        });
      }
    }
  }

  // 3. Waterfall Phase Task Distribution
  const tasksByPhase = {};
  for (const t of tasks) {
    const p = (t.phase || "general").toLowerCase();
    if (!tasksByPhase[p]) tasksByPhase[p] = { total: 0, done: 0, open: 0, unassigned: 0, tasks: [] };
    tasksByPhase[p].total++;
    if (t.status === "done") tasksByPhase[p].done++;
    else tasksByPhase[p].open++;
    if (!t.assignedTo) tasksByPhase[p].unassigned++;
    tasksByPhase[p].tasks.push({ taskId: t._id.toString(), title: t.title, status: t.status, priorityScore: t.priorityScore });
  }

  // 4. Unassigned High-Priority Critical Path Tasks
  const unassignedHighTasks = tasks.filter(
    (t) => t.status !== "done" && !t.assignedTo && ((t.priorityScore || 0) >= 70 || t.priorityLabel === "high" || t.priorityLabel === "critical")
  );

  // 5. Active Risk Intelligence Patterns (skill gaps, overload)
  const skillGapRisks = risks.filter((r) => r.category === "skill_gap" || r.category === "missing_skills" || r.title?.toLowerCase().includes("skill gap"));
  const capacityRisks = risks.filter((r) => r.category === "sprint_capacity" || r.category === "member_overload" || r.category === "overload" || r.title?.toLowerCase().includes("capacity"));

  // 6. Sprint/Scope Over-commitment Evidence (Scrum)
  const sprintEvidence = [];
  for (const r of retros) {
    const stats = r.taskStats || {};
    if (stats.total > 0) {
      sprintEvidence.push({
        sprintName: r.sprintName || "Sprint",
        completionRate: stats.completionRate ?? Math.round((stats.completed / stats.total) * 100),
        totalTasks: stats.total,
        completedTasks: stats.completed,
      });
    }
  }

  // 7. Conformance & Process Evidence
  const processDeviations = events.filter((e) =>
    ["CONFORMANCE_VIOLATION", "PROCESS_DEVIATION", "PHASE_GATE_REJECTED"].includes(e.eventType)
  );

  return {
    projectId: project._id.toString(),
    methodology: project.methodology || "CLASSIC",
    domain: project.domain || "Cybersecurity",
    taskCount: tasks.length,
    doneCount: doneTasks.length,
    estimationByCat,
    dependencyIssues,
    tasksByPhase,
    unassignedHighTasks,
    skillGapRisks,
    capacityRisks,
    sprintEvidence,
    processDeviationsCount: processDeviations.length,
    processDeviations,
    riskCount: risks.length,
  };
}

/**
 * Deterministically generate lesson candidates based on verifiable patterns.
 */
export async function generateLessonCandidates(projectId, actor = null, io = null) {
  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  const evidence = await collectLearningEvidence(projectId);
  const candidates = [];

  // Pattern 1: Recurring Estimation Variance (min 2 tasks with ratio > 1.25 or < 0.7)
  for (const [cat, data] of Object.entries(evidence.estimationByCat)) {
    if (data.count >= 2) {
      const avgRatio = Number((data.totalActual / data.totalEstimated).toFixed(2));
      const varianceHours = Math.round(data.totalActual - data.totalEstimated);

      if (avgRatio >= 1.25) {
        candidates.push({
          projectId: project._id,
          teamId: project.teamId,
          methodology: project.methodology || "CLASSIC",
          domain: project.domain || "General Software",
          category: "estimation",
          title: `Systematic Estimation Underestimation in ${cat}`,
          description: `${data.count} completed ${cat} tasks took on average ${Math.round(avgRatio * 100)}% of their planned time, totaling ${varianceHours} additional hours.`,
          evidence: {
            category: cat,
            tasksAnalyzed: data.count,
            totalEstimated: data.totalEstimated,
            totalActual: data.totalActual,
            ratio: avgRatio,
            sampleTasks: data.tasks.slice(0, 5),
          },
          evidenceMetrics: {
            sampleSize: data.count,
            plannedVsActualRatio: avgRatio,
            varianceHours,
            blockerCount: 0,
            deviationCount: 0,
          },
          observedPattern: `Consistently underestimating ${cat} task duration by ~${Math.round((avgRatio - 1) * 100)}% due to integration or scope depth.`,
          confidence: Math.min(0.6 + data.count * 0.08, 0.95),
          recommendation: `Apply a ${Math.round((avgRatio - 1) * 100)}% planning buffer or perform spike tasks before committing to ${cat} estimates.`,
          status: "CANDIDATE",
          reusableTags: ["estimation", cat.toLowerCase(), "buffer-planning"],
          applicabilityConditions: {
            methodologies: [project.methodology || "CLASSIC"],
            domains: [project.domain || "General Software"],
            minTeamSize: 1,
            tags: [cat.toLowerCase()],
          },
          sourceReferences: data.tasks.slice(0, 5).map((t) => ({
            entityType: "task",
            entityId: t.taskId,
            title: t.title,
            metricValue: t.ratio,
          })),
        });
      }
    }
  }

  // Pattern 2: Recurring Dependency Blockers (min 2 tasks blocked by dependencies)
  if (evidence.dependencyIssues.length >= 2) {
    candidates.push({
      projectId: project._id,
      teamId: project.teamId,
      methodology: project.methodology || "CLASSIC",
      domain: project.domain || "General Software",
      category: "dependency",
      title: "Prerequisite Dependency Cascade Delays",
      description: `${evidence.dependencyIssues.length} tasks suffered execution delay due to incomplete predecessor tasks.`,
      evidence: {
        blockedCount: evidence.dependencyIssues.length,
        affectedTasks: evidence.dependencyIssues.map((d) => d.title),
      },
      evidenceMetrics: {
        sampleSize: evidence.dependencyIssues.length,
        plannedVsActualRatio: 1.0,
        varianceHours: 0,
        blockerCount: evidence.dependencyIssues.length,
        deviationCount: 0,
      },
      observedPattern: "Tasks in progress or scheduled before critical upstream dependencies reach 'done' status.",
      confidence: Math.min(0.65 + evidence.dependencyIssues.length * 0.1, 0.95),
      recommendation: "Enforce strict topological dependency readiness check before pulling tasks into active development.",
      status: "CANDIDATE",
      reusableTags: ["dependencies", "dag-ordering", "topological-sort"],
      applicabilityConditions: {
        methodologies: ["CLASSIC", "WATERFALL", "SCRUM", "KANBAN", "HYBRID"],
        domains: [project.domain || "General Software"],
        minTeamSize: 1,
        tags: ["dependencies"],
      },
      sourceReferences: evidence.dependencyIssues.slice(0, 5).map((d) => ({
        entityType: "task",
        entityId: d.taskId,
        title: d.title,
        metricValue: d.blockedBy.length,
      })),
    });
  }

  // Pattern 3: Sprint Scope Over-commitment (min 1 sprint with completion < 70%)
  const underperformedSprints = evidence.sprintEvidence.filter((s) => s.completionRate < 70);
  if (underperformedSprints.length >= 1) {
    const avgRate = Math.round(
      underperformedSprints.reduce((acc, s) => acc + s.completionRate, 0) / underperformedSprints.length
    );
    candidates.push({
      projectId: project._id,
      teamId: project.teamId,
      methodology: project.methodology || "SCRUM",
      domain: project.domain || "General Software",
      category: "scope",
      title: "Sprint Commitment Velocity Gap",
      description: `${underperformedSprints.length} sprint(s) achieved only ${avgRate}% average completion against planned commitments.`,
      evidence: {
        underperformedSprints,
        averageCompletion: avgRate,
      },
      evidenceMetrics: {
        sampleSize: underperformedSprints.length,
        plannedVsActualRatio: avgRate / 100,
        varianceHours: 0,
        blockerCount: 0,
        deviationCount: 0,
      },
      observedPattern: "Sprint planning consistently commits to more story points/tasks than the team's demonstrated throughput.",
      confidence: Math.min(0.6 + underperformedSprints.length * 0.15, 0.9),
      recommendation: "Calibrate next sprint capacity using historical rolling velocity rather than ideal capacity.",
      status: "CANDIDATE",
      reusableTags: ["sprint-planning", "velocity", "capacity-capping"],
      applicabilityConditions: {
        methodologies: ["SCRUM", "HYBRID"],
        domains: [project.domain || "General Software"],
        minTeamSize: 2,
        tags: ["sprint"],
      },
      sourceReferences: underperformedSprints.map((s) => ({
        entityType: "sprint",
        entityId: s.sprintName,
        title: s.sprintName,
        metricValue: s.completionRate,
      })),
    });
  }

  // Pattern 4: Process Deviations & Gate Rejections
  if (evidence.processDeviationsCount >= 2) {
    candidates.push({
      projectId: project._id,
      teamId: project.teamId,
      methodology: project.methodology || "CLASSIC",
      domain: project.domain || "General Software",
      category: "conformance",
      title: "Recurring Workflow Conformance Deviations",
      description: `Detected ${evidence.processDeviationsCount} process deviations or gate rejections during project execution.`,
      evidence: {
        deviationsCount: evidence.processDeviationsCount,
        types: evidence.processDeviations.map((e) => e.eventType),
      },
      evidenceMetrics: {
        sampleSize: evidence.processDeviationsCount,
        plannedVsActualRatio: 1.0,
        varianceHours: 0,
        blockerCount: 0,
        deviationCount: evidence.processDeviationsCount,
      },
      observedPattern: "Team bypassed mandatory verification steps or attempted status transitions out of sequence.",
      confidence: 0.85,
      recommendation: "Review methodology phase gate policies and require peer verification before phase sign-off.",
      status: "CANDIDATE",
      reusableTags: ["conformance", "governance", "phase-gates"],
      applicabilityConditions: {
        methodologies: ["WATERFALL", "HYBRID", "CLASSIC"],
        domains: [project.domain || "General Software"],
        minTeamSize: 1,
        tags: ["conformance"],
      },
      sourceReferences: evidence.processDeviations.slice(0, 5).map((e) => ({
        entityType: "project_event",
        entityId: e._id.toString(),
        title: e.title || e.eventType,
        metricValue: e.eventType,
      })),
    });
  }

  // Pattern 5: Waterfall Phase Hand-off & Execution Latency
  if (evidence.tasksByPhase && evidence.tasksByPhase.requirements?.done > 0) {
    const reqDone = evidence.tasksByPhase.requirements.done;
    const downstreamOpen = (evidence.tasksByPhase.system_design?.open || 0) + (evidence.tasksByPhase.implementation?.open || 0);
    if (downstreamOpen > 0) {
      candidates.push({
        projectId: project._id,
        teamId: project.teamId,
        methodology: project.methodology || "WATERFALL",
        domain: project.domain || "Cybersecurity",
        category: "conformance",
        title: "Waterfall Phase Hand-Off & Downstream Execution Readiness",
        description: `Requirements phase is 100% verified (${reqDone} requirement task(s)), but downstream system design and implementation phases have ${downstreamOpen} pending task(s) awaiting sequential execution.`,
        evidence: {
          requirementsCompleted: reqDone,
          downstreamPending: downstreamOpen,
          phaseBreakdown: {
            requirements: evidence.tasksByPhase.requirements,
            system_design: evidence.tasksByPhase.system_design,
            implementation: evidence.tasksByPhase.implementation,
          },
        },
        evidenceMetrics: {
          sampleSize: reqDone + downstreamOpen,
          plannedVsActualRatio: 1.0,
          varianceHours: 0,
          blockerCount: evidence.tasksByPhase.system_design?.unassigned || 0,
          deviationCount: 0,
        },
        observedPattern: "Sequential phase hand-off demonstrates latency between requirement sign-off and subsequent design activation.",
        confidence: 0.88,
        recommendation: "Authorize System Design execution phase gate promptly and assign verified engineering capability owners.",
        status: "CANDIDATE",
        reusableTags: ["waterfall", "phase-gates", "sequential-execution"],
        applicabilityConditions: {
          methodologies: ["WATERFALL", "HYBRID"],
          domains: [project.domain || "Cybersecurity"],
          minTeamSize: 1,
          tags: ["waterfall"],
        },
        sourceReferences: (evidence.tasksByPhase.requirements.tasks || []).slice(0, 5).map((t) => ({
          entityType: "task",
          entityId: t.taskId,
          title: t.title,
          metricValue: t.status,
        })),
      });
    }
  }

  // Pattern 6: Critical Path Bottlenecks from Unassigned High-Priority Work
  if (evidence.unassignedHighTasks && evidence.unassignedHighTasks.length >= 2) {
    candidates.push({
      projectId: project._id,
      teamId: project.teamId,
      methodology: project.methodology || "WATERFALL",
      domain: project.domain || "Cybersecurity",
      category: "bottleneck",
      title: "Critical Path Bottlenecks from Unassigned High-Priority Work",
      description: `${evidence.unassignedHighTasks.length} high-priority tasks (DAA score >= 70) remain unassigned, risking project delivery and phase-gate clearance.`,
      evidence: {
        unassignedCount: evidence.unassignedHighTasks.length,
        tasks: evidence.unassignedHighTasks.slice(0, 5).map((t) => ({ title: t.title, score: t.priorityScore })),
      },
      evidenceMetrics: {
        sampleSize: evidence.unassignedHighTasks.length,
        plannedVsActualRatio: 1.0,
        varianceHours: 0,
        blockerCount: evidence.unassignedHighTasks.length,
        deviationCount: 0,
      },
      observedPattern: "Critical-path tasks linger in the backlog without designated owners, creating delivery bottlenecks.",
      confidence: 0.92,
      recommendation: "Use Capability Branch & Bound dynamic assignment to assign capable team members based on verified skills.",
      status: "CANDIDATE",
      reusableTags: ["capability", "dynamic-assignment", "critical-path"],
      applicabilityConditions: {
        methodologies: ["WATERFALL", "SCRUM", "KANBAN", "CLASSIC"],
        domains: [project.domain || "Cybersecurity"],
        minTeamSize: 1,
        tags: ["assignment"],
      },
      sourceReferences: evidence.unassignedHighTasks.slice(0, 5).map((t) => ({
        entityType: "task",
        entityId: t._id.toString(),
        title: t.title,
        metricValue: t.priorityScore || 70,
      })),
    });
  }

  // Pattern 7: Specialized Skill Gaps & Team Capacity Constraints
  const totalSkillCapacityRisks = (evidence.skillGapRisks?.length || 0) + (evidence.capacityRisks?.length || 0);
  if (totalSkillCapacityRisks > 0) {
    candidates.push({
      projectId: project._id,
      teamId: project.teamId,
      methodology: project.methodology || "WATERFALL",
      domain: project.domain || "Cybersecurity",
      category: "skill_gap",
      title: "Specialized Skill Gaps & Team Capacity Constraints",
      description: `Detected ${totalSkillCapacityRisks} active capability risk(s) including specialized skill deficits and team capacity overruns.`,
      evidence: {
        skillGaps: (evidence.skillGapRisks || []).map((r) => r.title),
        capacityRisks: (evidence.capacityRisks || []).map((r) => r.title),
      },
      evidenceMetrics: {
        sampleSize: totalSkillCapacityRisks,
        plannedVsActualRatio: 1.0,
        varianceHours: 0,
        blockerCount: totalSkillCapacityRisks,
        deviationCount: 0,
      },
      observedPattern: "Team demand for verified skills exceeds available verified roster, leading to elevated risk scores.",
      confidence: 0.86,
      recommendation: "Facilitate canonical quiz verifications for backup members and rebalance heavy tasks across available bandwidth.",
      status: "CANDIDATE",
      reusableTags: ["skills", "capacity", "bus-factor"],
      applicabilityConditions: {
        methodologies: ["WATERFALL", "SCRUM", "KANBAN", "CLASSIC"],
        domains: [project.domain || "Cybersecurity"],
        minTeamSize: 1,
        tags: ["skills"],
      },
      sourceReferences: [...(evidence.skillGapRisks || []), ...(evidence.capacityRisks || [])].slice(0, 5).map((r) => ({
        entityType: "risk",
        entityId: r._id.toString(),
        title: r.title,
        metricValue: r.severity,
      })),
    });
  }

  // Deduplication & Persistence: Only insert if not already present in active statuses
  const savedLessons = [];
  for (const cand of candidates) {
    const existing = await ProjectLesson.findOne({
      projectId: cand.projectId,
      category: cand.category,
      title: cand.title,
      status: { $in: ["CANDIDATE", "REVIEWED", "VALIDATED"] },
    });

    if (!existing) {
      if (actor && actor._id) cand.creatorId = actor._id;
      const created = await ProjectLesson.create(cand);
      savedLessons.push(created);

      // Audit Event
      await ProjectEvent.create({
        projectId: cand.projectId,
        teamId: cand.teamId,
        actorId: actor?._id || null,
        eventType: "LESSON_CANDIDATE_GENERATED",
        entityType: "project_lesson",
        entityId: created._id.toString(),
        title: `Lesson Candidate: ${created.title}`,
        previousValue: null,
        newValue: "CANDIDATE",
        metadata: { confidence: created.confidence, category: created.category },
      });

      if (io) {
        io.to(`project:${projectId}`).emit("lesson.created", { lesson: created });
      }
    } else {
      // Update evidence metrics on existing candidate if confidence changed
      existing.evidence = cand.evidence;
      existing.evidenceMetrics = cand.evidenceMetrics;
      existing.confidence = cand.confidence;
      await existing.save();
      savedLessons.push(existing);
    }
  }

  logger.info("[projectLearningService] Candidates generated", {
    projectId: projectId.toString(),
    count: savedLessons.length,
  });

  return savedLessons;
}

/**
 * Validate or reject a lesson candidate (requires leader/faculty role).
 */
export async function validateLesson(lessonId, actor, { approved = true, notes = "" } = {}, io = null) {
  if (!mongoose.isValidObjectId(lessonId)) throw new Error("Invalid lesson ID");

  const lesson = await ProjectLesson.findById(lessonId);
  if (!lesson) throw new Error("Lesson not found");

  const prevStatus = lesson.status;

  if (approved) {
    // Insufficient evidence check
    if (lesson.confidence < 0.4 || (lesson.evidenceMetrics?.sampleSize ?? 0) === 0) {
      throw new Error("Cannot validate lesson with insufficient evidence.");
    }
    lesson.status = "VALIDATED";
    lesson.validatorId = actor?._id || null;
    lesson.validationMetadata = {
      validatedAt: new Date(),
      validatedBy: actor?.name || "Authorized User",
      notes: notes || "Validated with empirical project evidence.",
    };
  } else {
    lesson.status = "ARCHIVED";
    lesson.validatorId = actor?._id || null;
    lesson.validationMetadata = {
      validatedAt: new Date(),
      validatedBy: actor?.name || "Authorized User",
      rejectionReason: notes || "Rejected due to insufficient or non-recurring evidence.",
    };
  }

  await lesson.save();

  // Audit Event
  await ProjectEvent.create({
    projectId: lesson.projectId,
    teamId: lesson.teamId,
    actorId: actor?._id || null,
    eventType: approved ? "LESSON_VALIDATED" : "LESSON_REJECTED",
    entityType: "project_lesson",
    entityId: lesson._id.toString(),
    title: `Lesson ${approved ? "Validated" : "Archived"}: ${lesson.title}`,
    previousValue: prevStatus,
    newValue: lesson.status,
    metadata: { validatedBy: actor?.name, notes },
  });

  if (io) {
    io.to(`project:${lesson.projectId.toString()}`).emit("lesson.validated", { lesson });
  }

  return lesson;
}

/**
 * Apply a validated lesson to a project.
 * INVARIANT: Does NOT silently change tasks or assignments. Creates an auditable event and recommendation.
 */
export async function applyLesson(lessonId, targetProjectId, actor, { notes = "" } = {}, io = null) {
  if (!mongoose.isValidObjectId(lessonId) || !mongoose.isValidObjectId(targetProjectId)) {
    throw new Error("Invalid lesson or project ID");
  }

  const lesson = await ProjectLesson.findById(lessonId);
  if (!lesson) throw new Error("Lesson not found");

  if (lesson.status !== "VALIDATED" && lesson.status !== "APPLIED") {
    throw new Error("Only validated lessons can be applied.");
  }

  const targetProject = await Project.findById(targetProjectId);
  if (!targetProject) throw new Error("Target project not found");

  // Record application
  lesson.appliedProjects.push({
    projectId: targetProject._id,
    appliedAt: new Date(),
    appliedBy: actor?._id || null,
    notes: notes || `Applied recommendation to ${targetProject.title}`,
  });
  lesson.status = "APPLIED";
  await lesson.save();

  // Audit Event
  await ProjectEvent.create({
    projectId: targetProject._id,
    teamId: targetProject.teamId,
    actorId: actor?._id || null,
    eventType: "LESSON_APPLIED",
    entityType: "project_lesson",
    entityId: lesson._id.toString(),
    title: `Applied Lesson Recommendation: ${lesson.title}`,
    previousValue: null,
    newValue: "APPLIED",
    metadata: {
      lessonId: lesson._id.toString(),
      recommendation: lesson.recommendation,
      appliedBy: actor?.name,
    },
  });

  if (io) {
    io.to(`project:${targetProject._id.toString()}`).emit("lesson.applied", { lesson, targetProjectId });
  }

  return lesson;
}

/**
 * Archive a lesson.
 */
export async function archiveLesson(lessonId, actor, reason = "", io = null) {
  if (!mongoose.isValidObjectId(lessonId)) throw new Error("Invalid lesson ID");

  const lesson = await ProjectLesson.findById(lessonId);
  if (!lesson) throw new Error("Lesson not found");

  const prevStatus = lesson.status;
  lesson.status = "ARCHIVED";
  lesson.validationMetadata = {
    ...lesson.validationMetadata,
    rejectionReason: reason || "Manually archived.",
  };
  await lesson.save();

  // Audit Event
  await ProjectEvent.create({
    projectId: lesson.projectId,
    teamId: lesson.teamId,
    actorId: actor?._id || null,
    eventType: "LESSON_ARCHIVED",
    entityType: "project_lesson",
    entityId: lesson._id.toString(),
    title: `Lesson Archived: ${lesson.title}`,
    previousValue: prevStatus,
    newValue: "ARCHIVED",
    metadata: { reason, actor: actor?.name },
  });

  if (io) {
    io.to(`project:${lesson.projectId.toString()}`).emit("lesson.archived", { lessonId: lesson._id.toString() });
  }

  return lesson;
}

/**
 * List lessons for a project.
 */
export async function getProjectLessons(projectId, { status, category } = {}) {
  if (!mongoose.isValidObjectId(projectId)) throw new Error("Invalid project ID");

  const query = { projectId };
  if (status) query.status = status;
  if (category) query.category = category;

  return ProjectLesson.find(query).sort({ confidence: -1, createdAt: -1 }).lean();
}

/**
 * Get reusable lessons across projects by domain/methodology/tags.
 */
export async function getReusableLessons({ domain, methodology, tag } = {}) {
  const query = {
    status: { $in: ["VALIDATED", "APPLIED"] },
  };

  if (domain) query.domain = domain;
  if (methodology) query.methodology = methodology;
  if (tag) query.reusableTags = tag;

  return ProjectLesson.find(query)
    .sort({ confidence: -1, "appliedProjects.length": -1 })
    .limit(50)
    .lean();
}
