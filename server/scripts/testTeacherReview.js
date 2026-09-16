/**
 * server/scripts/testTeacherReview.js
 * ============================================================================
 * NEXUSFLOW V4 — TEACHER REVIEW & FACULTY PORTAL TEST SUITE (Prompt 13)
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
import User from "../models/User.js";
import TeacherReview from "../models/TeacherReview.js";
import {
  assignFacultyToProject,
  createTeacherReview,
  addReviewComment,
  updateReviewStatus,
  getProjectTeacherReviews,
  getFacultyAssignedProjects,
} from "../services/teacherReviewService.js";

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
  console.log("NEXUSFLOW V4 — TEACHER REVIEW & FACULTY PORTAL TESTS");
  console.log("=".repeat(60) + "\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB.\n");
  } catch (err) {
    console.error("MongoDB Connection Failed:", err.message);
    process.exit(1);
  }

  const ts = Date.now();
  let facultyUser, otherFaculty, studentUser, testTeam, testProject, otherProject;

  try {
    facultyUser = await User.create({
      name: `Prof. Charles ${ts}`,
      email: `prof_${ts}@university.edu`,
      password: "Password123!",
      role: "faculty",
    });

    otherFaculty = await User.create({
      name: `Prof. Unassigned ${ts}`,
      email: `unassigned_${ts}@university.edu`,
      password: "Password123!",
      role: "faculty",
    });

    studentUser = await User.create({
      name: `Student Alice ${ts}`,
      email: `student_${ts}@university.edu`,
      password: "Password123!",
      role: "student",
    });

    testTeam = await Team.create({
      name: `Capstone Team ${ts}`,
      ownerId: studentUser._id,
      projectTitle: "Autonomous Drone",
      members: [
        { userId: studentUser._id, name: studentUser.name, role: "leader" },
      ],
    });

    testProject = await Project.create({
      teamId: testTeam._id,
      title: "Autonomous Drone Navigation",
      methodology: "WATERFALL",
    });

    otherProject = await Project.create({
      teamId: testTeam._id,
      title: "Unrelated Project",
      methodology: "SCRUM",
    });

    // ── Test 1: Faculty Assignment
    console.log("[TEST 1] Assign faculty to academic project");
    const assignResult = await assignFacultyToProject(testProject._id, facultyUser._id);
    assert(assignResult.success === true, "Faculty assigned successfully");

    const refreshedProj = await Project.findById(testProject._id).lean();
    assert(
      refreshedProj.assignedFacultyIds.some(id => id.toString() === facultyUser._id.toString()),
      "Faculty ID present in project assignedFacultyIds"
    );

    // ── Test 2: Faculty Review Creation with Initial Comment
    console.log("\n[TEST 2] Create faculty review on deliverable");
    const review = await createTeacherReview({
      projectId: testProject._id,
      teamId: testTeam._id,
      teacherId: facultyUser._id,
      teacherName: facultyUser.name,
      targetType: "deliverable",
      targetTitle: "Architecture Diagram",
      initialComment: "Architecture meets modularity standards. Consider redundancy.",
      isPrivateNote: false,
    });

    assert(review.status === "OPEN", "Review initialized with status OPEN");
    assert(review.comments.length === 1, "Initial comment attached");
    assert(review.comments[0].isPrivateNote === false, "Comment is public");
    assert(review.auditLog.length === 1, "Audit log initialized with REVIEW_CREATED");

    // ── Test 3: Add Private Faculty Note
    console.log("\n[TEST 3] Add private note (teacher-only)");
    await addReviewComment({
      reviewId: review._id,
      authorId: facultyUser._id,
      authorName: facultyUser.name,
      authorRole: "faculty",
      text: "INTERNAL FACULTY NOTE: Student needs to explain failover mechanism during viva.",
      isPrivateNote: true,
    });

    // ── Test 4: Privacy Isolation Verification (CRITICAL)
    console.log("\n[TEST 4] Strict privacy isolation — Student cannot see private notes");
    const studentView = await getProjectTeacherReviews(testProject._id, false); // isFaculty = false
    assert(studentView.length === 1, "Student receives review record");
    assert(studentView[0].comments.length === 1, "Student only sees public comment (private note stripped)");
    assert(
      !studentView[0].comments.some(c => c.text.includes("INTERNAL FACULTY NOTE")),
      "Private note text is completely absent from student view"
    );

    const facultyView = await getProjectTeacherReviews(testProject._id, true); // isFaculty = true
    assert(facultyView[0].comments.length === 2, "Faculty receives all comments including private note");
    assert(facultyView[0].hasPrivateNotes === true, "Faculty flagged hasPrivateNotes = true");

    // ── Test 5: Student Response & Lifecycle Advancement
    console.log("\n[TEST 5] Student response and lifecycle updates");
    await updateReviewStatus({
      reviewId: review._id,
      status: "FEEDBACK",
      actorId: facultyUser._id,
      actorName: facultyUser.name,
    });

    await addReviewComment({
      reviewId: review._id,
      authorId: studentUser._id,
      authorName: studentUser.name,
      authorRole: "student",
      text: "We have updated the design document to include dual battery failover specifications.",
      isPrivateNote: false,
    });

    const afterReply = await TeacherReview.findById(review._id).lean();
    assert(afterReply.status === "STUDENT_RESPONSE", "Status auto-advanced to STUDENT_RESPONSE after student reply");

    // Resolve review
    await updateReviewStatus({
      reviewId: review._id,
      status: "RESOLVED",
      actorId: facultyUser._id,
      actorName: facultyUser.name,
    });
    const resolved = await TeacherReview.findById(review._id).lean();
    assert(resolved.status === "RESOLVED", "Review resolved by faculty");

    // ── Test 6: Faculty Feed Project Isolation
    console.log("\n[TEST 6] Faculty dashboard feeds only assigned projects");
    const assignedFeed = await getFacultyAssignedProjects(facultyUser._id);
    assert(assignedFeed.length === 1, "Assigned faculty sees 1 project");
    assert(assignedFeed[0].id === testProject._id.toString(), "Feed contains assigned project");

    const unassignedFeed = await getFacultyAssignedProjects(otherFaculty._id);
    assert(unassignedFeed.length === 0, "Unassigned faculty sees 0 projects in feed");

  } finally {
    console.log("\n[CLEANUP]");
    if (facultyUser) await User.deleteOne({ _id: facultyUser._id });
    if (otherFaculty) await User.deleteOne({ _id: otherFaculty._id });
    if (studentUser) await User.deleteOne({ _id: studentUser._id });
    if (testTeam) await Team.deleteOne({ _id: testTeam._id });
    if (testProject) {
      await Project.deleteOne({ _id: testProject._id });
      await TeacherReview.deleteMany({ projectId: testProject._id });
    }
    if (otherProject) await Project.deleteOne({ _id: otherProject._id });
    await mongoose.disconnect();
  }

  console.log("\n" + "=".repeat(60));
  console.log(`TEACHER REVIEW RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60) + "\n");
  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error("Test execution error:", e);
  process.exit(1);
});
