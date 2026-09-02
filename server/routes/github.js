/**
 * server/routes/github.js
 * NEXUSFLOW 3.0 — Phase 11: GitHub Integration Routes
 */

import express from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { requireAuth } from "../auth.js";
import GitHubIntegration from "../models/GitHubIntegration.js";
import { encryptToken, fetchRepoSummary, buildOAuthUrl, exchangeCodeForToken } from "../services/githubService.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

const CLIENT_ID     = () => process.env.GITHUB_CLIENT_ID     || "";
const CLIENT_SECRET = () => process.env.GITHUB_CLIENT_SECRET || "";
const REDIRECT_URI  = () => process.env.GITHUB_REDIRECT_URI  || "http://localhost:4000/api/github/auth/callback";

// In-memory state store for CSRF (production: use Redis / DB)
const oauthStateStore = new Map();

// ── OAuth Init ────────────────────────────────────────────────────────────────
router.get("/github/auth/init", requireAuth, (req, res) => {
  const { projectId, teamId } = req.query;
  if (!CLIENT_ID()) {
    return res.status(200).json({ configured: false, message: "GitHub OAuth not configured" });
  }
  const state = crypto.randomBytes(16).toString("hex");
  oauthStateStore.set(state, { userId: req.user.id, projectId, teamId, createdAt: Date.now() });
  const url = buildOAuthUrl(state, CLIENT_ID(), REDIRECT_URI());
  res.json({ redirectUrl: url });
});

// ── OAuth Callback ─────────────────────────────────────────────────────────────
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

    // Store encrypted token for this user
    await GitHubIntegration.findOneAndUpdate(
      { userId: storedState.userId, projectId: storedState.projectId },
      { $set: { encryptedToken, teamId: storedState.teamId, isActive: true } },
      { upsert: true, new: true }
    );

    const frontendUrl = (() => {
      const url = process.env.FRONTEND_URL || "";
      if (!url || url.includes("your-frontend") || url.includes("example.com")) return "http://localhost:8081";
      return url.replace(/\/+$/, "");
    })();
    res.redirect(`${frontendUrl}/github/connected?success=true`);
  } catch (err) {
    logger.error("GitHub OAuth callback failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Connect Repo to Project ─────────────────────────────────────────────────────
router.post("/projects/:projectId/github/connect", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const { repoOwner, repoName } = req.body;

  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "Invalid project ID" });
  if (!repoOwner || !repoName) return res.status(400).json({ error: "repoOwner and repoName required" });

  try {
    const integration = await GitHubIntegration.findOne({ userId: req.user.id, isActive: true }).lean();
    if (!integration) return res.status(400).json({ error: "GitHub account not connected. Authenticate via /api/github/auth/init first." });

    const updated = await GitHubIntegration.findByIdAndUpdate(
      integration._id,
      {
        $set: {
          projectId,
          repoOwner,
          repoName,
          repoFullName: `${repoOwner}/${repoName}`,
          repoUrl: `https://github.com/${repoOwner}/${repoName}`,
        },
      },
      { new: true }
    );
    res.json({ success: true, integration: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get GitHub Summary ─────────────────────────────────────────────────────────
router.get("/projects/:projectId/github/summary", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "Invalid project ID" });

  try {
    const integration = await GitHubIntegration
      .findOne({ projectId, isActive: true })
      .select("+encryptedToken")
      .lean();

    if (!integration?.encryptedToken) {
      return res.status(404).json({ error: "No GitHub repository connected to this project" });
    }

    // Serve from cache if fresh (5 min)
    if (integration.cacheExpiresAt && new Date(integration.cacheExpiresAt) > new Date()) {
      return res.json({ summary: integration.cachedSummary, cached: true });
    }

    const summary = await fetchRepoSummary(integration.encryptedToken, integration.repoOwner, integration.repoName);

    await GitHubIntegration.findByIdAndUpdate(integration._id, {
      $set: { cachedSummary: summary, cacheExpiresAt: new Date(Date.now() + 5 * 60_000) },
    });

    res.json({ summary, cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Force Refresh Summary ─────────────────────────────────────────────────────
router.post("/projects/:projectId/github/refresh", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "Invalid project ID" });

  try {
    const integration = await GitHubIntegration
      .findOne({ projectId, isActive: true })
      .select("+encryptedToken")
      .lean();

    if (!integration?.encryptedToken) return res.status(404).json({ error: "No GitHub repository connected" });

    const summary = await fetchRepoSummary(integration.encryptedToken, integration.repoOwner, integration.repoName);

    await GitHubIntegration.findByIdAndUpdate(integration._id, {
      $set: { cachedSummary: summary, cacheExpiresAt: new Date(Date.now() + 5 * 60_000) },
    });

    res.json({ summary, refreshed: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Status Check ──────────────────────────────────────────────────────────────
router.get("/projects/:projectId/github/status", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "Invalid project ID" });

  const integration = await GitHubIntegration.findOne({ projectId, isActive: true }).lean();
  res.json({
    connected: !!integration,
    repo: integration ? { owner: integration.repoOwner, name: integration.repoName, url: integration.repoUrl } : null,
  });
});

// ── Disconnect ────────────────────────────────────────────────────────────────
router.delete("/projects/:projectId/github", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "Invalid project ID" });

  await GitHubIntegration.findOneAndUpdate(
    { projectId, userId: req.user.id },
    { $set: { isActive: false } }
  );
  res.json({ success: true });
});

export default router;
