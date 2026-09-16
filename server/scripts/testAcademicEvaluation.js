/**
 * server/scripts/testAcademicEvaluation.js
 * ============================================================================
 * NEXUSFLOW V4 — ACADEMIC EVALUATION MODE TEST SUITE (Prompt 14)
 * ============================================================================
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import AcademicRubric from "../models/AcademicRubric.js";
import {
  upsertAcademicRubric,
  getAcademicEvaluation,
  evaluateRubricCriterion,
  submitAcademicEvaluation,
} from "../services/academicEvaluationService.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow_dev";
let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n" + "=".repeat(60));
  console.log("NEXUSFLOW V4 — ACADEMIC EVALUATION MODE TESTS");
  console.log("=".repeat(60) + "\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB.\n");
  } catch (err) {
    console.error("MongoDB Connection Failed:", err.message);
    process.exit(1);
  }

  const ts = Date.now();
  let facultyUser, studentUser, testTeam, testProject;

  try {
    facultyUser = await User.create({
      name: `Dr. Smith ${ts}`,
      email: `smith_${ts}@university.edu`,
      password: "Password123!",
      role: "faculty",
    });

    studentUser = await User.create({
      name: `Student Bob ${ts}`,
      email: `bob_${ts}@university.edu`,
      password: "Password123!",
      role: "student",
    });

    testTeam = await Team.create({
      name: `Evaluation Team ${ts}`,
      ownerId: studentUser._id,
      projectTitle: "IoT Hydroponics",
    });

    testProject = await Project.create({
      teamId: testTeam._id,
      title: "Automated IoT Hydroponics",
      methodology: "WATERFALL",
      requirements: [
        {
          reqId: "REQ-01",
          title: "Soil moisture sensing",
          status: "approved",
          implementationEvidence: ["https://github.com/test/commit/abc"],
          testEvidence: ["https://ci.test/report/1"],
        },
        {
          reqId: "REQ-02",
          title: "Nutrient dosing pump",
          status: "draft", // Not approved, no evidence
          implementationEvidence: [],
          testEvidence: [],
        },
      ],
    });

    const task1 = await Task.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      title: "Calibrate sensors",
      status: "done",
    });

    const task2 = await Task.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      title: "Assemble dosing pump",
      status: "in_progress",
    });

    // ── Test 1: Rubric Configuration & Upsert
    console.log("[TEST 1] Configure academic rubric with criteria");
    const rubric = await upsertAcademicRubric(
      testProject._id,
      {
        course: "B.Tech Final Year Project",
        semester: "Semester 8",
        criteria: [
          {
            criterionId: "crit_hardware",
            title: "Hardware Sensing Subsystem",
            description: "Sensor integration, calibration, and telemetry",
            weight: 50,
            mappedRequirementIds: ["REQ-01"],
            mappedTaskIds: [task1._id.toString()],
          },
          {
            criterionId: "crit_actuator",
            title: "Actuator & Dosing Subsystem",
            description: "Nutrient dispensing and pump control",
            weight: 50,
            mappedRequirementIds: ["REQ-02"],
            mappedTaskIds: [task2._id.toString()],
          },
        ],
      },
      facultyUser._id,
      facultyUser.name
    );

    assert(rubric.criteria.length === 2, "Rubric configured with 2 criteria");
    assert(rubric.course === "B.Tech Final Year Project", "Course title saved");

    // ── Test 2: Objective Evidence Coverage Calculation
    console.log("\n[TEST 2] Calculate objective evidence coverage");
    const evalData = await getAcademicEvaluation(testProject._id);
    assert(evalData.noAutomaticGrading === true, "Enforces noAutomaticGrading invariant");

    const critHardware = evalData.criteria.find(c => c.criterionId === "crit_hardware");
    assert(critHardware.evidenceCoverageScore === 100, `Hardware criterion has 100% evidence coverage (got ${critHardware.evidenceCoverageScore}%)`);

    const critActuator = evalData.criteria.find(c => c.criterionId === "crit_actuator");
    assert(critActuator.evidenceCoverageScore === 0, `Actuator criterion has 0% coverage due to pending evidence (got ${critActuator.evidenceCoverageScore}%)`);

    assert(evalData.overallCoverageScore === 50, `Overall weighted coverage is 50% (got ${evalData.overallCoverageScore}%)`);

    // ── Test 3: Missing Evidence Gaps Identification
    console.log("\n[TEST 3] Detect missing evidence gaps");
    assert(evalData.missingEvidenceGaps.length >= 2, "Missing evidence gaps identified");
    assert(
      evalData.missingEvidenceGaps.some(g => g.id === "REQ-02"),
      "Identified REQ-02 missing evidence gap"
    );
    assert(
      evalData.missingEvidenceGaps.some(g => g.id === task2._id.toString()),
      "Identified task2 incomplete gap"
    );

    // ── Test 4: Teacher Evaluates Criterion (Teacher-Controlled)
    console.log("\n[TEST 4] Faculty reviews and marks criterion");
    const reviewedCrit = await evaluateRubricCriterion(
      testProject._id,
      "crit_hardware",
      {
        reviewedStatus: "SATISFIED",
        teacherScore: 95,
        teacherFeedback: "Sensors are well-calibrated and telemetry logs verify accurate readings.",
      },
      facultyUser._id,
      facultyUser.name
    );

    assert(reviewedCrit.reviewedStatus === "SATISFIED", "Criterion marked SATISFIED");
    assert(reviewedCrit.teacherScore === 95, "Teacher score recorded (95)");
    assert(reviewedCrit.teacherFeedback.includes("well-calibrated"), "Teacher feedback recorded");

    // ── Test 5: Teacher Submits Final Evaluation
    console.log("\n[TEST 5] Faculty completes overall project evaluation");
    const completedEval = await submitAcademicEvaluation(
      testProject._id,
      { teacherRemarks: "Strong hardware demonstration. Actuator section requires completion prior to final viva." },
      facultyUser._id,
      facultyUser.name
    );

    assert(completedEval.status === "REVIEWED", "Rubric status set to REVIEWED");
    assert(completedEval.overallEvaluation.evaluatorName === facultyUser.name, "Evaluator name recorded");
    assert(completedEval.overallEvaluation.teacherRemarks.length > 0, "Teacher remarks recorded");

  } finally {
    console.log("\n[CLEANUP]");
    if (facultyUser) await User.deleteOne({ _id: facultyUser._id });
    if (studentUser) await User.deleteOne({ _id: studentUser._id });
    if (testTeam) await Team.deleteOne({ _id: testTeam._id });
    if (testProject) {
      await Project.deleteOne({ _id: testProject._id });
      await Task.deleteMany({ projectId: testProject._id });
      await AcademicRubric.deleteOne({ projectId: testProject._id });
    }
    await mongoose.disconnect();
  }

  console.log("\n" + "=".repeat(60));
  console.log(`ACADEMIC EVALUATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60) + "\n");
  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error("Test execution error:", e);
  process.exit(1);
});
