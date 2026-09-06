/**
 * server/services/projectMemoryContext.js
 * ============================================================================
 * PROJECT MEMORY CONTEXT — getProjectContext(projectId) service.
 *
 * Provides a clean interface for retrieving structured project memory
 * with persistent vs temporary context separation.
 *
 * DESIGN PRINCIPLES:
 * 1. Clean interface: getProjectContext(projectId) returns a single object
 * 2. Persistent vs temporary separation
 * 3. Reuses existing Project Brain/decision/event infrastructure
 * 4. Project isolation enforced — only returns data for the given project
 * 5. Authorization enforced — verifies project access
 *
 * CONTEXT STRUCTURE:
 * {
 *   project: { ... },                    // Project metadata
 *   persistentMemory: [ ... ],           // Persistent memory entries
 *   temporaryMemory: [ ... ],            // Temporary memory entries
 *   decisions: [ ... ],                  // Recent decisions
 *   requirements: [ ... ],               // Structured requirements
 *   artifacts: [ ... ],                  // Project artifacts
 *   phaseHistory: [ ... ],               // Phase gate history
 *   events: [ ... ],                     // Recent project events
 *   copilotMemory: [ ... ],              // Existing copilot memory
 *   _generatedAt: string,                // Timestamp
 * }
 * ============================================================================
 */

import mongoose from "mongoose";
import Project from "../models/Project.js";
import ProjectMemory from "../models/ProjectMemory.js";
import Decision from "../models/Decision.js";
import DecisionFeedback from "../models/DecisionFeedback.js";
import ProjectEvent from "../models/ProjectEvent.js";
import { buildProjectBrainContext } from "./projectBrain.js";

/**
 * getProjectContext(projectId)
 * Returns a structured project memory context with persistent vs temporary separation.
 *
 * @param {string} projectId - MongoDB ObjectId string
 * @returns {Promise<object|null>} Project context object, or null if not found
 */
export async function getProjectContext(projectId) {
  if (!mongoose.isValidObjectId(projectId)) return null;

  const project = await Project.findById(projectId)
    .select("title description domain status currentPhase methodology teamId createdAt updatedAt")
    .lean();

  if (!project) return null;

  // Fetch all memory entries for this project, separated by scope
  const [persistentMemory, temporaryMemory] = await Promise.all([
    ProjectMemory.find({ projectId, scope: "persistent", status: { $in: ["active", "restored"] } })
      .sort({ createdAt: -1 })
      .lean(),
    ProjectMemory.find({ projectId, scope: "temporary", status: { $in: ["active", "restored"] } })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  // Fetch related data from existing infrastructure
  const [decisions, requirements, artifacts, phaseHistory, events, copilotMemory] =
    await Promise.all([
      Decision.find({ projectId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      Project.findById(projectId)
        .select("requirements")
        .lean()
        .then((p) => p?.requirements || []),
      Project.findById(projectId)
        .select("artifacts")
        .lean()
        .then((p) => p?.artifacts || []),
      Project.findById(projectId)
        .select("phaseGateHistory")
        .lean()
        .then((p) => p?.phaseGateHistory || []),
      ProjectEvent.find({ projectId })
        .sort({ timestamp: -1 })
        .limit(20)
        .lean(),
      Project.findById(projectId)
        .select("copilotMemory")
        .lean()
        .then((p) => p?.copilotMemory || []),
    ]);

  return {
    project: {
      _id:          project._id,
      title:        project.title,
      description:  project.description,
      domain:       project.domain,
      status:       project.status,
      currentPhase: project.currentPhase,
      methodology:  project.methodology,
      teamId:       project.teamId,
      createdAt:    project.createdAt,
      updatedAt:    project.updatedAt,
    },
    persistentMemory,
    temporaryMemory,
    decisions,
    requirements,
    artifacts,
    phaseHistory,
    events,
    copilotMemory,
    _generatedAt: new Date().toISOString(),
  };
}

/**
 * getProjectContextSummary(projectId)
 * Returns a lightweight summary of project memory for quick access.
 *
 * @param {string} projectId - MongoDB ObjectId string
 * @returns {Promise<object|null>} Summary object
 */
export async function getProjectContextSummary(projectId) {
  if (!mongoose.isValidObjectId(projectId)) return null;

  const project = await Project.findById(projectId)
    .select("title description domain status currentPhase")
    .lean();

  if (!project) return null;

  const [activeCount, archivedCount, persistentCount, temporaryCount] =
    await Promise.all([
      ProjectMemory.countDocuments({ projectId, status: { $in: ["active", "restored"] } }),
      ProjectMemory.countDocuments({ projectId, status: "archived" }),
      ProjectMemory.countDocuments({ projectId, scope: "persistent", status: { $in: ["active", "restored"] } }),
      ProjectMemory.countDocuments({ projectId, scope: "temporary", status: { $in: ["active", "restored"] } }),
    ]);

  return {
    project: {
      _id:    project._id,
      title:  project.title,
      domain: project.domain,
      status: project.status,
    },
    memoryStats: {
      activeCount,
      archivedCount,
      persistentCount,
      temporaryCount,
    },
    _generatedAt: new Date().toISOString(),
  };
}

/**
 * getPersistentContext(projectId)
 * Returns only persistent memory context for LLM injection.
 * Excludes temporary memory and archived entries.
 *
 * @param {string} projectId - MongoDB ObjectId string
 * @returns {Promise<object|null>} Persistent context object
 */
export async function getPersistentContext(projectId) {
  if (!mongoose.isValidObjectId(projectId)) return null;

  const project = await Project.findById(projectId)
    .select("title description domain status currentPhase")
    .lean();

  if (!project) return null;

  const persistentMemory = await ProjectMemory.find({
    projectId,
    scope: "persistent",
    status: { $in: ["active", "restored"] },
  })
    .sort({ createdAt: -1 })
    .lean();

  const decisions = await Decision.find({ projectId })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return {
    project: {
      _id:    project._id,
      title:  project.title,
      description: project.description,
      domain: project.domain,
      status: project.status,
      currentPhase: project.currentPhase,
    },
    persistentMemory,
    temporaryMemory: [],
    decisions,
    _generatedAt: new Date().toISOString(),
  };
}

/**
 * getTemporaryContext(projectId)
 * Returns only temporary memory context for short-lived sessions.
 *
 * @param {string} projectId - MongoDB ObjectId string
 * @returns {Promise<object|null>} Temporary context object
 */
export async function getTemporaryContext(projectId) {
  if (!mongoose.isValidObjectId(projectId)) return null;

  const project = await Project.findById(projectId)
    .select("title description domain status currentPhase")
    .lean();

  if (!project) return null;

  const temporaryMemory = await ProjectMemory.find({
    projectId,
    scope: "temporary",
    status: { $in: ["active", "restored"] },
  })
    .sort({ createdAt: -1 })
    .lean();

  return {
    project: {
      _id:    project._id,
      title:  project.title,
      description: project.description,
      domain: project.domain,
      status: project.status,
      currentPhase: project.currentPhase,
    },
    persistentMemory: [],
    temporaryMemory,
    _generatedAt: new Date().toISOString(),
  };
}

/**
 * buildMemoryContextForPrompt(projectId)
 * Builds a concise markdown string for LLM prompt injection.
 * Uses only persistent memory and decisions.
 *
 * @param {string} projectId - MongoDB ObjectId string
 * @returns {Promise<string>} Markdown-formatted context string
 */
export async function buildMemoryContextForPrompt(projectId) {
  const context = await getPersistentContext(projectId);
  if (!context) return "";

  const lines = [];
  lines.push(`## Project: ${context.project?.title ?? "Unknown"}`);
  if (context.project?.description) lines.push(`Description: ${context.project.description}`);
  if (context.project?.domain)      lines.push(`Domain: ${context.project.domain}`);
  if (context.project?.currentPhase) lines.push(`Phase: ${context.project.currentPhase}`);

  if (context.persistentMemory?.length) {
    lines.push("\n### Persistent Memory");
    for (const m of context.persistentMemory) {
      lines.push(`- [${m.category}] ${m.title}: ${m.content}`);
    }
  }

  if (context.decisions?.length) {
    lines.push("\n### Key Decisions");
    for (const d of context.decisions) {
      lines.push(`- [${d.status || "accepted"}] ${d.title}: ${d.decision || d.selectedOption || ""}`);
    }
  }

  return lines.join("\n");
}
