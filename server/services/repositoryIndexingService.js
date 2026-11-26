/**
 * server/services/repositoryIndexingService.js
 * NEXUSFLOW V4 — Incremental GitHub Repository Indexing & Code Intelligence
 *
 * Implements:
 *   - Bounded, incremental repository scanning
 *   - Binary & secret exclusion
 *   - Structural module identification (Auth, API, Models, Tests, Config)
 *   - Tech stack detection
 *   - Persistent RepositoryIndex and ProjectMemory synchronization
 *   - Idempotent upserts and recoverable error checkpoints
 */

import GitHubIntegration from "../models/GitHubIntegration.js";
import RepositoryIndex from "../models/RepositoryIndex.js";
import ProjectMemory from "../models/ProjectMemory.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import {
  fetchLatestCommit,
  fetchRepoSummary,
  fetchRepoTree,
  fetchFileContent,
  compareCommits,
  GitHubApiError,
} from "./githubService.js";
import { classifyRepoPath, redactSecrets } from "./ai/contextGuard.js";
import { logger } from "../utils/logger.js";

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".expo",
  "coverage",
  ".cache",
  "__pycache__",
  "vendor",
]);

const EXCLUDED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
  ".pdf", ".zip", ".tar", ".gz", ".7z", ".rar",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".woff", ".woff2", ".ttf", ".eot",
  ".mp4", ".mp3", ".wav", ".avi",
  ".lock",
]);

const SECRET_PATTERNS = [
  /^\.env/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /id_ecdsa/i,
  /id_dsa/i,
  /credentials\.json$/i,
  /service-account.*\.json$/i,
  /\.npmrc$/i,
  /\.dockercfg$/i,
  /\.aws/i,
];

function isSecretOrBinary(path) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  for (const part of parts) {
    if (EXCLUDED_DIRS.has(part)) return true;
  }
  const filename = parts[parts.length - 1];
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(filename)) return true;
  }
  const dotIdx = filename.lastIndexOf(".");
  if (dotIdx !== -1) {
    const ext = filename.slice(dotIdx).toLowerCase();
    if (EXCLUDED_EXTENSIONS.has(ext)) return true;
  }
  return false;
}

function detectLanguage(path) {
  const p = path.toLowerCase();
  if (p.endsWith(".ts") || p.endsWith(".tsx")) return "TypeScript";
  if (p.endsWith(".js") || p.endsWith(".jsx") || p.endsWith(".mjs")) return "JavaScript";
  if (p.endsWith(".py")) return "Python";
  if (p.endsWith(".java")) return "Java";
  if (p.endsWith(".go")) return "Go";
  if (p.endsWith(".rs")) return "Rust";
  if (p.endsWith(".cpp") || p.endsWith(".cc") || p.endsWith(".c")) return "C/C++";
  if (p.endsWith(".cs")) return "C#";
  if (p.endsWith(".html")) return "HTML";
  if (p.endsWith(".css") || p.endsWith(".scss")) return "CSS";
  if (p.endsWith(".json")) return "JSON";
  if (p.endsWith(".md")) return "Markdown";
  if (p.endsWith(".sh")) return "Shell";
  return "Text";
}

/**
 * Classifies file into structural categories
 */
function categorizePath(path) {
  const p = path.toLowerCase();
  if (/auth|jwt|passport|oauth|login|signup|session|crypto/i.test(p)) return "auth";
  if (/routes|router|controller|endpoints|handlers/i.test(p)) return "api";
  if (/models|schemas|entities|db\/schema/i.test(p)) return "models";
  if (/services|engines|helpers|utils|lib/i.test(p)) return "services";
  if (/components|views|pages|screens|ui/i.test(p)) return "components";
  if (/test|spec|__tests__|cypress|jest/i.test(p)) return "tests";
  if (/config|package\.json|tsconfig|docker|\.yaml|\.yml/i.test(p)) return "config";
  return "other";
}

export const INDEX_LIMITS = Object.freeze({
  maxIndexedFiles: 250,      // files recorded in the index
  maxTreeEntries: 20000,     // tree entries scanned at most
  maxFileBytes: 1_000_000,   // larger blobs are not listed
  maxPreviewFiles: 5,        // README / package.json / auth entry previews
  maxPreviewBytes: 60_000,   // per previewed file
  maxDepth: 12,              // path depth
  lockStaleMs: 5 * 60_000,   // a sync older than this is considered abandoned
});

/**
 * indexRepositoryForProject({ projectId, force, userId })
 * Phase 4: atomic duplicate-sync claim, owner-bound credential, incremental
 * (unchanged commit ⇒ 1 GitHub request, nothing re-downloaded), tree read at
 * the exact commit SHA, shared sensitive-path exclusions with per-reason
 * counts, redacted previews, bounded workload and truthful failure states.
 * Repository code is never executed and dependencies are never installed.
 */
export async function indexRepositoryForProject({ projectId, force = false, userId = null }) {
  const now = new Date();
  // Atomic claim: concurrent / duplicate syncs for the same project are no-ops.
  const integration = await GitHubIntegration.findOneAndUpdate(
    {
      projectId, isActive: true,
      $or: [{ syncInProgressSince: null }, { syncInProgressSince: { $lt: new Date(now.getTime() - INDEX_LIMITS.lockStaleMs) } }],
    },
    { $set: { syncInProgressSince: now, lastAttemptedSyncAt: now } },
    { new: true }
  ).select("+encryptedToken");

  if (!integration) {
    const exists = await GitHubIntegration.exists({ projectId, isActive: true });
    if (!exists) throw new Error("No active GitHub repository connected to this workspace");
    return { success: false, inProgress: true, message: "A synchronization for this repository is already in progress." };
  }
  if (!integration.encryptedToken) {
    await GitHubIntegration.updateOne({ _id: integration._id }, { $set: { syncInProgressSince: null, connectionStatus: "reconnect_required" } });
    throw new GitHubApiError("CREDENTIAL", "GitHub authorization must be reconnected.");
  }
  const cred = { encryptedToken: integration.encryptedToken, userId: String(integration.userId) };
  const previousStatus = integration.connectionStatus;

  try {
    const branch = integration.selectedBranch || integration.defaultBranch || "main";
    const latestCommit = await fetchLatestCommit(cred, integration.repoOwner, integration.repoName, branch);

    // Incremental: unchanged commit ⇒ no tree / content / summary downloads.
    if (!force && integration.lastSyncCommitSha && integration.lastSyncCommitSha === latestCommit.sha && !integration.isStale) {
      await GitHubIntegration.updateOne({ _id: integration._id }, {
        $set: { connectionStatus: "connected", lastSyncAt: new Date(), lastSyncError: "", rateLimitResetAt: null, syncInProgressSince: null },
      });
      return { success: true, noop: true, commitSha: latestCommit.sha, message: "Repository index is already up to date." };
    }

    await GitHubIntegration.updateOne({ _id: integration._id }, { $set: { connectionStatus: "syncing" } });
    const [treeData, summaryData] = await Promise.all([
      fetchRepoTree(cred, integration.repoOwner, integration.repoName, latestCommit.sha),
      fetchRepoSummary(cred, integration.repoOwner, integration.repoName),
    ]);

    const rawTree = (Array.isArray(treeData.tree) ? treeData.tree : []).slice(0, INDEX_LIMITS.maxTreeEntries);
    const validFiles = [];
    const excluded = {};
    const moduleLocations = { auth: [], api: [], models: [], services: [], components: [], tests: [], config: [] };
    const techStackSet = new Set();
    let skippedForLimit = 0;

    for (const item of rawTree) {
      if (item.type !== "blob" || typeof item.path !== "string") continue;
      const reason = classifyRepoPath(item.path) || (isSecretOrBinary(item.path) ? "excluded_pattern" : null)
        || (item.path.split("/").length > INDEX_LIMITS.maxDepth ? "too_deep" : null)
        || ((item.size || 0) > INDEX_LIMITS.maxFileBytes ? "too_large" : null);
      if (reason) { excluded[reason] = (excluded[reason] || 0) + 1; continue; }
      if (validFiles.length >= INDEX_LIMITS.maxIndexedFiles) { skippedForLimit++; continue; }

      const lang = detectLanguage(item.path);
      if (lang !== "Text") techStackSet.add(lang);
      const category = categorizePath(item.path);
      if (category in moduleLocations && moduleLocations[category].length < 15) moduleLocations[category].push(item.path);
      validFiles.push({
        path: item.path, name: item.path.split("/").pop() || item.path, type: "file",
        size: item.size || 0, sha: item.sha || "", language: lang, lastModifiedCommit: latestCommit.sha, isRemoved: false,
      });
    }

    const priorityFiles = validFiles
      .filter((f) => /(^|\/)readme\.md$/i.test(f.path) || /(^|\/)package\.json$/i.test(f.path) || moduleLocations.auth.includes(f.path))
      .slice(0, INDEX_LIMITS.maxPreviewFiles);
    for (const pf of priorityFiles) {
      try {
        const content = await fetchFileContent(cred, integration.repoOwner, integration.repoName, pf.path, latestCommit.sha, { maxBytes: INDEX_LIMITS.maxPreviewBytes });
        if (!content) continue;
        // Untrusted repository text: secret patterns redacted before storage / AI use.
        pf.contentSnippet = redactSecrets(content.slice(0, 1500)).text;
        if (/package\.json$/i.test(pf.path)) {
          try {
            const pkg = JSON.parse(content);
            if (pkg && typeof pkg.dependencies === "object") Object.keys(pkg.dependencies).slice(0, 15).forEach((d) => techStackSet.add(String(d).slice(0, 60)));
          } catch { /* ignore */ }
        }
      } catch (err) {
        if (err?.kind === "RATE_LIMITED" || err?.kind === "AUTH_REVOKED") throw err;
        logger.warn("[repoIndexing] preview unavailable", { kind: err?.kind || err?.name });
      }
    }

    const activeTasks = await Task.find({ projectId }).select("_id title").lean();
    if (activeTasks.length > 0) {
      for (const f of validFiles) {
        const lowerPath = f.path.toLowerCase();
        for (const t of activeTasks) {
          const words = t.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
          if (words.some((w) => lowerPath.includes(w))) { f.relatedTaskIds = [t._id.toString()]; break; }
        }
      }
    }

    const techStackList = Array.from(techStackSet).slice(0, 18);
    const archSummary = [
      `Repository: ${integration.repoFullName} (${summaryData.visibility || "public"})`,
      `Branch: ${branch} | Commit: ${(latestCommit.sha || "").slice(0, 7)}`,
      `Tech Stack: ${techStackList.join(", ") || "General Software"}`,
      `Key Modules:`,
      `  - Authentication: ${moduleLocations.auth.join(", ") || "None detected"}`,
      `  - Routes & APIs: ${moduleLocations.api.slice(0, 6).join(", ") || "None detected"}`,
      `  - Data Models: ${moduleLocations.models.slice(0, 6).join(", ") || "None detected"}`,
      `  - Services: ${moduleLocations.services.slice(0, 6).join(", ") || "None detected"}`,
      `  - Tests: ${moduleLocations.tests.slice(0, 4).join(", ") || "None detected"}`,
      `Index coverage: ${validFiles.length} files indexed${skippedForLimit ? `, ${skippedForLimit} beyond the ${INDEX_LIMITS.maxIndexedFiles}-file limit` : ""}${treeData.truncated ? ", GitHub tree truncated" : ""}; ${Object.values(excluded).reduce((a, b) => a + b, 0)} excluded (sensitive / binary / generated / oversized).`,
    ].join("\n");

    await RepositoryIndex.findOneAndUpdate(
      { projectId },
      {
        $set: {
          teamId: integration.teamId, repoFullName: integration.repoFullName,
          defaultBranch: integration.defaultBranch, selectedBranch: branch,
          lastIndexedCommitSha: latestCommit.sha, lastIndexedAt: new Date(), status: "indexed", errorMessage: "",
          architectureSummary: archSummary, techStack: techStackList, keyModuleLocations: moduleLocations,
          files: validFiles, commits: summaryData.recentCommitsList || [], pullRequests: summaryData.pullRequestsList || [],
          openIssues: summaryData.openIssuesList || [], branches: summaryData.branches || [branch],
          totalFiles: validFiles.length, indexingVersion: "4.1.0", isActive: true,
        },
      },
      { upsert: true, new: true }
    );

    try {
      await ProjectMemory.findOneAndUpdate(
        { projectId, category: "CODE_INTELLIGENCE", source: "github" },
        {
          $set: {
            teamId: integration.teamId,
            title: `GitHub Architecture & Code Intelligence (${integration.repoFullName})`,
            content: archSummary, scope: "persistent", status: "active", isStale: false,
            commitSha: latestCommit.sha, confidence: 1.0, lastVerifiedAt: new Date(),
            evidence: [summaryData.repoUrl || `https://github.com/${integration.repoFullName}`],
            tags: ["github", "repository", "architecture", latestCommit.sha.slice(0, 7)],
            createdBy: userId || integration.userId,
          },
        },
        { upsert: true }
      );
    } catch (memErr) {
      logger.warn("[repoIndexing] ProjectMemory sync warning", { category: memErr?.name });
    }

    await GitHubIntegration.updateOne({ _id: integration._id }, {
      $set: {
        connectionStatus: "connected", lastSyncAt: new Date(), lastSyncCommitSha: latestCommit.sha, lastSyncError: "",
        syncErrorDetails: null, isStale: false, rateLimitResetAt: null, cachedSummary: summaryData,
        cacheExpiresAt: new Date(Date.now() + 5 * 60_000), syncInProgressSince: null,
      },
    });

    return {
      success: true, commitSha: latestCommit.sha, filesIndexed: validFiles.length, excluded,
      skippedForLimit, treeTruncated: Boolean(treeData.truncated), techStack: techStackList, summary: summaryData,
    };
  } catch (err) {
    const kind = err?.kind;
    const status = kind === "AUTH_REVOKED" || kind === "CREDENTIAL" ? "reconnect_required"
      : kind === "RATE_LIMITED" ? "rate_limited"
      : kind === "EMPTY_REPOSITORY" ? previousStatus || "connected" : "error";
    logger.error("[repoIndexing] Synchronization error", { kind: kind || err?.name });
    await GitHubIntegration.updateOne({ _id: integration._id }, {
      $set: {
        connectionStatus: status, lastSyncError: err?.message || "Synchronization failed.",
        syncErrorDetails: { kind: kind || "UNKNOWN", date: new Date() },
        rateLimitResetAt: kind === "RATE_LIMITED" ? err.resetAt || null : null,
        syncInProgressSince: null,
      },
    });
    try {
      await RepositoryIndex.updateOne({ projectId, isActive: true }, { $set: { status: "error", errorMessage: err?.message || "Synchronization failed." } });
    } catch { /* keep previous index */ }
    throw err;
  }
}

/**
 * getRepositoryIntelligence(projectId)
 * Retrieves current indexed repository metadata and files for AI context builder.
 */
export async function getRepositoryIntelligence(projectId) {
  const [integration, repoIndex] = await Promise.all([
    GitHubIntegration.findOne({ projectId, isActive: true }).lean(),
    RepositoryIndex.findOne({ projectId, isActive: true }).lean(),
  ]);

  if (!integration) return null;

  return {
    connected: true,
    repoFullName:        integration.repoFullName,
    repoUrl:             integration.repoUrl,
    branch:              integration.selectedBranch || integration.defaultBranch || "main",
    lastSyncAt:          integration.lastSyncAt,
    lastSyncCommitSha:   integration.lastSyncCommitSha,
    status:              integration.connectionStatus,
    isStale:             integration.isStale,
    lastError:           integration.lastSyncError,
    architectureSummary: repoIndex?.architectureSummary || "",
    techStack:           repoIndex?.techStack || [],
    keyModuleLocations:  repoIndex?.keyModuleLocations || {},
    files:               (repoIndex?.files || []).slice(0, 100),
    commits:             (repoIndex?.commits || []).slice(0, 10),
    pullRequests:        (repoIndex?.pullRequests || []).slice(0, 5),
    openIssues:          (repoIndex?.openIssues || []).slice(0, 5),
  };
}

export default {
  indexRepositoryForProject,
  getRepositoryIntelligence,
};
