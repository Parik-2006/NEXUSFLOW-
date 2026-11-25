/**
 * useDashboardSummary — Phase 2 (D-19): authoritative dashboard metrics from
 * GET /api/dashboard/summary, refreshed live over the existing socket.
 *
 * - Never fabricates numbers: while loading or after an error `summary` is
 *   null and the UI shows "unavailable" rather than zero.
 * - Stale responses are ignored (monotonic request id).
 * - Socket events are coalesced into one refresh (debounced).
 * - Only rooms of the caller's own workspaces are joined (server re-checks
 *   membership); listeners are removed on unmount.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSocket } from "@/services/socket";
import { API_BASE_URL } from "@/utils/api";

export type DashboardSummary = {
  workspaceCount: number;
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  unassignedTasks: number;
  completionPercentage: number;
  uniqueMemberCount: number;
  placeholderMemberCount: number;
  activeSprintCount: number;
  aiPlansReady: number;
  plansReadyBreakdown: { waterfall: number; scrum: number };
  lastUpdatedAt: string;
};

const REFRESH_EVENTS = [
  "task:created", "task:updated", "task:deleted", "task:execution-order",
  "member:added", "member:removed", "member:updated", "team:member_left",
  "sprint:started", "sprint:completed", "scrum:sprint_deleted", "scrum:plan:finalized",
  "waterfall:lifecycle:updated", "waterfall:plan:updated",
  "project:archived", "project:restored", "team:deleted", "team:restored", "invitation:updated",
];

export function useDashboardSummary(teamIds: string[]) {
  const { token } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const id = ++requestId.current;
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/summary`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => null);
      if (id !== requestId.current) return; // a newer request superseded this one
      if (!res.ok || !data) throw new Error(data?.error || "Dashboard statistics are unavailable.");
      setSummary(data);
    } catch (e: any) {
      if (id !== requestId.current) return;
      setSummary(null);
      setError(e?.message || "Dashboard statistics are unavailable.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [token]);

  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { refresh(); }, 400);
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  const teamKey = teamIds.slice().sort().join(",");
  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    for (const teamId of teamKey ? teamKey.split(",") : []) socket.emit("room:join", { teamId });
    for (const ev of REFRESH_EVENTS) socket.on(ev, scheduleRefresh);
    socket.on("connect", scheduleRefresh); // reconnect → catch missed changes
    return () => {
      for (const ev of REFRESH_EVENTS) socket.off(ev, scheduleRefresh);
      socket.off("connect", scheduleRefresh);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [token, teamKey, scheduleRefresh]);

  return { summary, loading, error, refresh };
}
