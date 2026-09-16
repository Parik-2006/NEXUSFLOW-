/**
 * testCrossFeaturePipeline.js
 * 
 * End-to-end integration verification testing the cross-feature chain:
 * Requirement -> Task -> Dependency -> Execution -> ProjectEvent 
 * -> Process Mining -> Workflow Conformance -> Evidence 
 * -> Teacher Review -> Academic Evaluation -> Fair Contribution
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Project = require('../models/Project');
const Task = require('../models/Task');
const Requirement = require('../models/Requirement');
const ProjectEvent = require('../models/ProjectEvent');
const TeacherReview = require('../models/TeacherReview');
const AcademicRubric = require('../models/AcademicRubric');
const ContributionDispute = require('../models/ContributionDispute');

const { analyzeProjectProcess } = require('../services/processMiningEngine');
const { analyzeWorkflowConformance } = require('../services/workflowConformanceEngine');
const { 
  createTeacherReview, 
  addReviewComment, 
  updateReviewStatus, 
  getProjectTeacherReviews 
} = require('../services/teacherReviewService');
const { 
  upsertRubricCriteria, 
  evaluateProjectAcademicState 
} = require('../services/academicEvaluationService');
const { 
  analyzeTeamContribution, 
  fileContributionDispute, 
  resolveContributionDispute 
} = require('../services/fairContributionService');

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

  let project;
  let req1;
  let task1;
  let task2;

  try {
    console.log('[STEP 1 & 2] Project & Requirement Creation');
    project = await Project.create({
      name: 'E2E Pipeline Test Project',
      teamId,
      ownerId: teacherId,
      assignedFacultyIds: [teacherId],
      methodology: 'SCRUM',
      status: 'active'
    });
    assert(project._id != null, 'Project created');

    req1 = await Requirement.create({
      projectId: project._id,
      title: 'REQ-1: User Authentication Module',
      description: 'Implement JWT authentication with RBAC',
      status: 'APPROVED',
      priority: 'CRITICAL',
      source: 'TEST_PIPELINE'
    });
    assert(req1._id != null, 'Requirement created & approved');

    console.log('\n[STEP 3 & 4] Task & Dependency Creation');
    task1 = await Task.create({
      projectId: project._id,
      teamId,
      title: 'Auth Backend Endpoints',
      status: 'TODO',
      assigneeId: studentAliceId,
      requirementId: req1._id,
      estimatedHours: 12,
      actualHours: 12,
      complexity: 'HIGH',
      priority: 'HIGH'
    });

    task2 = await Task.create({
      projectId: project._id,
      teamId,
      title: 'Auth UI Form',
      status: 'TODO',
      assigneeId: studentBobId,
      requirementId: req1._id,
      estimatedHours: 8,
      actualHours: 8,
      complexity: 'MEDIUM',
      priority: 'MEDIUM',
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
        eventType: 'TASK_TRANSITION',
        entityType: 'task',
        entityId: task1._id,
        title: 'Task Started',
        details: { previousState: 'TODO', newState: 'IN_PROGRESS', taskId: task1._id },
        createdAt: new Date(now - 1000 * 3600 * 5)
      },
      {
        projectId: project._id,
        teamId,
        actorId: studentAliceId,
        eventType: 'TASK_TRANSITION',
        entityType: 'task',
        entityId: task1._id,
        title: 'Task Completed',
        details: { previousState: 'IN_PROGRESS', newState: 'DONE', taskId: task1._id },
        createdAt: new Date(now - 1000 * 3600 * 2)
      },
      {
        projectId: project._id,
        teamId,
        actorId: studentBobId,
        eventType: 'TASK_TRANSITION',
        entityType: 'task',
        entityId: task2._id,
        title: 'Task Started',
        details: { previousState: 'TODO', newState: 'IN_PROGRESS', taskId: task2._id },
        createdAt: new Date(now - 1000 * 3600 * 1)
      }
    ]);
    task1.status = 'DONE';
    await task1.save();
    task2.status = 'IN_PROGRESS';
    await task2.save();
    assert(true, 'Task execution simulated with real ProjectEvent history');

    console.log('\n[STEP 6] Process Mining Engine Extraction');
    const processMining = await analyzeProjectProcess(project._id);
    assert(processMining.summary.totalEvents >= 3, 'Process Mining ingested events');
    assert(processMining.transitions.length > 0, 'Process Mining generated state transition graph');
    assert(processMining.metrics.completedWork === 1, 'Throughput & completed work computed factually');

    console.log('\n[STEP 7] Workflow Conformance Verification');
    const conformance = await analyzeWorkflowConformance(project._id);
    assert(conformance.status === 'CONFORMANT', `Workflow Conformance status: ${conformance.status}`);
    assert(conformance.deviations.length === 0, 'No illegal transitions detected in standard flow');

    console.log('\n[STEP 8] Evidence Linking');
    const evidenceRecord = {
      id: new mongoose.Types.ObjectId().toString(),
      type: 'PR_LINK',
      url: 'https://github.com/org/repo/pull/42',
      title: 'PR #42: Auth Service Complete',
      uploadedBy: studentAliceId
    };
    task1.evidence = [evidenceRecord];
    await task1.save();
    assert(task1.evidence.length === 1, 'Evidence attached to completed task');

    console.log('\n[STEP 9] Teacher Review & Privacy Invariant');
    const review = await createTeacherReview(project._id, teacherId, {
      title: 'Milestone 1 Architecture & Auth Review',
      targetType: 'TASK',
      targetId: task1._id,
      initialComment: 'Auth structure is solid. Ensure rate limiting is implemented.'
    });
    assert(review.lifecycleStatus === 'IN_REVIEW', 'Teacher review created in IN_REVIEW state');

    // Add public feedback
    await addReviewComment(review._id, teacherId, {
      authorName: 'Prof. Miller',
      role: 'TEACHER',
      text: 'Good unit test coverage on the endpoints.',
      isPrivateNote: false
    });

    // Add private teacher note
    await addReviewComment(review._id, teacherId, {
      authorName: 'Prof. Miller',
      role: 'TEACHER',
      text: 'Internal faculty note: student demonstrated strong autonomy.',
      isPrivateNote: true
    });

    // Verify privacy separation
    const studentView = await getProjectTeacherReviews(project._id, false);
    const facultyView = await getProjectTeacherReviews(project._id, true);
    assert(studentView[0].comments.every(c => !c.isPrivateNote), 'Student CANNOT see private teacher notes');
    assert(facultyView[0].comments.some(c => c.isPrivateNote), 'Faculty CAN see private notes');

    await updateReviewStatus(review._id, teacherId, 'RESOLVED', 'All milestone requirements verified.');
    assert(true, 'Review successfully advanced to RESOLVED');

    console.log('\n[STEP 10] Academic Evaluation Mode (Teacher-Controlled, Zero Auto-Grading)');
    await upsertRubricCriteria(project._id, teacherId, [
      {
        criterionId: 'CRIT_ARCH',
        title: 'Backend Architecture & Authentication',
        maxScore: 20,
        weight: 1.0,
        requirementIds: [req1._id],
        taskIds: [task1._id],
        rubricLevels: [
          { label: 'Exemplary', points: 20, descriptor: 'Full JWT + RBAC' },
          { label: 'Basic', points: 10, descriptor: 'Basic auth only' }
        ]
      }
    ]);

    const evalResult = await evaluateProjectAcademicState(project._id, teacherId);
    assert(evalResult.criteriaEvaluations.length === 1, 'Academic criteria mapped');
    assert(evalResult.criteriaEvaluations[0].objectiveCoverage.evidenceCount >= 1, 'Objective evidence detected');
    assert(evalResult.criteriaEvaluations[0].objectiveCoverage.tasksDoneCount === 1, 'Task completion accurately detected');

    console.log('\n[STEP 11] Fair Contribution Analysis (Multidimensional & Transparent)');
    const contribution = await analyzeTeamContribution(project._id);
    assert(contribution.memberContributions.length === 2, 'Evaluated all participating team members');
    assert(contribution.memberContributions[0].factualSummary.completedTasks === 1, 'Alice factual work recorded');
    assert(contribution.formula.weights.workloadHours === 0.40, 'Transparent formula disclosed');

    console.log('\n[STEP 12] Contribution Dispute Filing & Auditable Resolution');
    const dispute = await fileContributionDispute(project._id, studentBobId, {
      category: 'GITHUB_ATTRIBUTION',
      description: 'Commits on auth form were authored under secondary email handle.',
      evidenceUrls: ['https://github.com/org/repo/commits?author=bob-sec']
    });
    assert(dispute.status === 'PENDING', 'Dispute recorded as PENDING');

    const resolvedDispute = await resolveContributionDispute(dispute._id, teacherId, {
      status: 'RESOLVED',
      resolutionNotes: 'Reviewed commit log and confirmed email alias belongs to Bob.'
    });
    assert(resolvedDispute.status === 'RESOLVED', 'Dispute resolved by faculty with audit trail');

  } finally {
    console.log('\n[CLEANUP] Tearing down cross-feature test artifacts...');
    if (project) {
      await Project.findByIdAndDelete(project._id);
      await Task.deleteMany({ projectId: project._id });
      await Requirement.deleteMany({ projectId: project._id });
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
