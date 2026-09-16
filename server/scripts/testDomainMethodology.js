/**
 * server/scripts/testDomainMethodology.js
 * ============================================================================
 * NEXUSFLOW V4 — DOMAIN × METHODOLOGY RESOLVER TESTS (Workstream 19)
 * ============================================================================
 */

import { resolveEnvironment } from "../services/domainMethodologyResolver.js";

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
  console.log("NEXUSFLOW V4 — DOMAIN × METHODOLOGY RESOLVER TESTS");
  console.log("=".repeat(60) + "\n");

  // ── Test 1: Multiple Domain × Methodology Pairings
  console.log("[TEST 1] Domain × Methodology pairing resolution");
  const sweScrum = resolveEnvironment({
    domain: "Software Engineering",
    methodology: "SCRUM",
  });
  assert(sweScrum.environmentKey === "Software Engineering × SCRUM", "Resolved Software Engineering × SCRUM");
  assert(sweScrum.recommendedMetrics.includes("Sprint Velocity (pts)"), "Includes Sprint Velocity");

  const cyberKanban = resolveEnvironment({
    domain: "Cybersecurity",
    methodology: "KANBAN",
  });
  assert(cyberKanban.environmentKey === "Cybersecurity × KANBAN", "Resolved Cybersecurity × KANBAN");
  assert(cyberKanban.recommendedMetrics.includes("CVSS Remediation Speed (hours)"), "Includes CVSS Remediation Speed");

  const iotWaterfall = resolveEnvironment({
    domain: "IoT / Embedded",
    methodology: "WATERFALL",
  });
  assert(iotWaterfall.environmentKey === "IoT / Embedded × WATERFALL", "Resolved IoT / Embedded × WATERFALL");
  assert(iotWaterfall.recommendedMetrics.includes("Phase Gate Readiness Score"), "Includes Phase Gate Readiness Score");

  // ── Test 2: Hybrid Methodology Resolution
  console.log("\n[TEST 2] Domain × Hybrid pairing resolution");
  const hybridRes = resolveEnvironment({
    domain: "Software Engineering",
    methodology: "HYBRID",
    hybridConfig: {
      planningMethodology: "WATERFALL",
      executionMethodology: "SCRUM",
      templateName: "waterfall_planning_scrum_execution",
    },
  });
  assert(hybridRes.workflowModel.methodology === "HYBRID", "Identified Hybrid workflow model");
  assert(hybridRes.workflowModel.planningBoundary === "WATERFALL", "Identified Waterfall planning boundary");
  assert(hybridRes.workflowModel.executionBoundary === "SCRUM", "Identified Scrum execution boundary");

  // ── Test 3: Structural Friction & Conflict Detection
  console.log("\n[TEST 3] Detect structural friction points between domain & methodology");
  const iotScrum = resolveEnvironment({
    domain: "IoT / Embedded",
    methodology: "SCRUM",
  });
  assert(iotScrum.hasConflicts === true, "Detected conflicts for IoT / Embedded × SCRUM");
  const iotConflict = iotScrum.conflicts.find(c => c.conflictId === "IOT_SPRINT_CADENCE_MISMATCH");
  assert(Boolean(iotConflict), "Identified hardware cadence mismatch conflict");
  assert(iotConflict.guidance.includes("Hybrid"), "Provides actionable remediation guidance");

  const civilKanban = resolveEnvironment({
    domain: "Civil / Structural",
    methodology: "KANBAN",
  });
  assert(civilKanban.hasConflicts === true, "Detected conflict for Civil / Structural × KANBAN");
  assert(civilKanban.conflicts.some(c => c.conflictId === "STRUCTURAL_SAFETY_GATE_RISK"), "Identified structural safety gate risk");

  // ── Test 4: Pure Determinism Verification (10 Iterations)
  console.log("\n[TEST 4] Deterministic invariant — 10 iterations produce identical output");
  function clean(res) {
    const copy = { ...res };
    delete copy.resolvedAt;
    return JSON.stringify(copy);
  }
  const baseline = clean(resolveEnvironment({ domain: "Cybersecurity", methodology: "KANBAN" }));
  let allEqual = true;
  for (let i = 0; i < 10; i++) {
    const next = clean(resolveEnvironment({ domain: "Cybersecurity", methodology: "KANBAN" }));
    if (next !== baseline) {
      allEqual = false;
      break;
    }
  }
  assert(allEqual === true, "10 consecutive resolutions produced bit-for-bit identical results");

  // ── Test 5: Tailored Academic Criteria Generation
  console.log("\n[TEST 5] Tailored academic evaluation criteria generation");
  const academicEnv = resolveEnvironment({
    domain: "AI / Machine Learning",
    methodology: "SCRUM",
  });
  assert(academicEnv.tailoredAcademicCriteria.length > 0, "Generated academic criteria");
  assert(
    academicEnv.tailoredAcademicCriteria.some(c => c.title.includes("Dataset")),
    "Academic criteria tailored with dataset requirements"
  );

  console.log("\n" + "=".repeat(60));
  console.log(`DOMAIN × METHODOLOGY RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60) + "\n");
}

runTests().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
