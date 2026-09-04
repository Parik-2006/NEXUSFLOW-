/**
 * applicationService.js — V4 Open Team Discovery & Application Management
 *
 * Implements:
 * - Skill match calculations (weighted matching of required & preferred skills)
 * - Application lifecycle (SUBMITTED, UNDER_REVIEW, ACCEPTED, REJECTED, WITHDRAWN)
 * - Anti-tampering and duplicate prevention
 * - Leader-only review actions with actual User ID membership creation
 * - Notification dispatch & TeamApplicationAudit logging
 */
import mongoose from "mongoose";
import Team from "../models/Team.js";
import User from "../models/User.js";
import TeamApplication from "../models/TeamApplication.js";
import TeamApplicationAudit from "../models/TeamApplicationAudit.js";
import Notification from "../models/Notification.js";
import SkillVerification from "../models/SkillVerification.js";

/**
 * Calculates candidate skill-match percentage against role requirements.
 * Weight: Required skills (70%), Preferred skills (30%).
 */
export function calculateSkillMatch({
  requiredSkills = [],
  preferredSkills = [],
  userProfileSkills = [],
  verifiedBadges = [],
  currentQuiz = null,
}) {
  const norm = (list) => (list || []).map((s) => String(s).toLowerCase().trim()).filter(Boolean);
  const req = norm(requiredSkills);
  const pref = norm(preferredSkills);

  // Set of verified skills (from DB badges or passing current quiz)
  const verifiedSet = new Set(
    (verifiedBadges || [])
      .filter((b) => b.verified === true || b.status === "passed" || (b.score && b.score >= 3))
      .map((b) => String(b.skill).toLowerCase().trim())
  );

  if (currentQuiz && (currentQuiz.verified || (currentQuiz.score && currentQuiz.score >= 3))) {
    if (currentQuiz.skill) verifiedSet.add(String(currentQuiz.skill).toLowerCase().trim());
  }

  // Set of general profile skills
  const profileSet = new Set(norm(userProfileSkills));

  const hasSkill = (s) => verifiedSet.has(s) || profileSet.has(s);

  const matchedRequired = req.filter(hasSkill);
  const missingRequired = req.filter((s) => !hasSkill(s));

  const matchedPreferred = pref.filter(hasSkill);
  const missingPreferred = pref.filter((s) => !hasSkill(s));

  let matchPercentage = 100;
  if (req.length > 0 && pref.length > 0) {
    const reqRatio = matchedRequired.length / req.length;
    const prefRatio = matchedPreferred.length / pref.length;
    matchPercentage = Math.round(reqRatio * 70 + prefRatio * 30);
  } else if (req.length > 0) {
    matchPercentage = Math.round((matchedRequired.length / req.length) * 100);
  } else if (pref.length > 0) {
    matchPercentage = Math.round((matchedPreferred.length / pref.length) * 100);
  }

  let compatibilityLabel = "Developing";
  if (matchPercentage >= 70) compatibilityLabel = "High";
  else if (matchPercentage >= 40) compatibilityLabel = "Moderate";

  return {
    score: matchPercentage,
    matchPercentage,
    matchedSkills: [...matchedRequired, ...matchedPreferred],
    missingSkills: [...missingRequired, ...missingPreferred],
    compatibilityLabel,
  };
}

async function resolveUser(user) {
  if (!user) return null;
  const id = (user._id || user.id)?.toString();
  if (mongoose.isValidObjectId(id)) {
    const doc = await User.findById(id);
    if (doc) return doc;
  }
  if (user.email) {
    const doc = await User.findOne({ email: user.email.toLowerCase().trim() });
    if (doc) return doc;
  }
  return null;
}

/**
 * Submits a student application for an open role.
 */
export async function submitApplication({
  teamId,
  roleId,
  applicantUser,
  message = "",
  quizResult = null,
}) {
  if (!mongoose.isValidObjectId(teamId)) {
    throw { status: 400, message: "Invalid team ID format." };
  }
  if (!mongoose.isValidObjectId(roleId)) {
    throw { status: 400, message: "Invalid role ID format." };
  }

  const applicant = await resolveUser(applicantUser);
  if (!applicant) {
    throw { status: 401, message: "Unauthorized or applicant account not found." };
  }

  const team = await Team.findById(teamId);
  if (!team) {
    throw { status: 404, message: "Workspace not found." };
  }

  if (!team.isDiscoverable) {
    throw { status: 400, message: "This workspace is not open for discovery or public applications." };
  }

  const role = team.openRoles?.id(roleId);
  if (!role || role.status !== "open") {
    throw { status: 404, message: "Selected role is no longer available or open." };
  }

  // Check if applicant is already a member
  const isMember = (team.members || []).some(
    (m) => m.userId && m.userId.toString() === applicant._id.toString()
  );
  if (isMember) {
    throw { status: 409, message: "You are already a member of this workspace." };
  }

  // Prevent duplicate active application
  const existingActive = await TeamApplication.findOne({
    teamId: team._id,
    roleId: role._id,
    applicantId: applicant._id,
    status: { $in: ["SUBMITTED", "UNDER_REVIEW", "QUIZ_PENDING"] },
  });
  if (existingActive) {
    throw { status: 409, message: "You already have an active application for this role." };
  }

  // Retrieve user's verified badges
  const verifiedDocs = await SkillVerification.find({
    userId: applicant._id,
    verified: true,
  }).lean();

  const verifiedBadges = verifiedDocs.map((doc) => ({
    skill: doc.skill,
    score: doc.score,
    totalQuestions: doc.totalQuestions || 5,
    percentage: doc.percentage || Math.round((doc.score / 5) * 100),
    verified: true,
    verifiedAt: doc.verifiedAt || doc.createdAt,
  }));

  // Incorporate current quiz if completed
  if (quizResult && quizResult.skill && quizResult.score !== undefined) {
    const isPassing = quizResult.score >= (role.minVerificationScore || 3);
    const existingIndex = verifiedBadges.findIndex(
      (b) => b.skill.toLowerCase() === quizResult.skill.toLowerCase()
    );
    const badgeItem = {
      skill: quizResult.skill,
      score: quizResult.score,
      totalQuestions: quizResult.totalQuestions || 5,
      percentage: quizResult.percentage || Math.round((quizResult.score / 5) * 100),
      verified: isPassing,
      verifiedAt: new Date(),
    };
    if (existingIndex >= 0) {
      verifiedBadges[existingIndex] = badgeItem;
    } else {
      verifiedBadges.push(badgeItem);
    }
  }

  const skillMatch = calculateSkillMatch({
    requiredSkills: role.requiredSkills,
    preferredSkills: role.preferredSkills,
    userProfileSkills: applicant.skills || [],
    verifiedBadges,
    currentQuiz: quizResult,
  });

  const application = await TeamApplication.create({
    teamId: team._id,
    teamName: team.name,
    roleId: role._id,
    roleName: role.roleName,
    applicantId: applicant._id,
    applicantName: applicant.name || "Candidate",
    applicantEmail: applicant.email.toLowerCase().trim(),
    status: "SUBMITTED",
    message: String(message || "").trim(),
    quizScore: quizResult?.score ?? 0,
    quizTotal: quizResult?.totalQuestions ?? 5,
    quizPercentage: quizResult?.percentage ?? (quizResult?.score ? Math.round((quizResult.score / 5) * 100) : 0),
    verifiedSkills: verifiedBadges,
    skillMatch,
  });

  // Audit event
  await TeamApplicationAudit.create({
    applicationId: application._id,
    teamId: team._id,
    actorId: applicant._id,
    action: "SUBMITTED",
    previousStatus: "DRAFT",
    newStatus: "SUBMITTED",
    reason: "Candidate submitted role application",
    metadata: {
      roleName: role.roleName,
      skillMatchScore: skillMatch.score,
    },
  });

  // Notify team leader/owner
  try {
    const notifyRecipientId = team.ownerId;
    if (notifyRecipientId) {
      await Notification.create({
        userId: notifyRecipientId,
        type: "application_submitted",
        title: "New Team Application",
        message: `${applicant.name || "A candidate"} applied for the "${role.roleName}" role on "${team.name}".`,
        data: {
          teamId: team._id,
          teamName: team.name,
          applicationId: application._id,
          applicantName: applicant.name,
          role: role.roleName,
        },
      });
    }
  } catch (notifErr) {
    console.warn("[Application] Could not dispatch leader notification:", notifErr.message);
  }

  return application;
}

/**
 * Accepts an application and creates a team membership with real User ID.
 */
export async function acceptApplication({ applicationId, leaderUser }) {
  if (!mongoose.isValidObjectId(applicationId)) {
    throw { status: 400, message: "Invalid application ID format." };
  }

  const application = await TeamApplication.findById(applicationId);
  if (!application) {
    throw { status: 404, message: "Application not found." };
  }

  if (!["SUBMITTED", "UNDER_REVIEW"].includes(application.status)) {
    throw {
      status: 400,
      message: `Cannot accept application in "${application.status}" status.`,
    };
  }

  const leader = await resolveUser(leaderUser);
  if (!leader) {
    throw { status: 401, message: "Unauthorized: User record not found." };
  }

  const team = await Team.findById(application.teamId);
  if (!team) {
    throw { status: 404, message: "Workspace not found." };
  }

  // Authorization check: leader, manager, or owner
  const isOwner = team.ownerId && team.ownerId.toString() === leader._id.toString();
  const leaderMember = (team.members || []).find(
    (m) => m.userId && m.userId.toString() === leader._id.toString()
  );
  const isLeader =
    isOwner ||
    (leaderMember &&
      ["owner", "leader", "team leader", "manager", "project manager"].includes(
        (leaderMember.role || "").toLowerCase()
      ));

  if (!isLeader) {
    throw {
      status: 403,
      message: "Only the workspace owner or a team leader/manager can accept applications.",
    };
  }

  // Verify candidate exists
  const candidate = await User.findById(application.applicantId);
  if (!candidate) {
    throw { status: 404, message: "Candidate user record not found." };
  }

  // Add to team members if not already present
  const alreadyMember = (team.members || []).some(
    (m) => m.userId && m.userId.toString() === candidate._id.toString()
  );

  if (!alreadyMember) {
    team.members.push({
      userId: candidate._id,
      name: candidate.name || application.applicantName,
      avatar: candidate.avatar || "",
      role: "member",
      skills: { frontend: 5, backend: 5, devops: 5, design: 5, ml: 5, testing: 5 },
      capacity: 40,
      assignedLoad: 0,
    });

    // Update open role filledSlots
    const role = team.openRoles?.id(application.roleId);
    if (role) {
      role.filledSlots = (role.filledSlots || 0) + 1;
      if (role.filledSlots >= (role.availableSlots || 1)) {
        role.status = "closed";
      }
    }

    await team.save();
  }

  // Update application state
  const prevStatus = application.status;
  application.status = "ACCEPTED";
  application.reviewerId = leader._id;
  application.reviewerName = leader.name || "Team Leader";
  application.reviewedAt = new Date();
  await application.save();

  // Create audit record
  await TeamApplicationAudit.create({
    applicationId: application._id,
    teamId: team._id,
    actorId: leader._id,
    action: "ACCEPTED",
    previousStatus: prevStatus,
    newStatus: "ACCEPTED",
    reason: "Accepted by team leader",
    metadata: {
      candidateId: candidate._id,
      roleName: application.roleName,
    },
  });

  // Notify candidate
  try {
    await Notification.create({
      userId: candidate._id,
      type: "application_accepted",
      title: "Application Accepted!",
      message: `Congratulations! Your application for "${application.roleName}" on team "${team.name}" was accepted. You are now an active team member.`,
      data: {
        teamId: team._id,
        teamName: team.name,
        applicationId: application._id,
        role: application.roleName,
      },
    });
  } catch (notifErr) {
    console.warn("[Application] Could not dispatch candidate acceptance notification:", notifErr.message);
  }

  return { application, team };
}

/**
 * Rejects an application with an optional reason.
 */
export async function rejectApplication({ applicationId, leaderUser, reason = "" }) {
  if (!mongoose.isValidObjectId(applicationId)) {
    throw { status: 400, message: "Invalid application ID format." };
  }

  const application = await TeamApplication.findById(applicationId);
  if (!application) {
    throw { status: 404, message: "Application not found." };
  }

  if (!["SUBMITTED", "UNDER_REVIEW"].includes(application.status)) {
    throw {
      status: 400,
      message: `Cannot reject application in "${application.status}" status.`,
    };
  }

  const leader = await resolveUser(leaderUser);
  if (!leader) {
    throw { status: 401, message: "Unauthorized: User record not found." };
  }

  const team = await Team.findById(application.teamId);
  if (!team) {
    throw { status: 404, message: "Workspace not found." };
  }

  const isOwner = team.ownerId && team.ownerId.toString() === leader._id.toString();
  const leaderMember = (team.members || []).find(
    (m) => m.userId && m.userId.toString() === leader._id.toString()
  );
  const isLeader =
    isOwner ||
    (leaderMember &&
      ["owner", "leader", "team leader", "manager", "project manager"].includes(
        (leaderMember.role || "").toLowerCase()
      ));

  if (!isLeader) {
    throw {
      status: 403,
      message: "Only the workspace owner or a team leader/manager can reject applications.",
    };
  }

  const prevStatus = application.status;
  application.status = "REJECTED";
  application.reviewerId = leader._id;
  application.reviewerName = leader.name || "Team Leader";
  application.reviewReason = String(reason || "").trim();
  application.reviewedAt = new Date();
  await application.save();

  // Create audit record
  await TeamApplicationAudit.create({
    applicationId: application._id,
    teamId: team._id,
    actorId: leader._id,
    action: "REJECTED",
    previousStatus: prevStatus,
    newStatus: "REJECTED",
    reason: application.reviewReason || "Application not accepted",
  });

  // Notify candidate
  try {
    const reasonClause = application.reviewReason ? `: ${application.reviewReason}` : ".";
    await Notification.create({
      userId: application.applicantId,
      type: "application_rejected",
      title: "Application Status Update",
      message: `Your application for "${application.roleName}" on team "${team.name}" was not accepted${reasonClause}`,
      data: {
        teamId: team._id,
        teamName: team.name,
        applicationId: application._id,
        role: application.roleName,
        reason: application.reviewReason,
      },
    });
  } catch (notifErr) {
    console.warn("[Application] Could not dispatch rejection notification:", notifErr.message);
  }

  return application;
}

/**
 * Allows a candidate to withdraw their active application.
 */
export async function withdrawApplication({ applicationId, applicantUser }) {
  if (!mongoose.isValidObjectId(applicationId)) {
    throw { status: 400, message: "Invalid application ID format." };
  }

  const application = await TeamApplication.findById(applicationId);
  if (!application) {
    throw { status: 404, message: "Application not found." };
  }

  const applicant = await resolveUser(applicantUser);
  if (!applicant || application.applicantId.toString() !== applicant._id.toString()) {
    throw { status: 403, message: "You can only withdraw your own applications." };
  }

  if (!["SUBMITTED", "UNDER_REVIEW", "QUIZ_PENDING", "DRAFT"].includes(application.status)) {
    throw {
      status: 400,
      message: `Cannot withdraw an application that is already ${application.status}.`,
    };
  }

  const prevStatus = application.status;
  application.status = "WITHDRAWN";
  application.withdrawnAt = new Date();
  await application.save();

  await TeamApplicationAudit.create({
    applicationId: application._id,
    teamId: application.teamId,
    actorId: applicant._id,
    action: "WITHDRAWN",
    previousStatus: prevStatus,
    newStatus: "WITHDRAWN",
    reason: "Candidate withdrew application",
  });

  return application;
}
