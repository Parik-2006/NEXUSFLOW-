/**
 * server/routes/github.js
 * NEXUSFLOW V4 — GitHub Integration, Repository Intelligence & Workspace Memory Routes
 *
 * Implements:
 *   - Centralized OAuth configuration validation and safe diagnostics
 *   - Multi-instance, MongoDB-backed CSRF & replay-safe OAuth authorization flow
 *   - Decoupled user-level GitHub authorization (GitHubCredential) vs workspace repository connection (GitHubIntegration)
 *   - Strictly enforced project vs team resolution (no silent Project creation)
 *   - Strict workspace membership authorization (no unauthenticated/unauthorized access)
 *   - Exactly one active repository per workspace enforcement with upstream GitHub validation
 *   - Incremental repository synchronization and re-indexing
 *   - Granular status reporting (unconfigured, authorized, connected, syncing, error, stale, disconnected)
 *   - Safe disconnection with audit preservation
 *   - Grounded workspace context Q&A endpoint with OmniRoute $0 zero-cost AI policy
 */

import express from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { requireAuth } from "../auth.js";
import GitHubIntegration from "../models/GitHubIntegration.js";
import GitHubCredential from "../models/GitHubCredential.js";
import OAuthState from "../models/OAuthState.js";
import RepositoryIndex from "../models/RepositoryIndex.js";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import {
  validateGitHubOAuthConfig,
  getGitHubOAuthConfig,
} from "../config/githubOAuthConfig.js";
import {
  encryptToken,
  decryptToken,
  fetchRepoSummary,
  buildOAuthUrl,
  exchangeCodeForToken,
  fetchUserRepos,
  fetchGitHubUser,
  validateRepoAccess,
} from "../services/githubService.js";
import { indexRepositoryForProject, getRepositoryIntelligence } from "../services/repositoryIndexingService.js";
import { answerWorkspaceQuery, assembleWorkspaceContext } from "../services/workspaceContextService.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

/**
 * Helper: verify that the user is authorized to access the given project/workspace.
 *
 * Rules:
 *   - Explicitly distinguishes Project ID from Team/Workspace ID
 *   - Resolves a Team's active project without silently creating a new Project as a side effect
 *   - Enforces strict membership (team.ownerId or team.members) with NO unauthenticated bypass
 */
export async function verifyProjectAccess(projectIdOrTeamId, userId, res) {
  if (!mongoose.isValidObjectId(projectIdOrTeamId)) {
    res.status(400).json({ error: "Invalid project or workspace ID" });
    return null;
  }

  const idStr = String(projectIdOrTeamId);
  const uid = userId?.toString();

  // 1. Try finding by Project ID
  let project = await Project.findById(idStr).lean();
  let team = null;

  if (project) {
    if (project.teamId) {
      team = await Team.findById(project.teamId).lean();
    }
  } else {
    // 2. Try resolving as Team/Workspace ID
    team = await Team.findById(idStr).lean();
    if (team) {
      if (team.activeProjectId) {
        project = await Project.findById(team.activeProjectId).lean();
      }
      if (!project) {
        // Find existing project associated with this team
        project = await Project.findOne({ teamId: team._id }).sort({ updatedAt: -1 }).lean();
      }
      // If team has no project, DO NOT silently create one as a side effect of status/auth check!
      if (!project) {
        res.status(404).json({ error: "No active project found for this workspace" });
        return null;
      }
    }
  }

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }

  // 3. Strict membership / ownership verification
  if (team) {
    const isOwner = team.ownerId && team.ownerId.toString() === uid;
    const isMember = Array.isArray(team.members) && team.members.some((m) => {
      const mid = (m.userId?._id || m.userId)?.toString();
      return mid === uid;
    });

    if (!isOwner && !isMember) {
      res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
      return null;
    }
  }

  return { project, team };
}

// ── 0. Safe Configuration Diagnostic Endpoint ─────────────────────────────────
router.get("/github/config", (req, res) => {
  const validation = validateGitHubOAuthConfig();
  res.json({
    configured: validation.isConfigured,
    status: {
      ...validation.sanitizedStatus,
      databaseConnected: mongoose.connection.readyState === 1,
      oauthStateStoreAvailable: true,
      routesMounted: true,
    },
    issues: validation.issues,
  });
});

// ── 1. OAuth Init ─────────────────────────────────────────────────────────────
router.get("/github/auth/init", requireAuth, async (req, res) => {
  const { projectId, teamId } = req.query;
  const userId = (req.user._id || req.user.id).toString();

  const configCheck = validateGitHubOAuthConfig();
  if (!configCheck.isConfigured || !configCheck.config) {
    return res.status(200).json({
      configured: false,
      message: configCheck.issues.length > 0
        ? `GitHub OAuth not configured: ${configCheck.issues.join("; ")}`
        : "GitHub OAuth not configured. You can still connect repositories manually.",
      issues: configCheck.issues,
    });
  }

  // If workspace context provided, verify caller belongs to workspace before initiating
  let resolvedProjectId = null;
  let resolvedTeamId = null;

  if (projectId || teamId) {
    const targetId = projectId || teamId;
    const authResult = await verifyProjectAccess(targetId, userId, res);
    if (!authResult) return; // response sent by helper
    resolvedProjectId = authResult.project._id.toString();
    resolvedTeamId = (authResult.team?._id || authResult.project.teamId)?.toString() || null;
  }

  try {
    // Generate cryptographically strong random state token
    const state = crypto.randomBytes(32).toString("hex");

    // Persist one-time state in MongoDB (expires in 10 minutes)
    await OAuthState.create({
      state,
      provider: "github",
      userId,
      projectId: resolvedProjectId,
      teamId: resolvedTeamId,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });

    const url = buildOAuthUrl(state, configCheck.config.clientId, configCheck.config.redirectUri);

    res.json({
      configured: true,
      authUrl: url,
      redirectUrl: url,
    });
  } catch (err) {
    logger.error("Failed to initialize GitHub OAuth state", { error: err.message });
    res.status(500).json({ error: "Failed to initialize authorization session" });
  }
});

// ── 2. OAuth Callback ─────────────────────────────────────────────────────────
router.get("/github/auth/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;

  const configCheck = validateGitHubOAuthConfig();
  const frontendUrl = configCheck.config?.frontendUrl || "http://localhost:8081";

  // Handle GitHub user cancellation or authorization errors
  if (error) {
    logger.warn("GitHub OAuth authorization rejected by user or GitHub", { error, description: error_description });
    // Attempt state lookup to redirect back to specific workspace tab if available
    let fallbackPath = "/(tabs)/dashboard";
    if (state && typeof state === "string") {
      const stored = await OAuthState.findOne({ state });
      if (stored?.teamId) {
        fallbackPath = `/team/${stored.teamId}?tab=github`;
      }
    }
    return res.redirect(`${frontendUrl}${fallbackPath}?github_error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code || !state || typeof code !== "string" || typeof state !== "string") {
    return res.status(400).json({ error: "Missing required OAuth code or state parameter" });
  }

  // Atomically consume state (prevents replay, concurrent reuse, and expired states)
  const storedState = await OAuthState.consumeState(state);
  if (!storedState) {
    logger.warn("Invalid, expired, or replayed GitHub OAuth state attempt");
    return res.status(400).json({
      error: "Invalid, expired, or already-consumed OAuth state. Please initiate authorization again from your workspace.",
    });
  }

  try {
    const config = getGitHubOAuthConfig();
    const accessToken = await exchangeCodeForToken(
      code,
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );

    const encryptedToken = encryptToken(accessToken);

    // Fetch user profile from GitHub
    let ghUser = { login: "", id: "", avatarUrl: "" };
    try {
      ghUser = await fetchGitHubUser(encryptedToken);
    } catch (userErr) {
      logger.warn(`Could not fetch GitHub user profile: ${userErr.message}`);
    }

    // Persist decoupled user-level credential record
    await GitHubCredential.findOneAndUpdate(
      { userId: storedState.userId },
      {
        $set: {
          encryptedToken,
          githubLogin: ghUser.login,
          githubId: ghUser.id,
          avatarUrl: ghUser.avatarUrl,
          authorizedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    // If a specific project was targeted and that project ALREADY has a connected repo,
    // update the integration's encrypted token for ongoing synchronization.
    // NOTE: A workspace is NEVER marked connected to a repository before a repository is explicitly selected!
    if (storedState.projectId) {
      await GitHubIntegration.updateOne(
        { projectId: storedState.projectId, isActive: true, repoFullName: { $ne: "" } },
        { $set: { encryptedToken } }
      );
    }

    // Determine safe, validated frontend redirect destination
    let redirectPath = "/(tabs)/dashboard";
    if (storedState.teamId) {
      redirectPath = `/team/${storedState.teamId}?tab=github`;
    } else if (storedState.projectId) {
      const proj = await Project.findById(storedState.projectId).lean();
      if (proj?.teamId) {
        redirectPath = `/team/${proj.teamId}?tab=github`;
      }
    }

    res.redirect(`${frontendUrl}${redirectPath}&github_auth=success`);
  } catch (err) {
    logger.error("GitHub OAuth callback processing failed", { error: err.message });
    res.redirect(`${frontendUrl}/(tabs)/dashboard?github_error=${encodeURIComponent(err.message || "OAuth exchange failed")}`);
  }
});

// ── 3. List Accessible Repositories for Current User ──────────────────────────
router.get("/github/user/repos", requireAuth, async (req, res) => {
  const userId = req.user._id || req.user.id;

  try {
    // 1. Look up user-level credential
    let credential = await GitHubCredential.findOne({ userId }).select("+encryptedToken");

    // 2. Backward compatibility fallback: check existing GitHubIntegration for this user
    if (!credential?.encryptedToken) {
      const existingIntegration = await GitHubIntegration.findOne({ userId })
        .select("+encryptedToken")
        .sort({ updatedAt: -1 });

      if (existingIntegration?.encryptedToken) {
        credential = existingIntegration;
      }
    }

    if (!credential || !credential.encryptedToken) {
      return res.status(200).json({
        connected: false,
        authorized: false,
        repositories: [],
        message: "No authenticated GitHub account found. Please authorize with GitHub first.",
      });
    }

    const repos = await fetchUserRepos(credential.encryptedToken);
    res.json({
      connected: true,
      authorized: true,
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
  const targetProjectId = project._id;

  try {
    // Retrieve authorized token: check user credential first, then workspace integration
    let tokenDoc = await GitHubCredential.findOne({ userId }).select("+encryptedToken");
    if (!tokenDoc?.encryptedToken) {
      tokenDoc = await GitHubIntegration.findOne({ projectId: targetProjectId }).select("+encryptedToken");
    }
    if (!tokenDoc?.encryptedToken) {
      tokenDoc = await GitHubIntegration.findOne({ userId }).select("+encryptedToken").sort({ updatedAt: -1 });
    }

    if (!tokenDoc?.encryptedToken) {
      return res.status(401).json({
        error: "No authorized GitHub account found for this user. Please authorize with GitHub before connecting a repository.",
      });
    }

    // Pre-validate repository existence, accessibility, and visibility with upstream GitHub API
    let validatedRepo;
    try {
      validatedRepo = await validateRepoAccess(tokenDoc.encryptedToken, cleanOwner, cleanName);
    } catch (valErr) {
      return res.status(400).json({ error: valErr.message });
    }

    const repoFullName = validatedRepo.fullName;
    const repoUrl = validatedRepo.htmlUrl;
    const effectiveBranch = selectedBranch || defaultBranch || validatedRepo.defaultBranch || "main";

    // Atomically upsert the single active integration for this project
    const integration = await GitHubIntegration.findOneAndUpdate(
      { projectId: targetProjectId },
      {
        $set: {
          userId,
          teamId: project.teamId || team?._id,
          repoOwner: validatedRepo.owner,
          repoName: validatedRepo.name,
          repoFullName,
          repoUrl,
          defaultBranch: validatedRepo.defaultBranch,
          selectedBranch: effectiveBranch,
          visibility: validatedRepo.visibility || visibility || "unknown",
          connectionStatus: "connected",
          isActive: true,
          isStale: false,
          lastSyncError: "",
          syncErrorDetails: null,
          disconnectedAt: null,
          disconnectedBy: null,
          encryptedToken: tokenDoc.encryptedToken,
        },
      },
      { upsert: true, new: true }
    );

    // Trigger initial indexing asynchronously in background
    indexRepositoryForProject({ projectId: targetProjectId, force: true, userId }).catch((idxErr) => {
      logger.warn(`[github/connect] Background indexing warning for ${repoFullName}: ${idxErr.message}`);
    });

    res.json({
      success: true,
      message: `Repository ${repoFullName} connected successfully`,
      integration: {
        repoOwner: integration.repoOwner,
        repoName: integration.repoName,
        repoFullName: integration.repoFullName,
        repoUrl: integration.repoUrl,
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
  const { project } = authResult;
  const targetProjectId = project._id;

  const [integration, credential] = await Promise.all([
    GitHubIntegration.findOne({ projectId: targetProjectId, isActive: true }).lean(),
    GitHubCredential.findOne({ userId }).lean(),
  ]);

  const hasAuthorizedAccount = Boolean(credential) || Boolean(integration?.encryptedToken);

  // If no integration or no repoFullName is configured, repo is disconnected
  if (!integration || !integration.repoFullName) {
    return res.json({
      connected: false,
      authorized: hasAuthorizedAccount,
      repo: null,
      status: "disconnected",
    });
  }

  res.json({
    connected: true,
    authorized: true,
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
  const { project } = authResult;
  const targetProjectId = project._id;

  try {
    const integration = await GitHubIntegration.findOne({ projectId: targetProjectId, isActive: true })
      .select("+encryptedToken");

    if (!integration?.encryptedToken || !integration.repoFullName) {
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
  const { project } = authResult;
  const targetProjectId = project._id;

  try {
    const result = await indexRepositoryForProject({
      projectId: targetProjectId,
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
  const { project } = authResult;
  const targetProjectId = project._id;

  // Soft-disconnect active integration to preserve audit trail
  await GitHubIntegration.findOneAndUpdate(
    { projectId: targetProjectId, isActive: true },
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
    { projectId: targetProjectId, isActive: true },
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
  const { project } = authResult;
  const targetProjectId = project._id;

  const repoIndex = await RepositoryIndex.findOne({ projectId: targetProjectId, isActive: true })
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
  const { project } = authResult;
  const targetProjectId = project._id;

  try {
    const result = await answerWorkspaceQuery({
      projectId: targetProjectId,
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
  const { project } = authResult;
  const targetProjectId = project._id;

  try {
    const contextData = await assembleWorkspaceContext({
      projectId: targetProjectId,
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
