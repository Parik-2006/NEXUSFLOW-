/**
 * server/routes/github.js
 * NEXUSFLOW V4 — GitHub Integration, Repository Intelligence & Workspace Memory Routes
 *
 * Implements:
 *   - OAuth authentication flow with CSRF protection and dual URL responses
 *   - Accessible user repositories listing for UI selector
 *   - Exactly one active repository per workspace enforcement
 *   - Incremental repository synchronization and re-indexing
 *   - Granular status reporting (connected, syncing, error, stale, disconnected)
 *   - Safe disconnection with audit preservation
 *   - Grounded workspace context Q&A endpoint
 */

import express from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { requireAuth } from "../auth.js";
import GitHubIntegration from "../models/GitHubIntegration.js";
import RepositoryIndex from "../models/RepositoryIndex.js";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import {
  encryptToken,
  decryptToken,
  fetchRepoSummary,
  buildOAuthUrl,
  exchangeCodeForToken,
  fetchUserRepos,
} from "../services/githubService.js";
import { indexRepositoryForProject, getRepositoryIntelligence } from "../services/repositoryIndexingService.js";
import { answerWorkspaceQuery, assembleWorkspaceContext } from "../services/workspaceContextService.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

const CLIENT_ID     = () => process.env.GITHUB_CLIENT_ID     || "";
const CLIENT_SECRET = () => process.env.GITHUB_CLIENT_SECRET || "";
const REDIRECT_URI  = () => process.env.GITHUB_REDIRECT_URI  || "http://localhost:4000/api/github/auth/callback";

// In-memory state store for CSRF with TTL
const oauthStateStore = new Map();

// Periodic cleanup of stale OAuth state
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of oauthStateStore.entries()) {
    if (now - val.createdAt > 15 * 60_000) {
      oauthStateStore.delete(key);
    }
  }
}, 60_000);

/**
 * Helper: verify that the user is authorized to access the given project/workspace
 */
async function verifyProjectAccess(projectId, userId, res) {
  if (!mongoose.isValidObjectId(projectId)) {
    res.status(400).json({ error: "Invalid project ID" });
    return null;
  }

  const project = await Project.findById(projectId).lean();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }

  if (project.teamId) {
    const team = await Team.findById(project.teamId).lean();
    if (team) {
      const uid = userId?.toString();
      const isOwner = team.ownerId && team.ownerId.toString() === uid;
      const isMember = Array.isArray(team.members) && team.members.some((m) => {
        const mid = (m.userId?._id || m.userId)?.toString();
        return mid === uid;
      });

      if (!isOwner && !isMember && !team.ownerId) {
        // legacy workspace without strict owner
        return { project, team };
      }

      if (!isOwner && !isMember) {
        res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
        return null;
      }
      return { project, team };
    }
  }

  return { project, team: null };
}

// ── 1. OAuth Init ─────────────────────────────────────────────────────────────
router.get("/github/auth/init", requireAuth, (req, res) => {
  const { projectId, teamId } = req.query;
  const clientId = CLIENT_ID();

  if (!clientId) {
    return res.status(200).json({
      configured: false,
      message: "GitHub OAuth not configured. You can still connect repositories manually.",
    });
  }

  const state = crypto.randomBytes(16).toString("hex");
  oauthStateStore.set(state, {
    userId:    (req.user._id || req.user.id).toString(),
    projectId: projectId ? String(projectId) : null,
    teamId:    teamId ? String(teamId) : null,
    createdAt: Date.now(),
  });

  const url = buildOAuthUrl(state, clientId, REDIRECT_URI());
  // Return both authUrl and redirectUrl to accommodate all client conventions
  res.json({
    configured:  true,
    authUrl:     url,
    redirectUrl: url,
  });
});

// ── 2. OAuth Callback ─────────────────────────────────────────────────────────
router.get("/github/auth/callback", async (req, res) => {
  const { code, state } = req.query;
  const storedState = oauthStateStore.get(state);

  if (!storedState || Date.now() - storedState.createdAt > 10 * 60_000) {
    return res.status(400).json({ error: "Invalid or expired OAuth state" });
  }
  oauthStateStore.delete(state);

  try {
    const accessToken = await exchangeCodeForToken(code, CLIENT_ID(), CLIENT_SECRET(), REDIRECT_URI());
    const encryptedToken = encryptToken(accessToken);

    // If projectId was passed, link to this project directly
    if (storedState.projectId && mongoose.isValidObjectId(storedState.projectId)) {
      await GitHubIntegration.findOneAndUpdate(
        { projectId: storedState.projectId },
        {
          $set: {
            userId: storedState.userId,
            teamId: storedState.teamId,
            encryptedToken,
            isActive: true,
            connectionStatus: "connected",
          },
        },
        { upsert: true, new: true }
      );
    } else {
      // Save user-level token association by updating any active integration for this user
      await GitHubIntegration.updateMany(
        { userId: storedState.userId },
        { $set: { encryptedToken } }
      );
    }

    const frontendUrl = (() => {
      const url = process.env.FRONTEND_URL || "";
      if (!url || url.includes("your-frontend") || url.includes("example.com")) return "http://localhost:8081";
      return url.replace(/\/+$/, "");
    })();

    res.redirect(`${frontendUrl}/github/connected?success=true&projectId=${storedState.projectId || ""}`);
  } catch (err) {
    logger.error("GitHub OAuth callback failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── 3. List Accessible Repositories for Current User ──────────────────────────
router.get("/github/user/repos", requireAuth, async (req, res) => {
  const userId = req.user._id || req.user.id;

  try {
    // Find any integration record for this user containing an encrypted token
    const existing = await GitHubIntegration.findOne({ userId })
      .select("+encryptedToken")
      .sort({ updatedAt: -1 });

    if (!existing || !existing.encryptedToken) {
      return res.status(200).json({
        connected: false,
        repositories: [],
        message: "No authenticated GitHub account found. Please authorize with GitHub first.",
      });
    }

    const repos = await fetchUserRepos(existing.encryptedToken);
    res.json({
      connected: true,
      repositories: repos,
    });
  } catch (err) {
    logger.warn(`Failed to fetch GitHub user repos: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── 4. Connect Repository to Project (Enforces 1 Active Repo per Workspace) ─────
router.post("/projects/:projectId/github/connect", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const { repoOwner, repoName, defaultBranch, selectedBranch, visibility } = req.body;
  const userId = req.user._id || req.user.id;

  const authResult = await verifyProjectAccess(projectId, userId, res);
  if (!authResult) return;
  const { project, team } = authResult;

  if (!repoOwner || !repoName) {
    return res.status(400).json({ error: "repoOwner and repoName are required" });
  }

  const cleanOwner = String(repoOwner).trim();
  const cleanName  = String(repoName).trim();
  const repoFullName = `${cleanOwner}/${cleanName}`;
  const repoUrl = `https://github.com/${cleanOwner}/${cleanName}`;

  try {
    // Locate token from current project integration OR from user's other connections
    let tokenDoc = await GitHubIntegration.findOne({ projectId })
      .select("+encryptedToken");

    if (!tokenDoc?.encryptedToken) {
      tokenDoc = await GitHubIntegration.findOne({ userId })
        .select("+encryptedToken")
        .sort({ updatedAt: -1 });
    }

    // Upsert the single active integration for this project
    const integration = await GitHubIntegration.findOneAndUpdate(
      { projectId },
      {
        $set: {
          userId,
          teamId: project.teamId || team?._id,
          repoOwner: cleanOwner,
          repoName: cleanName,
          repoFullName,
          repoUrl,
          defaultBranch: defaultBranch || "main",
          selectedBranch: selectedBranch || defaultBranch || "main",
          visibility: visibility || "unknown",
          connectionStatus: "connected",
          isActive: true,
          isStale: false,
          lastSyncError: "",
          disconnectedAt: null,
          disconnectedBy: null,
          ...(tokenDoc?.encryptedToken ? { encryptedToken: tokenDoc.encryptedToken } : {}),
        },
      },
      { upsert: true, new: true }
    );

    // Trigger initial indexing asynchronously in background
    indexRepositoryForProject({ projectId, force: true, userId }).catch((idxErr) => {
      logger.warn(`[github/connect] Background indexing warning for ${repoFullName}: ${idxErr.message}`);
    });

    res.json({
      success: true,
      message: `Repository ${repoFullName} connected successfully`,
      integration: {
        repoOwner: cleanOwner,
        repoName: cleanName,
        repoFullName,
        repoUrl,
        defaultBranch: integration.defaultBranch,
        selectedBranch: integration.selectedBranch,
        connectionStatus: integration.connectionStatus,
        lastSyncAt: integration.lastSyncAt,
      },
    });
  } catch (err) {
    logger.error(`Error connecting repo to project ${projectId}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── 5. Status Check (Full State & Sync Info) ───────────────────────────────────
router.get("/projects/:projectId/github/status", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user._id || req.user.id;

  const authResult = await verifyProjectAccess(projectId, userId, res);
  if (!authResult) return;

  const integration = await GitHubIntegration.findOne({ projectId, isActive: true }).lean();

  if (!integration) {
    return res.json({
      connected: false,
      repo: null,
      status: "disconnected",
    });
  }

  res.json({
    connected: true,
    repo: {
      owner:          integration.repoOwner,
      name:           integration.repoName,
      fullName:       integration.repoFullName,
      url:            integration.repoUrl,
      defaultBranch:  integration.defaultBranch,
      selectedBranch: integration.selectedBranch,
      visibility:     integration.visibility,
    },
    status:              integration.connectionStatus || "connected",
    lastSyncAt:          integration.lastSyncAt,
    lastSyncCommitSha:   integration.lastSyncCommitSha,
    lastAttemptedSyncAt: integration.lastAttemptedSyncAt,
    lastSyncError:       integration.lastSyncError,
    isStale:             Boolean(integration.isStale),
    indexingVersion:     integration.indexingVersion,
  });
});

// ── 6. Get GitHub Summary ──────────────────────────────────────────────────────
router.get("/projects/:projectId/github/summary", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user._id || req.user.id;

  const authResult = await verifyProjectAccess(projectId, userId, res);
  if (!authResult) return;

  try {
    const integration = await GitHubIntegration.findOne({ projectId, isActive: true })
      .select("+encryptedToken");

    if (!integration?.encryptedToken) {
      return res.status(404).json({ error: "No active GitHub repository connected to this workspace" });
    }

    // Serve from cache if fresh (5 minutes)
    if (
      integration.cacheExpiresAt &&
      new Date(integration.cacheExpiresAt) > new Date() &&
      integration.cachedSummary?.repoFullName
    ) {
      return res.json({ summary: integration.cachedSummary, cached: true });
    }

    const summary = await fetchRepoSummary(
      integration.encryptedToken,
      integration.repoOwner,
      integration.repoName
    );

    integration.cachedSummary = summary;
    integration.cacheExpiresAt = new Date(Date.now() + 5 * 60_000);
    await integration.save();

    res.json({ summary, cached: false });
  } catch (err) {
    logger.error(`Error fetching GitHub summary for project ${projectId}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── 7. Trigger Sync / Re-indexing ─────────────────────────────────────────────
router.post(["/projects/:projectId/github/sync", "/projects/:projectId/github/refresh"], requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user._id || req.user.id;

  const authResult = await verifyProjectAccess(projectId, userId, res);
  if (!authResult) return;

  try {
    const result = await indexRepositoryForProject({
      projectId,
      force: true,
      userId,
    });

    res.json({
      success: true,
      message: "Repository synchronization completed successfully.",
      ...result,
    });
  } catch (err) {
    logger.error(`Sync failed for project ${projectId}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── 8. Disconnect Repository ──────────────────────────────────────────────────
router.delete("/projects/:projectId/github", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user._id || req.user.id;

  const authResult = await verifyProjectAccess(projectId, userId, res);
  if (!authResult) return;

  // Soft-disconnect active integration to preserve audit trail
  await GitHubIntegration.findOneAndUpdate(
    { projectId, isActive: true },
    {
      $set: {
        isActive: false,
        connectionStatus: "disconnected",
        disconnectedAt: new Date(),
        disconnectedBy: userId,
      },
    }
  );

  // Mark repository index as stale/inactive
  await RepositoryIndex.findOneAndUpdate(
    { projectId, isActive: true },
    {
      $set: {
        isActive: false,
        status: "stale",
      },
    }
  );

  res.json({
    success: true,
    message: "Repository disconnected. Historical project artifacts and conversations are preserved.",
  });
});

// ── 9. Repository File Tree & Snippet Retrieval ───────────────────────────────
router.get("/projects/:projectId/github/tree", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user._id || req.user.id;

  const authResult = await verifyProjectAccess(projectId, userId, res);
  if (!authResult) return;

  const repoIndex = await RepositoryIndex.findOne({ projectId, isActive: true })
    .select("files techStack architectureSummary keyModuleLocations lastIndexedAt lastIndexedCommitSha");

  if (!repoIndex) {
    return res.status(404).json({ error: "No repository index found for this workspace" });
  }

  res.json({
    success: true,
    totalFiles:          (repoIndex.files || []).length,
    techStack:           repoIndex.techStack,
    architectureSummary: repoIndex.architectureSummary,
    keyModuleLocations:  repoIndex.keyModuleLocations,
    lastIndexedAt:       repoIndex.lastIndexedAt,
    lastIndexedCommitSha:repoIndex.lastIndexedCommitSha,
    files:               repoIndex.files || [],
  });
});

// ── 10. Workspace Context Q&A (Integrated with OmniRoute) ─────────────────────
router.post("/projects/:projectId/context/query", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const { query } = req.body;
  const userId = req.user._id || req.user.id;

  const authResult = await verifyProjectAccess(projectId, userId, res);
  if (!authResult) return;

  try {
    const result = await answerWorkspaceQuery({
      projectId,
      userId,
      query: query || "",
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    logger.error(`Workspace context query failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── 11. Workspace Context Snapshot (Structured Evidence) ─────────────────────
router.get("/projects/:projectId/context/snapshot", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const { query } = req.query;
  const userId = req.user._id || req.user.id;

  const authResult = await verifyProjectAccess(projectId, userId, res);
  if (!authResult) return;

  try {
    const contextData = await assembleWorkspaceContext({
      projectId,
      query: typeof query === "string" ? query : "",
    });

    res.json({
      success: true,
      context: contextData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
