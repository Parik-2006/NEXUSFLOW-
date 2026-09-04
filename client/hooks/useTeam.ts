/**
 * useTeam.ts — single team workspace data + member/algorithm operations.
 *   • team + members (REST)
 *   • addMember, setMemberSkill          → enables Branch & Bound
 *   • runAssignment (Branch & Bound)      → POST /assign
 *   • sprintOptimize (0/1 Knapsack)       → POST /sprint-optimize
 *   • leaveTeam (Member departure)        → POST /leave
 *   • deleteTeam (Owner only)             → DELETE /teams/:teamId
 *   • Real-time Socket.IO synchronization for team & member updates
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSocket } from "@/services/socket";
import type { Team, TeamMember } from "@/hooks/useTeams";
export type { Team, TeamMember } from "@/hooks/useTeams";
import { API_BASE_URL } from "@/utils/api";

const API = API_BASE_URL;

export type Assignment = {
  taskId: string; taskTitle: string; memberId: string; memberName: string; cost: number;
};
export type AssignResult = {
  assignments: Assignment[];
  totalCost: number;
  costMatrix: number[][];
  memberLabels: string[];
  taskLabels: string[];
  meta: { nodesExplored?: number; nodesPruned?: number; pruningRatio?: string; algorithm?: string; complexity?: { time: string; space: string } };
};

export type SprintTaskRow = {
  _id: string; title: string; status?: string;
  estimatedHours?: number; businessValue?: number; ratio?: number;
  selected?: boolean; reason?: string;
};
export type SprintResult = {
  selectedTasks: { _id: string; title: string; estimatedHours?: number; businessValue?: number }[];
  eligible?: SprintTaskRow[];
  ineligible?: SprintTaskRow[];
  totalValue: number; totalHours: number; totalEligible?: number;
  sprintCapacity: number; utilizationPct: number;
  algorithm: string; warning?: string | null; message?: string;
};

export function useTeam(teamId: string | undefined) {
  const { token } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const hydrate = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`${API}/api/teams/${teamId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 404) {
        // Team was deleted (or never existed). Surface a sentinel so the page
        // can safely redirect instead of leaving the user on a broken workspace.
        setTeam(null);
        setNotFound(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setTeam(data);
        setNotFound(false);
      }
    } finally {
      setLoading(false);
    }
  }, [teamId, token]);

  useEffect(() => { hydrate(); }, [hydrate]);

  // ── Real-time Socket.IO Subscriptions ──────────────────────────────────────
  useEffect(() => {
    if (!teamId || !token) return;
    const socket = getSocket(token);
    socket.emit("room:join", { teamId });

    const onMemberAdded = (payload: { teamId: string; member: TeamMember; team?: Team }) => {
      if (payload.teamId !== teamId) return;
      if (payload.team) {
        setTeam(payload.team);
      } else if (payload.member) {
        setTeam((prev) => {
          if (!prev) return prev;
          const members = prev.members || [];
          const exists = members.some(
            (m) =>
              (m.userId && payload.member.userId && m.userId === payload.member.userId) ||
              (m.name && payload.member.name && m.name.toLowerCase() === payload.member.name.toLowerCase())
          );
          if (exists) return prev;
          return { ...prev, members: [...members, payload.member] };
        });
      }
    };

    const onMemberRemoved = (payload: { teamId: string; userId: string; team?: Team }) => {
      if (payload.teamId !== teamId) return;
      if (payload.team) {
        setTeam(payload.team);
      } else {
        setTeam((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            members: (prev.members || []).filter(
              (m) => (m.userId || (m as any)._id) !== payload.userId
            ),
          };
        });
      }
    };

    const onMemberUpdated = (payload: { teamId: string; userId: string; team?: Team }) => {
      if (payload.teamId !== teamId) return;
      if (payload.team) {
        setTeam(payload.team);
      } else {
        hydrate();
      }
    };

    const onSkillsUpdated = (payload: { teamId: string; userId: string; skills: Record<string, number>; member?: TeamMember; team?: Team }) => {
      if (payload.teamId !== teamId) return;
      if (payload.team) {
        setTeam(payload.team);
      } else {
        setTeam((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            members: (prev.members || []).map((m) =>
              (m.userId === payload.userId || (m as any)._id === payload.userId)
                ? { ...m, skills: { ...m.skills, ...payload.skills } }
                : m
            ),
          };
        });
      }
    };

    const onTeamUpdated = (payload: { teamId: string; team?: Team }) => {
      if (payload.teamId !== teamId) return;
      if (payload.team) setTeam(payload.team);
      else hydrate();
    };

    const onTeamDeleted = (payload: { teamId: string }) => {
      if (payload.teamId === teamId) {
        setTeam(null);
        setNotFound(true);
      }
    };

    socket.on("member:added", onMemberAdded);
    socket.on("member:removed", onMemberRemoved);
    socket.on("member:updated", onMemberUpdated);
    socket.on("member:skills_updated", onSkillsUpdated);
    socket.on("team:updated", onTeamUpdated);
    socket.on("team:deleted", onTeamDeleted);
    socket.on("reconnect", hydrate);

    return () => {
      socket.emit("room:leave", { teamId });
      socket.off("member:added", onMemberAdded);
      socket.off("member:removed", onMemberRemoved);
      socket.off("member:updated", onMemberUpdated);
      socket.off("member:skills_updated", onSkillsUpdated);
      socket.off("team:updated", onTeamUpdated);
      socket.off("team:deleted", onTeamDeleted);
      socket.off("reconnect", hydrate);
    };
  }, [teamId, token, hydrate]);

  const members: TeamMember[] = team?.members ?? [];

  const addMember = useCallback(async (name: string, skills?: Record<string, number>): Promise<{ error?: string }> => {
    const res = await fetch(`${API}/api/teams/${teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, skills }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? "Failed to add member" };
    setTeam(data);
    return {};
  }, [teamId, token]);

  const inviteMemberByEmail = useCallback(async (email: string, role = "member"): Promise<{ error?: string; message?: string }> => {
    if (!token || !teamId) return { error: "Unauthorized or invalid team" };
    try {
      const res = await fetch(`${API}/api/teams/${teamId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role: role || "member" }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || "Failed to invite teammate" };
      return { message: data.message };
    } catch (e: any) {
      return { error: e.message || "Failed to send invitation" };
    }
  }, [teamId, token]);

  // Remove a member; server unassigns their tasks.
  const deleteMember = useCallback(async (userId: string, reason?: string): Promise<{ error?: string }> => {
    const res = await fetch(`${API}/api/teams/${teamId}/members/${userId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason: reason || "Removed by team leader" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error ?? "Failed to delete member" };
    setTeam(data);
    return {};
  }, [teamId, token]);

  // Leave Team (for normal members)
  const leaveTeam = useCallback(async (reason: string, explanation?: string): Promise<{ error?: string }> => {
    if (!token || !teamId) return { error: "Unauthorized or invalid team" };
    try {
      const res = await fetch(`${API}/api/teams/${teamId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason, explanation }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { error: data.error || "Failed to leave team" };
      setTeam(null);
      return {};
    } catch (e: any) {
      return { error: e.message || "Failed to leave team" };
    }
  }, [teamId, token]);

  // Delete Team (owner only)
  const deleteTeam = useCallback(async (): Promise<{ error?: string }> => {
    if (!token || !teamId) return { error: "Unauthorized or invalid team" };
    try {
      const res = await fetch(`${API}/api/teams/${teamId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { error: data.error || "Failed to delete team" };
      setTeam(null);
      return {};
    } catch (e: any) {
      return { error: e.message || "Failed to delete team" };
    }
  }, [teamId, token]);

  // Update member name / role (PATCH /members/:userId).
  const updateMember = useCallback(async (userId: string, fields: { name?: string; role?: string }): Promise<{ error?: string }> => {
    const res = await fetch(`${API}/api/teams/${teamId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(fields),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error ?? "Failed to update member" };
    setTeam(data);
    return {};
  }, [teamId, token]);

  const setMemberSkill = useCallback(async (userId: string, skill: string, value: number): Promise<{ error?: string }> => {
    const res = await fetch(`${API}/api/teams/${teamId}/members/${userId}/skills`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ [skill]: value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { return { error: data.error ?? "Failed to update skill" }; }
    if (data.team) {
      setTeam(data.team);
    } else {
      setTeam((prev) => prev ? {
        ...prev,
        members: (prev.members ?? []).map((m) => (m.userId === userId || (m as any)._id === userId) ? { ...m, skills: { ...m.skills, [skill]: value } } : m),
      } : prev);
    }
    return {};
  }, [teamId, token]);

  const updateMemberSkills = useCallback(async (userId: string, skills: Record<string, number>): Promise<{ error?: string }> => {
    const res = await fetch(`${API}/api/teams/${teamId}/members/${userId}/skills`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(skills),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error ?? "Failed to update skills" };
    if (data.team) {
      setTeam(data.team);
    } else {
      setTeam((prev) => prev ? {
        ...prev,
        members: (prev.members ?? []).map((m) => (m.userId === userId || (m as any)._id === userId) ? { ...m, skills: { ...m.skills, ...skills } } : m),
      } : prev);
    }
    return {};
  }, [teamId, token]);

  const runAssignment = useCallback(async (): Promise<{ result?: AssignResult; error?: string }> => {
    const res = await fetch(`${API}/api/teams/${teamId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ persist: true }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? "Assignment failed" };
    return { result: data };
  }, [teamId, token]);

  const sprintOptimize = useCallback(async (sprintHours: number): Promise<{ result?: SprintResult; error?: string }> => {
    const res = await fetch(`${API}/api/teams/${teamId}/sprint-optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sprintHours }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? "Optimization failed" };
    return { result: data };
  }, [teamId, token]);

  return {
    team,
    members,
    loading,
    notFound,
    refetch: hydrate,
    addMember,
    inviteMemberByEmail,
    deleteMember,
    leaveTeam,
    deleteTeam,
    updateMember,
    setMemberSkill,
    updateMemberSkills,
    runAssignment,
    sprintOptimize,
  };
}
