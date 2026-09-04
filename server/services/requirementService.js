/**
 * server/services/requirementService.js
 * ============================================================================
 * V4 WATERFALL REQUIREMENTS & DAA PRIORITY ENGINE
 *
 * Implements deterministic DAA scoring for requirements, Merge Sort ranking,
 * and AI-assisted extraction from uploaded project artifacts (SRS, rubric,
 * architecture documents, teacher guidelines) under the zero-cost policy.
 *
 * ARCHITECTURAL RULE:
 * DAA calculates the score. AI may explain or extract the text.
 * LLMs do NOT invent deterministic scores.
 * ============================================================================
 */

import { omniRouteGenerate } from "./omniRoute.js";

// Weight configuration for requirement priority
const W_ACADEMIC = 0.30;
const W_TEACHER = 0.25;
const W_CRITICALITY = 0.25;
const W_BUSINESS = 0.20;

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

/**
 * calculateRequirementScore
 * Deterministic DAA composite scoring for requirements.
 *
 * @param {object} req - requirement object
 * @returns {{ priorityScore: number, scoreExplanation: string }}
 */
export function calculateRequirementScore(req = {}) {
  const academic = clamp(Number(req.academicValue ?? 8), 1, 10);
  const teacher = clamp(Number(req.teacherImportance ?? 8), 1, 10);
  const crit = clamp(Number(req.criticality ?? 7), 1, 10);
  const biz = clamp(Number(req.businessValue ?? 7), 1, 10);
  const depCount = Array.isArray(req.dependencies) ? req.dependencies.length : 0;
  const depBonus = Math.min(depCount * 1.5, 6); // Up to +6 for heavy dependency fan-in

  // Normalize inputs from [1..10] to [0..100]
  const academicNorm = ((academic - 1) / 9) * 100;
  const teacherNorm = ((teacher - 1) / 9) * 100;
  const critNorm = ((crit - 1) / 9) * 100;
  const bizNorm = ((biz - 1) / 9) * 100;

  const baseScore =
    W_ACADEMIC * academicNorm +
    W_TEACHER * teacherNorm +
    W_CRITICALITY * critNorm +
    W_BUSINESS * bizNorm;

  const finalScore = Math.min(100, Math.round(baseScore + depBonus));

  // Determine top contributing factor for explanation
  const factors = [
    { label: "Academic Value", pct: Math.round(W_ACADEMIC * academicNorm) },
    { label: "Teacher Importance", pct: Math.round(W_TEACHER * teacherNorm) },
    { label: "System Criticality", pct: Math.round(W_CRITICALITY * critNorm) },
    { label: "Business Value", pct: Math.round(W_BUSINESS * bizNorm) },
  ].sort((a, b) => b.pct - a.pct);

  const top = factors[0];
  const second = factors[1];
  const scoreExplanation = `Primary driver: ${top.label} (${top.pct}pts), followed by ${second.label} (${second.pct}pts)${depCount > 0 ? ` +${Math.round(depBonus)}pts dependency impact` : ""}.`;

  return { priorityScore: finalScore, scoreExplanation };
}

/**
 * sortRequirementsMergeSort
 * Divide & Conquer Merge Sort for requirements by priorityScore descending.
 */
export function sortRequirementsMergeSort(items = []) {
  if (!Array.isArray(items) || items.length <= 1) return items;

  const mid = Math.floor(items.length / 2);
  const left = sortRequirementsMergeSort(items.slice(0, mid));
  const right = sortRequirementsMergeSort(items.slice(mid));

  const result = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    if (left[i].priorityScore >= right[j].priorityScore) {
      result.push(left[i++]);
    } else {
      result.push(right[j++]);
    }
  }

  while (i < left.length) result.push(left[i++]);
  while (j < right.length) result.push(right[j++]);

  return result;
}

/**
 * extractRequirementsFromArtifacts
 * Analyzes uploaded project artifacts and synthesizes structured requirements,
 * goals, phases, deliverables, constraints, and dependencies.
 */
export async function extractRequirementsFromArtifacts({
  artifacts = [],
  projectTitle = "",
  projectDescription = "",
  domain = "General Software",
}) {
  const combinedArtifactText = artifacts
    .map((a, idx) => `--- ARTIFACT ${idx + 1}: ${a.name} (${a.artifactType || "document"}) ---\n${a.content || a.summary || ""}`)
    .join("\n\n");

  const promptText = `
You are the NexusFlow V4 Waterfall Project Analyst.
Analyze the following project details and uploaded materials:

PROJECT TITLE: ${projectTitle}
DOMAIN: ${domain}
DESCRIPTION: ${projectDescription}

UPLOADED ARTIFACTS:
${combinedArtifactText || "No custom files uploaded. Analyze based on project title, domain, and description."}

Extract a comprehensive Waterfall Project Plan with:
1. Executive Goals (3-5 core objectives)
2. Constraints (time, budget, stack, security)
3. Structured Requirements (5-10 formal SRS items) categorized into Waterfall phases:
   - requirements
   - design
   - implementation
   - testing
   - deployment
   - maintenance

Return ONLY valid JSON matching this schema:
{
  "goals": ["string"],
  "constraints": ["string"],
  "deliverables": ["string"],
  "requirements": [
    {
      "reqId": "REQ-001",
      "title": "string",
      "description": "string",
      "phase": "requirements | design | implementation | testing | deployment | maintenance",
      "businessValue": 8,
      "academicValue": 9,
      "criticality": 8,
      "teacherImportance": 9,
      "estimatedHours": 16,
      "requiredSkills": ["skill1", "skill2"],
      "dependencies": [],
      "acceptanceCriteria": ["criterion 1", "criterion 2"]
    }
  ]
}
`.trim();

  let parsed = null;
  try {
    const aiRes = await omniRouteGenerate({
      prompt: promptText,
      systemInstruction: "You are an expert Systems Analyst extracting formal IEEE-style software requirements for a Waterfall project. Always respond with valid JSON only.",
      temperature: 0.2,
    });

    if (aiRes && aiRes.content) {
      const cleaned = aiRes.content.replace(/```json/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    }
  } catch (err) {
    console.warn("[extractRequirementsFromArtifacts] OmniRoute error or fallback:", err.message);
  }

  // Fallback if AI call failed or returned incomplete data
  if (!parsed || !Array.isArray(parsed.requirements) || parsed.requirements.length === 0) {
    parsed = generateCanonicalRequirementsFallback(projectTitle, domain);
  }

  // Score every requirement using deterministic DAA
  const scoredRequirements = parsed.requirements.map((req, idx) => {
    const scored = calculateRequirementScore(req);
    return {
      reqId: req.reqId || `REQ-00${idx + 1}`,
      title: req.title || `Requirement ${idx + 1}`,
      description: req.description || "",
      phase: req.phase || "requirements",
      businessValue: clamp(Number(req.businessValue ?? 7), 1, 10),
      academicValue: clamp(Number(req.academicValue ?? 8), 1, 10),
      criticality: clamp(Number(req.criticality ?? 7), 1, 10),
      teacherImportance: clamp(Number(req.teacherImportance ?? 8), 1, 10),
      estimatedHours: Number(req.estimatedHours ?? 14),
      requiredSkills: Array.isArray(req.requiredSkills) ? req.requiredSkills : ["Analysis"],
      dependencies: Array.isArray(req.dependencies) ? req.dependencies : [],
      acceptanceCriteria: Array.isArray(req.acceptanceCriteria) ? req.acceptanceCriteria : [],
      status: "draft",
      priorityScore: scored.priorityScore,
      scoreExplanation: scored.scoreExplanation,
      createdAt: new Date(),
    };
  });

  return {
    goals: Array.isArray(parsed.goals) ? parsed.goals : [`Successfully deliver ${projectTitle}`],
    constraints: Array.isArray(parsed.constraints) ? parsed.constraints : ["Strict sequential Waterfall phase gates"],
    deliverables: Array.isArray(parsed.deliverables) ? parsed.deliverables : ["SRS Document", "Architecture Specification", "System Implementation", "Test Suite", "Deployment Package"],
    requirements: sortRequirementsMergeSort(scoredRequirements),
  };
}

/**
 * generateCanonicalRequirementsFallback
 * High-quality fallback requirements for academic and software engineering projects.
 */
function generateCanonicalRequirementsFallback(title, domain) {
  return {
    goals: [
      `Deliver a robust ${title || "Waterfall System"} adhering to academic and engineering rigor`,
      "Achieve over 90% test coverage with automated unit and integration tests",
      "Produce comprehensive IEEE-compliant SRS documentation and architectural diagrams",
    ],
    constraints: [
      "Zero-defect delivery for critical path modules",
      "Sequential phase verification: testing cannot commence before code freeze",
      "Strict zero-cost infrastructure limits on external AI services",
    ],
    deliverables: [
      "Software Requirements Specification (SRS)",
      "High-Level & Low-Level Architectural Design Document",
      "Full Stack Application Codebase",
      "Verification & Validation Test Report",
      "User Manual & Deployment Runbook",
    ],
    requirements: [
      {
        reqId: "REQ-001",
        title: "Comprehensive Software Requirements Specification (SRS)",
        description: "Formally document functional and non-functional requirements, use cases, and acceptance criteria.",
        phase: "requirements",
        businessValue: 8,
        academicValue: 10,
        criticality: 9,
        teacherImportance: 10,
        estimatedHours: 18,
        requiredSkills: ["Requirements Engineering", "Technical Writing"],
        dependencies: [],
        acceptanceCriteria: ["Teacher approved SRS document", "Traceability matrix established"],
      },
      {
        reqId: "REQ-002",
        title: "Relational Database Schema & System Architecture Design",
        description: "Design 3NF relational schemas, entity-relationship diagrams, and component tier boundaries.",
        phase: "design",
        businessValue: 7,
        academicValue: 9,
        criticality: 9,
        teacherImportance: 9,
        estimatedHours: 22,
        requiredSkills: ["System Design", "Database Design", "UML"],
        dependencies: ["REQ-001"],
        acceptanceCriteria: ["ER diagrams approved", "Data dictionary compiled"],
      },
      {
        reqId: "REQ-003",
        title: "Core Service Implementation & RESTful APIs",
        description: "Implement primary business logic, authentication, and transactional endpoints.",
        phase: "implementation",
        businessValue: 9,
        academicValue: 9,
        criticality: 9,
        teacherImportance: 9,
        estimatedHours: 35,
        requiredSkills: ["Backend Development", "Node.js", "API Security"],
        dependencies: ["REQ-002"],
        acceptanceCriteria: ["All core endpoints return valid responses", "Authentication protected"],
      },
      {
        reqId: "REQ-004",
        title: "Interactive User Interface & Visualization Modules",
        description: "Develop responsive client interfaces, interactive dashboards, and feedback controls.",
        phase: "implementation",
        businessValue: 8,
        academicValue: 8,
        criticality: 8,
        teacherImportance: 8,
        estimatedHours: 28,
        requiredSkills: ["Frontend Development", "React", "UI/UX"],
        dependencies: ["REQ-003"],
        acceptanceCriteria: ["UI adheres to warm editorial aesthetic", "Responsive across devices"],
      },
      {
        reqId: "REQ-005",
        title: "Automated Integration & Quality Gate Test Suite",
        description: "Execute unit tests, boundary validations, regression runs, and security audits.",
        phase: "testing",
        businessValue: 8,
        academicValue: 10,
        criticality: 10,
        teacherImportance: 10,
        estimatedHours: 20,
        requiredSkills: ["QA Testing", "Jest", "Test Automation"],
        dependencies: ["REQ-003", "REQ-004"],
        acceptanceCriteria: ["Zero critical bugs remaining", "Test suite passing 100%"],
      },
      {
        reqId: "REQ-006",
        title: "Production Deployment & Demonstration Runbook",
        description: "Configure staging environment, CI/CD pipeline, and prepare teacher evaluation demo.",
        phase: "deployment",
        businessValue: 9,
        academicValue: 9,
        criticality: 8,
        teacherImportance: 9,
        estimatedHours: 14,
        requiredSkills: ["DevOps", "Cloud Deployment", "Documentation"],
        dependencies: ["REQ-005"],
        acceptanceCriteria: ["Live URL accessible", "Demo script prepared"],
      },
    ],
  };
}
