/**
 * server/services/invitationService.js
 * ============================================================================
 * Centralized Team & Workflow Invitation Service — NEXUSFLOW V4.0.
 *
 * Responsibilities:
 * - Email normalization & self-invite prevention
 * - Inviter role and team authorization checks (only authorized leaders/managers/owners)
 * - Resolution against the registered User model (no fake users, no fake IDs)
 * - Active membership and duplicate pending invitation guards
 * - Invitation record creation with 7-day expiration
 * - Notification record creation with ObjectId references
 * - Real-time Socket.IO dispatch
 * ============================================================================
 */

import mongoose from "mongoose";
import User from "../models/User.js";
import Team from "../models/Team.js";
import Invitation from "../models/Invitation.js";
import Notification from "../models/Notification.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates invitation expiration and status.
 */
export async function checkInvitationExpiry(inv) {
  if (!inv) return { error: "Invitation not found.", status: 404 };
  if (inv.status !== "pending") {
    return { error: `Invitation is already ${inv.status}.`, status: 400 };
  }
  if (new Date() > new Date(inv.expiresAt)) {
    inv.status = "expired";
    await inv.save();
    return { error: "Invitation has expired.", status: 400 };
  }
  return { invitation: inv };
}

/**
 * Checks if a user is an authorized leader or manager who can send invitations.
 */
export function isAuthorizedToInvite(team, userIdStr, userEmail = "", userName = "") {
  if (!team) return false;

  // 1. Team Owner can always invite
  if (team.ownerId && team.ownerId.toString() === userIdStr) {
    return true;
  }

  // 2. Legacy unowned team
  if (!team.ownerId && (!team.members || team.members.length === 0)) {
    return true;
  }

  // 3. Member with leader, manager, or admin role
  if (Array.isArray(team.members)) {
    const member = team.members.find((m) => {
      const mId = (m.userId?._id || m.userId)?.toString() || "";
      const mName = (m.name || "").toLowerCase().trim();
      return (
        (mId && mId === userIdStr) ||
        (userEmail && mName === userEmail.toLowerCase().trim()) ||
        (userName && mName === userName.toLowerCase().trim())
      );
    });

    if (member) {
      const role = String(member.role || "").toLowerCase();
      // Owners, leaders, and managers can send invitations
      return ["owner", "leader", "manager", "admin", "team leader", "project manager"].includes(role);
    }
  }

  return false;
}

/**
 * Sends a team collaboration invitation.
 *
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.teamId
 * @param {Object} params.inviter - Resolved User document or JWT auth user
 * @param {string} params.email - Target teammate email
 * @param {string} [params.role="member"] - Preserved role in workspace
 * @param {Object} [params.io] - Socket.IO instance
 * @returns {Promise<{ status: number, success?: boolean, error?: string, message?: string, invitation?: Object }>}
 */
export async function sendTeamInvitation({ teamId, inviter, inviterUser, email, invitedEmail, role = "member", io = null }) {
  const activeInviter = inviter || inviterUser;
  const targetEmail = email || invitedEmail;
  if (!teamId || !mongoose.isValidObjectId(teamId)) {
    return { status: 400, error: "Valid team ID is required.", ok: false };
  }

  if (!activeInviter) {
    return { status: 401, error: "Unauthorized: Inviter could not be resolved.", ok: false };
  }

  const inviterIdStr = (activeInviter._id || activeInviter.id)?.toString() || "";
  if (!inviterIdStr || !mongoose.isValidObjectId(inviterIdStr)) {
    return { status: 401, error: "Unauthorized: Invalid inviter ID.", ok: false };
  }

  const team = await Team.findById(teamId);
  if (!team) {
    return { status: 404, error: "Team not found.", ok: false };
  }

  // 1. Authorization check: only authorized leaders/managers/owners can invite
  const canInvite = isAuthorizedToInvite(
    team,
    inviterIdStr,
    activeInviter.email || "",
    activeInviter.name || ""
  );

  if (!canInvite) {
    return {
      status: 403,
      error: "Forbidden: Only team leaders, project managers, or team owners can send invitations.",
      ok: false,
    };
  }

  // 2. Email validation and normalization
  const normalizedEmail = String(targetEmail || "").toLowerCase().trim();
  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
    return { status: 400, error: "A valid email address is required to invite a teammate." };
  }

  // 3. Self-invite check
  const inviterEmail = String(activeInviter.email || "").toLowerCase().trim();
  if (normalizedEmail === inviterEmail) {
    return { status: 400, error: "You cannot invite yourself.", ok: false };
  }

  // 4. Target user registration check in User model
  const targetUser = await User.findOne({ email: normalizedEmail })
    .select("_id name email avatar")
    .lean();

  if (!targetUser) {
    return {
      status: 404,
      error: "User is not registered on NEXUSFLOW. They need to create an account before they can accept a team invitation.",
      ok: false,
    };
  }

  const targetUserIdStr = targetUser._id.toString();

  // 5. Already active member check
  const alreadyMember =
    (team.ownerId && team.ownerId.toString() === targetUserIdStr) ||
    (Array.isArray(team.members) &&
      team.members.some((m) => (m.userId?._id || m.userId)?.toString() === targetUserIdStr));

  if (alreadyMember) {
    return { status: 409, error: "User is already a member of this team.", ok: false };
  }

  // 6. Duplicate pending invitation check
  const existingPending = await Invitation.findOne({
    teamId: team._id,
    invitedUserId: targetUser._id,
    status: "pending",
  }).lean();

  if (existingPending) {
    return { status: 409, error: "Invitation already pending for this user.", ok: false };
  }

  // 7. Create Invitation record with 7-day expiration and preserved role
  const inviterName = activeInviter.name || activeInviter.email || "Teammate";
  const invitationRole = typeof role === "string" && role.trim() ? role.trim() : "member";

  const invitation = await Invitation.create({
    teamId: team._id,
    teamName: team.name,
    inviterId: new mongoose.Types.ObjectId(inviterIdStr),
    inviterName,
    inviterEmail: activeInviter.email || "",
    invitedUserId: targetUser._id,
    invitedEmail: targetUser.email,
    role: invitationRole,
    status: "pending",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  // 8. Create Notification record for invited user
  await Notification.create({
    userId: targetUser._id,
    type: "team_invitation",
    title: "Team Collaboration Invitation",
    message: `${inviterName} invited you to join team "${team.name}" as ${invitationRole}.`,
    data: {
      teamId: team._id,
      teamName: team.name,
      invitationId: invitation._id,
      inviterName,
      role: invitationRole,
    },
    status: "unread",
  });

  // 9. Dispatch real-time Socket.IO notification if available
  if (io) {
    const payload = {
      invitation: invitation.toObject(),
      teamName: team.name,
      inviterName,
      role: invitationRole,
    };
    io.to(`user:${targetUser._id}`).emit("invitation:received", payload);
    if (targetUser.email) {
      io.to(`user:${targetUser.email.toLowerCase().trim()}`).emit("invitation:received", payload);
    }
  }

  return {
    status: 201,
    success: true,
    ok: true,
    message: `Invitation sent to ${targetUser.email}`,
    invitation,
  };
}
