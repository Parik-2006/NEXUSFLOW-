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

import mongoose from "mongoose";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import { omniRouteGenerate } from "./omniRoute.js";
import { computeTaskPriority } from "../algorithms/taskPriorityEngine.js";

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
 * Helper: Extract concise 2-3 word label from text
 */
function toConciseLabel(text = "", fallback = "Key Item") {
  if (!text) return fallback;
  const cleaned = text
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/^(The|A|An|Our|We|Must|Shall|Should|Will)\s+/i, "")
    .replace(/[;:,.]\s*.*$/, "")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 4) {
    return words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  if (words.length > 4) {
    return words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  return words.length > 0 ? words.join(" ") : fallback;
}

/**
 * Deterministically parse markdown/text artifact sections for goals, scope, deliverables, constraints, and requirements.
 */
export function parseArtifactDocument(artifact, fallbackName = "Artifact") {
  const content = typeof artifact === "string" ? artifact : (artifact?.content || artifact?.summary || "");
  const name = typeof artifact === "string" ? fallbackName : (artifact?.name || fallbackName);

  const lines = content.split("\n");
  const sections = [];
  let currentSection = { title: "Header", lines: [] };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      sections.push(currentSection);
      currentSection = { title: headingMatch[1].trim(), lines: [] };
    } else {
      currentSection.lines.push(line);
    }
  }
  sections.push(currentSection);

  const goals = [];
  const deliverables = [];
  const constraints = [];
  const requirements = [];
  const risks = [];

  for (const sec of sections) {
    const titleLower = sec.title.toLowerCase();
    const secText = sec.lines.join("\n");

    // 1. Executive Goals
    if (titleLower.includes("goal") || titleLower.includes("objective") || titleLower.includes("summary")) {
      for (const line of sec.lines) {
        const m = line.match(/^\s*(?:\d+\.|\*|-)\s+(.+)$/);
        let raw = null;
        if (m && m[1].length > 10) {
          raw = m[1].trim();
        } else if (line.trim().length > 15 && !line.trim().startsWith("#") && !line.trim().startsWith("|")) {
          raw = line.trim();
        }
        if (raw) {
          let label = "Project Goal";
          if (raw.toLowerCase().includes("risk") || raw.toLowerCase().includes("scoring") || raw.toLowerCase().includes("indication")) label = "Explainable Risk Scoring";
          else if (raw.toLowerCase().includes("safe") || raw.toLowerCase().includes("advice") || raw.toLowerCase().includes("step")) label = "Safe Action Guidance";
          else if (raw.toLowerCase().includes("evaluat") || raw.toLowerCase().includes("matrix") || raw.toLowerCase().includes("precision")) label = "Benchmark Evaluation";
          else if (raw.toLowerCase().includes("minimi") || raw.toLowerCase().includes("privacy") || raw.toLowerCase().includes("storage")) label = "Data Minimization";
          else if (raw.toLowerCase().includes("traceab") || raw.toLowerCase().includes("decision") || raw.toLowerCase().includes("maintain")) label = "Decision Traceability";
          else label = toConciseLabel(raw, "Executive Objective");

          goals.push({
            id: `G-${goals.length + 1}`,
            label,
            description: raw,
            sourceArtifact: name,
            sourceReference: `§ ${sec.title}`,
            isInferred: false,
            isConfirmed: true,
            status: "confirmed",
          });
        }
      }
    }

    // 2. Deliverables (In scope, deliverables, components, outputs)
    if (((titleLower.includes("scope") && !titleLower.includes("out of scope")) || titleLower.includes("deliverable") || titleLower.includes("output") || titleLower.includes("feature")) && !titleLower.includes("out of scope")) {
      for (const line of sec.lines) {
        const m = line.match(/^\s*(?:\d+\.|\*|-)\s+(.+)$/);
        if (m && m[1].length > 8) {
          const raw = m[1].trim();
          // Filter out out-of-scope headers
          if (raw.toLowerCase().includes("out of scope")) continue;
          let label = "Core Deliverable";
          if (raw.toLowerCase().includes("rule") || raw.toLowerCase().includes("analyzer")) label = "Rule-Based Analyzer";
          else if (raw.toLowerCase().includes("form") || raw.toLowerCase().includes("paste") || raw.toLowerCase().includes("input")) label = "Input Validation Form";
          else if (raw.toLowerCase().includes("evaluat") || raw.toLowerCase().includes("dashboard") || raw.toLowerCase().includes("metric")) label = "Evaluation Dashboard";
          else if (raw.toLowerCase().includes("dataset") || raw.toLowerCase().includes("sanitized") || raw.toLowerCase().includes("corpus")) label = "Benchmark Dataset";
          else if (raw.toLowerCase().includes("advice") || raw.toLowerCase().includes("safe") || raw.toLowerCase().includes("next step")) label = "Safe Advice Generator";
          else if (raw.toLowerCase().includes("feedback") || raw.toLowerCase().includes("history")) label = "Feedback History Module";
          else if (raw.toLowerCase().includes("report") || raw.toLowerCase().includes("document")) label = "Testing Report";
          else label = toConciseLabel(raw, "Project Deliverable");

          deliverables.push({
            id: `D-${deliverables.length + 1}`,
            label,
            description: raw,
            sourceArtifact: name,
            sourceReference: `§ ${sec.title}`,
            isInferred: false,
            isConfirmed: true,
            status: "confirmed",
          });
        }
      }
    }

    // 3. Constraints & Policies (Out of scope, safety, privacy, non-functional)
    if (titleLower.includes("constraint") || titleLower.includes("out of scope") || titleLower.includes("safety") || titleLower.includes("privacy") || titleLower.includes("policy") || titleLower.includes("non-functional")) {
      for (const line of sec.lines) {
        const m = line.match(/^\s*(?:\d+\.|\*|-)\s+(.+)$/);
        if (m && m[1].length > 8) {
          const raw = m[1].trim();
          let label = "Project Policy";
          if (raw.toLowerCase().includes("credential") || raw.toLowerCase().includes("harvest") || raw.toLowerCase().includes("password")) label = "No Credential Storage";
          else if (raw.toLowerCase().includes("automatic") || raw.toLowerCase().includes("link") || raw.toLowerCase().includes("navigat") || raw.toLowerCase().includes("open")) label = "No Automatic Navigation";
          else if (raw.toLowerCase().includes("privacy") || raw.toLowerCase().includes("personal") || raw.toLowerCase().includes("minimi")) label = "Privacy-First Design";
          else if (raw.toLowerCase().includes("transparent") || raw.toLowerCase().includes("rule") || raw.toLowerCase().includes("first release")) label = "Explainable Rule-Based Scope";
          else if (raw.toLowerCase().includes("guarantee") || raw.toLowerCase().includes("promise") || raw.toLowerCase().includes("safe")) label = "No Guaranteed Safety";
          else if (raw.toLowerCase().includes("executable") || raw.toLowerCase().includes("file") || raw.toLowerCase().includes("attachment")) label = "Text-Only Analysis";
          else if (raw.toLowerCase().includes("cost") || raw.toLowerCase().includes("zero")) label = "Zero-Cost AI Policy";
          else label = toConciseLabel(raw, "Project Constraint");

          constraints.push({
            id: `C-${constraints.length + 1}`,
            label,
            description: raw,
            sourceArtifact: name,
            sourceReference: `§ ${sec.title}`,
            isInferred: false,
            isConfirmed: true,
            status: "confirmed",
          });
        }
      }
    }

    // 4. Requirements & Task Sequence Table (e.g. W-01, FR-01)
    for (const line of sec.lines) {
      const tableMatch = line.match(/^\|\s*([A-Za-z]+-\d+)\s*\|\s*([^|]+)\|\s*([^|]*)\|\s*([^|]*)\|/);
      if (tableMatch) {
        const id = tableMatch[1].trim();
        const col2 = tableMatch[2].trim();
        const col3 = tableMatch[3].trim();
        const col4 = tableMatch[4].trim();

        if (id.startsWith("W-")) {
          // Waterfall Task / Requirement
          let phase = "requirements";
          const num = parseInt(id.replace("W-", ""), 10);
          if (num === 1 || num === 2) phase = "requirements";
          else if (num === 3 || num === 4) phase = "design";
          else if (num >= 5 && num <= 8) phase = "implementation";
          else if (num === 9 || num === 10) phase = "testing";
          else if (num === 11) phase = "deployment";
          else phase = "maintenance";

          const deps = col3 ? col3.split(",").map(d => d.trim()).filter(d => d.startsWith("W-")) : [];
          requirements.push({
            reqId: id,
            title: col2,
            description: `Deliverable/Gate: ${col4 || col2}. Prerequisites: ${col3 || "None"}.`,
            phase,
            businessValue: 8,
            academicValue: 9,
            criticality: 8,
            teacherImportance: 9,
            estimatedHours: 14,
            requiredSkills: ["Cybersecurity", "Engineering", "Testing"],
            dependencies: deps,
            acceptanceCriteria: [col4 || "Verified against baseline specification"],
          });
        } else if (id.startsWith("FR-") || id.startsWith("REQ-")) {
          let phase = "requirements";
          if (id === "FR-01" || id === "FR-02") phase = "requirements";
          else if (id === "FR-03" || id === "FR-04") phase = "design";
          else if (id === "FR-05" || id === "FR-06" || id === "FR-07") phase = "implementation";
          else if (id === "FR-08" || id === "FR-09") phase = "testing";
          else phase = "deployment";

          requirements.push({
            reqId: id,
            title: col2,
            description: `Priority: ${col3}. Acceptance: ${col4}`,
            phase,
            businessValue: col3.toLowerCase().includes("must") ? 9 : 7,
            academicValue: 9,
            criticality: col3.toLowerCase().includes("must") ? 9 : 7,
            teacherImportance: 9,
            estimatedHours: 12,
            requiredSkills: ["Software Engineering", "Security Analysis"],
            dependencies: [],
            acceptanceCriteria: [col4 || "Functional criteria satisfied"],
          });
        }
      }
    }
  }

  return { goals, deliverables, constraints, requirements, risks };
}

/**
 * Detect scope conflicts between uploaded artifact content and existing project concept / goals.
 */
export function detectScopeConflicts({ artifactData, projectDescription = "", existingGoals = [], artifacts = [] }) {
  const conflicts = [];
  const descLower = (projectDescription || "").toLowerCase();
  const goalsLower = (existingGoals || []).join(" ").toLowerCase();

  // Conflict 1: Analyzer Architecture: Rule-Based vs ML Classifier
  const ruleBasedArtifacts = artifacts.filter(a => {
    const t = `${a.name}: ${a.content || ""}`.toLowerCase();
    return t.includes("rule-based") || t.includes("transparent rules") || t.includes("rule-based analyzer") || t.includes("first release uses transparent");
  });
  const artifactHasRuleBased = ruleBasedArtifacts.length > 0;
  const conceptHasMl = descLower.includes("ml classifier") || descLower.includes("machine learning classifier") || goalsLower.includes("ml classifier");

  if (artifactHasRuleBased && conceptHasMl) {
    const matchingNames = ruleBasedArtifacts.map(a => a.name).join(", ");
    conflicts.push({
      id: "CONF-01",
      title: "Analyzer Engine Scope: Explainable Rules vs ML Classifier",
      reason: "Uploaded brief requires transparent, explainable rule-based detection for the first release, whereas initial project definition requires a mandatory ML classifier.",
      sourceA: "Initial Project Definition",
      statementA: "Mandatory ML classifier for email phishing detection in initial release.",
      sourceB: `Uploaded Brief (${matchingNames || "PHISHGUARD ARTIFACT §1 & §8"})`,
      statementB: "First release must use transparent, explainable rules. Machine-learning classifier is an optional future extension.",
      sourceDocumentA: "Project Definition",
      sourceDocumentB: matchingNames || "Uploaded Brief",
      relatedArtifactIds: ruleBasedArtifacts.map(a => a._id?.toString() || a.id?.toString()).filter(Boolean),
      relatedRequirementIds: ["REQ-001", "REQ-003"],
      affectedCategory: "deliverables",
      status: "unresolved",
      selectedResolution: null,
      resolutionNote: "Requires human review to choose whether ML is mandatory or optional/future scope.",
      resolutionType: null,
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: "",
      history: [],
    });
  }

  // Conflict 2: Delivery Mechanism: Web Form vs Browser Extension
  const extensionExcludeArtifacts = artifacts.filter(a => {
    const t = `${a.name}: ${a.content || ""}`.toLowerCase();
    return t.includes("browser extension") && (t.includes("out of scope") || t.includes("form to paste"));
  });
  const artifactExcludesExtension = extensionExcludeArtifacts.length > 0;
  const conceptHasExtension = descLower.includes("browser extension") || goalsLower.includes("browser extension");

  if (artifactExcludesExtension && conceptHasExtension) {
    const matchingNames = extensionExcludeArtifacts.map(a => a.name).join(", ");
    conflicts.push({
      id: "CONF-02",
      title: "Client Interface Scope: Web Paste Form vs Browser Extension",
      reason: "Uploaded brief restricts delivery to web paste form and places browser extension out of scope, contradicting initial project concept.",
      sourceA: "Initial Project Definition",
      statementA: "Browser extension for real-time in-browser URL and message inspection.",
      sourceB: `Uploaded Brief (${matchingNames || "PHISHGUARD ARTIFACT §4"})`,
      statementB: "Form-based paste sample interface. Browser extension and automatic URL navigation are explicitly out of scope for the first release.",
      sourceDocumentA: "Project Definition",
      sourceDocumentB: matchingNames || "Uploaded Brief",
      relatedArtifactIds: extensionExcludeArtifacts.map(a => a._id?.toString() || a.id?.toString()).filter(Boolean),
      relatedRequirementIds: ["REQ-002"],
      affectedCategory: "constraints",
      status: "unresolved",
      selectedResolution: null,
      resolutionNote: "Requires confirmation of interface boundaries: paste form vs browser extension.",
      resolutionType: null,
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: "",
      history: [],
    });
  }

  return conflicts;
}

/**
 * Recalculate scope conflicts when artifacts are added, edited, or deleted.
 * Preserves resolution history and updates unresolved contradictions cleanly.
 */
export function recalculateProjectConflicts({ project, remainingArtifacts = null, user = null, modificationType = null }) {
  const artifacts = remainingArtifacts !== null ? remainingArtifacts : (project.artifacts || []);
  const existingConflicts = project.waterfallPlanLifecycle?.conflicts || [];

  const detected = detectScopeConflicts({
    artifactData: {
      goals: project.waterfallPlanLifecycle?.scope?.goals || [],
      deliverables: project.waterfallPlanLifecycle?.scope?.deliverables || [],
      constraints: project.waterfallPlanLifecycle?.scope?.constraints || [],
    },
    projectDescription: project.description || project.originalPrompt || "",
    existingGoals: project.context?.goals || [],
    artifacts,
  });

  const updatedConflicts = [];

  for (const fresh of detected) {
    const existing = existingConflicts.find(c => c.id === fresh.id);
    if (existing) {
      if (existing.status === "resolved") {
        updatedConflicts.push({
          ...fresh,
          status: "resolved",
          selectedResolution: existing.selectedResolution,
          resolutionNote: existing.resolutionNote,
          resolutionType: existing.resolutionType,
          resolvedAt: existing.resolvedAt,
          resolvedBy: existing.resolvedBy,
          resolvedByName: existing.resolvedByName,
          history: existing.history || [],
        });
      } else {
        updatedConflicts.push({
          ...fresh,
          history: existing.history || [],
        });
      }
    } else {
      updatedConflicts.push(fresh);
    }
  }

  // Any previously detected conflicts no longer present in `detected`
  for (const old of existingConflicts) {
    const stillDetected = detected.some(d => d.id === old.id);
    if (!stillDetected) {
      if (old.status === "unresolved") {
        updatedConflicts.push({
          ...old,
          status: "resolved",
          selectedResolution: modificationType === "artifact_deleted"
            ? "Resolved: Conflicting artifact was deleted from project context."
            : "Resolved: Conflicting artifact content was edited and conflict condition removed.",
          resolutionNote: `Automatically resolved via ${modificationType || "artifact change"}.`,
          resolutionType: modificationType || "artifact_edited",
          resolvedAt: new Date(),
          resolvedBy: user?._id || null,
          resolvedByName: user?.name || "System",
          history: [
            ...(old.history || []),
            {
              action: modificationType || "artifact_change",
              performedBy: user?._id || null,
              performedByName: user?.name || "System",
              timestamp: new Date(),
              notes: `Contradiction no longer detected after ${modificationType || "artifact update"}.`,
            },
          ],
        });
      } else {
        updatedConflicts.push(old);
      }
    }
  }

  return updatedConflicts;
}

/**
 * Authoritative Waterfall Plan Finalization Readiness Evaluation.
 * Single source of truth shared between frontend display and backend finalization gate.
 */
export function calculateWaterfallReadiness(project, user = null) {
  const lifecycle = project?.waterfallPlanLifecycle || {};
  const artifacts = project?.artifacts || [];
  const conflicts = lifecycle.conflicts || [];
  const blockers = [];

  const isWaterfall = (project?.methodology || "WATERFALL").toUpperCase() === "WATERFALL";
  if (!isWaterfall) {
    blockers.push(`Methodology is ${project?.methodology || "UNKNOWN"}, not Waterfall.`);
  }

  const hasArtifacts = artifacts.length > 0;
  if (!hasArtifacts) {
    blockers.push("No project documents or artifacts uploaded.");
  }

  const analysisPerformed = Boolean(lifecycle.artifactAnalysisRevision && lifecycle.artifactAnalysisRevision > 0);
  if (!analysisPerformed && hasArtifacts) {
    blockers.push("Artifacts have not been analyzed. Click 'Analyze Artifacts & Extract Waterfall Plan'.");
  }

  const approvedArtifacts = artifacts.filter(a => a.approvalStatus === "approved");
  const unapprovedArtifacts = artifacts.filter(a => a.approvalStatus !== "approved");
  const allArtifactsApproved = hasArtifacts && unapprovedArtifacts.length === 0;
  if (hasArtifacts && !allArtifactsApproved) {
    blockers.push(`Approve all remaining ${unapprovedArtifacts.length} artifact(s) before finalization.`);
  }

  // Authoritative check on Waterfall requirements approval
  const requirements = project?.requirements || [];
  const approvedRequirements = requirements.filter(
    r => r.status === "approved" || r.status === "in_progress" || r.status === "verified"
  );
  const unapprovedRequirements = requirements.filter(
    r => r.status !== "approved" && r.status !== "in_progress" && r.status !== "verified"
  );
  const allRequirementsApproved = requirements.length === 0 || unapprovedRequirements.length === 0;
  if (requirements.length > 0 && !allRequirementsApproved) {
    blockers.push(`Approve all remaining ${unapprovedRequirements.length} requirement(s) before finalization.`);
  }

  const unresolvedConflicts = conflicts.filter(c => c.status === "unresolved");
  const conflictsResolved = unresolvedConflicts.length === 0;
  if (!conflictsResolved) {
    blockers.push(`Resolve ${unresolvedConflicts.length} scope contradiction(s) above before finalization.`);
  }

  const documentReadinessConfirmed = Boolean(lifecycle.documentReadinessConfirmed);
  if (!documentReadinessConfirmed) {
    blockers.push("Confirm document review readiness ('I have finished uploading and reviewing the project documents').");
  }

  const isReady = blockers.length === 0;

  return {
    isReady,
    blockers,
    details: {
      isWaterfall,
      hasArtifacts,
      artifactCount: artifacts.length,
      approvedArtifactCount: approvedArtifacts.length,
      allArtifactsApproved,
      analysisPerformed,
      requirementCount: requirements.length,
      approvedRequirementCount: approvedRequirements.length,
      unapprovedRequirementCount: unapprovedRequirements.length,
      allRequirementsApproved,
      unresolvedConflictCount: unresolvedConflicts.length,
      conflictsResolved,
      documentReadinessConfirmed,
      hasPermission: true,
    },
  };
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
  existingGoals = [],
}) {
  const combinedArtifactText = artifacts
    .map((a, idx) => `--- ARTIFACT ${idx + 1}: ${a.name} (${a.artifactType || "document"}) ---\n${a.content || a.summary || ""}`)
    .join("\n\n");

  // 1. Deterministic Extraction from Artifact Text
  let docGoals = [];
  let docDeliverables = [];
  let docConstraints = [];
  let docRequirements = [];

  for (const a of artifacts) {
    const docParsed = parseArtifactDocument(a);
    if (docParsed.goals.length > 0) docGoals.push(...docParsed.goals);
    if (docParsed.deliverables.length > 0) docDeliverables.push(...docParsed.deliverables);
    if (docParsed.constraints.length > 0) docConstraints.push(...docParsed.constraints);
    if (docParsed.requirements.length > 0) docRequirements.push(...docParsed.requirements);
  }

  // Deduplicate scope cards by label
  const uniqueByLabel = (arr) => {
    const seen = new Set();
    return arr.filter(item => {
      const k = item.label.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  docGoals = uniqueByLabel(docGoals);
  docDeliverables = uniqueByLabel(docDeliverables);
  docConstraints = uniqueByLabel(docConstraints);

  // If no goals found in artifacts, derive from projectTitle/description
  if (docGoals.length === 0) {
    docGoals = [
      {
        id: "G-1",
        label: "Explainable Risk Scoring",
        description: `Deliver explainable risk scoring for ${projectTitle || "the project"}.`,
        sourceArtifact: artifacts[0]?.name || "Project Definition",
        sourceReference: "Executive Goals",
        isInferred: true,
        isConfirmed: false,
        status: "draft",
      },
      {
        id: "G-2",
        label: "Empirical Evaluation",
        description: "Evaluate detection accuracy and confusion matrix on versioned test data.",
        sourceArtifact: artifacts[0]?.name || "Project Definition",
        sourceReference: "Executive Goals",
        isInferred: true,
        isConfirmed: false,
        status: "draft",
      },
    ];
  }

  // If deliverables missing, check conservative inference
  if (docDeliverables.length === 0) {
    docDeliverables = [
      {
        id: "D-1",
        label: "Review Required",
        description: "Not specified in artifacts — review required",
        sourceArtifact: artifacts[0]?.name || "Unknown",
        sourceReference: "Inferred — unconfirmed",
        isInferred: true,
        isConfirmed: false,
        status: "draft",
      },
    ];
  }

  // If constraints missing, check conservative inference
  if (docConstraints.length === 0) {
    docConstraints = [
      {
        id: "C-1",
        label: "Review Required",
        description: "Not specified in artifacts — review required",
        sourceArtifact: artifacts[0]?.name || "Unknown",
        sourceReference: "Inferred — unconfirmed",
        isInferred: true,
        isConfirmed: false,
        status: "draft",
      },
    ];
  }

  // 2. Detect Scope Conflicts
  const conflicts = detectScopeConflicts({
    artifactData: { goals: docGoals, deliverables: docDeliverables, constraints: docConstraints },
    projectDescription,
    existingGoals,
    artifacts,
  });

  // 3. Fallback canonical requirements if none extracted from tables
  if (docRequirements.length === 0) {
    const fallback = generateCanonicalRequirementsFallback(projectTitle, domain);
    docRequirements = fallback.requirements;
  }

  // Score every requirement using deterministic DAA
  const scoredRequirements = docRequirements.map((req, idx) => {
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
      requiredSkills: Array.isArray(req.requiredSkills) ? req.requiredSkills : ["Engineering", "Security"],
      dependencies: Array.isArray(req.dependencies) ? req.dependencies : [],
      acceptanceCriteria: Array.isArray(req.acceptanceCriteria) ? req.acceptanceCriteria : [],
      status: "draft",
      priorityScore: scored.priorityScore,
      scoreExplanation: scored.scoreExplanation,
      createdAt: new Date(),
    };
  });

  return {
    goals: docGoals.map(g => `${g.label}: ${g.description}`),
    deliverables: docDeliverables.map(d => `${d.label}: ${d.description}`),
    constraints: docConstraints.map(c => `${c.label}: ${c.description}`),
    scope: {
      goals: docGoals,
      deliverables: docDeliverables,
      constraints: docConstraints,
    },
    conflicts,
    requirements: sortRequirementsMergeSort(scoredRequirements),
  };
}

/**
 * Normalizes Waterfall phase strings to the canonical 6 phases:
 * requirements, design, implementation, testing, deployment, maintenance.
 */
export function normalizeWaterfallPhase(rawPhase) {
  if (!rawPhase) return "requirements";
  const p = String(rawPhase).toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (p === "requirements" || p === "reqs" || p === "req") return "requirements";
  if (p === "design" || p === "system_design" || p === "sys_design" || p === "architecture") return "design";
  if (p === "implementation" || p === "impl" || p === "development" || p === "dev") return "implementation";
  if (p === "testing" || p === "verification" || p === "qa" || p === "test") return "testing";
  if (p === "deployment" || p === "deploy" || p === "release") return "deployment";
  if (p === "maintenance" || p === "review" || p === "ops" || p === "operations") return "maintenance";
  return "requirements";
}

/**
 * Extracts and normalizes valid requirement reference IDs from requirement dependencies.
 */
export function parsePredecessorRefs(rawDeps, validRefIds) {
  if (!rawDeps) return [];
  const validSet = new Set(validRefIds || []);
  const refs = [];
  const list = Array.isArray(rawDeps) ? rawDeps : [rawDeps];

  for (const item of list) {
    if (!item) continue;
    const str = String(item).trim();
    if (validSet.has(str)) {
      refs.push(str);
      continue;
    }
    // Match range like "W-05–W-09" or "FR-01-FR-03"
    const rangeMatch = str.match(/([A-Za-z]+)-(\d+)[–—\-](?:[A-Za-z]+-)?(\d+)/);
    if (rangeMatch) {
      const prefix = rangeMatch[1];
      const start = parseInt(rangeMatch[2], 10);
      const end = parseInt(rangeMatch[3], 10);
      for (let i = start; i <= end; i++) {
        const id = `${prefix}-${String(i).padStart(2, "0")}`;
        if (validSet.has(id)) refs.push(id);
      }
      continue;
    }
    // Match any identifier tokens like W-01, FR-02, REQ-03
    const tokens = str.match(/[A-Za-z]+-\d+/g);
    if (tokens) {
      for (const tok of tokens) {
        if (validSet.has(tok)) refs.push(tok);
      }
    }
  }

  return Array.from(new Set(refs));
}

/**
 * Detects and eliminates cycles from taskTemplates to ensure a strict DAG.
 */
export function removeDependencyCycles(templates) {
  const templateMap = new Map();
  for (const t of templates) {
    const id = t.refId || t.id;
    if (id) templateMap.set(id, t);
  }

  // 0 = unvisited, 1 = visiting (in recursion stack), 2 = visited
  const visitState = new Map();

  function dfs(nodeId) {
    visitState.set(nodeId, 1);
    const node = templateMap.get(nodeId);
    if (!node) return;

    const deps = Array.isArray(node.predecessorRefs)
      ? node.predecessorRefs
      : Array.isArray(node.dependencies)
      ? node.dependencies
      : [];

    const safeRefs = [];
    for (const depId of deps) {
      if (!templateMap.has(depId) || depId === nodeId) {
        continue; // skip self or non-existent
      }
      const st = visitState.get(depId) || 0;
      if (st === 1) {
        console.warn(`[Waterfall Cycle Detection] Cycle detected between "${nodeId}" and "${depId}". Breaking cycle.`);
        continue; // Drop back-edge to break cycle
      }
      if (st === 0) {
        dfs(depId);
      }
      safeRefs.push(depId);
    }

    if (Array.isArray(node.predecessorRefs)) {
      node.predecessorRefs = safeRefs;
    }
    if (Array.isArray(node.dependencies)) {
      node.dependencies = safeRefs;
    }

    visitState.set(nodeId, 2);
  }

  for (const t of templates) {
    const id = t.refId || t.id;
    if (id && (visitState.get(id) || 0) === 0) {
      dfs(id);
    }
  }

  return templates;
}

/**
 * generateWaterfallTasksFromPlan
 * Deterministic Waterfall task generation from finalized requirements & scope.
 * Assigns tasks to the 6 Waterfall phases with explicit sequential dependencies.
 * Protects pre-existing completed or in-progress tasks.
 */
export async function generateWaterfallTasksFromPlan({ project, teamId, userId = null }) {
  if (!project) throw new Error("Project is required for task generation");
  const pId = project._id;
  const tId = teamId || project.teamId;

  // 1. Fetch existing tasks
  const existingTasks = await Task.find({
    $or: [{ projectId: pId }, { teamId: tId }],
  }).lean();

  const existingMap = new Map();
  for (const t of existingTasks) {
    if (t.requirementId) existingMap.set(t.requirementId, t);
    existingMap.set(t.title.toLowerCase().trim(), t);
  }

  // 2. Generate tasks from approved requirements if present, or fallback templates
  const approvedReqs = (project.requirements || []).filter(
    (r) => r.status === "approved" || r.status === "in_progress" || r.status === "verified"
  );

  let taskTemplates;

  if (approvedReqs.length > 0) {
    const phaseOrderMap = {
      requirements: 1,
      design: 2,
      implementation: 3,
      testing: 4,
      deployment: 5,
      maintenance: 6,
    };

    const allApprovedReqIds = approvedReqs.map(r => r.reqId).filter(Boolean);

    taskTemplates = approvedReqs.map((r, idx) => {
      const reqId = r.reqId || `REQ-${String(idx + 1).padStart(2, "0")}`;
      const cleanTitle = r.title && r.title.startsWith(reqId) ? r.title : `${reqId}: ${r.title}`;
      const pLabel = r.priority || (
        (r.priorityScore || 0) >= 80 ? "critical" :
        (r.priorityScore || 0) >= 60 ? "high" :
        (r.priorityScore || 0) >= 40 ? "medium" : "low"
      );
      const normPhase = normalizeWaterfallPhase(r.phase);
      const parsedDeps = parsePredecessorRefs(r.dependencies, allApprovedReqIds);

      return {
        refId: reqId,
        title: cleanTitle,
        description: r.description || r.title,
        phase: normPhase,
        estimatedHours: r.estimatedHours || 12,
        priorityLabel: pLabel,
        urgency: r.criticality ? Math.min(5, Math.max(1, Math.round(r.criticality / 2))) : 4,
        impact: r.academicValue ? Math.min(5, Math.max(1, Math.round(r.academicValue / 2))) : 4,
        businessValue: r.businessValue || 7,
        requiredSkills: r.requiredSkills || [],
        acceptanceCriteria: r.acceptanceCriteria || [],
        predecessorRefs: parsedDeps,
        sourceArtifact: "Approved Requirements Baseline",
      };
    });

    // Detect and break any circular dependencies
    removeDependencyCycles(taskTemplates);

    // Sort by phase order first, then topologically by predecessor refs, breaking ties by priority
    taskTemplates.sort((a, b) => {
      const pA = phaseOrderMap[a.phase] || 1;
      const pB = phaseOrderMap[b.phase] || 1;
      if (pA !== pB) return pA - pB;
      if (a.predecessorRefs.includes(b.refId)) return 1;
      if (b.predecessorRefs.includes(a.refId)) return -1;
      return (b.urgency * b.impact) - (a.urgency * a.impact);
    });

    taskTemplates.forEach((t, i) => {
      t.executionOrder = i + 1;
    });

    // Clean up tasks from deleted/unapproved requirements that are still in "todo"
    const approvedReqIdSet = new Set(approvedReqs.map(r => r.reqId));
    await Task.deleteMany({
      projectId: pId,
      status: "todo",
      requirementId: { $exists: true, $nin: Array.from(approvedReqIdSet) },
      source: "ai",
    }).catch(() => {});
  } else {
    // Canonical Waterfall Task Templates mapped to 6 canonical phases if no requirements exist
    taskTemplates = [
      {
        refId: "W-01",
        title: "W-01: Freeze Requirements Baseline & In-Scope Indicator Rules",
        description: "Define formal IEEE-style functional requirements, acceptance criteria, and approve in-scope indicator rules.",
        phase: "requirements",
        executionOrder: 1,
        estimatedHours: 12,
        priorityLabel: "critical",
        urgency: 5,
        impact: 5,
        requiredSkills: ["Requirements Engineering", "Cybersecurity"],
        acceptanceCriteria: ["Requirements baseline approved by team", "Indicator catalog frozen"],
        predecessorRefs: [],
      },
      {
        refId: "W-02",
        title: "W-02: Curate & Sanitize Benchmark Dataset",
        description: "Curate a versioned, balanced test corpus with positive, negative, and ambiguous samples; verify privacy sanitization.",
        phase: "requirements",
        executionOrder: 2,
        estimatedHours: 16,
        priorityLabel: "high",
        urgency: 4,
        impact: 5,
        requiredSkills: ["Data Analysis", "Privacy Engineering"],
        acceptanceCriteria: ["Held-out test split established", "No credentials or PII in dataset"],
        predecessorRefs: ["W-01"],
      },
      {
        refId: "W-03",
        title: "W-03: Define Indicator Rules & Scoring Policy",
        description: "Document rule catalog, threshold criteria, and scoring policy for transparent indicator matching.",
        phase: "design",
        executionOrder: 3,
        estimatedHours: 14,
        priorityLabel: "critical",
        urgency: 4,
        impact: 5,
        requiredSkills: ["System Design", "Cybersecurity"],
        acceptanceCriteria: ["Decision table finalized", "Scoring policy approved"],
        predecessorRefs: ["W-01", "W-02"],
      },
      {
        refId: "W-04",
        title: "W-04: Design Data Flow, Privacy, Storage & Security Controls",
        description: "Architect system component boundaries, data minimization controls, input sanitization, and access permissions.",
        phase: "design",
        executionOrder: 4,
        estimatedHours: 14,
        priorityLabel: "high",
        urgency: 4,
        impact: 4,
        requiredSkills: ["Architecture Design", "Security"],
        acceptanceCriteria: ["Data flow diagrams reviewed", "Privacy boundaries documented"],
        predecessorRefs: ["W-01"],
      },
      {
        refId: "W-05",
        title: "W-05: Build Input Form & Validation Modules",
        description: "Develop user interface input form accepting text samples, header metadata, visible URL text, and payload validation.",
        phase: "implementation",
        executionOrder: 5,
        estimatedHours: 18,
        priorityLabel: "high",
        urgency: 4,
        impact: 4,
        requiredSkills: ["Frontend Development", "React"],
        acceptanceCriteria: ["Safe text normalization", "Empty/malformed input rejected cleanly"],
        predecessorRefs: ["W-01"],
      },
      {
        refId: "W-06",
        title: "W-06: Implement Rule-Based Analyzer Engine",
        description: "Implement transparent detection rules checking sender identity, visible URL mismatches, urgency cues, and sensitive requests.",
        phase: "implementation",
        executionOrder: 6,
        estimatedHours: 24,
        priorityLabel: "critical",
        urgency: 5,
        impact: 5,
        requiredSkills: ["Backend Development", "Algorithm Design"],
        acceptanceCriteria: ["Unit tests cover positive, negative, and borderline cases", "Runs under 2s local latency"],
        predecessorRefs: ["W-02", "W-03"],
      },
      {
        refId: "W-07",
        title: "W-07: Implement Explanations & Safe Advice Generator",
        description: "Generate indicator explanations, uncertainty ratings, disclaimers, and safe next-steps advice.",
        phase: "implementation",
        executionOrder: 7,
        estimatedHours: 16,
        priorityLabel: "high",
        urgency: 4,
        impact: 4,
        requiredSkills: ["Frontend Development", "UX Writing"],
        acceptanceCriteria: ["Every result explains signals", "Disclaimers explicitly state automated results may be wrong"],
        predecessorRefs: ["W-03", "W-06"],
      },
      {
        refId: "W-08",
        title: "W-08: Implement Privacy-Reviewed Feedback & History",
        description: "Provide optional feedback persistence referencing sample IDs with redaction of sensitive content.",
        phase: "implementation",
        executionOrder: 8,
        estimatedHours: 14,
        priorityLabel: "medium",
        urgency: 3,
        impact: 3,
        requiredSkills: ["Database Design", "Node.js"],
        acceptanceCriteria: ["No credentials stored", "Feedback tied to result ID only"],
        predecessorRefs: ["W-04", "W-05", "W-06"],
      },
      {
        refId: "W-09",
        title: "W-09: Build Evaluation Metrics & Benchmark Dashboard",
        description: "Compute confusion-matrix counts, precision, recall, and false positive/negative counts on versioned dataset.",
        phase: "testing",
        executionOrder: 9,
        estimatedHours: 18,
        priorityLabel: "high",
        urgency: 4,
        impact: 5,
        requiredSkills: ["Data Science", "QA Testing"],
        acceptanceCriteria: ["Precision and recall reported with sample sizes", "Evaluation is reproducible"],
        predecessorRefs: ["W-02", "W-06"],
      },
      {
        refId: "W-10",
        title: "W-10: Run Security, Privacy, Accessibility & Regression Checks",
        description: "Execute end-to-end security validations, ensure no automatic URL opening, verify keyboard navigation, and regression tests.",
        phase: "testing",
        executionOrder: 10,
        estimatedHours: 16,
        priorityLabel: "critical",
        urgency: 5,
        impact: 5,
        requiredSkills: ["Security Testing", "QA"],
        acceptanceCriteria: ["Zero critical security findings", "All automated tests pass"],
        predecessorRefs: ["W-05", "W-06", "W-07", "W-08", "W-09"],
      },
      {
        refId: "W-11",
        title: "W-11: Prepare Demo, Limitations, User Guide & Final Evaluation",
        description: "Compile final student demo, user guide, documented limitations, and teacher evaluation submission package.",
        phase: "deployment",
        executionOrder: 11,
        estimatedHours: 12,
        priorityLabel: "high",
        urgency: 4,
        impact: 4,
        requiredSkills: ["Technical Writing", "DevOps"],
        acceptanceCriteria: ["Working demo verified on localhost", "Evaluation documentation compiled"],
        predecessorRefs: ["W-10"],
      },
      {
        refId: "W-12",
        title: "W-12: Operational Review & Maintenance Runbook",
        description: "Conduct post-release review, catalog lessons learned, and prepare maintenance guidelines.",
        phase: "maintenance",
        executionOrder: 12,
        estimatedHours: 10,
        priorityLabel: "medium",
        urgency: 2,
        impact: 3,
        requiredSkills: ["Technical Writing", "Maintenance"],
        acceptanceCriteria: ["Maintenance checklist published", "Post-mortem documented"],
        predecessorRefs: ["W-11"],
      },
    ];
  }

  // 3. Two-pass task creation to establish real ObjectId dependencies
  const taskDocMap = new Map();
  const createdTasks = [];

  for (const tpl of taskTemplates) {
    const existing = existingMap.get(tpl.refId) || existingMap.get(tpl.title.toLowerCase().trim());

    if (existing) {
      taskDocMap.set(tpl.refId, existing._id);
      // Update with latest requirement content (ensures edits to requirements update the task)
      await Task.findByIdAndUpdate(existing._id, {
        $set: {
          title: tpl.title,
          description: tpl.description,
          executionOrder: tpl.executionOrder,
          phase: tpl.phase,
          waterfallPhase: tpl.phase,
          requirementId: tpl.refId,
          waterfallRequirementId: tpl.refId,
          sourceArtifact: tpl.sourceArtifact || "Approved Requirements Baseline",
          estimatedHours: tpl.estimatedHours,
          priorityLabel: tpl.priorityLabel,
          urgency: tpl.urgency,
          impact: tpl.impact,
          businessValue: tpl.businessValue || 7,
          requiredSkills: tpl.requiredSkills,
          acceptanceCriteria: tpl.acceptanceCriteria,
        },
      });
      createdTasks.push(existing);
    } else {
      const newTask = await Task.create({
        teamId: tId,
        projectId: pId,
        title: tpl.title,
        description: tpl.description,
        phase: tpl.phase,
        waterfallPhase: tpl.phase,
        executionOrder: tpl.executionOrder,
        requirementId: tpl.refId,
        waterfallRequirementId: tpl.refId,
        source: "ai",
        sourceArtifact: tpl.sourceArtifact || "Approved Requirements Baseline",
        priorityLabel: tpl.priorityLabel,
        urgency: tpl.urgency,
        impact: tpl.impact,
        businessValue: tpl.businessValue || 7,
        estimatedHours: tpl.estimatedHours,
        status: "todo",
        requiredSkills: tpl.requiredSkills,
        acceptanceCriteria: tpl.acceptanceCriteria,
        createdBy: userId,
        dependencies: [],
      });
      taskDocMap.set(tpl.refId, newTask._id);
      createdTasks.push(newTask.toObject ? newTask.toObject() : newTask);
    }
  }

  // 4. Resolve task dependencies to real Mongo ObjectIds
  for (const tpl of taskTemplates) {
    const taskId = taskDocMap.get(tpl.refId);
    if (!taskId) continue;

    const depIds = (tpl.predecessorRefs || [])
      .map(ref => taskDocMap.get(ref))
      .filter(Boolean);

    await Task.findByIdAndUpdate(taskId, {
      $set: { dependencies: depIds },
    });
  }

  const finalTasks = await Task.find({
    $or: [{ projectId: pId }, { teamId: tId }],
  }).sort({ executionOrder: 1 }).lean();

  await Project.findByIdAndUpdate(pId, {
    taskCount: finalTasks.length,
  }).catch(() => {});

  return finalTasks;
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

/**
 * bulkConvertApprovedRequirementsToTasks
 * Idempotently converts all eligible approved/verified requirements into active Waterfall tasks.
 * Calculates deterministic DAA priority, maps canonical 6 phases, establishes dependencies,
 * avoids duplicates, and synchronizes real-time updates.
 */
export async function bulkConvertApprovedRequirementsToTasks(optsOrProject, userOrTeam = null, maybeIo = null) {
  let project = optsOrProject;
  let teamId = null;
  let userId = null;
  let io = null;

  if (optsOrProject && typeof optsOrProject === "object" && (optsOrProject.project || optsOrProject._id)) {
    if (optsOrProject.project) {
      project = optsOrProject.project;
      teamId = optsOrProject.teamId;
      userId = optsOrProject.userId;
      io = optsOrProject.io;
    } else {
      project = optsOrProject;
      if (userOrTeam && typeof userOrTeam === "object") {
        userId = userOrTeam._id || userOrTeam.id;
      } else if (typeof userOrTeam === "string") {
        teamId = userOrTeam;
      }
      io = maybeIo;
    }
  } else if (optsOrProject && (typeof optsOrProject === "string" || mongoose.isValidObjectId(optsOrProject))) {
    project = await Project.findById(optsOrProject);
    if (userOrTeam && typeof userOrTeam === "object") {
      userId = userOrTeam._id || userOrTeam.id;
    } else if (typeof userOrTeam === "string") {
      teamId = userOrTeam;
    }
    io = maybeIo;
  }

  if (project && (typeof project === "string" || mongoose.isValidObjectId(project)) && !project.requirements) {
    project = await Project.findById(project);
  }
  if (!project) throw new Error("Project is required");
  const pId = project._id;
  const tId = teamId || project.teamId;

  const allReqs = project.requirements || [];
  const eligibleReqs = allReqs.filter(
    (r) => r.status === "approved" || r.status === "verified" || r.status === "in_progress"
  );
  const skippedReqs = allReqs.filter(
    (r) => r.status !== "approved" && r.status !== "verified" && r.status !== "in_progress"
  );

  if (eligibleReqs.length === 0) {
    return {
      success: true,
      createdCount: 0,
      alreadyActiveCount: 0,
      alreadyConvertedCount: 0,
      skippedCount: skippedReqs.length,
      createdTasks: [],
      alreadyActiveTasks: [],
      alreadyConvertedTasks: [],
      message: "No eligible approved or verified requirements found to convert.",
    };
  }

  // Fetch existing tasks
  const existingTasks = await Task.find({
    $or: [{ project: pId }, { projectId: pId }, { teamId: tId }],
  }).lean();

  const existingByReqId = new Map();
  for (const t of existingTasks) {
    if (t.requirementId) {
      existingByReqId.set(t.requirementId, t);
    }
  }

  const allEligibleReqIds = eligibleReqs.map((r) => r.reqId).filter(Boolean);
  const toCreate = [];
  const alreadyActive = [];

  for (const r of eligibleReqs) {
    const reqId = r.reqId;
    const existing = existingByReqId.get(reqId);
    if (existing) {
      alreadyActive.push({
        requirementId: reqId,
        taskId: existing._id.toString(),
        title: existing.title,
        status: existing.status,
      });
    } else {
      toCreate.push(r);
    }
  }

  const createdTasks = [];
  if (toCreate.length > 0) {
    // 1. Prepare task templates with DAA priority and normalized phases
    const taskTemplates = toCreate.map((r, idx) => {
      const reqId = r.reqId || `REQ-${String(idx + 1).padStart(2, "0")}`;
      const cleanTitle = r.title && r.title.startsWith(reqId) ? r.title : `${reqId}: ${r.title}`;
      const normPhase = normalizeWaterfallPhase(r.phase);
      const parsedDeps = parsePredecessorRefs(r.dependencies, allEligibleReqIds);

      const urgency = r.criticality ? Math.min(5, Math.max(1, Math.round(r.criticality / 2))) : 3;
      const impact = r.academicValue ? Math.min(5, Math.max(1, Math.round(r.academicValue / 2))) : 3;
      const businessValue = r.businessValue || 7;

      const priorityResult = computeTaskPriority({
        urgency,
        impact,
        businessValue,
        dependencies: parsedDeps,
        phase: normPhase,
      });

      return {
        refId: reqId,
        title: cleanTitle,
        description: r.description || r.title,
        phase: normPhase,
        estimatedHours: r.estimatedHours || 12,
        priorityLabel: priorityResult.tier || "medium",
        priorityScore: priorityResult.score || 50,
        urgency,
        impact,
        businessValue,
        requiredSkills: r.requiredSkills || [],
        acceptanceCriteria: r.acceptanceCriteria || [],
        predecessorRefs: parsedDeps,
        sourceArtifact: "Approved Requirements Baseline",
      };
    });

    // Detect and break cycles
    removeDependencyCycles(taskTemplates);

    // Map existing tasks for dependency resolution
    const taskDocMap = new Map();
    for (const t of existingTasks) {
      if (t.requirementId) taskDocMap.set(t.requirementId, t._id);
    }

    // Pass 1: Create new task documents
    for (const tpl of taskTemplates) {
      const newTask = await Task.create({
        teamId: tId,
        project: pId,
        projectId: pId,
        title: tpl.title,
        description: tpl.description,
        phase: tpl.phase,
        waterfallPhase: tpl.phase,
        requirementId: tpl.refId,
        waterfallRequirementId: tpl.refId,
        source: "manual",
        sourceArtifact: tpl.sourceArtifact,
        priorityLabel: tpl.priorityLabel,
        priorityScore: tpl.priorityScore,
        urgency: tpl.urgency,
        impact: tpl.impact,
        businessValue: tpl.businessValue,
        estimatedHours: tpl.estimatedHours,
        status: "todo",
        requiredSkills: tpl.requiredSkills,
        acceptanceCriteria: tpl.acceptanceCriteria,
        createdBy: userId,
        dependencies: [],
      });

      taskDocMap.set(tpl.refId, newTask._id);
      createdTasks.push(newTask.toObject ? newTask.toObject() : newTask);
    }

    // Pass 2: Resolve dependencies to real Mongo ObjectIds
    for (const tpl of taskTemplates) {
      const taskId = taskDocMap.get(tpl.refId);
      if (!taskId) continue;

      const depIds = (tpl.predecessorRefs || [])
        .map((ref) => taskDocMap.get(ref))
        .filter(Boolean);

      if (depIds.length > 0) {
        await Task.findByIdAndUpdate(taskId, {
          $set: { dependencies: depIds },
        });
      }
    }

    // Update requirements status to in_progress or retain approved
    const convertedReqIds = toCreate.map((r) => r.reqId);
    await Project.updateOne(
      { _id: pId },
      {
        $set: {
          "requirements.$[elem].status": "in_progress",
        },
      },
      {
        arrayFilters: [{ "elem.reqId": { $in: convertedReqIds }, "elem.status": "approved" }],
      }
    );
  }

  // Update project task count
  const totalTasks = await Task.countDocuments({
    $or: [{ project: pId }, { projectId: pId }, { teamId: tId }],
  });
  await Project.findByIdAndUpdate(pId, { taskCount: totalTasks }).catch(() => {});

  // Socket broadcast
  if (io) {
    io.to(`project:${pId.toString()}`).emit("tasks:updated", { count: totalTasks });
    io.to(`team:${tId.toString()}`).emit("tasks:updated", { count: totalTasks });
    io.to(`project:${pId.toString()}`).emit("waterfall:plan:updated", { projectId: pId.toString() });
    io.to(`team:${tId.toString()}`).emit("waterfall:plan:updated", { projectId: pId.toString() });
    io.to(`project:${pId.toString()}`).emit("project:updated", { projectId: pId.toString() });
    io.to(`project:${pId.toString()}`).emit("project:health:updated", { projectId: pId.toString() });
  }

  return {
    success: true,
    createdCount: createdTasks.length,
    alreadyActiveCount: alreadyActive.length,
    alreadyConvertedCount: alreadyActive.length,
    skippedCount: skippedReqs.length,
    createdTasks,
    alreadyActiveTasks: alreadyActive,
    alreadyConvertedTasks: alreadyActive,
    message: `Converted ${createdTasks.length} requirement(s) into active tasks (${alreadyActive.length} already active).`,
  };
}

/**
 * convertSingleRequirementToTask
 * Safely converts an individual approved requirement into an active Task using the canonical rules.
 */
export async function convertSingleRequirementToTask(optsOrProject, reqIdParam = null, userParam = null, ioParam = null) {
  let project = optsOrProject;
  let reqId = reqIdParam;
  let userId = null;
  let io = null;

  if (optsOrProject && typeof optsOrProject === "object" && optsOrProject.project && optsOrProject.reqId) {
    project = optsOrProject.project;
    reqId = optsOrProject.reqId;
    userId = optsOrProject.userId;
    io = optsOrProject.io;
  } else {
    project = optsOrProject;
    reqId = reqIdParam;
    if (userParam && typeof userParam === "object") {
      userId = userParam._id || userParam.id;
    } else {
      userId = userParam;
    }
    io = ioParam;
  }

  if (project && (typeof project === "string" || mongoose.isValidObjectId(project)) && !project.requirements) {
    project = await Project.findById(project);
  }
  if (!project) throw new Error("Project is required");
  const pId = project._id;
  const tId = project.teamId;

  const reqItem = (project.requirements || []).find(
    (r) => r.reqId === reqId || r._id?.toString() === reqId
  );
  if (!reqItem) throw new Error("Requirement not found in project");

  // Idempotency: check if task already exists
  const existing = await Task.findOne({
    $or: [{ project: pId }, { projectId: pId }, { teamId: tId }],
    requirementId: reqItem.reqId,
  });

  if (existing) {
    return {
      success: true,
      alreadyExisted: true,
      task: existing,
      message: `Requirement ${reqItem.reqId} is already converted into an active task.`,
    };
  }

  const normPhase = normalizeWaterfallPhase(reqItem.phase);
  const allReqIds = (project.requirements || []).map((r) => r.reqId).filter(Boolean);
  const parsedDeps = parsePredecessorRefs(reqItem.dependencies, allReqIds);

  const urgency = reqItem.criticality ? Math.min(5, Math.max(1, Math.round(reqItem.criticality / 2))) : 3;
  const impact = reqItem.academicValue ? Math.min(5, Math.max(1, Math.round(reqItem.academicValue / 2))) : 3;
  const businessValue = reqItem.businessValue || 7;

  const priorityResult = computeTaskPriority({
    urgency,
    impact,
    businessValue,
    dependencies: parsedDeps,
    phase: normPhase,
  });

  // Resolve dependencies to ObjectIds if preceding tasks exist
  const depTasks = await Task.find({
    $or: [{ project: pId }, { projectId: pId }, { teamId: tId }],
    requirementId: { $in: parsedDeps },
  }).select("_id").lean();

  const cleanTitle = reqItem.title && reqItem.title.startsWith(reqItem.reqId)
    ? reqItem.title
    : `${reqItem.reqId}: ${reqItem.title}`;

  const task = await Task.create({
    teamId: tId,
    project: pId,
    projectId: pId,
    title: cleanTitle,
    description: reqItem.description || reqItem.title,
    phase: normPhase,
    waterfallPhase: normPhase,
    requirementId: reqItem.reqId,
    waterfallRequirementId: reqItem.reqId,
    source: "manual",
    sourceArtifact: "Approved Requirements Baseline",
    priorityLabel: priorityResult.tier || "medium",
    priorityScore: priorityResult.score || 50,
    urgency,
    impact,
    businessValue,
    estimatedHours: reqItem.estimatedHours || 12,
    status: "todo",
    requiredSkills: reqItem.requiredSkills || [],
    acceptanceCriteria: reqItem.acceptanceCriteria || [],
    createdBy: userId,
    dependencies: depTasks.map((d) => d._id),
  });

  // Update requirement status in project
  await Project.updateOne(
    { _id: pId, "requirements.reqId": reqItem.reqId },
    { $set: { "requirements.$.status": "in_progress" } }
  );

  const totalTasks = await Task.countDocuments({
    $or: [{ project: pId }, { projectId: pId }, { teamId: tId }],
  });
  await Project.findByIdAndUpdate(pId, { taskCount: totalTasks }).catch(() => {});

  if (io) {
    io.to(`project:${pId.toString()}`).emit("tasks:updated", { count: totalTasks });
    io.to(`team:${tId.toString()}`).emit("tasks:updated", { count: totalTasks });
    io.to(`project:${pId.toString()}`).emit("waterfall:plan:updated", { projectId: pId.toString() });
    io.to(`project:${pId.toString()}`).emit("project:updated", { projectId: pId.toString() });
    io.to(`project:${pId.toString()}`).emit("project:health:updated", { projectId: pId.toString() });
  }

  return {
    success: true,
    alreadyExisted: false,
    task,
    message: `Requirement ${reqItem.reqId} converted into an active task.`,
  };
}
