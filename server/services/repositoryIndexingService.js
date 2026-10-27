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
} from "./githubService.js";
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

/**
 * indexRepositoryForProject({ projectId, force, userId })
 * Performs bounded, incremental indexing of a project's connected repository.
 */
export async function indexRepositoryForProject({ projectId, force = false, userId = null }) {
  const integration = await GitHubIntegration.findOne({ projectId, isActive: true })
    .select("+encryptedToken");

  if (!integration || !integration.encryptedToken) {
    throw new Error("No active GitHub repository connected to this workspace");
  }

  // Update status to syncing
  integration.connectionStatus = "syncing";
  integration.lastAttemptedSyncAt = new Date();
  await integration.save();

  try {
    const branch = integration.selectedBranch || integration.defaultBranch || "main";
    const latestCommit = await fetchLatestCommit(
      integration.encryptedToken,
      integration.repoOwner,
      integration.repoName,
      branch
    );

    // Incremental check: if unchanged commit and not forced, return early with fresh summary
    if (
      !force &&
      integration.lastSyncCommitSha &&
      integration.lastSyncCommitSha === latestCommit.sha &&
      !integration.isStale
    ) {
      const summary = await fetchRepoSummary(
        integration.encryptedToken,
        integration.repoOwner,
        integration.repoName
      );
      integration.cachedSummary = summary;
      integration.connectionStatus = "connected";
      integration.lastSyncAt = new Date();
      await integration.save();

      return {
        success: true,
        noop: true,
        commitSha: latestCommit.sha,
        message: "Repository index is already up to date.",
      };
    }

    // Fetch repository tree & summary in parallel
    const [treeData, summaryData] = await Promise.all([
      fetchRepoTree(integration.encryptedToken, integration.repoOwner, integration.repoName, branch),
      fetchRepoSummary(integration.encryptedToken, integration.repoOwner, integration.repoName),
    ]);

    // Filter tree entries safely
    const rawTree = Array.isArray(treeData.tree) ? treeData.tree : [];
    const validFiles = [];
    const moduleLocations = {
      auth: [],
      api: [],
      models: [],
      services: [],
      components: [],
      tests: [],
      config: [],
    };
    const techStackSet = new Set();

    // Scan through files up to 250 items
    for (const item of rawTree) {
      if (item.type !== "blob") continue;
      if (isSecretOrBinary(item.path)) continue;

      const lang = detectLanguage(item.path);
      if (lang !== "Text") techStackSet.add(lang);

      const category = categorizePath(item.path);
      if (category in moduleLocations && moduleLocations[category].length < 15) {
        moduleLocations[category].push(item.path);
      }

      validFiles.push({
        path: item.path,
        name: item.path.split("/").pop() || item.path,
        type: "file",
        size: item.size || 0,
        sha:  item.sha || "",
        language: lang,
        lastModifiedCommit: latestCommit.sha,
        isRemoved: false,
      });

      if (validFiles.length >= 250) break;
    }

    // Inspect critical files (e.g. README.md, package.json, auth entrypoint)
    const priorityFiles = validFiles
      .filter((f) =>
        /readme\.md$/i.test(f.path) ||
        /package\.json$/i.test(f.path) ||
        moduleLocations.auth.includes(f.path)
      )
      .slice(0, 5);

    for (const pf of priorityFiles) {
      try {
        const content = await fetchFileContent(
          integration.encryptedToken,
          integration.repoOwner,
          integration.repoName,
          pf.path,
          branch
        );
        if (content) {
          pf.contentSnippet = content.slice(0, 1500);
          if (/package\.json$/i.test(pf.path)) {
            try {
              const pkg = JSON.parse(content);
              if (pkg.dependencies) {
                Object.keys(pkg.dependencies).slice(0, 15).forEach((d) => techStackSet.add(d));
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (err) {
        logger.warn(`[repoIndexing] Could not fetch preview for ${pf.path}: ${err.message}`);
      }
    }

    // Correlate with active project tasks and requirements
    const activeTasks = await Task.find({ projectId }).select("_id title").lean();
    if (activeTasks.length > 0) {
      for (const f of validFiles) {
        const lowerPath = f.path.toLowerCase();
        for (const t of activeTasks) {
          const words = t.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
          if (words.some((w) => lowerPath.includes(w))) {
            f.relatedTaskIds = [t._id.toString()];
            break;
          }
        }
      }
    }

    // Generate architecture summary text
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
    ].join("\n");

    // Upsert RepositoryIndex model
    await RepositoryIndex.findOneAndUpdate(
      { projectId },
      {
        $set: {
          teamId:               integration.teamId,
          repoFullName:         integration.repoFullName,
          defaultBranch:        integration.defaultBranch,
          selectedBranch:       branch,
          lastIndexedCommitSha: latestCommit.sha,
          lastIndexedAt:        new Date(),
          status:               "indexed",
          errorMessage:         "",
          architectureSummary:  archSummary,
          techStack:            techStackList,
          keyModuleLocations:   moduleLocations,
          files:                validFiles,
          commits:              summaryData.recentCommitsList || [],
          pullRequests:         summaryData.pullRequestsList || [],
          openIssues:           summaryData.openIssuesList || [],
          branches:             summaryData.branches || [branch],
          totalFiles:           validFiles.length,
          indexingVersion:      "4.0.0",
          isActive:             true,
        },
      },
      { upsert: true, new: true }
    );

    // Sync persistent ProjectMemory entry
    try {
      await ProjectMemory.findOneAndUpdate(
        {
          projectId,
          category: "CODE_INTELLIGENCE",
          source: "github",
        },
        {
          $set: {
            teamId: integration.teamId,
            title: `GitHub Architecture & Code Intelligence (${integration.repoFullName})`,
            content: archSummary,
            scope: "persistent",
            status: "active",
            isStale: false,
            commitSha: latestCommit.sha,
            confidence: 1.0,
            lastVerifiedAt: new Date(),
            evidence: [summaryData.repoUrl || `https://github.com/${integration.repoFullName}`],
            tags: ["github", "repository", "architecture", latestCommit.sha.slice(0, 7)],
            createdBy: userId || integration.userId,
          },
        },
        { upsert: true }
      );
    } catch (memErr) {
      logger.warn(`[repoIndexing] ProjectMemory sync warning: ${memErr.message}`);
    }

    // Save integration record checkpoint
    integration.connectionStatus = "connected";
    integration.lastSyncAt = new Date();
    integration.lastSyncCommitSha = latestCommit.sha;
    integration.lastSyncError = "";
    integration.syncErrorDetails = null;
    integration.isStale = false;
    integration.cachedSummary = summaryData;
    integration.cacheExpiresAt = new Date(Date.now() + 5 * 60_000);
    await integration.save();

    return {
      success: true,
      commitSha: latestCommit.sha,
      filesIndexed: validFiles.length,
      techStack: techStackList,
      summary: summaryData,
    };
  } catch (err) {
    logger.error("[repoIndexing] Synchronization error", { error: err.message, stack: err.stack });
    integration.connectionStatus = "error";
    integration.lastSyncError = err.message;
    integration.syncErrorDetails = { message: err.message, date: new Date() };
    await integration.save();

    // Preserve previously indexed files while marking index status as error
    try {
      await RepositoryIndex.updateOne(
        { projectId, isActive: true },
        { $set: { status: "error", errorMessage: err.message } }
      );
    } catch (idxUpdateErr) {
      logger.warn(`[repoIndexing] Failed to update RepositoryIndex error status: ${idxUpdateErr.message}`);
    }

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
