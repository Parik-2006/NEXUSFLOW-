/**
 * server/services/projectBrain.js
 * NEXUSFLOW 3.0 — Phase 17: Project Brain RAG Context Builder
 *
 * Aggregates multi-source project intelligence into a single serializable context
 * snapshot for injection into LLM system prompts.
 *
 * PRIVACY GUARANTEE: Copilot conversation history (AIConversation / AIMessage)
 * is intentionally excluded from this snapshot. It is per-user private.
 */

import mongoose from "mongoose";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Decision from "../models/Decision.js";
import ArchitectureComponent from "../models/ArchitectureComponent.js";
import ResearchItem from "../models/ResearchItem.js";
import Risk from "../models/Risk.js";
import Retrospective from "../models/Retrospective.js";
import LearningInsight from "../models/LearningInsight.js";

/**
 * buildProjectBrainContext(projectId, requestingUserId)
 * Returns a structured snapshot of all authorized project intelligence.
 */
export async function buildProjectBrainContext(projectId, requestingUserId) {
  if (!mongoose.isValidObjectId(projectId)) return null;

  const project = await Project.findById(projectId).lean();
  if (!project) return null;

  const [
    decisions,
    architecture,
    research,
    tasks,
    risks,
    retrospectives,
    insights,
  ] = await Promise.all([
    Decision.find({ projectId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),

    ArchitectureComponent.find({ projectId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),

    ResearchItem.find({ projectId })
      .sort({ relevance: -1, createdAt: -1 })
      .limit(10)
      .lean(),

    Task.find({ projectId })
      .sort({ priorityScore: -1 })
      .limit(30)
      .lean()
      .then((all) => ({
        activeTasks:    all.filter((t) => t.status !== "done"),
        completedTasks: all.filter((t) => t.status === "done"),
        totalCount:     all.length,
      })),

    Risk.find({ projectId, status: "open" })
      .sort({ severity: 1, createdAt: -1 })
      .limit(5)
      .lean(),

    Retrospective.find({ projectId })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean(),

    LearningInsight.find({ projectId, isStale: false })
      .sort({ confidence: -1 })
      .limit(5)
      .lean(),
  ]);

  return {
    project: {
      _id:          project._id,
      title:        project.title,
      description:  project.description,
      domain:       project.domain,
      status:       project.status,
      currentPhase: project.currentPhase,
    },
    decisions,
    architecture,
    research,
    tasks,
    risks,
    retrospectives,
    insights,
    _generatedAt: new Date().toISOString(),
    // NOTE: AIConversation / AIMessage are intentionally excluded — they are private per-user.
  };
}

/**
 * serializeBrainForPrompt(brain)
 * Converts the brain snapshot into a concise markdown-style string for LLM injection.
 */
export function serializeBrainForPrompt(brain) {
  if (!brain) return "";

  const lines = [];
  lines.push(`## Project: ${brain.project?.title ?? "Unknown"}`);
  if (brain.project?.description) lines.push(`Description: ${brain.project.description}`);
  if (brain.project?.domain)      lines.push(`Domain: ${brain.project.domain}`);
  if (brain.project?.currentPhase) lines.push(`Phase: ${brain.project.currentPhase}`);

  if (brain.decisions?.length) {
    lines.push("\n### Key Decisions");
    for (const d of brain.decisions) {
      lines.push(`- [${d.status || "accepted"}] ${d.title}: ${d.decision || d.selectedOption || ""}`);
    }
  }

  if (brain.architecture?.length) {
    lines.push("\n### Architecture Components");
    for (const c of brain.architecture) {
      lines.push(`- ${c.name} (${c.componentType}): ${c.technology || ""}${c.description ? " — " + c.description : ""}`);
    }
  }

  if (brain.research?.length) {
    lines.push("\n### Research & References");
    for (const r of brain.research) {
      lines.push(`- ${r.title}: ${r.summary || ""}`);
    }
  }

  if (brain.tasks?.activeTasks?.length) {
    lines.push("\n### Active Tasks");
    for (const t of brain.tasks.activeTasks.slice(0, 10)) {
      lines.push(`- [${t.status}] ${t.title}${t.estimatedHours ? ` (~${t.estimatedHours}h)` : ""}`);
    }
  }

  if (brain.risks?.length) {
    lines.push("\n### Open Risks");
    for (const r of brain.risks) {
      lines.push(`- [${r.severity}] ${r.title}: ${r.recommendation || ""}`);
    }
  }

  if (brain.insights?.length) {
    lines.push("\n### Learning Insights");
    for (const i of brain.insights) {
      lines.push(`- ${i.insight}`);
    }
  }

  return lines.join("\n");
}
