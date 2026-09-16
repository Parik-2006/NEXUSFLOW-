/**
 * server/scripts/testDomainIntelligence.js
 * ============================================================================
 * NEXUSFLOW V4 — DOMAIN INTELLIGENCE ENGINE TESTS (Workstream 18)
 * ============================================================================
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import User from "../models/User.js";
import {
  CANONICAL_DOMAINS,
  DOMAIN_PROFILES,
  getDomainProfile,
  evaluateDomainIntelligence,
  setProjectDomain,
} from "../services/domainIntelligenceService.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow_dev";
let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n" + "=".repeat(60));
  console.log("NEXUSFLOW V4 — DOMAIN INTELLIGENCE ENGINE TESTS");
  console.log("=".repeat(60) + "\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB.\n");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }

  const ts = Date.now();
  let user, team, projectA, projectB;

  try {
    user = await User.create({
      name: `Domain Tester ${ts}`,
      email: `domain_${ts}@test.dev`,
      password: "Password123!",
    });

    team = await Team.create({
      name: `Domain Team ${ts}`,
      ownerId: user._id,
      members: [{ userId: user._id, name: user.name, role: "leader" }],
    });

    projectA = await Project.create({
      teamId: team._id,
      title: "IoT Hydroponic Sensor Grid",
      methodology: "WATERFALL",
      domain: "IoT / Embedded",
    });

    projectB = await Project.create({
      teamId: team._id,
      title: "FinTech Microservices Platform",
      methodology: "SCRUM",
      domain: "Cybersecurity",
    });

    // ── Test 1: Canonical Domain Taxonomy Completeness
    console.log("[TEST 1] Canonical domain taxonomy verification");
    assert(CANONICAL_DOMAINS.includes("Software Engineering"), "Includes Software Engineering");
    assert(CANONICAL_DOMAINS.includes("Cybersecurity"), "Includes Cybersecurity");
    assert(CANONICAL_DOMAINS.includes("AI / Machine Learning"), "Includes AI / Machine Learning");
    assert(CANONICAL_DOMAINS.includes("IoT / Embedded"), "Includes IoT / Embedded");
    assert(CANONICAL_DOMAINS.includes("Civil / Structural"), "Includes Civil / Structural");
    assert(CANONICAL_DOMAINS.length >= 8, `Taxonomy contains at least 8 domains (got ${CANONICAL_DOMAINS.length})`);

    // ── Test 2: Domain Profiles & Rules
    console.log("\n[TEST 2] Domain profile retrieval & rule registry");
    const cyberProfile = getDomainProfile("Cybersecurity");
    assert(cyberProfile.domain === "Cybersecurity", "Retrieved Cybersecurity profile");
    assert(cyberProfile.expectedDeliverables.includes("STRIDE Threat Model"), "Expected deliverable contains threat model");
    assert(cyberProfile.domainRules.some(r => r.id === "SEC_THREAT_MODEL"), "Contains mandatory threat model rule");

    const iotProfile = getDomainProfile("IoT / Embedded");
    assert(iotProfile.terminology.includes("Microcontroller"), "IoT terminology contains Microcontroller");
    assert(iotProfile.domainRules.some(r => r.id === "IOT_SENSOR_CALIBRATION"), "IoT contains sensor calibration rule");

    // ── Test 3: Safe Fallback for Unknown Domains
    console.log("\n[TEST 3] Safe fallback for unknown domains");
    const fallbackProfile = getDomainProfile("Unknown Alien Technology");
    assert(fallbackProfile.domain === "Software Engineering", "Unknown domain falls back to Software Engineering");

    const researchFallback = getDomainProfile("Academic Novel Investigation");
    assert(researchFallback.domain === "Academic General", "Research domain falls back to Academic General");

    // ── Test 4: Evaluate Domain Compliance & Advisory Recommendations
    console.log("\n[TEST 4] Evaluate domain compliance & missing deliverables");
    const iotEval = await evaluateDomainIntelligence(projectA._id);
    assert(iotEval.domain === "IoT / Embedded", "Evaluated against IoT / Embedded profile");
    assert(iotEval.missingDeliverables.length > 0, "Flagged missing standard IoT deliverables");
    assert(iotEval.advisoryOnly === true, "Marked advisoryOnly=true");
    assert(iotEval.recommendations.some(r => r.category === "DELIVERABLES"), "Contains deliverable recommendations");
    assert(iotEval.recommendations.some(r => r.category === "DOMAIN_RULE"), "Contains domain rule guidance");

    // ── Test 5: Project Domain Mutation & Persistence
    console.log("\n[TEST 5] Update project domain via server service");
    const updateRes = await setProjectDomain(projectA._id, {
      domain: "Civil / Structural",
      subdomain: "Structural Health Monitoring",
    });
    assert(updateRes.success === true, "Domain update succeeded");
    assert(updateRes.domain === "Civil / Structural", "Domain updated to Civil / Structural");

    const refreshedProjA = await Project.findById(projectA._id);
    assert(refreshedProjA.domain === "Civil / Structural", "Persisted domain in database");
    assert(refreshedProjA.subdomain === "Structural Health Monitoring", "Persisted subdomain in database");

    // ── Test 6: Cross-Project Isolation
    console.log("\n[TEST 6] Project isolation — Project B unaffected by Project A domain update");
    const refreshedProjB = await Project.findById(projectB._id);
    assert(refreshedProjB.domain === "Cybersecurity", "Project B retained its Cybersecurity domain");

  } finally {
    console.log("\n[CLEANUP] Cleaning up test records...");
    if (user) await User.findByIdAndDelete(user._id);
    if (team) await Team.findByIdAndDelete(team._id);
    if (projectA) await Project.findByIdAndDelete(projectA._id);
    if (projectB) await Project.findByIdAndDelete(projectB._id);
    await mongoose.disconnect();
    console.log("Database connection closed cleanly.");
  }

  console.log("\n" + "=".repeat(60));
  console.log(`DOMAIN INTELLIGENCE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60) + "\n");
}

runTests().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
