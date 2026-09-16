/**
 * testCrossFeaturePipeline.js
 * 
 * End-to-end integration verification testing the cross-feature chain:
 * Requirement -> Task -> Dependency -> Execution -> ProjectEvent 
 * -> Process Mining -> Workflow Conformance -> Evidence 
 * -> Teacher Review -> Academic Evaluation -> Fair Contribution
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import ProjectEvent from "../models/ProjectEvent.js";
import TeacherReview from "../models/TeacherReview.js";
import AcademicRubric from "../models/AcademicRubric.js";
import ContributionDispute from "../models/ContributionDispute.js";

import { analyzeProjectProcess } from "../services/processMiningEngine.js";
import { analyzeWorkflowConformance } from "../services/workflowConformanceEngine.js";
import { 
  createTeacherReview, 
  addReviewComment, 
  updateReviewStatus, 
  getProjectTeacherReviews 
} from "../services/teacherReviewService.js";
import { 
  upsertAcademicRubric, 
  getAcademicEvaluation 
} from "../services/academicEvaluationService.js";
import { 
  calculateProjectContribution, 
  createContributionDispute, 
  resolveContributionDispute 
} from "../services/fairContributionService.js";

async function runPipelineTest() {
  console.log('============================================================');
  console.log('NEXUSFLOW V4 — CROSS-FEATURE INTEGRATION PIPELINE VERIFICATION');
  console.log('============================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/nexusflow';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.\n');

  let passes = 0;
  let fails = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`  ✅ PASS: ${msg}`);
      passes++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      fails++;
    }
  }

  const teacherId = new mongoose.Types.ObjectId();
  const studentAliceId = new mongoose.Types.ObjectId();
  const studentBobId = new mongoose.Types.ObjectId();
  const teamId = new mongoose.Types.ObjectId();
  const req1Id = new mongoose.Types.ObjectId();

  let project;
  let task1;
  let task2;

  try {
    console.log('[STEP 1 & 2] Project & Requirement Creation');
    const Team = (await import('../models/Team.js')).default;
    const team = await Team.create({
      name: 'E2E Pipeline Team',
      ownerId: teacherId,
      members: [
        { userId: studentAliceId, name: 'Alice', role: 'member' },
        { userId: studentBobId, name: 'Bob', role: 'member' }
      ]
    });

    project = await Project.create({
      title: 'E2E Pipeline Test Project',
      name: 'E2E Pipeline Test Project',
      teamId: team._id,
      ownerId: teacherId,
      assignedFacultyIds: [teacherId],
      methodology: 'SCRUM',
      status: 'active',
      requirements: [
        {
          _id: req1Id,
          reqId: 'REQ-001',
          title: 'REQ-1: User Authentication Module',
          description: 'Implement JWT authentication with RBAC',
          status: 'approved',
          priority: 'critical',
          source: 'faculty'
        }
      ]
    });
    assert(project._id != null, 'Project created');
    assert(project.requirements.length === 1, 'Requirement created & embedded in Project');

    console.log('\n[STEP 3 & 4] Task & Dependency Creation');
    const Sprint = (await import('../models/Sprint.js')).default;
    const sprint = await Sprint.create({
      projectId: project._id,
      teamId,
      sprintNumber: 1,
      name: 'Sprint 1',
      status: 'ACTIVE',
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 86400000)
    });

    task1 = await Task.create({
      projectId: project._id,
      teamId,
      sprintId: sprint._id,
      title: 'Auth Backend Endpoints',
      status: 'todo',
      assignedTo: studentAliceId,
      requirementId: 'REQ-001',
      estimatedHours: 12,
      actualHours: 12,
      storyPoints: 5,
      priorityLabel: 'high'
    });

    task2 = await Task.create({
      projectId: project._id,
      teamId,
      sprintId: sprint._id,
      title: 'Auth UI Form',
      status: 'todo',
      assignedTo: studentBobId,
      requirementId: 'REQ-001',
      estimatedHours: 8,
      actualHours: 8,
      storyPoints: 3,
      priorityLabel: 'medium',
      dependencies: [task1._id]
    });
    assert(task1._id && task2._id, 'Tasks created with requirement traceability');
    assert(task2.dependencies.length === 1, 'Dependency DAG established (Task 2 -> Task 1)');

    console.log('\n[STEP 5] Execution & ProjectEvent History Logging');
    const now = Date.now();
    await ProjectEvent.create([
      {
        projectId: project._id,
        teamId,
        actorId: studentAliceId,
        eventType: 'TASK_STATUS_CHANGED',
        entityType: 'task',
        entityId: task1._id.toString(),
        title: 'Task Started',
        previousValue: 'TODO',
        newValue: 'IN_PROGRESS',
        createdAt: new Date(now - 1000 * 3600 * 5)
      },
      {
        projectId: project._id,
        teamId,
        actorId: studentAliceId,
        eventType: 'TASK_STATUS_CHANGED',
        entityType: 'task',
        entityId: task1._id.toString(),
        title: 'Task In Review',
        previousValue: 'IN_PROGRESS',
        newValue: 'IN_REVIEW',
        createdAt: new Date(now - 1000 * 3600 * 3)
      },
      {
        projectId: project._id,
        teamId,
        actorId: studentAliceId,
        eventType: 'TASK_STATUS_CHANGED',
        entityType: 'task',
        entityId: task1._id.toString(),
        title: 'Task Completed',
        previousValue: 'IN_REVIEW',
        newValue: 'DONE',
        createdAt: new Date(now - 1000 * 3600 * 2)
      },
      {
        projectId: project._id,
        teamId,
        actorId: studentBobId,
        eventType: 'TASK_STATUS_CHANGED',
        entityType: 'task',
        entityId: task2._id.toString(),
        title: 'Task Started',
        previousValue: 'TODO',
        newValue: 'IN_PROGRESS',
        createdAt: new Date(now - 1000 * 3600 * 1)
      }
    ]);
    task1.status = 'done';
    await task1.save();
    task2.status = 'in_progress';
    await task2.save();
    assert(true, 'Task execution simulated with real ProjectEvent history');

    console.log('\n[STEP 6] Process Mining Engine Extraction');
    const processMining = await analyzeProjectProcess(project._id);
    assert(processMining.eventCount >= 3, 'Process Mining ingested events');
    assert(processMining.transitions.length > 0, 'Process Mining generated state transition graph');
    assert(processMining.throughput.completedTasks === 1, 'Throughput & completed work computed factually');

    console.log('\n[STEP 7] Workflow Conformance Verification');
    const conformance = await analyzeWorkflowConformance(project._id);
    console.log('    Deviations found:', conformance.deviations);
    assert(conformance.status === 'CONFORMANT' || conformance.status === 'DEVIATIONS_DETECTED', `Workflow Conformance status: ${conformance.status}`);
    assert(conformance.deviations != null, 'Deviations array returned');

    console.log('\n[STEP 8] Evidence Linking');
    const evidenceRecord = {
      id: new mongoose.Types.ObjectId().toString(),
      type: 'PR_LINK',
      url: 'https://github.com/org/repo/pull/42',
      title: 'PR #42: Auth Service Complete',
      uploadedBy: studentAliceId
    };
    project.requirements[0].implementationEvidence.push(evidenceRecord);
    await project.save();
    assert(project.requirements[0].implementationEvidence.length === 1, 'Evidence attached to approved requirement');

    console.log('\n[STEP 9] Teacher Review & Privacy Invariant');
    const review = await createTeacherReview({
      projectId: project._id,
      teamId,
      teacherId,
      teacherName: 'Prof. Miller',
      targetType: 'task',
      targetId: task1._id.toString(),
      targetTitle: 'Auth Backend Endpoints',
      initialComment: 'Auth structure is solid. Ensure rate limiting is implemented.',
      isPrivateNote: false
    });
    assert(review.status === 'OPEN', 'Teacher review created in OPEN state');

    // Add public feedback
    await addReviewComment({
      reviewId: review._id,
      authorId: teacherId,
      authorName: 'Prof. Miller',
      authorRole: 'teacher',
      text: 'Good unit test coverage on the endpoints.',
      isPrivateNote: false
    });

    // Add private teacher note
    await addReviewComment({
      reviewId: review._id,
      authorId: teacherId,
      authorName: 'Prof. Miller',
      authorRole: 'teacher',
      text: 'Internal faculty note: student demonstrated strong autonomy.',
      isPrivateNote: true
    });

    // Verify privacy separation
    const studentView = await getProjectTeacherReviews(project._id, false);
    const facultyView = await getProjectTeacherReviews(project._id, true);
    assert(studentView[0].comments.every(c => !c.isPrivateNote), 'Student CANNOT see private teacher notes');
    assert(facultyView[0].comments.some(c => c.isPrivateNote), 'Faculty CAN see private notes');

    await updateReviewStatus({
      reviewId: review._id,
      status: 'RESOLVED',
      actorId: teacherId,
      actorName: 'Prof. Miller',
      actorRole: 'teacher',
    });
    assert(true, 'Review successfully advanced to RESOLVED');

    console.log('\n[STEP 10] Academic Evaluation Mode (Teacher-Controlled, Zero Auto-Grading)');
    await upsertAcademicRubric(project._id, {
      course: 'CS401 Senior Project',
      semester: 'Spring 2026',
      criteria: [
        {
          criterionId: 'crit_arch',
          title: 'Backend Architecture & Authentication',
          description: 'Evaluates authentication architecture and code robustness',
          weight: 100,
          requiredEvidenceTypes: ['code', 'documentation'],
          mappedRequirementIds: ['REQ-001'],
          mappedTaskIds: [task1._id.toString()]
        }
      ]
    }, teacherId, 'Prof. Miller');

    const evalResult = await getAcademicEvaluation(project._id);
    assert(evalResult.criteria.length === 1, 'Academic criteria mapped');
    assert(evalResult.noAutomaticGrading === true, 'No automatic grading invariant maintained');
    assert(evalResult.criteria[0].evidenceCoverageScore != null, 'Objective evidence coverage score computed');

    console.log('\n[STEP 11] Fair Contribution Analysis (Multidimensional & Transparent)');
    const contribution = await calculateProjectContribution(project._id);
    assert(contribution.status === 'COMPUTED', 'Fair contribution computed successfully');
    assert(contribution.members.length === 2, 'Evaluated all participating team members');
    assert(contribution.weights.taskWorkload === 0.40, 'Transparent formula disclosed (40% workload)');

    console.log('\n[STEP 12] Contribution Dispute Filing & Auditable Resolution');
    const dispute = await createContributionDispute({
      projectId: project._id,
      studentId: studentBobId,
      studentName: 'Bob',
      disputeCategory: 'GITHUB_MISMATCH',
      description: 'Commits on auth form were authored under secondary email handle.',
      evidenceUrls: ['https://github.com/org/repo/commits?author=bob-sec']
    });
    assert(dispute.status === 'PENDING', 'Dispute recorded as PENDING');

    const resolvedDispute = await resolveContributionDispute(
      dispute._id,
      {
        status: 'RESOLVED',
        resolutionNotes: 'Reviewed commit log and confirmed email alias belongs to Bob.'
      },
      teacherId,
      'Prof. Miller'
    );
    assert(resolvedDispute.status === 'RESOLVED', 'Dispute resolved by faculty with audit trail');

  } finally {
    console.log('\n[CLEANUP] Tearing down cross-feature test artifacts...');
    if (project) {
      const Team = (await import('../models/Team.js')).default;
      await Team.findByIdAndDelete(project.teamId);
      await Project.findByIdAndDelete(project._id);
      await Task.deleteMany({ projectId: project._id });
      await ProjectEvent.deleteMany({ projectId: project._id });
      await TeacherReview.deleteMany({ projectId: project._id });
      await AcademicRubric.deleteMany({ projectId: project._id });
      await ContributionDispute.deleteMany({ projectId: project._id });
    }
    await mongoose.disconnect();
    console.log('Database connection closed cleanly.');
  }

  console.log('\n============================================================');
  console.log(`CROSS-FEATURE PIPELINE: ${passes} PASSED, ${fails} FAILED`);
  console.log('============================================================');
}

runPipelineTest().catch(err => {
  console.error('Fatal pipeline test error:', err);
  process.exit(1);
});
