/**
 * server/services/kanbanBottleneckService.js
 * ============================================================================
 * NEXUSFLOW V4 — BOTTLENECK DETECTION ENGINE (Prompt 17)
 *
 * Deterministic detection of flow constraints using WIP saturation, queue
 * accumulation, aging concentration, blocker density, and downstream starvation.
 *
 * DAA / AI Separation:
 *   - Identifies constrained stages and deterministic evidence factors.
 *   - AI provides natural language summary; never mutates workflow automatically.
 * ============================================================================
 */

/**
 * Detect bottlenecks across the active Kanban workflow columns
 */
export function detectBottlenecks(tasks = [], columns = [], options = {}) {
  const agingWarningDays = options.agingWarningDays || 3;
  const now = new Date();
  const bottlenecks = [];

  // Group active tasks by column
  const columnTasks = {};
  for (const col of columns) {
    columnTasks[col.id] = [];
  }

  for (const t of tasks) {
    const colId = t.workflowColumn || (t.kanbanStatus ? t.kanbanStatus.toLowerCase() : "backlog");
    if (!columnTasks[colId]) columnTasks[colId] = [];
    columnTasks[colId].push(t);
  }

  // Iterate active non-done columns
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (col.isDoneColumn || col.id === "backlog") continue;

    const items = columnTasks[col.id] || [];
    const limit = col.wipLimit || 0;
    const count = items.length;

    const evidenceFactors = [];
    let severityScore = 0; // 0 to 100

    // 1. WIP Saturation & Overload
    const isSaturated = limit > 0 && count >= limit;
    if (limit > 0) {
      if (count > limit) {
        severityScore += 40;
        evidenceFactors.push(`WIP limit exceeded: ${count}/${limit} items (${Math.round((count / limit) * 100)}% utilization)`);
      } else if (count === limit) {
        severityScore += 35;
        evidenceFactors.push(`WIP limit saturated at maximum capacity (${count}/${limit})`);
      }
    }

    // 2. Aging Concentration in this column
    const agingItems = items.filter((t) => {
      const start = t.activeStartedAt || t.readyAt || t.createdAt;
      const ageDays = (now.getTime() - new Date(start).getTime()) / (24 * 3600 * 1000);
      return ageDays >= agingWarningDays;
    });

    if (agingItems.length >= 2) {
      severityScore += 30;
      evidenceFactors.push(`${agingItems.length} work items are aging beyond the ${agingWarningDays}-day threshold`);
    } else if (agingItems.length === 1) {
      severityScore += 15;
      evidenceFactors.push(`1 work item is aging beyond ${agingWarningDays} days`);
    }

    // 3. Blocker Density in this column
    const blockedItems = items.filter((t) => t.isBlocked || (Array.isArray(t.blockers) && t.blockers.some((b) => b.status !== "RESOLVED")));
    if (blockedItems.length >= 2) {
      severityScore += 30;
      evidenceFactors.push(`${blockedItems.length} items blocked by unresolved impediments in this column`);
    } else if (blockedItems.length === 1) {
      severityScore += 15;
      evidenceFactors.push("1 item blocked by unresolved impediments");
    }

    // 4. Downstream Starvation check (next column is starved while this one is full)
    const nextCol = columns[i + 1];
    if (nextCol && !nextCol.isDoneColumn) {
      const nextItems = columnTasks[nextCol.id] || [];
      if (count >= limit && limit > 0 && nextItems.length === 0) {
        severityScore += 20;
        evidenceFactors.push(`Starvation pattern: downstream stage '${nextCol.name}' has 0 items waiting`);
      }
    }

    // Classify severity
    if (severityScore >= 35) {
      let severity = "LOW";
      if (severityScore >= 75) severity = "CRITICAL";
      else if (severityScore >= 50) severity = "HIGH";
      else severity = "MEDIUM";

      let recommendation = "Review work items in this column to expedite completion.";
      if (blockedItems.length > 0) {
        recommendation = "Focus team swarming on resolving active blockers to restore flow.";
      } else if (count >= limit) {
        recommendation = "Halt new pulls into this column and pair on in-flight items.";
      }

      bottlenecks.push({
        id: col.id,
        columnId: col.id,
        columnName: col.name,
        severity,
        severityScore: Math.min(100, severityScore),
        itemCount: count,
        wipLimit: limit,
        saturated: isSaturated,
        isSaturated,
        evidenceFactors,
        recommendation,
      });
    }
  }

  // Sort by highest severity
  bottlenecks.sort((a, b) => b.severityScore - a.severityScore);

  bottlenecks.isConstrained = bottlenecks.length > 0;
  bottlenecks.criticalBottleneckCount = bottlenecks.filter((b) => b.severity === "CRITICAL" || b.severity === "HIGH").length;
  bottlenecks.bottlenecks = bottlenecks;

  return bottlenecks;
}
