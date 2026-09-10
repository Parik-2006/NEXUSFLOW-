/**
 * client/services/kanbanApiService.ts
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN API CLIENT SERVICE
 *
 * Provides typed, error-handled HTTP requests for all Kanban continuous-flow
 * endpoints: board, backlog, replenishment, flow metrics, blockers, team,
 * policies, health, continuous delivery, and simulation.
 * ============================================================================
 */

import { API_BASE_URL } from "@/utils/api";

const API = API_BASE_URL;

function authHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// ── 1. Overview ─────────────────────────────────────────────────────────────
export async function fetchKanbanOverview(targetId: string, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/overview/${targetId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to load Kanban overview (${res.status})`);
  }
  return res.json();
}

// ── 2. Board ────────────────────────────────────────────────────────────────
export async function fetchKanbanBoard(targetId: string, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/board/${targetId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to load Kanban board (${res.status})`);
  }
  return res.json();
}

// ── 3. Pull & Move ──────────────────────────────────────────────────────────
export async function pullKanbanItem(
  targetId: string,
  data: { taskId: string; toColumn: string; hasOverride?: boolean; overrideReason?: string },
  token?: string | null
) {
  const res = await fetch(`${API}/api/kanban/pull`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ ...data, projectId: targetId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to pull work item.");
  }
  return res.json();
}

// ── 4. Backlog & Replenishment ──────────────────────────────────────────────
export async function fetchKanbanBacklog(targetId: string, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/backlog/${targetId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load Kanban backlog.");
  }
  return res.json();
}

export async function replenishKanbanBacklog(targetId: string, taskIds: string[], token?: string | null) {
  const res = await fetch(`${API}/api/kanban/backlog/replenish`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ projectId: targetId, taskIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to replenish backlog items.");
  }
  return res.json();
}

// ── 5. Tasks (Work Items) ───────────────────────────────────────────────────
export async function createKanbanTask(targetId: string, taskData: any, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/tasks`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ ...taskData, projectId: targetId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create work item.");
  }
  return res.json();
}

export async function updateKanbanTask(taskId: string, updates: any, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/tasks/${taskId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update work item.");
  }
  return res.json();
}

// ── 6. Flow Metrics & Forecasting ───────────────────────────────────────────
export async function fetchKanbanFlowMetrics(targetId: string, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/flow/${targetId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load flow metrics.");
  }
  return res.json();
}

// ── 7. Blockers ─────────────────────────────────────────────────────────────
export async function fetchKanbanBlockers(targetId: string, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/blockers/${targetId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load blockers.");
  }
  return res.json();
}

export async function createKanbanBlocker(
  targetId: string,
  blockerData: { taskId: string; title: string; description?: string; category?: string; severity?: string },
  token?: string | null
) {
  const res = await fetch(`${API}/api/kanban/blockers`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ ...blockerData, projectId: targetId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to record blocker.");
  }
  return res.json();
}

export async function updateKanbanBlocker(
  blockerId: string,
  updates: { taskId?: string; status?: string; resolutionNotes?: string; severity?: string },
  token?: string | null
) {
  const res = await fetch(`${API}/api/kanban/blockers/${blockerId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update blocker.");
  }
  return res.json();
}

// ── 8. Team Intelligence & Personal WIP ─────────────────────────────────────
export async function fetchKanbanTeam(targetId: string, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/team/${targetId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load Kanban team data.");
  }
  return res.json();
}

// ── 9. Policies ─────────────────────────────────────────────────────────────
export async function fetchKanbanPolicies(targetId: string, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/policies/${targetId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load Kanban policies.");
  }
  return res.json();
}

export async function updateKanbanPolicies(targetId: string, updates: any, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/policies/${targetId}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update Kanban policies.");
  }
  return res.json();
}

// ── 10. Health & Continuous Improvement ─────────────────────────────────────
export async function fetchKanbanHealth(targetId: string, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/health/${targetId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load Kanban health.");
  }
  return res.json();
}

export async function fetchKanbanContinuousImprovement(targetId: string, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/continuous-improvement/${targetId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load continuous improvement insights.");
  }
  return res.json();
}

// ── 11. Continuous Delivery Review ──────────────────────────────────────────
export async function fetchKanbanContinuousDelivery(targetId: string, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/continuous-delivery/${targetId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load delivered work.");
  }
  return res.json();
}

// ── 12. Change Impact Simulation ────────────────────────────────────────────
export async function simulateKanbanChangeImpact(targetId: string, simulationData: any, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/change-impact/${targetId}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(simulationData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to simulate change impact.");
  }
  return res.json();
}

// ── 13. Events Audit Trail ──────────────────────────────────────────────────
export async function fetchKanbanEvents(targetId: string, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/events/${targetId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load Kanban event history.");
  }
  return res.json();
}

// ── 14. Copilot Context ─────────────────────────────────────────────────────
export async function fetchKanbanCopilotContext(targetId: string, token?: string | null) {
  const res = await fetch(`${API}/api/kanban/copilot-context/${targetId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load Copilot context.");
  }
  return res.json();
}
