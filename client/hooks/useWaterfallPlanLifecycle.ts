import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";
import { getSocket } from "@/services/socket";

export interface WaterfallReadinessData {
  isReady: boolean;
  blockers: string[];
  details?: {
    isWaterfall?: boolean;
    hasArtifacts?: boolean;
    artifactCount?: number;
    approvedArtifactCount?: number;
    allArtifactsApproved?: boolean;
    analysisPerformed?: boolean;
    unresolvedConflictCount?: number;
    conflictsResolved?: boolean;
    documentReadinessConfirmed?: boolean;
    hasPermission?: boolean;
  };
}

export interface WaterfallLifecycleData {
  status:
    | "ARTIFACTS_PENDING"
    | "ANALYSIS_PENDING"
    | "PLAN_REVIEW_REQUIRED"
    | "AWAITING_FINALIZATION"
    | "PLAN_FINALIZED"
    | "TASKS_GENERATED"
    | "IN_EXECUTION"
    | "COMPLETED";
  planRevision: number;
  artifactAnalysisRevision: number;
  finalizedPlanRevision: number;
  taskGenerationRevision: number;
  documentReadinessConfirmed: boolean;
  readinessConfirmedAt?: string | null;
  conflicts?: any[];
  scope?: {
    goals?: any[];
    deliverables?: any[];
    constraints?: any[];
  };
}

export function useWaterfallPlanLifecycle(teamId?: string, projectId?: string) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lifecycle, setLifecycle] = useState<WaterfallLifecycleData | null>(null);
  const [readiness, setReadiness] = useState<WaterfallReadinessData | null>(null);
  const [methodology, setMethodology] = useState<string>("WATERFALL");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(projectId || null);

  const fetchLifecycle = useCallback(async () => {
    try {
      setLoading(true);
      let pId = resolvedProjectId;
      if (!pId && teamId) {
        const teamRes = await fetch(`${API_BASE_URL}/api/teams/${teamId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (teamRes.ok) {
          const teamData = await teamRes.json();
          pId = teamData.activeProjectId || teamData.project?._id || null;
          if (pId) setResolvedProjectId(pId);
        }
      }
      if (!pId) {
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/projects/${pId}/plan`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMethodology(data.methodology || "WATERFALL");
        const lc = data.waterfallPlanLifecycle || data.lifecycle || null;
        setLifecycle(lc);
        if (data.readiness) {
          setReadiness(data.readiness);
        }
        const unlocked = data.executionUnlocked ?? [
          "PLAN_FINALIZED",
          "TASKS_GENERATED",
          "IN_EXECUTION",
          "COMPLETED",
        ].includes(lc?.status);
        setIsUnlocked(unlocked);
      }
    } catch (e) {
      console.error("Error fetching waterfall lifecycle:", e);
    } finally {
      setLoading(false);
    }
  }, [teamId, resolvedProjectId, token]);

  useEffect(() => {
    fetchLifecycle();
  }, [fetchLifecycle]);

  // Subscribe to real-time socket events for cross-tab synchronization
  useEffect(() => {
    const socket = getSocket(token);
    if (!socket) return;

    const onLifecycleUpdated = (payload?: any) => {
      if (payload?.lifecycle) {
        setLifecycle(payload.lifecycle);
        const unlocked = [
          "PLAN_FINALIZED",
          "TASKS_GENERATED",
          "IN_EXECUTION",
          "COMPLETED",
        ].includes(payload.lifecycle.status);
        setIsUnlocked(unlocked);
      }
      if (payload?.readiness) {
        setReadiness(payload.readiness);
      }
      fetchLifecycle();
    };

    const onPlanFinalized = (payload?: any) => {
      setIsUnlocked(true);
      if (payload?.lifecycle) setLifecycle(payload.lifecycle);
      if (payload?.readiness) setReadiness(payload.readiness);
      fetchLifecycle();
    };

    const onGenericUpdate = () => {
      fetchLifecycle();
    };

    socket.on("waterfall:lifecycle:updated", onLifecycleUpdated);
    socket.on("waterfall:plan:finalized", onPlanFinalized);
    socket.on("waterfall:phase:updated", onGenericUpdate);
    socket.on("tasks:updated", onGenericUpdate);

    return () => {
      socket.off("waterfall:lifecycle:updated", onLifecycleUpdated);
      socket.off("waterfall:plan:finalized", onPlanFinalized);
      socket.off("waterfall:phase:updated", onGenericUpdate);
      socket.off("tasks:updated", onGenericUpdate);
    };
  }, [fetchLifecycle]);

  return {
    loading,
    lifecycle,
    readiness,
    methodology,
    isUnlocked,
    resolvedProjectId,
    refetchLifecycle: fetchLifecycle,
  };
}
