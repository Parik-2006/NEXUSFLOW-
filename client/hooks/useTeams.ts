import { useCallback, useEffect, useState } from "react";
import { getSocket } from "@/services/socket";
import { useAuth } from "@/context/AuthContext";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

export type TeamMember = {
  userId: string;
  name?: string;
  skills?: Record<string, number>;
};

export type Team = {
  _id: string;
  name: string;
  taskCount: number;
  doneCount: number;
  members?: TeamMember[];
};

export type NewTeamInput = {
  name: string;
  members?: { name: string; skills?: Record<string, number> }[];
  tasks?: { title: string; urgency?: number; impact?: number; businessValue?: number; estimatedHours?: number }[];
};

export function useTeams() {
  const { token } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // REST hydrate.
  const hydrate = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/teams`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTeams(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { hydrate(); }, [hydrate]);

  // ── Create a team ─────────────────────────────────────────────────────────
  const createTeam = useCallback(async (input: NewTeamInput): Promise<{ team?: Team; error?: string }> => {
    try {
      const res = await fetch(`${API}/api/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error ?? "Failed to create team" };
      setTeams((prev) => [data, ...prev]);
      return { team: data };
    } catch (e: any) {
      return { error: e.message };
    }
  }, [token]);

  // ── Delete a team ─────────────────────────────────────────────────────────
  const deleteTeam = useCallback(async (teamId: string): Promise<{ error?: string }> => {
    try {
      const res = await fetch(`${API}/api/teams/${teamId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); return { error: d.error ?? "Failed to delete" }; }
      setTeams((prev) => prev.filter((t) => t._id !== teamId));
      return {};
    } catch (e: any) {
      return { error: e.message };
    }
  }, [token]);

  // ── Join a team (add the current user as a member) ────────────────────────
  const joinTeam = useCallback(async (teamId: string, name: string): Promise<{ error?: string }> => {
    try {
      const res = await fetch(`${API}/api/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error ?? "Failed to join" };
      setTeams((prev) => prev.map((t) => (t._id === teamId ? data : t)));
      return {};
    } catch (e: any) {
      return { error: e.message };
    }
  }, [token]);

  /**
   * recomputeProgress — adjust a team's doneCount when a task transitions
   * between statuses, using the task's previous status to avoid double counting.
   */
  const recomputeProgress = useCallback(
    (teamId: string, prevStatus: string, nextStatus: string) => {
      setTeams((prev) =>
        prev.map((t) => {
          if (t._id !== teamId) return t;
          const wasDone = prevStatus === "done";
          const isDone = nextStatus === "done";
          let doneCount = t.doneCount;
          if (!wasDone && isDone) doneCount += 1;   // moved into done
          if (wasDone && !isDone) doneCount -= 1;   // moved out of done
          return { ...t, doneCount: Math.max(0, Math.min(doneCount, t.taskCount)) };
        })
      );
    },
    []
  );

  // Subscribe to live task transitions to keep progress bars accurate.
  useEffect(() => {
    const socket = getSocket(token);
    const onTaskUpdated = (p: { teamId: string; prevStatus: string; status: string }) =>
      recomputeProgress(p.teamId, p.prevStatus, p.status);

    socket.on("task:updated", onTaskUpdated);
    // Reconnection replay: when the socket comes back, refetch to catch missed deltas.
    socket.on("reconnect", hydrate);

    return () => {
      socket.off("task:updated", onTaskUpdated);
      socket.off("reconnect", hydrate);
    };
  }, [token, recomputeProgress, hydrate]);

  return { teams, loading, error, refetch: hydrate, recomputeProgress, createTeam, deleteTeam, joinTeam };
}
