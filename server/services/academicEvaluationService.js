/**
 * server/services/academicEvaluationService.js
 * ============================================================================
 * NEXUSFLOW V4 — ACADEMIC EVALUATION SERVICE (Prompt 14)
 *
 * Implements configurable rubric criteria, evidence coverage calculation,
 * missing evidence detection, and teacher-controlled evaluation.
 *
 * SAFETY INVARIANT:
 *   NO AUTOMATIC FINAL GRADING.
 *   Coverage scores reflect objective evidence completeness (0-100%).
 *   Final marks and qualitative evaluations are strictly teacher-entered.
 * ============================================================================
 */

import mongoose from "mongoose";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import AcademicRubric from "../models/AcademicRubric.js";
import { recordProjectEvent } from "./eventService.js";

const DEFAULT_RUBRIC_CRITERIA = [
  {
    criterionId: "crit_arch",
    title: "System Architecture & Design",
    description: "Design specifications, component models, and architectural clarity",
    weight: 25,
    requiredEvidenceTypes: ["architecture", "documentation"],
    mappedRequirementIds: [],
    mappedTaskIds: [],
  },
  {
    criterionId: "crit_impl",
    title: "Implementation & Functionality",
    description: "Quality of source code, requirement coverage, and completed features",
    weight: 35,
    requiredEvidenceTypes: ["code", "repository"],
    mappedRequirementIds: [],
    mappedTaskIds: [],
  },
  {
    criterionId: "crit_test",
    title: "Verification & Testing Evidence",
    description: "Test coverage, automated tests, and verification artifacts",
    weight: 25,
    requiredEvidenceTypes: ["test", "verification"],
    mappedRequirementIds: [],
    mappedTaskIds: [],
  },
  {
    criterionId: "crit_doc",
    title: "Project Documentation & Process",
    description: "Project documentation, reports, and methodology compliance",
    weight: 15,
    requiredEvidenceTypes: ["report", "presentation"],
    mappedRequirementIds: [],
    mappedTaskIds: [],
  },
];

/**
 * Upsert / configure academic rubric for a project.
 */
export async function upsertAcademicRubric(projectId, rubricData = {}, actorId = null, actorName = "Faculty") {
  if (!mongoose.isValidObjectId(projectId)) {
    throw new Error("Invalid project ID.");
  }

  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");

  let rubric = await AcademicRubric.findOne({ projectId });
  if (!rubric) {
    rubric = new AcademicRubric({
      projectId,
      course: rubricData.course || "Capstone Engineering Project",
      semester: rubricData.semester || "Final Year",
      academicDeadline: rubricData.academicDeadline || null,
      criteria: rubricData.criteria && rubricData.criteria.length > 0 ? rubricData.criteria : DEFAULT_RUBRIC_CRITERIA,
    });
  } else {
    if (rubricData.course) rubric.course = rubricData.course;
    if (rubricData.semester) rubric.semester = rubricData.semester;
    if (rubricData.academicDeadline) rubric.academicDeadline = rubricData.academicDeadline;
    if (rubricData.criteria) rubric.criteria = rubricData.criteria;
  }

  await rubric.save();

  await recordProjectEvent({
    projectId,
    teamId: project.teamId,
    actorId,
    actorName,
    eventType: "ACADEMIC_RUBRIC_CONFIGURED",
    entityType: "academic_evaluation",
    entityId: rubric._id.toString(),
    title: "Academic rubric configured",
    description: `Configured ${rubric.criteria.length} rubric criteria for evaluation`,
    source: "teacher",
  });

  return rubric;
}

/**
 * Get current academic evaluation report with objective evidence coverage.
 */
export async function getAcademicEvaluation(projectId) {
  if (!mongoose.isValidObjectId(projectId)) {
    throw new Error("Invalid project ID.");
  }

  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found.");

  let rubric = await AcademicRubric.findOne({ projectId }).lean();
  if (!rubric) {
    // Create default rubric if not configured yet
    const created = await AcademicRubric.create({
      projectId,
      course: "Engineering Capstone Project",
      semester: "Final Semester",
      criteria: DEFAULT_RUBRIC_CRITERIA,
    });
    rubric = created.toObject();
  }

  const tasks = await Task.find({ projectId }).lean();
  const requirements = project.requirements || [];

  const taskMap = new Map(tasks.map(t => [t._id.toString(), t]));
  const reqMap = new Map(requirements.map(r => [r.reqId || r._id?.toString(), r]));

  let totalWeight = 0;
  let weightedCoverageSum = 0;
  const missingEvidenceGaps = [];

  // Evaluate each criterion
  const evaluatedCriteria = (rubric.criteria || []).map(crit => {
    let matchedRequirements = 0;
    let coveredRequirements = 0;
    let matchedTasks = 0;
    let completedTasks = 0;

    // Check mapped requirements
    (crit.mappedRequirementIds || []).forEach(reqId => {
      matchedRequirements++;
      const req = reqMap.get(reqId);
      if (req) {
        const hasEvidence = (req.implementationEvidence && req.implementationEvidence.length > 0) ||
                            (req.testEvidence && req.testEvidence.length > 0) ||
                            (req.artifactEvidence && req.artifactEvidence.length > 0);
        if (hasEvidence && req.status === "approved") {
          coveredRequirements++;
        } else {
          missingEvidenceGaps.push({
            criterionTitle: crit.title,
            type: "REQUIREMENT",
            id: reqId,
            title: req.title,
            reason: !hasEvidence ? "Missing implementation or test evidence" : "Requirement not approved",
          });
        }
      }
    });

    // Check mapped tasks
    (crit.mappedTaskIds || []).forEach(taskId => {
      matchedTasks++;
      const task = taskMap.get(taskId);
      if (task) {
        if (task.status === "done") {
          completedTasks++;
        } else {
          missingEvidenceGaps.push({
            criterionTitle: crit.title,
            type: "TASK",
            id: taskId,
            title: task.title,
            reason: `Task status is "${task.status}" (expected "done")`,
          });
        }
      }
    });

    // Calculate objective evidence coverage score (0 to 100)
    const totalMapped = matchedRequirements + matchedTasks;
    const totalMet = coveredRequirements + completedTasks;
    const coverageScore = totalMapped > 0 ? Math.round((totalMet / totalMapped) * 100) : 0;

    totalWeight += crit.weight || 0;
    weightedCoverageSum += coverageScore * (crit.weight || 0);

    return {
      ...crit,
      evidenceCoverageScore: coverageScore,
      itemsTotal: totalMapped,
      itemsMet: totalMet,
    };
  });

  const overallCoverageScore = totalWeight > 0 ? Math.round(weightedCoverageSum / totalWeight) : 0;

  return {
    projectId: projectId.toString(),
    course: rubric.course,
    semester: rubric.semester,
    status: rubric.status,
    academicDeadline: rubric.academicDeadline,
    criteria: evaluatedCriteria,
    overallCoverageScore,
    missingEvidenceGaps,
    overallEvaluation: rubric.overallEvaluation || {},
    noAutomaticGrading: true, // Invariant: system never auto-assigns academic grades
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Teacher marks or evaluates a specific rubric criterion.
 */
export async function evaluateRubricCriterion(
  projectId,
  criterionId,
  { reviewedStatus, teacherScore, teacherFeedback },
  teacherId,
  teacherName = "Faculty"
) {
  const rubric = await AcademicRubric.findOne({ projectId });
  if (!rubric) throw new Error("Academic rubric not found.");

  const crit = (rubric.criteria || []).find(c => c.criterionId === criterionId);
  if (!crit) throw new Error(`Criterion "${criterionId}" not found in rubric.`);

  if (reviewedStatus) crit.reviewedStatus = reviewedStatus;
  if (teacherScore !== undefined && teacherScore !== null) crit.teacherScore = Number(teacherScore);
  if (teacherFeedback !== undefined) crit.teacherFeedback = teacherFeedback;

  rubric.status = "UNDER_REVIEW";
  await rubric.save();

  const project = await Project.findById(projectId).select("teamId");
  await recordProjectEvent({
    projectId,
    teamId: project?.teamId,
    actorId: teacherId,
    actorName: teacherName,
    eventType: "CRITERION_EVALUATED",
    entityType: "academic_evaluation",
    entityId: criterionId,
    title: `Criterion evaluated: ${crit.title}`,
    description: `Marked as ${crit.reviewedStatus || "REVIEWED"} with feedback`,
    source: "teacher",
  });

  return crit;
}

/**
 * Submit final academic evaluation remarks (teacher-controlled).
 */
export async function submitAcademicEvaluation(
  projectId,
  { teacherRemarks },
  teacherId,
  teacherName = "Faculty"
) {
  const rubric = await AcademicRubric.findOne({ projectId });
  if (!rubric) throw new Error("Academic rubric not found.");

  rubric.status = "REVIEWED";
  rubric.overallEvaluation = {
    teacherRemarks: teacherRemarks || "",
    evaluatedAt: new Date(),
    evaluatedBy: teacherId,
    evaluatorName: teacherName,
  };

  await rubric.save();

  const project = await Project.findById(projectId).select("teamId");
  await recordProjectEvent({
    projectId,
    teamId: project?.teamId,
    actorId: teacherId,
    actorName: teacherName,
    eventType: "ACADEMIC_EVALUATION_COMPLETED",
    entityType: "academic_evaluation",
    entityId: rubric._id.toString(),
    title: "Academic evaluation completed",
    description: `Evaluation completed by ${teacherName}`,
    source: "teacher",
  });

  return rubric;
}
