/**
 * useTeam.ts — single team workspace data + member/algorithm operations.
 *   • team + members (REST)
 *   • addMember, setMemberSkill          → enables Branch & Bound
 *   • runAssignment (Branch & Bound)      → POST /assign
 *   • sprintOptimize (0/1 Knapsack)       → POST /sprint-optimize
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { Team, TeamMember } from "@/hooks/useTeams";

const API = process.env.EXPO_PUBLIC_API_URL ?? "https://nexusflow-nxeg.onrender.com";

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

  const hydrate = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`${API}/api/teams/${teamId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setTeam(await res.json());
    } finally {
      setLoading(false);
    }
  }, [teamId, token]);

  useEffect(() => { hydrate(); }, [hydrate]);

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

  // Remove a member; server unassigns their tasks. Caller re-runs Branch &
  // Bound afterwards so the cost matrix / assignments recompute automatically.
  const deleteMember = useCallback(async (userId: string): Promise<{ error?: string }> => {
    const res = await fetch(`${API}/api/teams/${teamId}/members/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error ?? "Failed to delete member" };
    setTeam(data); // route returns the updated team (member row removed)
    return {};
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
    setTeam(data); // route returns the updated team
    return {};
  }, [teamId, token]);

  const setMemberSkill = useCallback(async (userId: string, skill: string, value: number): Promise<{ error?: string }> => {
    const res = await fetch(`${API}/api/teams/${teamId}/members/${userId}/skills`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ [skill]: value }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); return { error: d.error ?? "Failed" }; }
    // optimistic local update
    setTeam((prev) => prev ? {
      ...prev,
      members: (prev.members ?? []).map((m) => m.userId === userId ? { ...m, skills: { ...m.skills, [skill]: value } } : m),
    } : prev);
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

  return { team, members, loading, refetch: hydrate, addMember, deleteMember, updateMember, setMemberSkill, runAssignment, sprintOptimize };
}
