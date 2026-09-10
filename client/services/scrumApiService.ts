/**
 * client/services/scrumApiService.ts
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM API CLIENT SERVICE
 *
 * Provides typed, error-handled HTTP requests for all Scrum endpoints.
 * Handles auth headers, JSON parsing, error logging, and standard fallbacks.
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

// ── 1. Scrum Overview ─────────────────────────────────────────────────────────
export async function fetchScrumOverview(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/overview/${teamId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to load Scrum overview (${res.status})`);
  }
  return res.json();
}

// ── 2. Scrum Config ───────────────────────────────────────────────────────────
export async function fetchScrumConfig(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/config/${teamId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load Scrum configuration");
  return res.json();
}

export async function updateScrumConfig(teamId: string, updates: any, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/config/${teamId}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update Scrum configuration");
  }
  return res.json();
}

// ── 3. Sprints ────────────────────────────────────────────────────────────────
export async function fetchSprints(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/sprints/${teamId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load Sprints");
  return res.json();
}

export async function createSprint(teamId: string, sprintData: any, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/sprints/${teamId}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(sprintData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create Sprint");
  }
  return res.json();
}

export async function updateSprint(sprintId: string, sprintData: any, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/sprints/${sprintId}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(sprintData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update Sprint");
  }
  return res.json();
}

export async function startSprint(sprintId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/sprints/${sprintId}/start`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to start Sprint");
  }
  return res.json();
}

export async function completeSprint(sprintId: string, payload: { carryOverAction?: string } = {}, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/sprints/${sprintId}/complete`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to complete Sprint");
  }
  return res.json();
}

export async function cancelSprint(sprintId: string, reason?: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/sprints/${sprintId}/cancel`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to cancel Sprint");
  }
  return res.json();
}

export async function fetchSprintReview(sprintId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/sprints/${sprintId}/review`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load Sprint review data");
  return res.json();
}

export async function submitSprintReview(sprintId: string, reviewData: any, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/sprints/${sprintId}/review`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(reviewData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save Sprint review");
  }
  return res.json();
}

// ── 4. Product Backlog ────────────────────────────────────────────────────────
export async function fetchScrumBacklog(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/backlog/${teamId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load Product Backlog");
  return res.json();
}

export async function createBacklogItem(teamId: string, itemData: any, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/backlog/${teamId}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(itemData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create Backlog item");
  }
  return res.json();
}

export async function updateBacklogItem(taskId: string, itemData: any, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/backlog/task/${taskId}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(itemData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update Backlog item");
  }
  return res.json();
}

export async function deleteBacklogItem(taskId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/backlog/task/${taskId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete Backlog item");
  }
  return res.json();
}

// ── 5. Sprint Planning (DAA deterministic) ────────────────────────────────────
export async function calculatePlanningCandidates(teamId: string, payload: any = {}, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/planning/candidates/${teamId}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to calculate planning candidates");
  return res.json();
}

export async function commitSprintPlan(teamId: string, payload: any, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/planning/commit/${teamId}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to commit Sprint plan");
  }
  return res.json();
}

// ── 6. Task Status Transition ─────────────────────────────────────────────────
export async function updateScrumTaskStatus(taskId: string, status: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/task/${taskId}/status`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update task status");
  }
  return res.json();
}

// ── 7. Capacity ───────────────────────────────────────────────────────────────
export async function fetchScrumCapacity(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/capacity/${teamId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load team capacity");
  return res.json();
}

// ── 8. Dependencies ───────────────────────────────────────────────────────────
export async function fetchScrumDependencies(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/dependencies/${teamId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load Scrum dependencies");
  return res.json();
}

// ── 9. Insights ───────────────────────────────────────────────────────────────
export async function fetchScrumInsights(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/insights/${teamId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load Scrum insights");
  return res.json();
}

// ── 10. Health ────────────────────────────────────────────────────────────────
export async function fetchScrumHealth(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/health/${teamId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load Scrum health");
  return res.json();
}

// ── 11. Timeline ──────────────────────────────────────────────────────────────
export async function fetchScrumTimeline(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/timeline/${teamId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load Scrum timeline");
  return res.json();
}

// ── 12. Retrospective ─────────────────────────────────────────────────────────
export async function fetchScrumRetrospective(teamId: string, sprintId?: string | null, token?: string | null) {
  const q = sprintId ? `?sprintId=${encodeURIComponent(sprintId)}` : "";
  const res = await fetch(`${API}/api/scrum/retrospective/${teamId}${q}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load Scrum retrospective");
  return res.json();
}

export async function generateScrumRetrospective(teamId: string, payload: any = {}, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/retrospective/${teamId}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to generate Scrum retrospective");
  }
  return res.json();
}

// ── 13. Copilot Context ───────────────────────────────────────────────────────
export async function fetchScrumCopilotContext(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/copilot/context/${teamId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load Scrum copilot context");
  return res.json();
}
