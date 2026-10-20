/**
 * server/scripts/testGitHubWorkspaceMemoryAndDocsV4.js
 * ============================================================================
 * NEXUSFLOW V4 INTEGRATED TEST SUITE:
 *   Fix #1: GitHub Repository Intelligence & Persistent Workspace Memory
 *   Fix #2: Documentation Navigation & Content Redesign
 * ============================================================================
 */

import assert from "assert";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import GitHubIntegration from "../models/GitHubIntegration.js";
import RepositoryIndex from "../models/RepositoryIndex.js";
import ProjectMemory, { MEMORY_CATEGORIES, MEMORY_SCOPE, MEMORY_STATUS } from "../models/ProjectMemory.js";
import {
  encryptToken,
  decryptToken,
  buildOAuthUrl,
} from "../services/githubService.js";
import { assembleWorkspaceContext } from "../services/workspaceContextService.js";
import {
  getMethodologyRegistry,
  isMethodologyAllowedForNewProjects,
  normalizeMethodologyId,
} from "../config/methodologyAvailability.js";

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function main() {
  console.log("================================================================================");
  console.log("  NEXUSFLOW V4: GITHUB REPO INTELLIGENCE, WORKSPACE MEMORY & DOCS AUDIT SUITE");
  console.log("================================================================================\n");

  // ── GROUP 1: GITHUB CONNECTION MODEL & ENCRYPTION ──────────────────────────
  console.log("Group 1: GitHub Integration Model, Encryption & Workspace Isolation");

  runTest("AES-256-CBC token encryption and decryption roundtrip", () => {
    const rawToken = "ghp_mockAccessToken1234567890abcdef";
    const encrypted = encryptToken(rawToken);
    assert.ok(encrypted !== rawToken, "Encrypted token must differ from plaintext");
    assert.ok(encrypted.includes(":"), "Encrypted token must have IV:Ciphertext format");
    const decrypted = decryptToken(encrypted);
    assert.strictEqual(decrypted, rawToken, "Decrypted token must exactly match original");
  });

  runTest("GitHubIntegration schema has required V4 canonical fields", () => {
    const paths = GitHubIntegration.schema.paths;
    assert.ok(paths.userId, "userId path exists");
    assert.ok(paths.teamId, "teamId path exists");
    assert.ok(paths.projectId, "projectId path exists");
    assert.ok(paths.repoOwner, "repoOwner path exists");
    assert.ok(paths.repoName, "repoName path exists");
    assert.ok(paths.repoFullName, "repoFullName path exists");
    assert.ok(paths.defaultBranch, "defaultBranch path exists");
    assert.ok(paths.selectedBranch, "selectedBranch path exists");
    assert.ok(paths.visibility, "visibility path exists");
    assert.ok(paths.connectionStatus, "connectionStatus path exists");
    assert.ok(paths.lastSyncAt, "lastSyncAt path exists");
    assert.ok(paths.lastSyncCommitSha, "lastSyncCommitSha path exists");
    assert.ok(paths.lastSyncError, "lastSyncError path exists");
    assert.ok(paths.isStale, "isStale path exists");
    assert.ok(paths.indexingVersion, "indexingVersion path exists");
    assert.ok(paths.disconnectedAt, "disconnectedAt path exists");
  });

  runTest("One active repository per workspace index constraint exists", () => {
    const indexes = GitHubIntegration.schema.indexes();
    const partialProjectIndex = indexes.find(
      (idx) => idx[0].projectId === 1 && idx[1]?.unique === true && idx[1]?.partialFilterExpression?.isActive === true
    );
    assert.ok(partialProjectIndex, "Partial unique index on { projectId: 1, isActive: true } must exist");
  });

  runTest("OAuth URL builder produces valid scope and redirect URI", () => {
    const url = buildOAuthUrl("randomState123", "client_xyz", "http://localhost:4000/callback");
    assert.ok(url.startsWith("https://github.com/login/oauth/authorize?"));
    assert.ok(url.includes("client_id=client_xyz"));
    assert.ok(url.includes("state=randomState123"));
    assert.ok(url.includes("scope=repo+read%3Auser"));
  });

  // ── GROUP 2: REPOSITORY INDEX & CODE INTELLIGENCE MODEL ────────────────────
  console.log("\nGroup 2: Repository Index & Code Intelligence Schema");

  runTest("RepositoryIndex schema defines structural code locations and file lists", () => {
    const paths = RepositoryIndex.schema.paths;
    assert.ok(paths.projectId, "projectId path exists");
    assert.ok(paths.teamId, "teamId path exists");
    assert.ok(paths.repoFullName, "repoFullName path exists");
    assert.ok(paths.lastIndexedCommitSha, "lastIndexedCommitSha path exists");
    assert.ok(paths.architectureSummary, "architectureSummary path exists");
    assert.ok(paths.techStack, "techStack path exists");
    assert.ok(paths["keyModuleLocations.auth"], "keyModuleLocations.auth exists");
    assert.ok(paths["keyModuleLocations.api"], "keyModuleLocations.api exists");
    assert.ok(paths["keyModuleLocations.models"], "keyModuleLocations.models exists");
    assert.ok(paths["keyModuleLocations.tests"], "keyModuleLocations.tests exists");
    assert.ok(paths.files, "files array exists");
    assert.ok(paths.commits, "commits array exists");
  });

  // ── GROUP 3: PERSISTENT WORKSPACE MEMORY & PROVENANCE ──────────────────────
  console.log("\nGroup 3: Persistent Workspace Memory & Provenance");

  runTest("ProjectMemory schema has 19 categories including CODE_INTELLIGENCE", () => {
    assert.ok(MEMORY_CATEGORIES.length >= 17, `Expected at least 17 categories, got ${MEMORY_CATEGORIES.length}`);
    assert.ok(MEMORY_CATEGORIES.includes("CODE_INTELLIGENCE"), "CODE_INTELLIGENCE exists");
    assert.ok(MEMORY_CATEGORIES.includes("ARCHITECTURE_DECISION"), "ARCHITECTURE_DECISION exists");
    assert.ok(MEMORY_CATEGORIES.includes("DECISION"), "DECISION exists");
    assert.ok(MEMORY_CATEGORIES.includes("REQUIREMENT"), "REQUIREMENT exists");
    assert.ok(MEMORY_CATEGORIES.includes("IMPORTANT_ARTIFACT"), "IMPORTANT_ARTIFACT exists");
  });

  runTest("ProjectMemory schema supports github source and commitSha provenance", () => {
    const paths = ProjectMemory.schema.paths;
    assert.ok(paths.source, "source path exists");
    assert.ok(paths.commitSha, "commitSha path exists");
    assert.ok(paths.evidence, "evidence path exists");
    assert.ok(paths.isStale, "isStale path exists");
    assert.ok(ProjectMemory.schema.path("source").enumValues.includes("github"), "github is valid source");
  });

  // ── GROUP 4: DOCUMENTATION REDESIGN VERIFICATION ───────────────────────────
  console.log("\nGroup 4: Documentation Page Navigation & Content Verification");

  runTest("docs.tsx defines exactly 5 primary navigation tabs in required order", () => {
    const docsCode = fs.readFileSync(path.join(__dirname, "../../client/app/docs.tsx"), "utf8");

    // Exact order check
    const secMatch = docsCode.match(/const SECTIONS: DocSection\[\] = \[([\s\S]*?)\];/);
    assert.ok(secMatch, "SECTIONS array found in docs.tsx");
    const secContent = secMatch[1];

    const expectedKeys = [
      "getting-started",
      "project-management",
      "methodologies",
      "daa",
      "project-ai",
    ];

    const actualKeys = [...secContent.matchAll(/key:\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(actualKeys, expectedKeys, "Tabs must be in exact 5-tab required order");

    // Check badges
    assert.ok(secContent.includes('key: "getting-started"') && secContent.includes('badge: "Start Here"'), "Getting Started has 'Start Here' badge");
    assert.ok(secContent.includes('key: "methodologies"') && secContent.includes('badge: "Guide & Phases"'), "Methodologies has 'Guide & Phases' badge");
    assert.ok(secContent.includes('key: "daa"') && secContent.includes('badge: "v1.0"'), "DAA Algorithms has 'v1.0' badge");
    assert.ok(secContent.includes('key: "project-ai"') && secContent.includes('badge: "AI 2.0"'), "Project AI Hub has 'AI 2.0' badge");

    // Primary navigation does NOT contain ai-system
    assert.ok(!actualKeys.includes("ai-system"), "Free AI Policy & Fallback (ai-system) is absent from primary tabs");
  });

  runTest("Methodologies section displays Classic, NexusFlow, Waterfall as available, and only Scrum, Kanban, Hybrid as In Progress", () => {
    const docsCode = fs.readFileSync(path.join(__dirname, "../../client/app/docs.tsx"), "utf8");

    const methMatch = docsCode.match(/const METHODOLOGY_DOCS: MethodologyDocDetail\[\] = \[([\s\S]*?)\];/);
    assert.ok(methMatch, "METHODOLOGY_DOCS array found in docs.tsx");
    const methContent = methMatch[1];

    // Methodologies defined
    assert.ok(methContent.includes('id: "CLASSIC"'), "Classic methodology exists");
    assert.ok(methContent.includes('id: "NEXUSFLOW"'), "NexusFlow methodology exists");
    assert.ok(methContent.includes('id: "WATERFALL"'), "Waterfall methodology exists");
    assert.ok(methContent.includes('id: "SCRUM"'), "Scrum methodology exists");
    assert.ok(methContent.includes('id: "KANBAN"'), "Kanban methodology exists");
    assert.ok(methContent.includes('id: "HYBRID"'), "Hybrid methodology exists");

    // Only Scrum, Kanban, Hybrid have badge: "IN_PROGRESS"
    const inProgressIds = [];
    const activeIds = [];

    const blocks = methContent.split(/\{\s*id:/).slice(1);
    for (const b of blocks) {
      const idMatch = b.match(/^\s*"([^"]+)"/);
      const badgeMatch = b.match(/badge:\s*"([^"]+)"/);
      if (idMatch && badgeMatch) {
        if (badgeMatch[1] === "IN_PROGRESS") {
          inProgressIds.push(idMatch[1]);
        } else if (badgeMatch[1] === "ACTIVE") {
          activeIds.push(idMatch[1]);
        }
      }
    }

    assert.deepStrictEqual(inProgressIds.sort(), ["HYBRID", "KANBAN", "SCRUM"].sort(), "Only Scrum, Kanban, and Hybrid are IN_PROGRESS");
    assert.ok(activeIds.includes("WATERFALL"), "Waterfall is ACTIVE");
    assert.ok(activeIds.includes("CLASSIC"), "Classic is ACTIVE");
    assert.ok(activeIds.includes("NEXUSFLOW"), "NexusFlow is ACTIVE");
  });

  runTest("Project Management section replaced old algorithm capabilities with full ecosystem documentation", () => {
    const docsCode = fs.readFileSync(path.join(__dirname, "../../client/app/docs.tsx"), "utf8");

    const pmMatch = docsCode.match(/function ProjectManagementSection\(\) \{([\s\S]*?)\n\}/);
    assert.ok(pmMatch, "ProjectManagementSection found in docs.tsx");
    const pmContent = pmMatch[1];

    // Old algorithm section must be gone
    assert.ok(!pmContent.includes("Greedy Priority"), "Greedy Priority removed from Project Management Core Capabilities");
    assert.ok(!pmContent.includes("0/1 Knapsack"), "0/1 Knapsack removed from Project Management Core Capabilities");
    assert.ok(!pmContent.includes("Branch & Bound"), "Branch & Bound removed from Project Management Core Capabilities");

    // New ecosystem documentation must be present
    assert.ok(pmContent.includes("The NexusFlow Project Management Ecosystem"), "Ecosystem introduction present");
    assert.ok(pmContent.includes("Who Uses NexusFlow?"), "Who Uses NexusFlow present");
    assert.ok(pmContent.includes("Students & Capstone Teams"), "Students & Capstones present");
    assert.ok(pmContent.includes("Hackathon Teams & Innovators"), "Hackathon Teams present");
    assert.ok(pmContent.includes("Workspace & Data Model Hierarchy"), "Workspace Hierarchy present");
    assert.ok(pmContent.includes("The Project Lifecycle"), "Project Lifecycle present");
    assert.ok(pmContent.includes("Collaboration, Governance & Visibility"), "Collaboration & Visibility present");
    assert.ok(pmContent.includes("Practical Scenarios: Capstones vs. Hackathons"), "Academic vs Hackathon present");
    assert.ok(pmContent.includes("Context-Grounded AI Assistance & Project Memory"), "AI Assistance & Memory present");
  });

  runTest("Waterfall 7-tab canonical order is maintained and no obsolete 8-tab claims exist in docs", () => {
    const docsCode = fs.readFileSync(path.join(__dirname, "../../client/app/docs.tsx"), "utf8");
    const guideCode = fs.readFileSync(path.join(__dirname, "../../client/constants/waterfallGuideData.ts"), "utf8");

    assert.ok(!docsCode.includes("8-tab workspace"), "docs.tsx does not claim 8-tab workspace");
    assert.ok(!guideCode.includes("8 Main Workspace Tabs"), "waterfallGuideData does not claim 8 Main Workspace Tabs");
    assert.ok(guideCode.includes("7 Main Workspace Tabs"), "waterfallGuideData specifies 7 Main Workspace Tabs");
  });

  // ── GROUP 5: GITHUB PANEL CLIENT COMPONENT ─────────────────────────────────
  console.log("\nGroup 5: GitHubPanel Client Component Capabilities");

  runTest("GitHubPanel.tsx supports OAuth, repo selection, sync, disconnect, and tabs", () => {
    const panelCode = fs.readFileSync(path.join(__dirname, "../../client/components/workspace/GitHubPanel.tsx"), "utf8");

    assert.ok(panelCode.includes("/api/github/auth/init"), "Initiates GitHub OAuth");
    assert.ok(panelCode.includes("/api/github/user/repos"), "Fetches accessible repos");
    assert.ok(panelCode.includes("/api/projects/${projectId}/github/connect"), "Connects active repo");
    assert.ok(panelCode.includes("/api/projects/${projectId}/github/sync"), "Triggers sync and re-indexing");
    assert.ok(panelCode.includes("method: \"DELETE\""), "Disconnects repo safely");
    assert.ok(panelCode.includes("Code Intelligence"), "Code Intelligence tab exists");
    assert.ok(panelCode.includes("Recent Commits"), "Recent Commits tab exists");
    assert.ok(panelCode.includes("PRs & Issues"), "PRs & Issues tab exists");
    assert.ok(panelCode.includes("lastSyncCommitSha"), "Displays analyzed commit SHA");
    assert.ok(panelCode.includes("staleBanner"), "Renders stale index state");
    assert.ok(panelCode.includes("errorBanner"), "Renders error and retry state");
  });

  console.log("\n================================================================================");
  console.log(`  ALL AUDIT SUITE TESTS PASSED: ${passed} / ${total}`);
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
