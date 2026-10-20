/**
 * server/config/methodologyAvailability.js
 * ============================================================================
 * NEXUSFLOW V4 — CENTRALIZED METHODOLOGY AVAILABILITY & PRODUCTION SAFETY
 *
 * Authoritative single source of truth for methodology availability across
 * production releases and development/remote-branch testing environments.
 *
 * Rules:
 *   1. Classic and Waterfall are ACTIVE and AVAILABLE for production projects.
 *   2. Scrum, Kanban, and Hybrid are IN_PROGRESS in production and disabled
 *      for starting new production projects or switching existing projects.
 *   3. In development/testing, setting ENABLE_EXPERIMENTAL_METHODOLOGIES="true"
 *      explicitly permits remote-branch development and test execution.
 *   4. Fail-safe default: missing or invalid configuration always restricts
 *      unapproved methodologies to prevent accidental production leaks.
 *   5. Saved historical projects under Scrum/Kanban/Hybrid remain accessible
 *      for read-only and analytical workflows — no data is damaged or mutated.
 * ============================================================================
 */

export const METHODOLOGY_IDS = {
  WATERFALL: "WATERFALL",
  CLASSIC: "CLASSIC",
  NEXUSFLOW: "NEXUSFLOW",
  SCRUM: "SCRUM",
  KANBAN: "KANBAN",
  HYBRID: "HYBRID",
};

/**
 * Evaluates whether experimental methodologies (Scrum, Kanban, Hybrid) are
 * enabled for new project creation in the current runtime environment.
 *
 * SAFEGUARD A: In production (NODE_ENV === "production"), experimental methodologies
 * are FORCIBLY and unconditionally blocked, even if ENABLE_EXPERIMENTAL_METHODOLOGIES is set.
 * In development and testing, setting ENABLE_EXPERIMENTAL_METHODOLOGIES="true" allows
 * controlled development testing on remote branches.
 */
export function areExperimentalMethodologiesEnabled() {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return process.env.ENABLE_EXPERIMENTAL_METHODOLOGIES === "true";
}

/**
 * Returns the authoritative availability descriptor for each methodology.
 */
export function getMethodologyRegistry() {
  const experimentalActive = areExperimentalMethodologiesEnabled();

  return {
    WATERFALL: {
      id: "WATERFALL",
      name: "Waterfall",
      status: "AVAILABLE",
      badge: "ACTIVE",
      allowNewProjects: true,
      tagline: "Sequential phase gates, CPM critical path, and structured SRS delivery",
      statusMessage: "Available for production use.",
      reason: "Production-ready enterprise sequential phase-gate engineering lifecycle.",
      phases: ["Requirements", "System Design", "Implementation", "Verification/Testing", "Deployment", "Maintenance"],
    },
    CLASSIC: {
      id: "CLASSIC",
      name: "NexusFlow Classic",
      status: "AVAILABLE",
      badge: "ACTIVE",
      allowNewProjects: true,
      tagline: "Original 12-tab comprehensive engineering workspace",
      statusMessage: "Available for production use.",
      reason: "Production-ready original multi-tab workspace with sprint and kanban capabilities.",
      phases: ["To Do", "In Progress", "Blocked", "Done"],
    },
    NEXUSFLOW: {
      id: "NEXUSFLOW",
      name: "NexusFlow",
      status: "AVAILABLE",
      badge: "ACTIVE",
      allowNewProjects: true,
      tagline: "Intelligent algorithmic orchestration with DAA scheduling and persistent project memory",
      statusMessage: "Available for production use.",
      reason: "Production-ready intelligent algorithmic orchestration workspace.",
      phases: ["To Do", "In Progress", "Blocked", "Done"],
    },
    SCRUM: {
      id: "SCRUM",
      name: "Scrum",
      status: experimentalActive ? "AVAILABLE" : "IN_PROGRESS",
      badge: experimentalActive ? "ACTIVE" : "IN_PROGRESS",
      allowNewProjects: experimentalActive,
      tagline: "Time-boxed iterations, product backlog burndown, and team velocity",
      statusMessage: experimentalActive
        ? "Enabled in development environment."
        : "This methodology is currently in development and is not yet available in production.",
      reason: "Agile Scrum planning and ceremony workflows are undergoing stabilization.",
      targetRelease: "NexusFlow V4.1",
    },
    KANBAN: {
      id: "KANBAN",
      name: "Kanban",
      status: experimentalActive ? "AVAILABLE" : "IN_PROGRESS",
      badge: experimentalActive ? "ACTIVE" : "IN_PROGRESS",
      allowNewProjects: experimentalActive,
      tagline: "Continuous flow, explicit WIP limits, and cycle-time optimization",
      statusMessage: experimentalActive
        ? "Enabled in development environment."
        : "This methodology is currently in development and is not yet available in production.",
      reason: "Continuous flow CFD analytics and dynamic WIP limits are undergoing stabilization.",
      targetRelease: "NexusFlow V4.1",
    },
    HYBRID: {
      id: "HYBRID",
      name: "Hybrid",
      status: experimentalActive ? "AVAILABLE" : "IN_PROGRESS",
      badge: experimentalActive ? "ACTIVE" : "IN_PROGRESS",
      allowNewProjects: experimentalActive,
      tagline: "Phase-gated governance combined with agile sprint execution",
      statusMessage: experimentalActive
        ? "Enabled in development environment."
        : "This methodology is currently in development and is not yet available in production.",
      reason: "Stage-gate macro governance combined with micro-sprint execution is scheduled for V4.2.",
      targetRelease: "NexusFlow V4.2",
    },
  };
}

/**
 * Normalizes an arbitrary methodology string to its canonical uppercase ID.
 *
 * SAFEGUARD B:
 * - Missing/null/undefined/empty input returns "WATERFALL" as the safe backward-compatible default.
 * - Recognized methodologies and valid aliases return their canonical ID.
 * - Unknown, non-empty values return null (NEVER silently converts an unsupported value or typo to Waterfall).
 *
 * @param {string|null|undefined} input
 * @returns {string|null}
 */
export function normalizeMethodologyId(input) {
  if (input === null || input === undefined) return "WATERFALL";
  const trimmed = String(input).trim();
  if (!trimmed) return "WATERFALL";

  const s = trimmed.toUpperCase();
  if (s === "WATERFALL") return "WATERFALL";
  if (s === "CLASSIC" || s === "NEXUSFLOW" || s === "V3") return "CLASSIC";
  if (s === "SCRUM" || s === "AGILE") return "SCRUM";
  if (s === "KANBAN") return "KANBAN";
  if (s === "HYBRID") return "HYBRID";

  // Unknown non-empty value must NOT silently convert to Waterfall!
  return null;
}

export function isValidMethodologyId(input) {
  return normalizeMethodologyId(input) !== null;
}

/**
 * Authoritative check whether a given methodology is allowed for creating
 * a new project or switching an existing project in the current environment.
 *
 * @param {string} methodology
 * @returns {boolean}
 */
export function isMethodologyAllowedForNewProjects(methodology) {
  const norm = normalizeMethodologyId(methodology);
  if (!norm) return false;
  const registry = getMethodologyRegistry();
  return Boolean(registry[norm]?.allowNewProjects);
}

/**
 * Returns availability metadata for a specific methodology.
 */
export function getMethodologyAvailability(methodology) {
  const trimmed = String(methodology || "").trim().toUpperCase();
  const registry = getMethodologyRegistry();
  if (trimmed === "NEXUSFLOW") return registry.NEXUSFLOW;
  const norm = normalizeMethodologyId(methodology);
  return (norm && registry[norm]) ? registry[norm] : null;
}

export default {
  METHODOLOGY_IDS,
  areExperimentalMethodologiesEnabled,
  getMethodologyRegistry,
  normalizeMethodologyId,
  isValidMethodologyId,
  isMethodologyAllowedForNewProjects,
  getMethodologyAvailability,
};
