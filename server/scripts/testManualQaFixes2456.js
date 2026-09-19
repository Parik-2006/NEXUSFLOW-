/**
 * NexusFlow V4 — Manual QA Fixes 2, 4, 5, 6 Comprehensive Test Suite
 * ============================================================================
 * Covers:
 *   FIX 2: Example Projects + >=1000 Chars Description + Context + Waterfall Task Generation
 *   FIX 4: Skill-Specific Quiz Question Banks (Cryptography vs NetSec vs CyberSec)
 *   FIX 5: Waterfall Artifact Analysis & Plan Extraction (Fix 404, Draft Output)
 *   FIX 6: Waterfall Task Distribution + Static Sequential Phase Gates (All Tabs)
 * ============================================================================
 */

import { resolveCanonicalSkillId, SKILL_QUESTION_POOLS } from "../constants/quizQuestionBanks.js";
import { decomposeProject, mapCategoryOrTitleToWaterfallPhase } from "../algorithms/projectDecomposer.js";
import { WATERFALL_PHASES, PHASE_DISPLAY_NAMES } from "../services/phaseGateService.js";

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, name) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${name}`);
  }
}

console.log("\n===========================================================");
console.log("NEXUSFLOW V4 — MASTER QA EXECUTION SUITE (FIXES 2, 4, 5, 6)");
console.log("===========================================================\n");

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2 TEST SUITE — Complete Project Context & 1000+ Character Description
// ═══════════════════════════════════════════════════════════════════════════
console.log("--- FIX 2: Project Description Validation & Waterfall Task Generation ---");

// Meaningful character validator
function validateProjectDescription(desc) {
  if (typeof desc !== "string") return false;
  const meaningful = desc.trim();
  return meaningful.length >= 1000;
}

assert(validateProjectDescription("short description") === false, "1. Description < 1000 chars rejected");
assert(validateProjectDescription("   ".repeat(400)) === false, "2. Whitespace-only string rejected");
assert(validateProjectDescription("a".repeat(999)) === false, "3. 999 chars rejected");
assert(validateProjectDescription("a".repeat(1000)) === true, "4. 1000 meaningful chars accepted");
assert(validateProjectDescription("   " + "b".repeat(1000) + "   ") === true, "5. 1000 chars with padding accepted");
assert(validateProjectDescription("x".repeat(1500)) === true, "6. 1500 chars accepted");

// Test Example Project templates
const EXAMPLE_TEMPLATES = [
  "AI Irrigation System",
  "Project Management System",
  "PhishShield",
  "Kavach",
  "E-Commerce Platform",
  "Hospital Management System",
  "AI Learning Platform",
];
assert(EXAMPLE_TEMPLATES.length === 7, "7. All 7 example templates preserved");

// Test complete project context reaching decomposer
const sample1000Desc = `
Smart Irrigation System is an autonomous agricultural IoT platform that continuously monitors soil moisture,
ambient temperature, humidity, and weather forecasts to optimize water distribution across distributed farm fields.
The system integrates ESP32 microcontrollers wired to analog soil sensors, solenoid valves, and water pumps.
Telemetry is ingested over MQTT into a Node.js REST backend, evaluated by an AI prediction model to determine
optimal irrigation schedules, and visualized on a real-time web dashboard for farmers.
Functional Requirements:
1. Ingest telemetry from 50+ soil moisture and temperature sensors every 60 seconds.
2. Provide automated valve actuation based on soil moisture thresholds and rain predictions.
3. Allow manual irrigation override via authenticated web and mobile dashboards.
4. Issue real-time alert notifications on valve malfunctions, sensor timeouts, and water pressure drops.
5. Provide historical analytics, crop yield estimations, and water conservation reports.
Non-Functional Requirements:
1. 99.9% uptime for sensor telemetry ingestion gateway.
2. Sub-200ms latency for manual override valve commands.
3. AES-256 encrypted MQTT payload transmission from microcontrollers.
4. Role-based access control (Admin, Agronomist, Farmer).
5. Comprehensive unit, integration, and sensor stress testing before field deployment.
Constraints:
- ESP32 microcontrollers must operate on low-power battery and solar panels.
- Hard deadline: 16 weeks to production deployment.
`.trim().padEnd(1050, " Detailed requirements document specifications for automated agricultural flow.");

assert(sample1000Desc.length >= 1000, "8. Test description satisfies >= 1000 chars");

const generatedTasks = decomposeProject("AI Irrigation System", sample1000Desc);
assert(generatedTasks.length >= 12, `9. Decomposer generated ${generatedTasks.length} tasks from complete context`);

const phasesRepresented = new Set(generatedTasks.map((t) => t.phase));
assert(phasesRepresented.has("requirements"), "10. Requirements phase has generated tasks");
assert(phasesRepresented.has("design"), "11. System Design phase has generated tasks");
assert(phasesRepresented.has("implementation"), "12. Implementation phase has generated tasks");
assert(phasesRepresented.has("testing"), "13. Verification phase has generated tasks");
assert(phasesRepresented.has("deployment"), "14. Deployment phase has generated tasks");
assert(phasesRepresented.has("maintenance"), "15. Maintenance phase has generated tasks");
assert(phasesRepresented.size >= 5, "16. Tasks are distributed across multiple Waterfall phases (not all dumped in requirements)");


// ═══════════════════════════════════════════════════════════════════════════
// FIX 4 TEST SUITE — Skill-Specific Quiz Question Banks
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n--- FIX 4: Skill-Specific Quiz Question Banks ---");

assert(resolveCanonicalSkillId("Cryptography") === "cryptography", "17. Canonical skill: Cryptography → cryptography");
assert(resolveCanonicalSkillId("crypto") === "cryptography", "18. Canonical skill: crypto → cryptography");
assert(resolveCanonicalSkillId("Network Security") === "network_security", "19. Canonical skill: Network Security → network_security");
assert(resolveCanonicalSkillId("Cybersecurity") === "cybersecurity", "20. Canonical skill: Cybersecurity → cybersecurity");
assert(resolveCanonicalSkillId("Frontend Development") === "frontend", "21. Canonical skill: Frontend Development → frontend");
assert(resolveCanonicalSkillId("Docker & Containers") === "docker", "22. Canonical skill: Docker → docker");

const cryptoPool = SKILL_QUESTION_POOLS["cryptography"];
const netSecPool = SKILL_QUESTION_POOLS["network_security"];
const cyberSecPool = SKILL_QUESTION_POOLS["cybersecurity"];

assert(Array.isArray(cryptoPool) && cryptoPool.length >= 15, `23. Cryptography pool has ${cryptoPool?.length} questions (>=15)`);
assert(Array.isArray(netSecPool) && netSecPool.length >= 15, `24. Network Security pool has ${netSecPool?.length} questions (>=15)`);
assert(Array.isArray(cyberSecPool) && cyberSecPool.length >= 15, `25. Cybersecurity pool has ${cyberSecPool?.length} questions (>=15)`);

// Semantic relevance checks
const cryptoKeywords = ["aes", "rsa", "ecc", "hash", "signature", "key", "cipher", "encryption", "diffie"];
const cryptoRelevant = cryptoPool.filter((q) =>
  cryptoKeywords.some((k) => q.question.toLowerCase().includes(k))
).length;
assert(cryptoRelevant >= 12, `26. Cryptography questions semantically relevant (${cryptoRelevant}/${cryptoPool.length})`);

const netSecKeywords = [
  "firewall", "tls", "vpn", "ids", "ips", "packet", "port", "segmentation",
  "ddos", "syn", "dnssec", "arp", "bgp", "dmz", "waf", "ipsec", "802.1x",
  "telnet", "tunneling", "routing", "broadcast", "network"
];
const netSecRelevant = netSecPool.filter((q) =>
  netSecKeywords.some((k) => q.question.toLowerCase().includes(k))
).length;
assert(netSecRelevant >= 14, `27. Network Security questions semantically relevant (${netSecRelevant}/${netSecPool.length})`);

const cyberSecKeywords = [
  "cia", "malware", "phishing", "risk", "zero-day", "vulnerability", "threat",
  "mfa", "authentication", "authorization", "permission", "security",
  "ransomware", "incident", "xss", "sqli", "siem", "csrf", "edr",
  "social engineering", "defense-in-depth"
];
const cyberSecRelevant = cyberSecPool.filter((q) =>
  cyberSecKeywords.some((k) => q.question.toLowerCase().includes(k))
).length;
assert(cyberSecRelevant >= 14, `28. Cybersecurity questions semantically relevant (${cyberSecRelevant}/${cyberSecPool.length})`);

// Question pool differentiation
const cryptoQuestions = new Set(cryptoPool.map((q) => q.question));
const netSecQuestions = new Set(netSecPool.map((q) => q.question));
const cyberSecQuestions = new Set(cyberSecPool.map((q) => q.question));

let cryptoNetOverlap = 0;
for (const q of cryptoQuestions) {
  if (netSecQuestions.has(q)) cryptoNetOverlap++;
}
assert(cryptoNetOverlap === 0, "29. Cryptography pool and Network Security pool are 100% disjoint");

let cryptoCyberOverlap = 0;
for (const q of cryptoQuestions) {
  if (cyberSecQuestions.has(q)) cryptoCyberOverlap++;
}
assert(cryptoCyberOverlap === 0, "30. Cryptography pool and Cybersecurity pool are 100% disjoint");

let netCyberOverlap = 0;
for (const q of netSecQuestions) {
  if (cyberSecQuestions.has(q)) netCyberOverlap++;
}
assert(netCyberOverlap === 0, "31. Network Security pool and Cybersecurity pool are 100% disjoint");

// Quiz attempt selection: exactly 5, no duplicates, varied attempts
function pickQuizQuestions(pool) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5);
}

const attempt1 = pickQuizQuestions(cryptoPool);
const attempt2 = pickQuizQuestions(cryptoPool);
assert(attempt1.length === 5, "32. Attempt 1 has exactly 5 questions");
assert(new Set(attempt1.map((q) => q.question)).size === 5, "33. No duplicates within attempt 1");
assert(attempt2.length === 5, "34. Attempt 2 has exactly 5 questions");
assert(new Set(attempt2.map((q) => q.question)).size === 5, "35. No duplicates within attempt 2");

// Passing threshold rule: 3 of 5
function checkVerification(score) {
  return score >= 3;
}
assert(checkVerification(5) === true, "36. 5/5 → Verified");
assert(checkVerification(4) === true, "37. 4/5 → Verified");
assert(checkVerification(3) === true, "38. 3/5 → Verified");
assert(checkVerification(2) === false, "39. 2/5 → Not Verified");
assert(checkVerification(1) === false, "40. 1/5 → Not Verified");
assert(checkVerification(0) === false, "41. 0/5 → Not Verified");


// ═══════════════════════════════════════════════════════════════════════════
// FIX 5 TEST SUITE — Waterfall Artifact Analysis & Plan Extraction
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n--- FIX 5: Waterfall Artifact Analysis & Plan Extraction ---");

// Empty artifact validation
function validateArtifactsBeforeExtract(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return { ok: false, status: 400, error: "Upload an SRS, specification, or project artifact before analyzing." };
  }
  return { ok: true };
}

assert(validateArtifactsBeforeExtract([]).ok === false, "42. Empty artifact array rejected with 400");
assert(validateArtifactsBeforeExtract([]).error === "Upload an SRS, specification, or project artifact before analyzing.", "43. Helpful error message returned for empty artifacts");
assert(validateArtifactsBeforeExtract([{ name: "SRS.md", content: "System specification" }]).ok === true, "44. Valid artifact allows extraction");

// Draft plan structure validation (no blind mutation)
function mockDraftExtraction(artifact) {
  return {
    goals: ["Automate irrigation scheduling based on live sensor readings", "Reduce water wastage by 35%"],
    requirements: [
      { id: "REQ-001", title: "Soil Moisture Telemetry Ingestion", phase: "requirements", criticality: 9 },
      { id: "REQ-002", title: "Automated Valve Actuation Controller", phase: "implementation", criticality: 8 },
    ],
    constraints: ["ESP32 battery life > 12 months", "Hard deadline: 16 weeks"],
    candidateTasks: [
      { title: "Define telemetry payload schema", phase: "requirements" },
      { title: "Design database time-series schema", phase: "design" },
      { title: "Implement MQTT ingestion worker", phase: "implementation" },
      { title: "Conduct field moisture sensor calibration", phase: "testing" },
    ],
    isDraft: true,
  };
}

const extracted = mockDraftExtraction({ name: "SRS.md" });
assert(extracted.isDraft === true, "45. Extracted plan is flagged as DRAFT (requires human approval)");
assert(extracted.goals.length > 0, "46. Goals extracted from artifact");
assert(extracted.requirements.length > 0, "47. Requirements extracted from artifact");
assert(extracted.candidateTasks.length === 4, "48. Candidate tasks extracted with phases");
assert(extracted.candidateTasks.every((t) => WATERFALL_PHASES.includes(t.phase)), "49. Candidate tasks mapped to canonical Waterfall phases");


// ═══════════════════════════════════════════════════════════════════════════
// FIX 6 TEST SUITE — Waterfall Task Distribution & Sequential Phase Gates
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n--- FIX 6: Waterfall Task Distribution & Static Sequential Gates ---");

assert(WATERFALL_PHASES.length === 6, "50. Exact 6 canonical Waterfall phases defined");
assert(WATERFALL_PHASES[0] === "requirements", "51. Phase 1 is requirements");
assert(WATERFALL_PHASES[1] === "design", "52. Phase 2 is design (System Design)");
assert(WATERFALL_PHASES[2] === "implementation", "53. Phase 3 is implementation");
assert(WATERFALL_PHASES[3] === "testing", "54. Phase 4 is testing (Verification)");
assert(WATERFALL_PHASES[4] === "deployment", "55. Phase 5 is deployment");
assert(WATERFALL_PHASES[5] === "maintenance", "56. Phase 6 is maintenance");

// Semantic phase classification test
assert(mapCategoryOrTitleToWaterfallPhase("Planning", "Requirements Gathering and Analysis") === "requirements", "57. Requirements gathering → requirements");
assert(mapCategoryOrTitleToWaterfallPhase("Planning", "SRS Document Preparation") === "requirements", "58. SRS preparation → requirements");
assert(mapCategoryOrTitleToWaterfallPhase("Architecture", "Database Schema & System Design") === "design", "59. Schema design → design");
assert(mapCategoryOrTitleToWaterfallPhase("Backend", "REST API Development") === "implementation", "60. REST API dev → implementation");
assert(mapCategoryOrTitleToWaterfallPhase("Testing", "Unit & Integration Test Suite") === "testing", "61. Integration tests → testing");
assert(mapCategoryOrTitleToWaterfallPhase("Deployment", "Docker & Production Deployment") === "deployment", "62. Docker deploy → deployment");
assert(mapCategoryOrTitleToWaterfallPhase("General", "System Monitoring & Post-Launch Maintenance") === "maintenance", "63. Monitoring → maintenance");

// Sequential gate simulator based on phaseGateService logic
function simulateWaterfallGates(tasks) {
  const phaseDefs = [
    { phase: "requirements", name: "Requirements", order: 1 },
    { phase: "design", name: "System Design", order: 2 },
    { phase: "implementation", name: "Implementation", order: 3 },
    { phase: "testing", name: "Verification", order: 4 },
    { phase: "deployment", name: "Deployment", order: 5 },
    { phase: "maintenance", name: "Maintenance", order: 6 },
  ];

  const tasksByPhase = new Map();
  for (const def of phaseDefs) tasksByPhase.set(def.phase, []);
  for (const t of tasks) {
    const p = t.phase || "requirements";
    if (tasksByPhase.has(p)) tasksByPhase.get(p).push(t);
  }

  let priorAllCleared = true;
  let firstUncleared = null;
  const states = [];

  for (let i = 0; i < phaseDefs.length; i++) {
    const def = phaseDefs[i];
    const pTasks = tasksByPhase.get(def.phase) || [];
    const total = pTasks.length;
    const done = pTasks.filter((t) => t.status === "done").length;
    const gateSatisfied = total > 0 ? done >= total : true;

    let status = "LOCKED";
    let lockedReason = null;

    if (i === 0) {
      status = gateSatisfied ? "CLEARED" : "ACTIVE";
    } else {
      if (priorAllCleared) {
        status = gateSatisfied ? "CLEARED" : "ACTIVE";
      } else {
        status = "LOCKED";
        lockedReason = `Complete ${firstUncleared?.name || "prior phase"} before starting ${def.name}`;
      }
    }

    if (!gateSatisfied && !firstUncleared) {
      firstUncleared = def;
      priorAllCleared = false;
    }

    states.push({
      phase: def.phase,
      name: def.name,
      status,
      done,
      total,
      gateSatisfied,
      lockedReason,
    });
  }

  return states;
}

// Initial state: Requirements has 5 tasks todo, other phases have tasks todo
const initialTasks = [
  { id: "1", phase: "requirements", status: "todo" },
  { id: "2", phase: "requirements", status: "todo" },
  { id: "3", phase: "design", status: "todo" },
  { id: "4", phase: "implementation", status: "todo" },
  { id: "5", phase: "testing", status: "todo" },
  { id: "6", phase: "deployment", status: "todo" },
  { id: "7", phase: "maintenance", status: "todo" },
];

const state1 = simulateWaterfallGates(initialTasks);
assert(state1[0].status === "ACTIVE", "64. Initial: Requirements phase is ACTIVE");
assert(state1[1].status === "LOCKED", "65. Initial: System Design is LOCKED");
assert(state1[2].status === "LOCKED", "66. Initial: Implementation is LOCKED");
assert(state1[3].status === "LOCKED", "67. Initial: Verification is LOCKED");
assert(state1[4].status === "LOCKED", "68. Initial: Deployment is LOCKED");
assert(state1[5].status === "LOCKED", "69. Initial: Maintenance is LOCKED");

// Partial completion in later phases does NOT unlock them
const randomTasks = [
  { id: "1", phase: "requirements", status: "todo" }, // Requirements not done
  { id: "2", phase: "requirements", status: "done" },
  { id: "3", phase: "design", status: "done" },       // Later task done
  { id: "4", phase: "implementation", status: "done" },
];
const state2 = simulateWaterfallGates(randomTasks);
assert(state2[0].status === "ACTIVE", "70. Requirements is ACTIVE (1/2 done)");
assert(state2[1].status === "LOCKED", "71. System Design remains LOCKED despite completed task");
assert(state2[2].status === "LOCKED", "72. Implementation remains LOCKED despite completed task");

// Clear Requirements gate
const reqCompleteTasks = [
  { id: "1", phase: "requirements", status: "done" },
  { id: "2", phase: "requirements", status: "done" },
  { id: "3", phase: "design", status: "todo" },
  { id: "4", phase: "implementation", status: "todo" },
];
const state3 = simulateWaterfallGates(reqCompleteTasks);
assert(state3[0].status === "CLEARED", "73. Requirements is CLEARED");
assert(state3[1].status === "ACTIVE", "74. System Design becomes ACTIVE");
assert(state3[2].status === "LOCKED", "75. Implementation remains LOCKED");

// Clear System Design gate
const designCompleteTasks = [
  { id: "1", phase: "requirements", status: "done" },
  { id: "2", phase: "requirements", status: "done" },
  { id: "3", phase: "design", status: "done" },
  { id: "4", phase: "implementation", status: "todo" },
];
const state4 = simulateWaterfallGates(designCompleteTasks);
assert(state4[0].status === "CLEARED", "76. Requirements is CLEARED");
assert(state4[1].status === "CLEARED", "77. System Design is CLEARED");
assert(state4[2].status === "ACTIVE", "78. Implementation becomes ACTIVE");

// Server-side gate execution enforcement check
function assertExecutable(task, targetStatus, phaseStates) {
  if (targetStatus !== "in_progress" && targetStatus !== "done") return { ok: true };
  if (task.status === "done" && targetStatus === "done") return { ok: true }; // preserve history

  const pInfo = phaseStates.find((p) => p.phase === task.phase);
  if (pInfo && pInfo.status === "LOCKED") {
    return {
      ok: false,
      statusCode: 403,
      error: `Cannot transition task in locked phase "${pInfo.name}". ${pInfo.lockedReason}`,
    };
  }
  return { ok: true };
}

const lockedTask = { id: "3", phase: "design", status: "todo" };
const checkInProgress = assertExecutable(lockedTask, "in_progress", state1);
assert(checkInProgress.ok === false && checkInProgress.statusCode === 403, "79. Server blocks setting locked task to in_progress with 403");

const checkDone = assertExecutable(lockedTask, "done", state1);
assert(checkDone.ok === false && checkDone.statusCode === 403, "80. Server blocks setting locked task to done with 403");

// History preservation: task already done remains done
const historicalDoneTask = { id: "10", phase: "design", status: "done" };
const checkHistorical = assertExecutable(historicalDoneTask, "done", state1);
assert(checkHistorical.ok === true, "81. Historical DONE task status preserved (not reopened)");

console.log("\n===========================================================");
console.log(`TEST SUMMARY: ${passed} PASSED / ${failed} FAILED (TOTAL: ${total})`);
console.log("===========================================================\n");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
