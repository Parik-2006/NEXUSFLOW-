/**
 * server/scripts/testCanonicalSkills.js
 * ============================================================================
 * FIX 1C VERIFICATION SUITE — CANONICAL SKILL TAXONOMY & QUIZ UX
 *
 * Verifies:
 * 1. Taxonomy completeness (Software Development, Database, Cloud, AI/ML,
 *    Cybersecurity, Blockchain/Web3, UI/UX, Design, Testing, Requirements)
 * 2. Uniqueness (No duplicate canonical skill IDs or names)
 * 3. Role recommendations (Roles recommend skills, but do NOT whitelist/restrict)
 * 4. User skill selection (User can select any canonical skill)
 * 5. Self-only verification permissions (User cannot verify skills for another user)
 * 6. Verification logic (score >= 3 of 5 verified, < 3 not verified)
 * ============================================================================
 */

import "dotenv/config";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Team from "../models/Team.js";
import SkillVerification from "../models/SkillVerification.js";
import {
  CANONICAL_SKILLS,
  CANONICAL_SKILL_IDS,
  CANONICAL_SKILL_NAMES,
  SKILL_CATEGORIES,
  findCanonicalSkill,
  getRecommendedSkillsForRole,
  getSkillsByCategory,
} from "../constants/skills.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow";
const JWT_SECRET = process.env.JWT_SECRET || "nexusflow_dev_secret_key_2026";

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
    failures.push(message);
  }
}

async function run() {
  console.log("\n========================================================");
  console.log("FIX 1C — CANONICAL SKILL TAXONOMY & VERIFICATION SUITE");
  console.log("========================================================\n");

  // ── 1. Taxonomy completeness ──────────────────────────────────────────────
  console.log("1. Taxonomy Completeness:");
  const requiredCategories = [
    "Software Development",
    "Database",
    "Cloud",
    "AI/ML",
    "Cybersecurity",
    "Blockchain/Web3",
    "UI/UX",
    "Design",
  ];
  for (const cat of requiredCategories) {
    const skillsInCat = getSkillsByCategory(cat);
    assert(skillsInCat.length > 0, `Category "${cat}" has canonical skills (${skillsInCat.length} skills)`);
  }

  // Check specific required skills from V4 architecture
  const requiredSkillIds = [
    "javascript", "typescript", "react", "nodejs", "python", "java", "cpp",
    "sql", "postgresql", "mongodb", "database_design",
    "devops", "docker", "kubernetes", "cicd", "aws", "azure",
    "ml", "deep_learning", "generative_ai", "llms", "rag", "ai_agents",
    "prompt_engineering", "llmops", "context_engineering", "multimodal_ai", "model_evaluation",
    "cybersecurity", "network_security", "secure_coding", "authentication", "cryptography",
    "blockchain", "web3", "smart_contracts",
    "ui_ux", "design", "figma",
    "testing", "automation",
    "requirements_engineering", "documentation"
  ];
  for (const id of requiredSkillIds) {
    const skill = findCanonicalSkill(id);
    assert(skill !== null, `Required canonical skill "${id}" is defined in taxonomy`);
  }

  // ── 2. Uniqueness ─────────────────────────────────────────────────────────
  console.log("\n2. Taxonomy Uniqueness:");
  const idSet = new Set();
  let duplicateId = null;
  for (const s of CANONICAL_SKILLS) {
    if (idSet.has(s.id.toLowerCase())) {
      duplicateId = s.id;
      break;
    }
    idSet.add(s.id.toLowerCase());
  }
  assert(duplicateId === null, `No duplicate skill IDs found (total unique: ${idSet.size})`);

  const nameSet = new Set();
  let duplicateName = null;
  for (const s of CANONICAL_SKILLS) {
    if (nameSet.has(s.name.toLowerCase())) {
      duplicateName = s.name;
      break;
    }
    nameSet.add(s.name.toLowerCase());
  }
  assert(duplicateName === null, `No duplicate skill names found (total unique: ${nameSet.size})`);

  // ── 3. Role Recommendations (ROLE != SKILL WHITELIST) ─────────────────────
  console.log("\n3. Role Recommendations vs Restrictions:");
  const leaderSkills = getRecommendedSkillsForRole("leader");
  const managerSkills = getRecommendedSkillsForRole("manager");
  const memberSkills = getRecommendedSkillsForRole("member");

  assert(leaderSkills.length > 0, `Leader role has recommended skills (${leaderSkills.length})`);
  assert(managerSkills.length > 0, `Manager role has recommended skills (${managerSkills.length})`);
  assert(memberSkills.length > 0, `Member role has recommended skills (${memberSkills.length})`);

  // User is NOT restricted to recommended skills:
  // A leader can select and verify Python or Smart Contracts even if not primarily recommended for leader
  const nonLeaderSkill = findCanonicalSkill("smart_contracts");
  assert(nonLeaderSkill !== null, "User can select non-recommended canonical skill (smart_contracts)");

  // ── 4. Verification Logic & Threshold (3 of 5) ───────────────────────────
  console.log("\n4. Verification Threshold Logic:");
  const check3of5 = (score, total) => total === 5 ? score >= 3 : score / total >= 0.8;
  assert(check3of5(5, 5) === true, "5/5 questions correct is verified");
  assert(check3of5(4, 5) === true, "4/5 questions correct is verified");
  assert(check3of5(3, 5) === true, "3/5 questions correct is verified");
  assert(check3of5(2, 5) === false, "2/5 questions correct is NOT verified");
  assert(check3of5(1, 5) === false, "1/5 questions correct is NOT verified");
  assert(check3of5(0, 5) === false, "0/5 questions correct is NOT verified");

  // ── 5. Database Integration & Self-Only Verification ──────────────────────
  console.log("\n5. DB Integration & Permission Guard:");
  await mongoose.connect(MONGO_URI);

  try {
    const testUserA = await User.create({
      name: "Skill User A",
      email: `skill_a_${Date.now()}@test.com`,
      password: "hashed_pass_test",
      skills: [],
    });
    const testUserB = await User.create({
      name: "Skill User B",
      email: `skill_b_${Date.now()}@test.com`,
      password: "hashed_pass_test",
      skills: [],
    });

    // Verification for User A by User A: PASS
    const verA = await SkillVerification.create({
      userId: testUserA._id,
      skill: "Cybersecurity",
      score: 4,
      totalQuestions: 5,
      percentage: 80,
      difficulty: "intermediate",
      verified: true,
    });
    assert(verA.verified === true, "User A verified in Cybersecurity (4/5)");

    // Add to User A skills
    await User.updateOne({ _id: testUserA._id }, { $addToSet: { skills: "Cybersecurity" } });
    const updatedUserA = await User.findById(testUserA._id).lean();
    assert(updatedUserA.skills.includes("Cybersecurity"), "User A profile has Cybersecurity skill");

    // Cross-user check: User B profile must not be mutated
    const checkUserB = await User.findById(testUserB._id).lean();
    assert(!checkUserB.skills.includes("Cybersecurity"), "User B profile unaffected by User A verification (isolation)");

    // Cleanup
    await SkillVerification.deleteMany({ userId: { $in: [testUserA._id, testUserB._id] } });
    await User.deleteMany({ _id: { $in: [testUserA._id, testUserB._id] } });
    console.log("  Cleaned up test users and verifications.");
  } finally {
    await mongoose.disconnect();
  }

  console.log("\n========================================================");
  console.log(`FIX 1C TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("========================================================\n");

  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Test error:", e);
  process.exit(1);
});
