/**
 * server/services/domainMethodologyResolver.js
 * ============================================================================
 * NEXUSFLOW V4 — DOMAIN × METHODOLOGY RESOLVER (Workstream 19)
 *
 * Deterministically resolves the intersection of Domain Intelligence and
 * Methodology Engines into a coherent project execution environment.
 *
 * ARCHITECTURAL PRINCIPLE:
 *   COMMON CORE + DOMAIN ADAPTER + METHODOLOGY ADAPTER = RESOLVED ENVIRONMENT
 *
 * DETERMINISTIC & EXPLAINABLE:
 *   Same (domain, methodology, config) -> Identical environment resolution.
 *   Zero AI dependency for core environment mapping and conflict detection.
 * ============================================================================
 */

import { getDomainProfile } from "./domainIntelligenceService.js";

/**
 * Known structural friction points between domain constraints and workflow models.
 */
const DOMAIN_METHODOLOGY_CONFLICTS = [
  {
    domain: "IoT / Embedded",
    methodology: "SCRUM",
    conflictId: "IOT_SPRINT_CADENCE_MISMATCH",
    severity: "MEDIUM",
    ruleA: "Hardware fabrication and sensor procurement lead times typically exceed 2-4 weeks",
    ruleB: "Scrum enforces strict 1-2 week time-boxed sprint commitments",
    guidance: "Consider Hybrid methodology (Waterfall hardware planning + Scrum firmware execution), or use hardware spikes.",
  },
  {
    domain: "Civil / Structural",
    methodology: "KANBAN",
    conflictId: "STRUCTURAL_SAFETY_GATE_RISK",
    severity: "HIGH",
    ruleA: "Civil engineering standards mandate formal sign-offs before physical load/stress testing",
    ruleB: "Kanban allows continuous pull without strict phase gate barriers",
    guidance: "Configure Hard WIP limits and require mandatory formal safety sign-off as a Definition of Done criterion.",
  },
  {
    domain: "Cybersecurity",
    methodology: "CLASSIC",
    conflictId: "RAPID_VULN_RESPONSE_DEFICIT",
    severity: "MEDIUM",
    ruleA: "Zero-day vulnerabilities and CVE remediation require immediate out-of-band resolution",
    ruleB: "Classic workflow lacks expedited classes of service for emergent threats",
    guidance: "Adopt Kanban with an Expedited Class of Service for security patch management.",
  },
];

/**
 * Deterministically resolves project execution environment.
 */
export function resolveEnvironment({
  domain = "Software Engineering",
  methodology = "CLASSIC",
  subdomain = "",
  hybridConfig = null,
} = {}) {
  const normMethodology = String(methodology).toUpperCase();
  const domainProfile = getDomainProfile(domain);

  const environmentKey = `${domainProfile.domain} × ${normMethodology}`;

  // Resolve active workflow boundaries
  let workflowModel = {
    methodology: normMethodology,
    planningBoundary: normMethodology,
    executionBoundary: normMethodology,
  };

  if (normMethodology === "HYBRID" && hybridConfig) {
    workflowModel = {
      methodology: "HYBRID",
      planningBoundary: hybridConfig.planningMethodology || "WATERFALL",
      executionBoundary: hybridConfig.executionMethodology || "SCRUM",
      templateName: hybridConfig.templateName || "custom",
    };
  }

  // Composite Metrics tailored to Domain × Methodology pairing
  const recommendedMetrics = [];
  if (normMethodology === "KANBAN") {
    recommendedMetrics.push("Throughput (items/week)", "Cycle Time P85", "WIP Saturation %");
    if (domainProfile.domain === "Cybersecurity") {
      recommendedMetrics.push("CVSS Remediation Speed (hours)", "Security Blocker Ratio");
    } else if (domainProfile.domain === "IoT / Embedded") {
      recommendedMetrics.push("Hardware Blocking Dwell Time", "Firmware Flash Success %");
    }
  } else if (normMethodology === "SCRUM") {
    recommendedMetrics.push("Sprint Velocity (pts)", "Sprint Delivery Probability", "Carried-Over Work %");
    if (domainProfile.domain === "AI / Machine Learning") {
      recommendedMetrics.push("Model Benchmark Gain per Sprint", "Experiment Iteration Count");
    }
  } else if (normMethodology === "WATERFALL") {
    recommendedMetrics.push("Phase Gate Readiness Score", "Schedule Variance (days)", "Requirement Volatility");
    if (domainProfile.domain === "Civil / Structural") {
      recommendedMetrics.push("Safety Factor Margin", "Sensor Telemetry Uptime %");
    }
  } else {
    recommendedMetrics.push("Task Completion Ratio", "Active Milestone Progress");
  }

  // Detect domain-methodology conflicts
  const conflicts = DOMAIN_METHODOLOGY_CONFLICTS.filter(c => {
    const matchDomain = c.domain.toLowerCase() === domainProfile.domain.toLowerCase();
    const matchMethod = c.methodology === normMethodology ||
      (normMethodology === "HYBRID" && (c.methodology === workflowModel.planningBoundary || c.methodology === workflowModel.executionBoundary));
    return matchDomain && matchMethod;
  });

  // Tailored Academic Criteria suggestions
  const tailoredAcademicCriteria = (domainProfile.expectedDeliverables || []).slice(0, 4).map((deliv, idx) => ({
    criterionId: `crit_${deliv.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
    title: `${domainProfile.domain}: ${deliv}`,
    weight: Math.round(100 / Math.min(4, domainProfile.expectedDeliverables.length)),
    requiredEvidenceTypes: domainProfile.recommendedEvidence || ["documentation"],
  }));

  return {
    environmentKey,
    domain: domainProfile.domain,
    subdomain: subdomain || domainProfile.subdomains[0] || "",
    methodology: normMethodology,
    workflowModel,
    domainProfile,
    recommendedMetrics,
    conflicts,
    tailoredAcademicCriteria,
    hasConflicts: conflicts.length > 0,
    deterministic: true,
    resolvedAt: new Date().toISOString(),
  };
}
