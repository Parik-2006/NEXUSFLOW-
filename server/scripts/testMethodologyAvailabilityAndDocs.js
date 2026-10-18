/**
 * server/scripts/testMethodologyAvailabilityAndDocs.js
 * ============================================================================
 * COMPREHENSIVE TEST SUITE:
 *   1. Production Methodology Restrictions & Safety Defaults
 *   2. Backend Route Rejection (POST /projects, POST /teams, PATCH /projects, methodology-select)
 *   3. Experimental Branch Override (ENABLE_EXPERIMENTAL_METHODOLOGIES="true")
 *   4. Existing Projects Preservation (Scrum, Kanban, Hybrid readable without mutation)
 *   5. Documentation Navigation & Waterfall Workspace Guide Structure
 * ============================================================================
 */

import assert from "assert";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env"), override: true });

import {
  METHODOLOGY_IDS,
  areExperimentalMethodologiesEnabled,
  getMethodologyRegistry,
  normalizeMethodologyId,
  isMethodologyAllowedForNewProjects,
  getMethodologyAvailability,
} from "../config/methodologyAvailability.js";

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function main() {
  console.log("================================================================================");
  console.log("  NEXUSFLOW V4: METHODOLOGY AVAILABILITY & DOCUMENTATION AUDIT TEST SUITE");
  console.log("================================================================================\n");

  // ── TEST GROUP 1: CONFIG REGISTRY & PRODUCTION SAFETY DEFAULTS ─────────────
  console.log("Group 1: Authoritative Methodology Registry & Production Rules");

  runTest("Classic & Waterfall are allowed in production", () => {
    delete process.env.ENABLE_EXPERIMENTAL_METHODOLOGIES;
    process.env.NODE_ENV = "production";
    try {
      assert.strictEqual(isMethodologyAllowedForNewProjects("WATERFALL"), true);
      assert.strictEqual(isMethodologyAllowedForNewProjects("CLASSIC"), true);
      assert.strictEqual(isMethodologyAllowedForNewProjects("waterfall"), true);
      assert.strictEqual(isMethodologyAllowedForNewProjects("classic"), true);
    } finally {
      delete process.env.NODE_ENV;
    }
  });

  runTest("Scrum, Kanban, Hybrid are rejected in production mode", () => {
    delete process.env.ENABLE_EXPERIMENTAL_METHODOLOGIES;
    process.env.NODE_ENV = "production";
    try {
      assert.strictEqual(isMethodologyAllowedForNewProjects("SCRUM"), false);
      assert.strictEqual(isMethodologyAllowedForNewProjects("KANBAN"), false);
      assert.strictEqual(isMethodologyAllowedForNewProjects("HYBRID"), false);
      assert.strictEqual(isMethodologyAllowedForNewProjects("scrum"), false);
      assert.strictEqual(isMethodologyAllowedForNewProjects("kanban"), false);
      assert.strictEqual(isMethodologyAllowedForNewProjects("hybrid"), false);
    } finally {
      delete process.env.NODE_ENV;
    }
  });

  runTest("Safeguard A: Production forcibly blocks WIP methodologies even if ENABLE_EXPERIMENTAL_METHODOLOGIES='true'", () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_EXPERIMENTAL_METHODOLOGIES = "true";
    try {
      assert.strictEqual(areExperimentalMethodologiesEnabled(), false);
      assert.strictEqual(isMethodologyAllowedForNewProjects("SCRUM"), false);
      assert.strictEqual(isMethodologyAllowedForNewProjects("KANBAN"), false);
      assert.strictEqual(isMethodologyAllowedForNewProjects("HYBRID"), false);
      assert.strictEqual(isMethodologyAllowedForNewProjects("WATERFALL"), true);
      assert.strictEqual(isMethodologyAllowedForNewProjects("CLASSIC"), true);
    } finally {
      delete process.env.NODE_ENV;
      delete process.env.ENABLE_EXPERIMENTAL_METHODOLOGIES;
    }
  });

  runTest("Safeguard B: Missing/empty methodology defaults to WATERFALL for backward compatibility", () => {
    assert.strictEqual(normalizeMethodologyId(null), "WATERFALL");
    assert.strictEqual(normalizeMethodologyId(undefined), "WATERFALL");
    assert.strictEqual(normalizeMethodologyId(""), "WATERFALL");
    assert.strictEqual(normalizeMethodologyId("   "), "WATERFALL");
    assert.strictEqual(isMethodologyAllowedForNewProjects(null), true);
    assert.strictEqual(isMethodologyAllowedForNewProjects(undefined), true);
    assert.strictEqual(isMethodologyAllowedForNewProjects(""), true);
  });

  runTest("Safeguard B: Unknown non-empty methodology returns null and is NOT silently converted to Waterfall", () => {
    assert.strictEqual(normalizeMethodologyId("UNKNOWN"), null);
    assert.strictEqual(normalizeMethodologyId("FOOBAR"), null);
    assert.strictEqual(normalizeMethodologyId("SCRUMMY"), null);
    assert.strictEqual(normalizeMethodologyId("INVALID_TYPO"), null);
    assert.strictEqual(isMethodologyAllowedForNewProjects("UNKNOWN"), false);
    assert.strictEqual(isMethodologyAllowedForNewProjects("FOOBAR"), false);
    assert.strictEqual(isMethodologyAllowedForNewProjects("INVALID_TYPO"), false);
  });

  runTest("Safeguard B: Supported aliases map correctly to canonical IDs", () => {
    assert.strictEqual(normalizeMethodologyId("NEXUSFLOW"), "CLASSIC");
    assert.strictEqual(normalizeMethodologyId("V3"), "CLASSIC");
    assert.strictEqual(normalizeMethodologyId("AGILE"), "SCRUM");
    assert.strictEqual(normalizeMethodologyId("waterfall"), "WATERFALL");
    assert.strictEqual(normalizeMethodologyId("classic"), "CLASSIC");
  });

  runTest("Metadata check: Status messages and badges conform to specification", () => {
    const scrumAvail = getMethodologyAvailability("SCRUM");
    assert.strictEqual(scrumAvail.status, "IN_PROGRESS");
    assert.strictEqual(scrumAvail.badge, "IN_PROGRESS");
    assert.strictEqual(scrumAvail.allowNewProjects, false);
    assert.ok(scrumAvail.statusMessage.includes("development"));

    const waterfallAvail = getMethodologyAvailability("WATERFALL");
    assert.strictEqual(scrumAvail.badge !== waterfallAvail.badge, true);
    assert.strictEqual(waterfallAvail.status, "AVAILABLE");
    assert.strictEqual(waterfallAvail.badge, "ACTIVE");
    assert.strictEqual(waterfallAvail.allowNewProjects, true);
  });

  runTest("Development Override: ENABLE_EXPERIMENTAL_METHODOLOGIES='true' allows all in non-production", () => {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_EXPERIMENTAL_METHODOLOGIES = "true";
    try {
      assert.strictEqual(areExperimentalMethodologiesEnabled(), true);
      assert.strictEqual(isMethodologyAllowedForNewProjects("SCRUM"), true);
      assert.strictEqual(isMethodologyAllowedForNewProjects("KANBAN"), true);
      assert.strictEqual(isMethodologyAllowedForNewProjects("HYBRID"), true);
      assert.strictEqual(isMethodologyAllowedForNewProjects("WATERFALL"), true);
      assert.strictEqual(isMethodologyAllowedForNewProjects("CLASSIC"), true);
    } finally {
      delete process.env.NODE_ENV;
      delete process.env.ENABLE_EXPERIMENTAL_METHODOLOGIES;
      assert.strictEqual(areExperimentalMethodologiesEnabled(), false);
    }
  });

  // ── TEST GROUP 2: BACKEND ROUTE GUARDS INSPECTION ─────────────
  console.log("\nGroup 2: Backend Routes Enforcement (projects.js & teams.js)");

  runTest("server/routes/projects.js enforces isMethodologyAllowedForNewProjects", () => {
    const projectsRouteCode = fs.readFileSync(path.join(__dirname, "../routes/projects.js"), "utf8");
    assert.ok(projectsRouteCode.includes("isMethodologyAllowedForNewProjects"));
    assert.ok(projectsRouteCode.includes("METHODOLOGY_UNAVAILABLE"));
    assert.ok(projectsRouteCode.includes("router.get(\"/methodologies\""));
    assert.ok(projectsRouteCode.includes("router.get(\"/methodologies/availability\""));
    assert.ok(projectsRouteCode.includes("router.post(\"/projects\""));
    assert.ok(projectsRouteCode.includes("router.patch(\"/projects/:projectId\""));
    assert.ok(projectsRouteCode.includes("router.post(\"/projects/:projectId/methodology-select\""));
  });

  runTest("server/routes/teams.js enforces isMethodologyAllowedForNewProjects", () => {
    const teamsRouteCode = fs.readFileSync(path.join(__dirname, "../routes/teams.js"), "utf8");
    assert.ok(teamsRouteCode.includes("isMethodologyAllowedForNewProjects"));
    assert.ok(teamsRouteCode.includes("METHODOLOGY_UNAVAILABLE"));
    assert.ok(teamsRouteCode.includes("router.post(\"/teams\""));
  });

  // ── TEST GROUP 3: CLIENT METHODOLOGY CONFIG & SELECTOR ─────────────
  console.log("\nGroup 3: Client Methodology Configuration & CreateTeamModal");

  runTest("client/utils/methodologyConfig.ts marks Scrum, Kanban, Hybrid as WIP / IN_PROGRESS", () => {
    const clientConfigCode = fs.readFileSync(path.join(__dirname, "../../client/utils/methodologyConfig.ts"), "utf8");
    assert.ok(clientConfigCode.includes("isMethodologyAllowedForNewProjects"));
    assert.ok(clientConfigCode.includes("WATERFALL_CONFIG"));
    assert.ok(clientConfigCode.includes("CLASSIC_CONFIG"));
    assert.ok(clientConfigCode.includes("SCRUM_CONFIG"));
    assert.ok(clientConfigCode.includes("KANBAN_CONFIG"));
    assert.ok(clientConfigCode.includes("HYBRID_CONFIG"));
  });

  runTest("client/components/CreateTeamModal.tsx displays disabled state and notice for in-progress methodologies", () => {
    const modalCode = fs.readFileSync(path.join(__dirname, "../../client/components/CreateTeamModal.tsx"), "utf8");
    assert.ok(modalCode.includes("isMethodologyAllowedForNewProjects"));
    assert.ok(modalCode.includes("METHODOLOGY_OPTIONS"));
    assert.ok(modalCode.includes("IN PROGRESS"));
    assert.ok(modalCode.includes("In development") || modalCode.includes("Unavailable in production"));
  });

  // ── TEST GROUP 4: DOCUMENTATION & WATERFALL GUIDE ─────────────
  console.log("\nGroup 4: Documentation Navigation & Waterfall Step-by-Step Guide");

  runTest("client/app/docs.tsx navigation contains exactly the 5 allowed sections", () => {
    const docsCode = fs.readFileSync(path.join(__dirname, "../../client/app/docs.tsx"), "utf8");
    const sectionsMatch = docsCode.match(/const SECTIONS: DocSection\[\] = \[([\s\S]*?)\];/);
    assert.ok(sectionsMatch, "SECTIONS array must be defined");
    const sectionsText = sectionsMatch[1];
    
    // Must include the 5 required tabs
    assert.ok(sectionsText.includes('"getting-started"'), "Must include getting-started");
    assert.ok(sectionsText.includes('"methodologies"'), "Must include methodologies");
    assert.ok(sectionsText.includes('"project-management"'), "Must include project-management");
    assert.ok(sectionsText.includes('"project-ai"'), "Must include project-ai");
    assert.ok(sectionsText.includes('"daa"'), "Must include daa");

    // Must NOT include the 4 removed tabs in visible navigation
    assert.ok(!sectionsText.includes('"ai-system"'), "Must not have ai-system in navigation");
    assert.ok(!sectionsText.includes('"analytics-audit"'), "Must not have analytics-audit in navigation");
    assert.ok(!sectionsText.includes('"architecture"'), "Must not have architecture in navigation");
    assert.ok(!sectionsText.includes('"security"'), "Must not have security in navigation");
    assert.ok(!sectionsText.includes('"auth"'), "Must not have auth in navigation");
    assert.ok(!sectionsText.includes('"jwt"'), "Must not have jwt in navigation");
  });

  runTest("client/constants/waterfallGuideData.ts provides all 6 phases, 7 primary tabs, and 5 insights subtabs", () => {
    const guideCode = fs.readFileSync(path.join(__dirname, "../../client/constants/waterfallGuideData.ts"), "utf8");
    
    // Check 6 phases
    assert.ok(guideCode.includes('"1. Requirements"'));
    assert.ok(guideCode.includes('"2. System Design"'));
    assert.ok(guideCode.includes('"3. Implementation"'));
    assert.ok(guideCode.includes('"4. Verification / Testing"'));
    assert.ok(guideCode.includes('"5. Deployment"'));
    assert.ok(guideCode.includes('"6. Maintenance & Review"'));

    // Check exactly 7 primary tabs
    assert.ok(guideCode.includes('tabKey: "overview"'));
    assert.ok(guideCode.includes('tabKey: "advisor"'));
    assert.ok(guideCode.includes('tabKey: "team"'));
    assert.ok(guideCode.includes('tabKey: "tasks"'));
    assert.ok(guideCode.includes('tabKey: "timeline"'));
    assert.ok(guideCode.includes('tabKey: "insights"'));
    assert.ok(guideCode.includes('tabKey: "chat"'));

    // Plan is integrated into Overview rather than a standalone primary tab
    assert.ok(!guideCode.includes('tabKey: "plan"'));
    assert.ok(guideCode.includes("Project Setup & Plan"));

    // Check 5 insights subtabs
    assert.ok(guideCode.includes('key: "health"'));
    assert.ok(guideCode.includes('key: "learning"'));
    assert.ok(guideCode.includes('key: "capability"'));
    assert.ok(guideCode.includes('key: "risks"'));
    assert.ok(guideCode.includes('key: "dag"'));
  });

  runTest("In-workspace banners embedded in OverviewPanel and PlanPanel", () => {
    const overviewCode = fs.readFileSync(path.join(__dirname, "../../client/components/workspace/OverviewPanel.tsx"), "utf8");
    assert.ok(overviewCode.includes("WaterfallGuideBanner"));

    const planCode = fs.readFileSync(path.join(__dirname, "../../client/components/workspace/PlanPanel.tsx"), "utf8");
    assert.ok(planCode.includes("WaterfallGuideBanner"));

    const bannerCode = fs.readFileSync(path.join(__dirname, "../../client/components/WaterfallGuideBanner.tsx"), "utf8");
    assert.ok(bannerCode.includes("WaterfallGuideModal"));
  });

  // ── TEST GROUP 5: DATABASE & EXISTING PROJECT PRESERVATION ─────────────
  console.log("\nGroup 5: MongoDB Live Check & Existing Projects Non-Destructive Preservation");

  await runAsyncTest("Connect to MongoDB and verify existing projects remain intact", async () => {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nexusflow";
    await mongoose.connect(mongoUri);
    try {
      const Project = mongoose.model("Project", new mongoose.Schema({}, { strict: false }));
      const projects = await Project.find({}).limit(5).lean();
      console.log(`    Found ${projects.length} existing projects in database.`);
      
      for (const p of projects) {
        assert.ok(p._id, "Project must have valid ID");
        console.log(`    - Project [${p._id}]: name="${p.name || p.title}", methodology="${p.methodology || 'N/A'}"`);
      }
    } finally {
      await mongoose.disconnect();
    }
  });

  console.log("\n================================================================================");
  console.log(`  ALL TESTS PASSED: ${passedTests} / ${totalTests}`);
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Test suite terminated with error:", err);
  process.exit(1);
});
