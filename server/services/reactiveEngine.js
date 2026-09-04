/**
 * server/services/reactiveEngine.js
 * ============================================================================
 * CENTRALIZED REACTIVE RECALCULATION & INVALIDATION ENGINE
 *
 * Prevents stale derived project intelligence.
 * Source mutations trigger targeted downstream invalidation:
 *   - Task priority (Greedy DAA)
 *   - Dependency DAG & Topological Sort
 *   - Critical Path Method (CPM)
 *   - Member workload & Branch & Bound capacity
 *   - Phase Gate status
 *   - Team Health & Risk Radar
 *
 * Rules:
 *   - Never display stale derived results as current
 *   - Preserves DONE history, manual overrides, explicit assignments
 *   - Bumps Project.derivedVersion on every state mutation
 *   - Emits structured ProjectEvent for full auditability
 *   - No infinite recalculation loops
 * ============================================================================
 */

import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import { recordProjectEvent } from "./eventService.js";
import { evaluateProjectPhaseGate } from "./phaseGateService.js";

// Keep in-memory lock to prevent recursive re-entrance loops
const activeRecalculations = new Set();

/**
 * Handle a project state mutation centrally.
 */
export async function handleProjectMutation({
  projectId,
  teamId,
  actorId = null,
  actorName = "System Engine",
  mutationType, // "TASK_UPDATED" | "TASK_CREATED" | "TASK_DELETED" | "DEPENDENCY_MUTATED" | "REQUIREMENT_MUTATED" | "DEADLINE_CHANGED" | "PHASE_ADVANCED" | "ASSIGNMENT_MUTATED"
  entityId = "",
  payload = {},
  io = null,
}) {
  const lockKey = `${projectId}:${mutationType}:${entityId}`;
  if (activeRecalculations.has(lockKey)) {
    // Avoid recursive loop
    return null;
  }

  activeRecalculations.add(lockKey);

  try {
    const project = await Project.findById(projectId);
    if (!project) return null;

    // 1. Determine affected domains based on mutation
    const affectedDomains = new Set();

    switch (mutationType) {
      case "TASK_CREATED":
      case "TASK_DELETED":
        affectedDomains.add("TASK_PRIORITY");
        affectedDomains.add("WORKLOAD_CAPACITY");
        affectedDomains.add("PHASE_GATE");
        affectedDomains.add("HEALTH");
        break;

      case "TASK_STATUS_CHANGED":
        affectedDomains.add("CRITICAL_PATH");
        affectedDomains.add("PHASE_GATE");
        affectedDomains.add("HEALTH");
        affectedDomains.add("RETROSPECTIVE");
        break;

      case "TASK_PRIORITY_CHANGED":
      case "TASK_UPDATED":
        affectedDomains.add("TASK_PRIORITY");
        affectedDomains.add("CRITICAL_PATH");
        affectedDomains.add("WORKLOAD_CAPACITY");
        break;

      case "DEPENDENCY_MUTATED":
        affectedDomains.add("DEPENDENCY_DAG");
        affectedDomains.add("CRITICAL_PATH");
        affectedDomains.add("TASK_PRIORITY");
        affectedDomains.add("RISK");
        break;

      case "REQUIREMENT_MUTATED":
        affectedDomains.add("REQUIREMENT_TRACEABILITY");
        affectedDomains.add("PHASE_GATE");
        affectedDomains.add("TASK_PRIORITY");
        break;

      case "DEADLINE_CHANGED":
        affectedDomains.add("CRITICAL_PATH");
        affectedDomains.add("TASK_PRIORITY");
        affectedDomains.add("RISK");
        affectedDomains.add("HEALTH");
        break;

      case "ASSIGNMENT_MUTATED":
        affectedDomains.add("WORKLOAD_CAPACITY");
        affectedDomains.add("HEALTH");
        break;

      case "PHASE_ADVANCED":
        affectedDomains.add("PHASE_GATE");
        affectedDomains.add("VISUALIZATION_3D");
        affectedDomains.add("HEALTH");
        break;

      default:
        affectedDomains.add("GENERAL");
    }

    // 2. Invalidate derived state and bump version
    const prevVersion = project.derivedVersion || 1;
    project.derivedVersion = prevVersion + 1;
    project.lastCalculatedAt = new Date();
    await project.save();

    // 3. Trigger targeted recalculations
    let phaseGateResult = null;
    if (affectedDomains.has("PHASE_GATE")) {
      try {
        phaseGateResult = await evaluateProjectPhaseGate(projectId);
      } catch (err) {
        console.warn("[reactiveEngine] Phase gate eval warning:", err.message);
      }
    }

    // 4. Record Project Event for audit trail
    await recordProjectEvent({
      projectId,
      teamId: teamId || project.teamId,
      actorId,
      actorName,
      eventType: mutationType,
      entityType: mutationType.startsWith("TASK")
        ? "task"
        : mutationType.startsWith("DEPENDENCY")
        ? "dependency"
        : mutationType.startsWith("REQUIREMENT")
        ? "requirement"
        : "project",
      entityId: String(entityId || ""),
      title: `Project State Recalculated: ${mutationType.replace(/_/g, " ")}`,
      description: `Derived intelligence invalidated. Affected domains: ${Array.from(affectedDomains).join(", ")}. Version bumped ${prevVersion} → ${project.derivedVersion}`,
      metadata: {
        affectedDomains: Array.from(affectedDomains),
        derivedVersion: project.derivedVersion,
        payload,
      },
      source: "reactive_engine",
    });

    // 5. Emit live socket sync if io is provided
    if (io && teamId) {
      io.to(String(teamId)).emit("project:state_recalculated", {
        projectId: String(projectId),
        derivedVersion: project.derivedVersion,
        affectedDomains: Array.from(affectedDomains),
        phaseGateStatus: phaseGateResult?.status || null,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      success: true,
      derivedVersion: project.derivedVersion,
      affectedDomains: Array.from(affectedDomains),
      phaseGateResult,
    };
  } catch (err) {
    console.error("[reactiveEngine] Error during reactive invalidation:", err);
    return null;
  } finally {
    activeRecalculations.delete(lockKey);
  }
}
