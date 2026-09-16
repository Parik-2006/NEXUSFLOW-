/**
 * server/services/teacherReviewService.js
 * ============================================================================
 * NEXUSFLOW V4 — TEACHER REVIEW & FACULTY PORTAL SERVICE (Prompt 13)
 *
 * Implements academic faculty review workflows, comment threads, private notes,
 * and review lifecycle audits.
 *
 * PRIVACY INVARIANT:
 *   Private notes (isPrivateNote=true) must NEVER be exposed to students.
 * ============================================================================
 */

import mongoose from "mongoose";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import User from "../models/User.js";
import TeacherReview from "../models/TeacherReview.js";
import { recordProjectEvent } from "./eventService.js";

/**
 * Assign a faculty member to a project.
 */
export async function assignFacultyToProject(projectId, teacherId) {
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(teacherId)) {
    throw new Error("Invalid project or teacher ID.");
  }

  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");

  const teacher = await User.findById(teacherId);
  if (!teacher) throw new Error("Teacher user not found.");

  if (!project.assignedFacultyIds) project.assignedFacultyIds = [];
  const exists = project.assignedFacultyIds.some(id => id.toString() === teacherId.toString());
  if (!exists) {
    project.assignedFacultyIds.push(teacherId);
    await project.save();

    await recordProjectEvent({
      projectId,
      teamId: project.teamId,
      actorId: teacherId,
      actorName: teacher.name,
      eventType: "FACULTY_ASSIGNED",
      entityType: "teacher_review",
      entityId: teacherId.toString(),
      title: `Faculty assigned: ${teacher.name}`,
      description: `${teacher.name} assigned to project review board`,
      source: "teacher",
    });
  }

  return { success: true, projectId, teacherId };
}

/**
 * Create a new faculty review record.
 */
export async function createTeacherReview({
  projectId,
  teamId,
  teacherId,
  teacherName = "Faculty Reviewer",
  targetType,
  targetId = "",
  targetTitle = "",
  initialComment = "",
  isPrivateNote = false,
}) {
  if (!projectId || !targetType) {
    throw new Error("projectId and targetType are required.");
  }

  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");

  const comments = [];
  if (initialComment) {
    comments.push({
      authorId: teacherId,
      authorName: teacherName,
      authorRole: "teacher",
      text: initialComment,
      isPrivateNote: Boolean(isPrivateNote),
      createdAt: new Date(),
    });
  }

  const auditLog = [
    {
      action: "REVIEW_CREATED",
      actorId: teacherId,
      actorName: teacherName,
      timestamp: new Date(),
      details: `Created review on ${targetType}: "${targetTitle}"`,
    },
  ];

  const review = await TeacherReview.create({
    projectId,
    teamId: teamId || project.teamId,
    teacherId,
    teacherName,
    targetType,
    targetId,
    targetTitle,
    status: "OPEN",
    comments,
    auditLog,
  });

  await recordProjectEvent({
    projectId,
    teamId: project.teamId,
    actorId: teacherId,
    actorName: teacherName,
    eventType: "TEACHER_REVIEW_CREATED",
    entityType: "teacher_review",
    entityId: review._id.toString(),
    title: `Teacher review opened on ${targetType}`,
    description: `Review opened on "${targetTitle || targetType}"`,
    source: "teacher",
  });

  return review;
}

/**
 * Add a comment or student response to an existing review.
 */
export async function addReviewComment({
  reviewId,
  authorId,
  authorName = "User",
  authorRole = "student",
  text,
  isPrivateNote = false,
}) {
  if (!reviewId || !text) {
    throw new Error("reviewId and text are required.");
  }

  const review = await TeacherReview.findById(reviewId);
  if (!review) throw new Error("Teacher review not found.");

  // Enforce: only teachers can make private notes
  const privateFlag = (authorRole === "teacher" || authorRole === "faculty") ? Boolean(isPrivateNote) : false;

  const newComment = {
    authorId,
    authorName,
    authorRole,
    text,
    isPrivateNote: privateFlag,
    createdAt: new Date(),
  };

  review.comments.push(newComment);

  // Auto-advance lifecycle if student replied
  if (authorRole === "student" && review.status === "FEEDBACK") {
    review.status = "STUDENT_RESPONSE";
  }

  review.auditLog.push({
    action: privateFlag ? "PRIVATE_NOTE_ADDED" : "COMMENT_ADDED",
    actorId: authorId,
    actorName: authorName,
    timestamp: new Date(),
    details: `${authorRole} added ${privateFlag ? "private note" : "comment"}`,
  });

  await review.save();

  return review;
}

/**
 * Update review lifecycle status.
 */
export async function updateReviewStatus({
  reviewId,
  status,
  actorId,
  actorName = "User",
  actorRole = "teacher",
}) {
  const allowed = ["OPEN", "IN_REVIEW", "FEEDBACK", "STUDENT_RESPONSE", "RESOLVED"];
  if (!allowed.includes(status)) {
    throw new Error(`Invalid status: ${status}. Valid: ${allowed.join(", ")}`);
  }

  const review = await TeacherReview.findById(reviewId);
  if (!review) throw new Error("Teacher review not found.");

  const prevStatus = review.status;
  review.status = status;

  review.auditLog.push({
    action: "STATUS_CHANGED",
    actorId,
    actorName,
    timestamp: new Date(),
    details: `Status changed from ${prevStatus} to ${status} by ${actorRole}`,
  });

  await review.save();

  await recordProjectEvent({
    projectId: review.projectId,
    teamId: review.teamId,
    actorId,
    actorName,
    eventType: "TEACHER_REVIEW_STATUS_CHANGED",
    entityType: "teacher_review",
    entityId: review._id.toString(),
    title: `Teacher review ${status}`,
    description: `Transitioned from ${prevStatus} to ${status}`,
    previousValue: prevStatus,
    newValue: status,
    source: "teacher",
  });

  return review;
}

/**
 * Retrieve project reviews with strict privacy filtering.
 * Students NEVER see comments where isPrivateNote === true.
 */
export async function getProjectTeacherReviews(projectId, isFaculty = false) {
  if (!mongoose.isValidObjectId(projectId)) {
    throw new Error("Invalid project ID.");
  }

  const reviews = await TeacherReview.find({ projectId }).sort({ createdAt: -1 }).lean();

  return reviews.map(r => {
    // Privacy sanitization
    let safeComments = r.comments || [];
    if (!isFaculty) {
      safeComments = safeComments.filter(c => !c.isPrivateNote);
    }

    return {
      ...r,
      comments: safeComments,
      hasPrivateNotes: isFaculty ? (r.comments || []).some(c => c.isPrivateNote) : false,
    };
  });
}

/**
 * Get faculty dashboard feed of assigned projects.
 */
export async function getFacultyAssignedProjects(teacherId) {
  if (!mongoose.isValidObjectId(teacherId)) {
    throw new Error("Invalid teacher ID.");
  }

  const projects = await Project.find({
    assignedFacultyIds: teacherId,
  }).lean();

  const projectSummaries = await Promise.all(
    projects.map(async p => {
      const openReviewCount = await TeacherReview.countDocuments({
        projectId: p._id,
        status: { $ne: "RESOLVED" },
      });

      return {
        id: p._id.toString(),
        title: p.title,
        methodology: p.methodology,
        status: p.status,
        openReviewCount,
      };
    })
  );

  return projectSummaries;
}
