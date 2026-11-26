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

import { authorizeProjectAccess } from "../services/accessControlService.js";

const router = express.Router();

// ── Phase 4 helpers ───────────────────────────────────────────────────────────
/** The requesting user's OWN credential reference (never another member's). */
async function ownCredentialRef(userId) {
  const credential = await GitHubCredential.findOne({ userId }).select("+encryptedToken").lean();
  if (credential?.encryptedToken) return { encryptedToken: credential.encryptedToken, userId: String(credential.userId) };
  const own = await GitHubIntegration.findOne({ userId }).select("+encryptedToken").sort({ updatedAt: -1 }).lean();
  return own?.encryptedToken ? { encryptedToken: own.encryptedToken, userId: String(own.userId) } : null;
}

const GH_STATUS = { AUTH_REVOKED: 401, CREDENTIAL: 409, FORBIDDEN: 403, NOT_FOUND: 404, RATE_LIMITED: 429, EMPTY_REPOSITORY: 409, INVALID_REQUEST: 400, TRANSIENT: 502 };
const GH_CODE = { AUTH_REVOKED: "GITHUB_RECONNECT_REQUIRED", CREDENTIAL: "GITHUB_RECONNECT_REQUIRED", FORBIDDEN: "GITHUB_FORBIDDEN", NOT_FOUND: "GITHUB_NOT_FOUND", RATE_LIMITED: "GITHUB_RATE_LIMITED", EMPTY_REPOSITORY: "GITHUB_EMPTY_REPOSITORY", INVALID_REQUEST: "GITHUB_INVALID_REQUEST", TRANSIENT: "GITHUB_UNAVAILABLE" };

/** Sanitised GitHub error response (never raw upstream bodies or stack traces). */
function sendGitHubError(res, err, fallback, fallbackStatus = 500) {
  if (err?.name === "GitHubApiError") {
    if (err.kind === "RATE_LIMITED") {
      const secs = err.retryAfterMs ? Math.ceil(err.retryAfterMs / 1000) : err.resetAt ? Math.max(1, Math.ceil((err.resetAt - Date.now()) / 1000)) : 60;
      res.set("Retry-After", String(secs));
    }
    return res.status(GH_STATUS[err.kind] || fallbackStatus).json({ error: err.message, code: GH_CODE[err.kind] || "GITHUB_ERROR", resetAt: err.resetAt || undefined });
  }
  logger.error(`[github] ${fallback}`, { category: err?.name });
  return res.status(fallbackStatus).json({ error: fallback, code: "GITHUB_ERROR" });
}

/** Record truthful integration state after a GitHub failure. */
async function markIntegrationFailure(projectId, err) {
  if (err?.name !== "GitHubApiError") return;
  const $set = { lastAttemptedSyncAt: new Date(), lastSyncError: err.message };
  if (err.kind === "AUTH_REVOKED" || err.kind === "CREDENTIAL") $set.connectionStatus = "reconnect_required";
  else if (err.kind === "RATE_LIMITED") { $set.connectionStatus = "rate_limited"; $set.rateLimitResetAt = err.resetAt || null; }
  else if (err.kind === "NOT_FOUND") $set.connectionStatus = "error";
  await GitHubIntegration.updateOne({ projectId, isActive: true }, { $set }).catch(() => {});
}

/**
 * Helper: verify that the user is authorized to access the given project/workspace.
 *
 * Rules:
 *   - Explicitly distinguishes Project ID from Team/Workspace ID
 *   - Resolves a Team's active project without silently creating a new Project as a side effect
 *   - Enforces strict membership (team.ownerId or team.members) with NO unauthenticated bypass
 */
export async function verifyProjectAccess(projectIdOrTeamId, userId, res) {
  // Phase 1: central, id-only, fail-closed check (a project without a team
  // previously passed). Read-only: never creates a project.
  const access = await authorizeProjectAccess(String(projectIdOrTeamId || ""), { id: userId?.toString() }, { allowTeamId: true });
  if (access.error) {
    const status = access.status;
    const msg = status === 400 ? "Invalid project or workspace ID" : status === 404 ? "Project not found" : "Forbidden: You are not a member of this workspace";
    res.status(status === 401 ? 403 : status).json({ error: msg, code: access.code });
    return null;
  }
  if (!access.project) {
    res.status(404).json({ error: "No active project found for this workspace" });
    return null;
  }
  return { project: access.project, team: access.team };
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

    // Phase 4 (D-30): AES-256-GCM envelope bound to the authorizing user.
    const encryptedToken = encryptToken(accessToken, { userId: String(storedState.userId) });

    // Fetch user profile from GitHub
    let ghUser = { login: "", id: "", avatarUrl: "" };
    try {
      ghUser = await fetchGitHubUser({ plaintextToken: accessToken });
    } catch (userErr) {
      logger.warn("Could not fetch GitHub user profile", { kind: userErr.kind || userErr.name });
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
          reconnectRequired: false,
        },
      },
      { upsert: true, new: true }
    );

    // If a specific project was targeted and that project ALREADY has a connected repo,
    // update the integration's encrypted token for ongoing synchronization.
    // NOTE: A workspace is NEVER marked connected to a repository before a repository is explicitly selected!
    // Phase 4: only the SAME user's own integration may receive the refreshed
    // token (another member's integration keeps its owner's credential).
    if (storedState.projectId) {
      await GitHubIntegration.updateOne(
        { projectId: storedState.projectId, userId: storedState.userId, isActive: true, repoFullName: { $ne: "" } },
        { $set: { encryptedToken, connectionStatus: "connected", lastSyncError: "" } }
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
    logger.error("GitHub OAuth callback processing failed", { category: err?.code || err?.name });
    // Error code only — never raw upstream/internal messages in a URL.
    const code = err?.code === "KEY_MISSING" || err?.code === "KEY_INVALID" ? "encryption_not_configured" : "oauth_exchange_failed";
    res.redirect(`${frontendUrl}/(tabs)/dashboard?github_error=${code}`);
  }
});

// ── 3. List Accessible Repositories for Current User ──────────────────────────
router.get("/github/user/repos", requireAuth, async (req, res) => {
  const userId = req.user._id || req.user.id;

  try {
    // Only the requesting user's OWN credential (or own integration) is used.
    const cred = await ownCredentialRef(userId);
    if (!cred) {
      return res.status(200).json({
        connected: false,
        authorized: false,
        repositories: [],
        message: "No authenticated GitHub account found. Please authorize with GitHub first.",
      });
    }

    const repos = await fetchUserRepos(cred);
    res.json({
      connected: true,
      authorized: true,
      repositories: repos,
    });
  } catch (err) {
    return sendGitHubError(res, err, "Failed to fetch GitHub repositories");
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
    // Phase 4 security fix: ONLY the requesting user's own credential may be
    // used. (Previously this fell back to ANY integration of the project, i.e.
    // another member's GitHub token, to validate and connect a repository.)
    const cred = await ownCredentialRef(userId);
    if (!cred) {
      return res.status(401).json({
        error: "No authorized GitHub account found for this user. Please authorize with GitHub before connecting a repository.",
        code: "GITHUB_NOT_AUTHORIZED",
      });
    }

    // Pre-validate repository existence, accessibility, and visibility with upstream GitHub API
    let validatedRepo;
    try {
      validatedRepo = await validateRepoAccess(cred, cleanOwner, cleanName);
    } catch (valErr) {
      return sendGitHubError(res, valErr, "Repository validation failed", 400);
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
          // Same owner (userId) as the credential, so the envelope's
          // associated data still matches when the integration decrypts it.
          encryptedToken: cred.encryptedToken,
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
    return sendGitHubError(res, err, "Failed to connect repository");
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
      { encryptedToken: integration.encryptedToken, userId: integration.userId },
      integration.repoOwner,
      integration.repoName
    );

    integration.cachedSummary = summary;
    integration.cacheExpiresAt = new Date(Date.now() + 5 * 60_000);
    await integration.save();

    res.json({ summary, cached: false });
  } catch (err) {
    await markIntegrationFailure(projectId, err);
    return sendGitHubError(res, err, "Failed to fetch GitHub summary");
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
    // Phase 4: incremental by default (unchanged commit ⇒ no re-download);
    // an explicit { force: true } re-indexes. Duplicate syncs are rejected.
    const result = await indexRepositoryForProject({
      projectId: targetProjectId,
      force: req.body?.force === true,
      userId,
    });
    if (result.inProgress) return res.status(409).json({ success: false, code: "SYNC_IN_PROGRESS", message: result.message });

    res.json({
      success: true,
      message: result.noop ? "Repository index is already up to date." : "Repository synchronization completed successfully.",
      ...result,
    });
  } catch (err) {
    return sendGitHubError(res, err, "Repository synchronization failed");
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
        syncInProgressSince: null,
      },
      // Phase 4: a disconnected integration keeps no copy of the token.
      $unset: { encryptedToken: "" },
    }
  );
  // Cached AI answers that used this repository's context are invalidated.
  try {
    const { aiCache } = await import("../services/omniRoute.js");
    aiCache.invalidateWorkspace(String(project.teamId));
  } catch { /* cache is best-effort */ }

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
    return sendGitHubError(res, err, "Workspace context query failed");
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
    return sendGitHubError(res, err, "Workspace context snapshot failed");
  }
});

export default router;
