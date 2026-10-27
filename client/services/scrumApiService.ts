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

export async function deleteSprint(sprintId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/sprints/${sprintId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete Sprint");
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

export async function acceptScrumAssignment(
  teamId: string,
  taskId: string,
  memberId: string,
  token?: string | null
) {
  const res = await fetch(`${API}/api/scrum/capability/${teamId}/assign`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ taskId, memberId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to accept Scrum assignment");
  }
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

export async function addScrumDependency(
  teamId: string,
  fromId: string,
  toId: string,
  token?: string | null
) {
  const res = await fetch(`${API}/api/scrum/dependencies/${teamId}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ fromId, toId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || "Failed to add dependency");
  }
  return res.json();
}

export async function removeScrumDependency(
  teamId: string,
  fromId: string,
  toId: string,
  token?: string | null
) {
  const res = await fetch(`${API}/api/scrum/dependencies/${teamId}`, {
    method: "DELETE",
    headers: authHeaders(token),
    body: JSON.stringify({ fromId, toId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || "Failed to remove dependency");
  }
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

// ── 14. Scrum Plan & AI Story Suggestions ─────────────────────────────────────
export async function fetchScrumPlan(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/plan/${teamId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load Scrum planning state");
  return res.json();
}

export async function analyzeScrumPlan(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/plan/analyze/${teamId}`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to analyze Scrum project");
  }
  return res.json();
}

export async function generateScrumPlan(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/plan/generate/${teamId}`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to generate Scrum plan suggestions");
  }
  return res.json();
}

export async function approveStorySuggestion(
  teamId: string,
  suggestionId: string,
  editedStory?: any,
  token?: string | null
) {
  const res = await fetch(`${API}/api/scrum/plan/suggestions/${teamId}/approve`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ suggestionId, editedStory }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to approve story suggestion");
  }
  return res.json();
}

export async function bulkApproveStorySuggestions(
  teamId: string,
  suggestionIds?: string[] | null,
  token?: string | null
) {
  const res = await fetch(`${API}/api/scrum/plan/suggestions/${teamId}/bulk-approve`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ suggestionIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to bulk approve story suggestions");
  }
  return res.json();
}

export async function rejectStorySuggestion(
  teamId: string,
  suggestionId: string,
  reason?: string,
  token?: string | null
) {
  const res = await fetch(`${API}/api/scrum/plan/suggestions/${teamId}/reject`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ suggestionId, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to reject suggestion");
  }
  return res.json();
}

export async function updateDraftSuggestion(
  teamId: string,
  suggestionId: string,
  updates: any,
  token?: string | null
) {
  const res = await fetch(`${API}/api/scrum/plan/suggestions/${teamId}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ suggestionId, ...updates }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update draft suggestion");
  }
  return res.json();
}

// ── 15. Daily Scrum Standup ───────────────────────────────────────────────────
export async function fetchSprintStandup(sprintId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/sprints/${sprintId}/standup`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load standup records");
  return res.json();
}

export async function submitSprintStandup(
  sprintId: string,
  checkinData: { goalProgress?: string; yesterdayWork?: string; todayPlan?: string; blockers?: string },
  token?: string | null
) {
  const res = await fetch(`${API}/api/scrum/sprints/${sprintId}/standup`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(checkinData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to submit standup check-in");
  }
  return res.json();
}

// ── 16. Retrospective Action Items & Learning Loop ─────────────────────────────
export async function addRetroAction(teamId: string, actionData: any, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/retrospective/${teamId}/actions`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(actionData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to add action item");
  }
  return res.json();
}

export async function updateRetroAction(teamId: string, actionId: string, updateData: any, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/retrospective/${teamId}/actions/${actionId}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(updateData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update action item");
  }
  return res.json();
}

export async function fetchLearningLoop(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/insights/${teamId}/learning-loop`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to load learning loop data");
  return res.json();
}

export async function decomposeStory(taskId: string, subtasks: any[], token?: string | null) {
  const res = await fetch(`${API}/api/scrum/backlog/task/${taskId}/decompose`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ subtasks }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to decompose story");
  }
  return res.json();
}

// ── 18. Fix 5: Scrum Plan Lifecycle, Conflict Resolution & Finalization ────────
export async function fetchScrumPlanReadiness(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/plan/readiness/${teamId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch Scrum plan readiness");
  }
  return res.json();
}

export async function finalizeScrumPlan(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/plan/finalize/${teamId}`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error: any = new Error(err.error || "Failed to finalize Scrum plan");
    error.blockers = err.blockers || [];
    error.readiness = err.readiness || null;
    throw error;
  }
  return res.json();
}

export async function resolveScrumConflict(
  teamId: string,
  conflictId: string,
  resolution: string,
  note?: string,
  resolutionType?: string,
  token?: string | null
) {
  const res = await fetch(`${API}/api/scrum/plan/conflicts/${teamId}/${conflictId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ resolution, note, resolutionType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to resolve scope conflict");
  }
  return res.json();
}

export async function approveArtifact(projectId: string, artifactId: string, token?: string | null) {
  const res = await fetch(`${API}/api/projects/${projectId}/artifacts/${artifactId}/approve`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to approve artifact");
  }
  return res.json();
}

export async function approveAllArtifacts(projectId: string, token?: string | null) {
  const res = await fetch(`${API}/api/projects/${projectId}/artifacts/approve-all`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to approve all artifacts");
  }
  return res.json();
}
// ── 19. Fix 6: Scrum Project Health & Risk Radar ──────────────────────────────
export async function fetchScrumHealth(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/health/${teamId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load Scrum health intelligence");
  }
  return res.json();
}

export async function refreshScrumHealth(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/health/${teamId}/refresh`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to recalculate Scrum project health");
  }
  return res.json();
}

export async function fetchScrumRisks(teamId: string, status: string = "open", token?: string | null) {
  const res = await fetch(`${API}/api/scrum/risks/${teamId}?status=${status}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch Scrum risks");
  }
  return res.json();
}

export async function scanScrumRisks(teamId: string, token?: string | null) {
  const res = await fetch(`${API}/api/scrum/risks/${teamId}/scan`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to run Scrum risk scan");
  }
  return res.json();
}

export async function updateScrumRiskStatus(
  teamId: string,
  riskId: string,
  status: "acknowledged" | "resolved",
  token?: string | null
) {
  const res = await fetch(`${API}/api/scrum/risks/${teamId}/${riskId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update Scrum risk status");
  }
  return res.json();
}
