/**
 * server/services/kanbanWipService.js
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN WIP LIMIT ENGINE & PERSONAL WIP (Prompts 9, 20)
 *
 * Deterministic calculation of column WIP, personal WIP, saturation signals,
 * advisory warnings, hard policy enforcement, and authorized overrides.
 * ============================================================================
 */

/**
 * Calculate WIP state for each workflow column
 */
export function calculateColumnWip(tasks = [], columns = []) {
  const list = [];

  for (const col of columns) {
    const colId = col.id;
    // Count tasks belonging to this column
    const colTasks = tasks.filter((t) => {
      if (t.workflowColumn) return t.workflowColumn === colId;
      // Fallback mapping if workflowColumn not yet populated
      if (colId === "backlog") return !t.kanbanStatus || t.kanbanStatus === "BACKLOG";
      if (colId === "ready") return t.kanbanStatus === "READY";
      if (colId === "in_progress") return t.kanbanStatus === "IN_PROGRESS" || t.status === "in_progress";
      if (colId === "in_review") return t.kanbanStatus === "IN_REVIEW";
      if (colId === "testing") return t.kanbanStatus === "TESTING";
      if (colId === "done") return t.kanbanStatus === "DONE" || t.status === "done";
      return false;
    });

    const count = colTasks.length;
    const limit = col.wipLimit || 0;
    const isUnlimited = limit === 0 || Boolean(col.isDoneColumn);
    const availableSlots = isUnlimited ? Infinity : Math.max(0, limit - count);
    const utilization = isUnlimited ? 0 : Math.round((count / limit) * 100);
    const isOverloaded = !isUnlimited && count >= limit;
    const isSaturated = !isUnlimited && count >= limit;

    // Count blocked and aging items within this column
    const blockedCount = colTasks.filter((t) => t.isBlocked || (Array.isArray(t.blockers) && t.blockers.some((b) => b.status !== "RESOLVED"))).length;

    const colData = {
      id: colId,
      columnId: colId,
      name: col.name,
      limit,
      wipLimit: limit,
      count,
      isUnlimited,
      availableSlots: isUnlimited ? null : availableSlots,
      utilization,
      isSaturated,
      isOverloaded,
      blockedCount,
      isDoneColumn: Boolean(col.isDoneColumn),
    };

    list.push(colData);
    list[colId] = colData;
  }

  return list;
}

/**
 * Calculate personal WIP distribution across team members
 * NOTE (Prompt 20): Blocked tasks are separated so blocked work does NOT
 * penalize member capacity as normal active execution overload.
 */
export function calculatePersonalWip(tasks = [], members = [], defaultLimit = 3) {
  const memberWip = {};

  // Initialize for all known team members
  for (const m of members) {
    const uid = (m.userId?._id || m.userId || "").toString();
    if (!uid) continue;
    memberWip[uid] = {
      userId: uid,
      name: m.name || "Member",
      role: m.role || "member",
      limit: m.capacity ? Math.max(1, Math.floor(m.capacity / 10)) : defaultLimit,
      activeCount: 0,
      blockedCount: 0,
      inReviewCount: 0,
      completedCount: 0,
      taskIds: [],
    };
  }

  // Count per assigned task
  for (const t of tasks) {
    if (!t.assignedTo) continue;
    const assigneeId = (t.assignedTo?._id || t.assignedTo || "").toString();
    if (!memberWip[assigneeId]) {
      memberWip[assigneeId] = {
        userId: assigneeId,
        name: "Assignee",
        role: "member",
        limit: defaultLimit,
        activeCount: 0,
        blockedCount: 0,
        inReviewCount: 0,
        completedCount: 0,
        taskIds: [],
      };
    }

    const isDone = t.kanbanStatus === "DONE" || t.status === "done" || t.workflowColumn === "done";
    const isReview = t.kanbanStatus === "IN_REVIEW" || t.workflowColumn === "in_review";
    const isBlocked = Boolean(t.isBlocked || (Array.isArray(t.blockers) && t.blockers.some((b) => b.status !== "RESOLVED")));

    if (isDone) {
      memberWip[assigneeId].completedCount++;
    } else if (isBlocked) {
      memberWip[assigneeId].blockedCount++;
    } else if (isReview) {
      memberWip[assigneeId].inReviewCount++;
      memberWip[assigneeId].taskIds.push(t._id);
    } else if (t.workflowColumn === "in_progress" || t.kanbanStatus === "IN_PROGRESS" || t.status === "in_progress") {
      memberWip[assigneeId].activeCount++;
      memberWip[assigneeId].taskIds.push(t._id);
    }
  }

  // Calculate saturation & overload
  for (const uid of Object.keys(memberWip)) {
    const entry = memberWip[uid];
    const effectiveActive = entry.activeCount; // Blocked tasks explicitly excluded
    entry.utilization = Math.round((effectiveActive / entry.limit) * 100);
    entry.isSaturated = effectiveActive >= entry.limit;
    entry.isOverloaded = effectiveActive > entry.limit;
    entry.availableSlots = Math.max(0, entry.limit - effectiveActive);
  }

  return Object.values(memberWip);
}

/**
 * Validate whether a pull into a column violates column WIP limits
 */
export function validatePullWip({
  column,
  currentCount,
  classOfService = "standard",
  hasOverride = false,
  wipPolicy = { mode: "advisory", allowOverride: true },
}) {
  const limit = column.wipLimit || 0;

  // Unlimited column or done column
  if (limit === 0 || column.isDoneColumn) {
    return { allowed: true, warning: null, reason: null };
  }

  // Under limit
  if (currentCount < limit) {
    return { allowed: true, warning: null, reason: null };
  }

  // Exactly at or above limit
  const isExpedite = classOfService === "expedite";

  // If Expedite class with bypass permission
  if (isExpedite && hasOverride) {
    return {
      allowed: true,
      warning: `EXPEDITE item admitted past WIP limit of ${limit} in '${column.name}'.`,
      isExpediteBypass: true,
    };
  }

  // If override provided and policy allows overrides
  if (hasOverride && wipPolicy.allowOverride) {
    return {
      allowed: true,
      warning: `Authorized WIP limit override applied in '${column.name}' (${currentCount + 1}/${limit}).`,
      isOverridden: true,
    };
  }

  // If advisory mode: allow but return visible warning
  if (wipPolicy.mode === "advisory") {
    return {
      allowed: true,
      warning: `WIP limit of ${limit} reached in '${column.name}'. Swarming or blocker clearing recommended.`,
      isSaturated: true,
    };
  }

  // Hard mode: strictly rejected
  return {
    allowed: false,
    error: `WIP limit exceeded for '${column.name}'. Current: ${currentCount}/${limit}. Hard WIP policy prevents pulling new work until active items are completed or an authorized override is provided.`,
    isLimitReached: true,
    suggestedAction: "Swarm existing work, resolve active blockers, or request a leader WIP override.",
  };
}
