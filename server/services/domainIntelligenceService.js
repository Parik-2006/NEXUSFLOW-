/**
 * server/services/domainIntelligenceService.js
 * ============================================================================
 * NEXUSFLOW V4 — DOMAIN INTELLIGENCE ENGINE (Workstream 18)
 *
 * Implements canonical domain taxonomy, domain profiles, rule registry,
 * and deterministic advisory recommendations.
 *
 * CORE INVARIANT:
 *   Advisory only — domain intelligence NEVER mutates project state automatically.
 * ============================================================================
 */

import mongoose from "mongoose";
import Project from "../models/Project.js";

/**
 * Centralized Canonical Domain Taxonomy
 */
export const CANONICAL_DOMAINS = Object.freeze([
  "Software Engineering",
  "Cybersecurity",
  "AI / Machine Learning",
  "IoT / Embedded",
  "Cloud Computing",
  "Data Science",
  "Electronics",
  "Civil / Structural",
  "Research",
  "Academic General",
]);

export const DOMAIN_PROFILES = Object.freeze({
  "Software Engineering": {
    domain: "Software Engineering",
    subdomains: ["Web Applications", "Mobile Apps", "Distributed Systems", "DevOps"],
    terminology: ["API", "CI/CD", "Refactoring", "Microservices", "Unit Testing", "Code Review"],
    expectedDeliverables: ["Architecture Diagram", "API Specification", "Test Plan", "Deployment Guide"],
    recommendedEvidence: ["unit_test_report", "pr_review", "ci_pipeline_log", "api_docs"],
    riskTypes: ["Technical Debt", "API Breaking Change", "Scalability Bottleneck", "Dependency Drift"],
    qualityDimensions: ["Code Coverage", "Maintainability Index", "Bug Density", "Lead Time"],
    domainRules: [
      { id: "SWE_TEST_COVERAGE", name: "Unit Test Verification", description: "Implementation must have corresponding test evidence", severity: "MEDIUM" },
      { id: "SWE_ARCH_REVIEW", name: "Modular Architecture Review", description: "System design must clearly separate domain models from transport layers", severity: "HIGH" },
    ],
  },
  "Cybersecurity": {
    domain: "Cybersecurity",
    subdomains: ["AppSec", "Network Defense", "Penetration Testing", "Cryptography", "SOC/SIEM"],
    terminology: ["Threat Model", "Attack Surface", "CVE", "Zero Trust", "Sanitization", "Cryptographic Salt"],
    expectedDeliverables: ["STRIDE Threat Model", "Attack Surface Analysis", "Vulnerability Assessment", "Penetration Test Report"],
    recommendedEvidence: ["threat_model_doc", "vulnerability_scan_report", "sast_dast_log", "compliance_audit"],
    riskTypes: ["Injection Flaw", "Broken Authentication", "Cryptographic Failure", "Insecure Deserialization"],
    qualityDimensions: ["CVSS Remediation Time", "Zero High-Severity Findings", "Audit Trail Completeness"],
    domainRules: [
      { id: "SEC_THREAT_MODEL", name: "Mandatory Threat Model", description: "Project must document an attack surface and STRIDE threat model", severity: "CRITICAL" },
      { id: "SEC_VULN_SCAN", name: "Static Security Analysis", description: "All dependencies and code must undergo vulnerability scanning", severity: "HIGH" },
    ],
  },
  "AI / Machine Learning": {
    domain: "AI / Machine Learning",
    subdomains: ["Computer Vision", "NLP / LLM", "Reinforcement Learning", "MLOps", "Predictive Analytics"],
    terminology: ["Dataset", "Ground Truth", "Precision/Recall", "F1 Score", "Model Drift", "Overfitting", "Inference"],
    expectedDeliverables: ["Dataset Provenance Card", "Model Architecture Spec", "Baseline Benchmark Report", "Confusion Matrix / ROC Curve"],
    recommendedEvidence: ["dataset_card", "benchmark_log", "confusion_matrix", "drift_analysis"],
    riskTypes: ["Data Leakage", "Model Drift", "Algorithmic Bias", "Inference Latency Spike", "Overfitting"],
    qualityDimensions: ["Accuracy / F1-Score", "Inference Latency (ms)", "Dataset Diversity", "Reproducibility"],
    domainRules: [
      { id: "AI_DATASET_PROVENANCE", name: "Dataset Provenance Tracking", description: "Training and testing datasets must have verifiable origins and split hygiene", severity: "HIGH" },
      { id: "AI_BENCHMARK_EVAL", name: "Empirical Baseline Comparison", description: "Models must be empirically compared against a documented baseline", severity: "HIGH" },
    ],
  },
  "IoT / Embedded": {
    domain: "IoT / Embedded",
    subdomains: ["Sensor Networks", "Firmware Engineering", "Industrial IoT", "Edge Computing", "Robotics"],
    terminology: ["Microcontroller", "Firmware", "GPIO", "I2C/SPI", "Baud Rate", "Power Consumption", "Telemetry"],
    expectedDeliverables: ["Hardware Schematics / Pinout", "Firmware Source & Flashing Guide", "Sensor Calibration Report", "Power Consumption Profile"],
    recommendedEvidence: ["circuit_schematic", "calibration_log", "hardware_in_the_loop_test", "power_log"],
    riskTypes: ["Hardware Sourcing Delay", "Memory Exhaustion", "Unstable Power Supply", "Sensor Noise", "Thermal Throttling"],
    qualityDimensions: ["Battery Life Hours", "Sensor Sampling Accuracy", "Packet Loss Rate", "Firmware Size (KB)"],
    domainRules: [
      { id: "IOT_SENSOR_CALIBRATION", name: "Sensor Validation & Calibration", description: "Hardware sensors must provide empirical calibration data against reference standards", severity: "CRITICAL" },
      { id: "IOT_POWER_PROFILE", name: "Power Envelope Compliance", description: "System must operate within designed battery and current limits", severity: "MEDIUM" },
    ],
  },
  "Civil / Structural": {
    domain: "Civil / Structural",
    subdomains: ["Structural Health Monitoring", "Smart Infrastructure", "Transportation Networks", "Geotechnical"],
    terminology: ["Load Capacity", "Strain Gauge", "Deflection", "Resonance", "Factor of Safety", "Finite Element Analysis"],
    expectedDeliverables: ["Structural Engineering Spec", "Sensor Placement Diagram", "Stress-Strain Telemetry Analysis", "Safety Factor Certification"],
    recommendedEvidence: ["fea_simulation_results", "sensor_telemetry_dataset", "safety_inspection_report"],
    riskTypes: ["Material Fatigue", "Excessive Vibration", "Environmental Degradation", "Sensor Telemetry Dropout"],
    qualityDimensions: ["Factor of Safety", "Deflection Limits (mm)", "Sensor Uptime", "Signal-to-Noise Ratio"],
    domainRules: [
      { id: "CIVIL_SAFETY_FACTOR", name: "Safety Margin Compliance", description: "Structural designs must strictly adhere to regulatory safety factors", severity: "CRITICAL" },
      { id: "CIVIL_TELEMETRY_VALIDATION", name: "Structural Telemetry Integrity", description: "Physical sensors must demonstrate continuous integrity without signal drift", severity: "HIGH" },
    ],
  },
  "Academic General": {
    domain: "Academic General",
    subdomains: ["Capstone Project", "Senior Thesis", "Applied Research"],
    terminology: ["Literature Review", "Methodology", "Evaluation", "Viva", "Bibliography"],
    expectedDeliverables: ["Project Synopsis", "Literature Survey", "Final Capstone Report", "Presentation Slides"],
    recommendedEvidence: ["report_pdf", "slide_deck", "code_repository", "viva_recording"],
    riskTypes: ["Scope Creep", "Literature Gap", "Incomplete Evaluation", "Milestone Delay"],
    qualityDimensions: ["Academic Rigor", "Documentation Clarity", "Presentation Quality"],
    domainRules: [
      { id: "ACAD_LIT_REVIEW", name: "Prior Work Contextualization", description: "Project must survey existing solutions and clarify novel contributions", severity: "MEDIUM" },
    ],
  },
});

/**
 * Returns the profile for a given domain string, or falls back to "Software Engineering".
 */
export function getDomainProfile(domain) {
  if (!domain || typeof domain !== "string") {
    return DOMAIN_PROFILES["Software Engineering"];
  }

  // Exact match
  if (DOMAIN_PROFILES[domain]) {
    return DOMAIN_PROFILES[domain];
  }

  // Case-insensitive match
  const lower = domain.toLowerCase();
  for (const [key, profile] of Object.entries(DOMAIN_PROFILES)) {
    if (key.toLowerCase() === lower || profile.subdomains.some(s => s.toLowerCase() === lower)) {
      return profile;
    }
  }

  // Return Academic General fallback for research/other
  if (lower.includes("academic") || lower.includes("research")) {
    return DOMAIN_PROFILES["Academic General"];
  }

  return DOMAIN_PROFILES["Software Engineering"];
}

/**
 * Evaluates domain compliance and generates advisory recommendations.
 */
export async function evaluateDomainIntelligence(projectId) {
  if (!mongoose.isValidObjectId(projectId)) {
    throw new Error("Invalid project ID.");
  }

  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found.");

  const domain = project.domain || "Software Engineering";
  const profile = getDomainProfile(domain);

  const existingDeliverableTitles = new Set(
    (project.artifacts || []).map(a => (a.title || a.name || "").toLowerCase())
  );

  const missingDeliverables = [];
  for (const item of profile.expectedDeliverables) {
    const found = Array.from(existingDeliverableTitles).some(t => t.includes(item.toLowerCase()));
    if (!found) {
      missingDeliverables.push(item);
    }
  }

  const recommendations = [];
  if (missingDeliverables.length > 0) {
    recommendations.push({
      category: "DELIVERABLES",
      severity: "MEDIUM",
      message: `Consider drafting standard ${profile.domain} deliverables: ${missingDeliverables.slice(0, 3).join(", ")}`,
      items: missingDeliverables,
    });
  }

  // Domain-specific rule recommendations
  for (const rule of profile.domainRules) {
    recommendations.push({
      category: "DOMAIN_RULE",
      ruleId: rule.id,
      severity: rule.severity,
      ruleName: rule.name,
      message: rule.description,
    });
  }

  return {
    projectId: projectId.toString(),
    domain: profile.domain,
    subdomains: profile.subdomains,
    terminology: profile.terminology,
    qualityDimensions: profile.qualityDimensions,
    riskTypes: profile.riskTypes,
    expectedDeliverables: profile.expectedDeliverables,
    missingDeliverables,
    domainRules: profile.domainRules,
    recommendations,
    advisoryOnly: true,
  };
}

/**
 * Updates a project's domain profile with server-side validation.
 */
export async function setProjectDomain(projectId, { domain, subdomain = "" }) {
  if (!mongoose.isValidObjectId(projectId)) {
    throw new Error("Invalid project ID.");
  }

  const normalizedDomain = CANONICAL_DOMAINS.find(d => d.toLowerCase() === (domain || "").toLowerCase()) || domain;

  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");

  project.domain = normalizedDomain;
  if (subdomain) {
    project.subdomain = subdomain;
  }
  await project.save();

  return {
    success: true,
    projectId: project._id.toString(),
    domain: project.domain,
    subdomain: project.subdomain || "",
  };
}
