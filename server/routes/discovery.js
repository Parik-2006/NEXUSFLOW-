import express from "express";
import mongoose from "mongoose";
import Team from "../models/Team.js";
import User from "../models/User.js";
import TeamApplication from "../models/TeamApplication.js";
import { requireAuth } from "../auth.js";
import {
  submitApplication,
  acceptApplication,
  rejectApplication,
  withdrawApplication,
} from "../services/applicationService.js";

const router = express.Router();

/**
 * Helper to verify if the authenticated user is workspace owner or leader/manager.
 */
function isUserLeaderOrOwner(team, userId) {
  if (!team || !userId) return false;
  const uIdStr = userId.toString();
  if (team.ownerId && team.ownerId.toString() === uIdStr) return true;
  const member = (team.members || []).find((m) => m.userId && m.userId.toString() === uIdStr);
  if (!member) return false;
  const r = (member.role || "").toLowerCase();
  return ["owner", "leader", "team leader", "manager", "project manager"].includes(r);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PUBLIC TEAM DISCOVERY (Privacy-Safe Search & Filter)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/discovery/teams — Search & filter discoverable workspaces.
 * Privacy-safe: Never returns private member emails, private chats, or passwords.
 */
router.get("/discovery/teams", async (req, res) => {
  try {
    const {
      search,
      domain,
      methodology,
      projectStage,
      academicCategory,
      difficulty,
      requiredSkills,
      hasOpenRoles,
    } = req.query;

    const query = { isDiscoverable: true };

    if (domain && domain !== "All") {
      query["discoverySettings.domain"] = new RegExp(`^${domain.trim()}$`, "i");
    }
    if (methodology && methodology !== "All") {
      query["discoverySettings.methodology"] = new RegExp(`^${methodology.trim()}$`, "i");
    }
    if (projectStage && projectStage !== "All") {
      query["discoverySettings.projectStage"] = new RegExp(`^${projectStage.trim()}$`, "i");
    }
    if (academicCategory && academicCategory !== "All") {
      query["discoverySettings.academicCategory"] = new RegExp(`^${academicCategory.trim()}$`, "i");
    }
    if (difficulty && difficulty !== "All") {
      query["discoverySettings.difficulty"] = new RegExp(`^${difficulty.trim()}$`, "i");
    }

    if (hasOpenRoles === "true" || hasOpenRoles === true) {
      query.openRoles = { $elemMatch: { status: "open" } };
    }

    if (requiredSkills) {
      const skillsArr = Array.isArray(requiredSkills)
        ? requiredSkills
        : String(requiredSkills).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (skillsArr.length > 0) {
        query["openRoles.requiredSkills"] = { $in: skillsArr.map((s) => new RegExp(`^${s}$`, "i")) };
      }
    }

    if (search && String(search).trim()) {
      const s = String(search).trim();
      const regex = new RegExp(s, "i");
      query.$or = [
        { name: regex },
        { projectTitle: regex },
        { projectDescription: regex },
        { "discoverySettings.generalInfo": regex },
        { "openRoles.roleName": regex },
        { "openRoles.requiredSkills": regex },
      ];
    }

    const teams = await Team.find(query)
      .select("name logo projectTitle projectDescription discoverySettings openRoles members taskCount doneCount createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const sanitized = teams.map((t) => {
      const openRolesList = (t.openRoles || [])
        .filter((r) => r.status === "open")
        .map((r) => ({
          _id: r._id,
          roleName: r.roleName,
          roleDescription: r.roleDescription,
          requiredSkills: r.requiredSkills,
          preferredSkills: r.preferredSkills,
          minVerificationScore: r.minVerificationScore,
          expectations: r.expectations,
          availableSlots: r.availableSlots,
          filledSlots: r.filledSlots,
          status: r.status,
        }));

      return {
        _id: t._id,
        name: t.name,
        logo: t.logo || "",
        projectTitle: t.projectTitle || "",
        projectDescription: t.projectDescription || "",
        discoverySettings: t.discoverySettings || {},
        openRoles: openRolesList,
        memberCount: (t.members || []).length,
        taskCount: t.taskCount || 0,
        doneCount: t.doneCount || 0,
        createdAt: t.createdAt,
      };
    });

    res.json({ success: true, count: sanitized.length, teams: sanitized });
  } catch (err) {
    console.error("[Discovery] Error in /discovery/teams:", err);
    res.status(500).json({ error: "Failed to search discoverable teams." });
  }
});

/**
 * GET /api/discovery/teams/:teamId — Public overview of a discoverable workspace.
 */
router.get("/discovery/teams/:teamId", async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!mongoose.isValidObjectId(teamId)) {
      return res.status(400).json({ error: "Invalid team ID format." });
    }

    const team = await Team.findById(teamId)
      .select("name logo projectTitle projectDescription isDiscoverable discoverySettings openRoles members taskCount doneCount createdAt")
      .lean();

    if (!team) {
      return res.status(404).json({ error: "Workspace not found." });
    }

    if (!team.isDiscoverable) {
      return res.status(403).json({ error: "This workspace is not public or discoverable." });
    }

    const openRolesList = (team.openRoles || [])
      .filter((r) => r.status === "open")
      .map((r) => ({
        _id: r._id,
        roleName: r.roleName,
        roleDescription: r.roleDescription,
        requiredSkills: r.requiredSkills,
        preferredSkills: r.preferredSkills,
        minVerificationScore: r.minVerificationScore,
        expectations: r.expectations,
        availableSlots: r.availableSlots,
        filledSlots: r.filledSlots,
        status: r.status,
      }));

    res.json({
      success: true,
      team: {
        _id: team._id,
        name: team.name,
        logo: team.logo || "",
        projectTitle: team.projectTitle || "",
        projectDescription: team.projectDescription || "",
        discoverySettings: team.discoverySettings || {},
        openRoles: openRolesList,
        memberCount: (team.members || []).length,
        taskCount: team.taskCount || 0,
        doneCount: team.doneCount || 0,
        createdAt: team.createdAt,
      },
    });
  } catch (err) {
    console.error("[Discovery] Error in /discovery/teams/:teamId:", err);
    res.status(500).json({ error: "Failed to load team public profile." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. LEADER DISCOVERY SETTINGS & OPEN ROLES MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/teams/:teamId/discovery — Configure discoverability and project metadata.
 */
router.patch("/teams/:teamId/discovery", requireAuth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!mongoose.isValidObjectId(teamId)) {
      return res.status(400).json({ error: "Invalid team ID." });
    }

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: "Workspace not found." });

    if (!isUserLeaderOrOwner(team, req.user._id)) {
      return res.status(403).json({ error: "Only the workspace owner or leader can configure discovery settings." });
    }

    const { isDiscoverable, discoverySettings } = req.body;
    if (typeof isDiscoverable === "boolean") {
      team.isDiscoverable = isDiscoverable;
    }
    if (discoverySettings && typeof discoverySettings === "object") {
      team.discoverySettings = {
        ...(team.discoverySettings ? team.discoverySettings.toObject() : {}),
        ...discoverySettings,
      };
    }

    await team.save();
    res.json({
      success: true,
      isDiscoverable: team.isDiscoverable,
      discoverySettings: team.discoverySettings,
      message: "Discovery settings updated.",
    });
  } catch (err) {
    console.error("[Discovery] Error updating discovery settings:", err);
    res.status(500).json({ error: err.message || "Failed to update discovery settings." });
  }
});

/**
 * POST /api/teams/:teamId/open-roles — Leader creates an open role.
 */
router.post("/teams/:teamId/open-roles", requireAuth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!mongoose.isValidObjectId(teamId)) {
      return res.status(400).json({ error: "Invalid team ID." });
    }

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: "Workspace not found." });

    if (!isUserLeaderOrOwner(team, req.user._id)) {
      return res.status(403).json({ error: "Only workspace leaders can add open roles." });
    }

    const {
      roleName,
      roleDescription = "",
      requiredSkills = [],
      preferredSkills = [],
      minVerificationScore = 3,
      expectations = "",
      availableSlots = 1,
    } = req.body;

    if (!roleName || !String(roleName).trim()) {
      return res.status(400).json({ error: "Role name is required." });
    }

    const newRole = {
      _id: new mongoose.Types.ObjectId(),
      roleName: String(roleName).trim(),
      roleDescription: String(roleDescription || "").trim(),
      requiredSkills: Array.isArray(requiredSkills) ? requiredSkills.map((s) => String(s).trim().toLowerCase()).filter(Boolean) : [],
      preferredSkills: Array.isArray(preferredSkills) ? preferredSkills.map((s) => String(s).trim().toLowerCase()).filter(Boolean) : [],
      minVerificationScore: Math.min(5, Math.max(1, Number(minVerificationScore) || 3)),
      expectations: String(expectations || "").trim(),
      availableSlots: Math.max(1, Number(availableSlots) || 1),
      filledSlots: 0,
      status: "open",
      createdAt: new Date(),
    };

    team.openRoles.push(newRole);
    await team.save();

    res.status(201).json({ success: true, role: newRole, message: "Open role added." });
  } catch (err) {
    console.error("[Discovery] Error adding open role:", err);
    res.status(500).json({ error: err.message || "Failed to add open role." });
  }
});

/**
 * PATCH /api/teams/:teamId/open-roles/:roleId — Leader updates an open role.
 */
router.patch("/teams/:teamId/open-roles/:roleId", requireAuth, async (req, res) => {
  try {
    const { teamId, roleId } = req.params;
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: "Workspace not found." });

    if (!isUserLeaderOrOwner(team, req.user._id)) {
      return res.status(403).json({ error: "Only workspace leaders can update open roles." });
    }

    const role = team.openRoles.id(roleId);
    if (!role) return res.status(404).json({ error: "Role not found." });

    const updates = req.body;
    if (updates.roleName) role.roleName = String(updates.roleName).trim();
    if (updates.roleDescription !== undefined) role.roleDescription = String(updates.roleDescription).trim();
    if (Array.isArray(updates.requiredSkills)) {
      role.requiredSkills = updates.requiredSkills.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
    }
    if (Array.isArray(updates.preferredSkills)) {
      role.preferredSkills = updates.preferredSkills.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
    }
    if (updates.minVerificationScore !== undefined) {
      role.minVerificationScore = Math.min(5, Math.max(1, Number(updates.minVerificationScore) || 3));
    }
    if (updates.expectations !== undefined) role.expectations = String(updates.expectations).trim();
    if (updates.availableSlots !== undefined) role.availableSlots = Math.max(1, Number(updates.availableSlots) || 1);
    if (updates.status && ["open", "closed"].includes(updates.status)) role.status = updates.status;

    await team.save();
    res.json({ success: true, role, message: "Open role updated." });
  } catch (err) {
    console.error("[Discovery] Error updating open role:", err);
    res.status(500).json({ error: err.message || "Failed to update open role." });
  }
});

/**
 * DELETE /api/teams/:teamId/open-roles/:roleId — Leader deletes/closes an open role.
 */
router.delete("/teams/:teamId/open-roles/:roleId", requireAuth, async (req, res) => {
  try {
    const { teamId, roleId } = req.params;
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: "Workspace not found." });

    if (!isUserLeaderOrOwner(team, req.user._id)) {
      return res.status(403).json({ error: "Only workspace leaders can remove open roles." });
    }

    const role = team.openRoles.id(roleId);
    if (!role) return res.status(404).json({ error: "Role not found." });

    team.openRoles.pull({ _id: roleId });
    await team.save();

    res.json({ success: true, message: "Open role removed." });
  } catch (err) {
    console.error("[Discovery] Error removing open role:", err);
    res.status(500).json({ error: err.message || "Failed to remove open role." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CANDIDATE APPLICATION SUBMISSION & STATUS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/discovery/teams/:teamId/roles/:roleId/apply — Candidate submits application.
 */
router.post("/discovery/teams/:teamId/roles/:roleId/apply", requireAuth, async (req, res) => {
  try {
    const { teamId, roleId } = req.params;
    const { message, quizResult } = req.body;

    const application = await submitApplication({
      teamId,
      roleId,
      applicantUser: req.user,
      message,
      quizResult,
    });

    res.status(201).json({
      success: true,
      application,
      message: "Application submitted successfully.",
    });
  } catch (err) {
    console.error("[Discovery] Error submitting application:", err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Failed to submit application." });
  }
});

/**
 * GET /api/my-applications — Candidate views their own applications.
 */
router.get("/my-applications", requireAuth, async (req, res) => {
  try {
    const applications = await TeamApplication.find({ applicantId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, count: applications.length, applications });
  } catch (err) {
    console.error("[Discovery] Error in /my-applications:", err);
    res.status(500).json({ error: "Failed to fetch your applications." });
  }
});

/**
 * POST /api/applications/:applicationId/withdraw — Candidate withdraws their application.
 */
router.post("/applications/:applicationId/withdraw", requireAuth, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const application = await withdrawApplication({
      applicationId,
      applicantUser: req.user,
    });

    res.json({
      success: true,
      application,
      message: "Application withdrawn successfully.",
    });
  } catch (err) {
    console.error("[Discovery] Error withdrawing application:", err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Failed to withdraw application." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. LEADER APPLICATION REVIEW (Accept & Reject)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/teams/:teamId/applications — Leader views applications for their workspace.
 */
router.get("/teams/:teamId/applications", requireAuth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!mongoose.isValidObjectId(teamId)) {
      return res.status(400).json({ error: "Invalid team ID." });
    }

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: "Workspace not found." });

    if (!isUserLeaderOrOwner(team, req.user._id)) {
      return res.status(403).json({ error: "Only workspace leaders can view applications." });
    }

    const applications = await TeamApplication.find({ teamId: team._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, count: applications.length, applications });
  } catch (err) {
    console.error("[Discovery] Error fetching team applications:", err);
    res.status(500).json({ error: "Failed to fetch workspace applications." });
  }
});

/**
 * POST /api/applications/:applicationId/accept — Leader accepts candidate application.
 */
router.post("/applications/:applicationId/accept", requireAuth, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const result = await acceptApplication({
      applicationId,
      leaderUser: req.user,
    });

    res.json({
      success: true,
      application: result.application,
      message: `Candidate accepted into team.`,
    });
  } catch (err) {
    console.error("[Discovery] Error accepting application:", err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Failed to accept application." });
  }
});

/**
 * POST /api/applications/:applicationId/reject — Leader rejects candidate application.
 */
router.post("/applications/:applicationId/reject", requireAuth, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { reason = "" } = req.body;

    const application = await rejectApplication({
      applicationId,
      leaderUser: req.user,
      reason,
    });

    res.json({
      success: true,
      application,
      message: "Application rejected.",
    });
  } catch (err) {
    console.error("[Discovery] Error rejecting application:", err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Failed to reject application." });
  }
});

export default router;
