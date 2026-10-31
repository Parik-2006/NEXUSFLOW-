/**
 * client/components/workspace/ScrumInsightsPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM INSIGHTS ARCHITECTURE (6 SUBTABS)
 *
 * Implements:
 *   1. Project Health (Sprint Goal Trajectory, Capacity Alignment, Dependency Flow, Carry-over Risk)
 *   2. Sprint Analytics (Burndown trajectory, planned vs completed work, completed sprint velocity, task status flow)
 *   3. Learning Loop (Retrospectives by sprint, action items with owner/due date/status, carried actions)
 *   4. Capability (Team availability, planned workload vs capacity, workload allocation per member)
 *   5. Risk Radar (Deterministic blockers, aging tasks, cross-sprint dependencies, capacity overruns)
 *   6. Dependency DAG (Visual graph of upstream prerequisites & downstream dependents with cycle warnings)
 *   + Data Provenance Indicator Banner (Actual Project vs Example Demo Mode)
 * ============================================================================
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { useToast, ModalSheet } from "@/components/feedback";
import { Card, SkeletonCard, ProgressBar, Badge, Button, EmptyState } from "@/components/ui";
import DependencyFlowGraph from "@/components/workspace/DependencyFlowGraph";
import DependencyGraphPanel from "@/components/DependencyGraphPanel";
import type { GraphNode, GraphEdge } from "@/hooks/useDependencyGraph";
import HealthScoreGauge from "@/components/workspace/HealthScoreGauge";
import {
  fetchScrumAnalytics,
  fetchScrumInsights,
  bulkAcceptScrumAssignments,
  fetchScrumHealth,
  refreshScrumHealth,
  fetchScrumRisks,
  scanScrumRisks,
  updateScrumRiskStatus,
  fetchSprints,
  fetchScrumBacklog,
  fetchScrumDependencies,
  addScrumDependency,
  fetchScrumCapacity,
  acceptScrumAssignment,
} from "@/services/scrumApiService";
import { colors, spacing, radius, font } from "@/theme";

type ScrumInsightSubTab = "health" | "analytics" | "capability" | "risks" | "dag";

interface SubTabOption {
  key: ScrumInsightSubTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const SUB_TABS: SubTabOption[] = [
  { key: "health",     label: "Project Health",    icon: "shield-checkmark-outline", color: colors.primary },
  { key: "analytics",  label: "Sprint Analytics",   icon: "trending-up-outline",      color: "#2563eb" },
  { key: "capability", label: "Capability",         icon: "people-outline",           color: colors.branch },
  { key: "risks",      label: "Risk Radar",         icon: "alert-circle-outline",     color: colors.warning },
  { key: "dag",        label: "Dependency DAG",     icon: "git-network-outline",       color: colors.topo },
];

export default function ScrumInsightsPanel({ teamId }: { teamId: string }) {
  const { user, token } = useAuth();
  const { team } = useTeam(teamId);
  const toast = useToast();

  const [activeSubTab, setActiveSubTab] = useState<ScrumInsightSubTab>("health");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Live Persisted Data States
  const [health, setHealth] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [sprints, setSprints] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [depData, setDepData] = useState<any>(null);

  // Sprint Analytics State (Grounded in authoritative MongoDB records)
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [selectedAnalyticsSprintId, setSelectedAnalyticsSprintId] = useState<string | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const handleSelectAnalyticsSprint = async (sprintId: string) => {
    setSelectedAnalyticsSprintId(sprintId);
    setLoadingAnalytics(true);
    try {
      const data = await fetchScrumAnalytics(teamId, sprintId, token);
      setAnalyticsData(data);
    } catch (err: any) {
      toast(err.message || "Failed to load sprint analytics", "error");
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // Mode: "actual" vs "example"
  const [dataMode, setDataMode] = useState<"example" | "actual">("actual");

  // Health & Risk Radar State
  const [recalculatingHealth, setRecalculatingHealth] = useState(false);
  const [scrumRisks, setScrumRisks] = useState<any[]>([]);
  const [riskCounts, setRiskCounts] = useState<{ open: number; acknowledged: number; resolved: number; all: number }>({
    open: 0,
    acknowledged: 0,
    resolved: 0,
    all: 0,
  });
  const [riskFilter, setRiskFilter] = useState<"open" | "acknowledged" | "resolved" | "all">("open");
  const [updatingRiskId, setUpdatingRiskId] = useState<string | null>(null);
  const [scanningRisks, setScanningRisks] = useState(false);

  // Capability Intelligence & Dynamic Assignment State
  const [capacityData, setCapacityData] = useState<any | null>(null);
  const [acceptingAssignId, setAcceptingAssignId] = useState<string | null>(null);

  // Bulk Assignment Modal & Execution State
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [allowOverrun, setAllowOverrun] = useState(false);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<any>(null);

  const handleExecuteBulkAssignment = async (eligibleAssignments: any[]) => {
    if (bulkAssigning) return;
    setBulkAssigning(true);
    try {
      const payload = eligibleAssignments.map((a: any) => ({
        taskId: a.taskId,
        memberId: a.recommendedMemberId,
      }));
      const res = await bulkAcceptScrumAssignments(teamId, payload, allowOverrun, token);
      setBulkSummary(res);
      toast(res.message || `Bulk assignment complete: ${res.assignedCount} stories assigned.`, "success");
      await loadData();
    } catch (err: any) {
      toast(err.message || "Failed to execute bulk assignment", "error");
    } finally {
      setBulkAssigning(false);
    }
  };

  const handleAcceptAssignment = async (taskId: string, memberId: string) => {
    if (acceptingAssignId) return;
    setAcceptingAssignId(taskId);
    try {
      await acceptScrumAssignment(teamId, taskId, memberId, token);
      toast("Assignment accepted and persisted.", "success");
      await loadData();
    } catch (err: any) {
      toast(err.message || "Failed to persist assignment", "error");
    } finally {
      setAcceptingAssignId(null);
    }
  };

  const handleRecalculateHealth = async () => {
    setRecalculatingHealth(true);
    try {
      const res = await refreshScrumHealth(teamId, token);
      setHealth(res);
      toast("Scrum project health recalculated from live persisted state", "success");
    } catch (err: any) {
      toast(err.message || "Failed to recalculate health", "error");
    } finally {
      setRecalculatingHealth(false);
    }
  };

  const handleScanRisks = async () => {
    setScanningRisks(true);
    try {
      const res = await scanScrumRisks(teamId, token);
      if (res?.counts) setRiskCounts(res.counts);
      if (res?.risks) {
        const filtered = riskFilter === "all" ? res.risks : res.risks.filter((r: any) => r.status === riskFilter);
        setScrumRisks(filtered);
      }
      const count = res?.count ?? res?.risks?.length ?? 0;
      toast(`Scrum risk scan complete: ${count} trigger(s) evaluated`, count > 0 ? "info" : "success");
      await loadData();
    } catch (err: any) {
      toast(err.message || "Failed to scan risks", "error");
    } finally {
      setScanningRisks(false);
    }
  };

  const handleUpdateRiskStatus = async (riskId: string, newStatus: "acknowledged" | "resolved") => {
    if (updatingRiskId) return;
    setUpdatingRiskId(riskId);
    try {
      await updateScrumRiskStatus(teamId, riskId, newStatus, token);
      toast(`Risk marked as ${newStatus}`, "success");
      setRiskCounts((prev) => {
        const target = scrumRisks.find((r) => r._id === riskId);
        const oldStatus = target?.status || "open";
        if (oldStatus === newStatus) return prev;
        return {
          ...prev,
          [oldStatus]: Math.max(0, (prev as any)[oldStatus] - 1),
          [newStatus]: (prev as any)[newStatus] + 1,
        };
      });
      setScrumRisks((prev) => {
        if (riskFilter === "all") {
          return prev.map((r) => (r._id === riskId ? { ...r, status: newStatus } : r));
        }
        if (riskFilter === newStatus) {
          return prev.map((r) => (r._id === riskId ? { ...r, status: newStatus } : r));
        }
        return prev.filter((r) => r._id !== riskId);
      });
      await loadData();
    } catch (err: any) {
      toast(err.message || "Failed to update risk status", "error");
    } finally {
      setUpdatingRiskId(null);
    }
  };

  // Add Dependency Modal State
  const [showAddDep, setShowAddDep] = useState(false);
  const [depFirst, setDepFirst] = useState("");
  const [depThen, setDepThen] = useState("");
  const [addingDep, setAddingDep] = useState(false);

  const handleAddDependency = async () => {
    if (!depFirst || !depThen) {
      toast("Pick both tasks", "error");
      return;
    }
    if (depFirst === depThen) {
      toast("Invalid dependency — a task cannot depend on itself.", "error");
      return;
    }
    setAddingDep(true);
    try {
      await addScrumDependency(teamId, depFirst, depThen, token);
      toast("Dependency added successfully — graph updated.", "success");
      setDepFirst("");
      setDepThen("");
      setShowAddDep(false);
      await loadData();
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("cycle") || msg.includes("Cycle")) {
        toast("Cycle detected — cannot create this dependency because it introduces a cycle.", "error");
      } else if (msg.includes("already exists") || msg.includes("duplicate")) {
        toast("Duplicate dependency — this dependency already exists.", "error");
      } else if (msg.includes("itself")) {
        toast("Invalid dependency — a task cannot depend on itself.", "error");
      } else {
        toast(err.message || "Failed to add dependency", "error");
      }
    } finally {
      setAddingDep(false);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const [hRes, insRes, sprintRes, backlogRes, depRes, riskRes, capRes, analyticsRes] = await Promise.all([
        fetchScrumHealth(teamId, token).catch(() => null),
        fetchScrumInsights(teamId, token).catch(() => null),
        fetchSprints(teamId, token).catch(() => ({ sprints: [] })),
        fetchScrumBacklog(teamId, token).catch(() => ({ items: [] })),
        fetchScrumDependencies(teamId, token).catch(() => null),
        fetchScrumRisks(teamId, riskFilter, token).catch(() => null),
        fetchScrumCapacity(teamId, token).catch(() => null),
        fetchScrumAnalytics(teamId, selectedAnalyticsSprintId, token).catch(() => null),
      ]);

      setHealth(hRes);
      setInsights(insRes);
      setSprints(sprintRes?.sprints || []);
      setTasks(backlogRes?.items || []);
      setDepData(depRes);
      setCapacityData(capRes);
      setAnalyticsData(analyticsRes);

      if (riskRes?.risks) setScrumRisks(riskRes.risks);
      if (riskRes?.counts) setRiskCounts(riskRes.counts);

      const hasRealData = (sprintRes?.sprints?.length || 0) > 0 || (backlogRes?.items?.length || 0) > 0;
      if (hasRealData) {
        setDataMode("actual");
      }
    } catch (err: any) {
      toast("Could not refresh some analytics", "info");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, token, riskFilter, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const hasLiveRecords = sprints.length > 0 || tasks.length > 0;
  const isDemo = dataMode === "example" && !hasLiveRecords;

  // Active sprint and planning sprints
  const activeSprint = useMemo(() => {
    return sprints.find((s) => s.status === "ACTIVE") || null;
  }, [sprints]);

  const planningSprints = useMemo(() => {
    return sprints.filter((s) => s.status === "PLANNING");
  }, [sprints]);

  const currentUserId = (user?._id || user?.id)?.toString();
  const isOwner = Boolean(team?.ownerId && currentUserId && team.ownerId.toString() === currentUserId);
  const isLeader = Boolean(
    isOwner ||
    user?.role === "leader" ||
    user?.role === "admin" ||
    (team?.members || []).some(
      (m: any) =>
        (m.userId?._id || m.userId)?.toString() === currentUserId &&
        ["owner", "leader", "team leader", "manager", "project manager", "scrum master"].includes(
          (m.role || "").toLowerCase()
        )
    )
  );

  const memberMap = useMemo(() => {
    return new Map((team?.members || []).map((m: any) => [String(m.userId?._id || m.userId), m.name]));
  }, [team]);

  // Calculations for Actual Mode - Honest & Grounded
  const liveHealthScore = useMemo(() => {
    if (!hasLiveRecords || !activeSprint || health?.insufficientData) return null;
    if (health?.healthScore !== undefined && health?.healthScore !== null) return health.healthScore;
    if (health?.health?.healthScore !== undefined && health?.health?.healthScore !== null) return health.health.healthScore;

    // Deterministic calculation ONLY when an active sprint with tasks exists
    const sprintTasks = tasks.filter((t) => t.sprintId === activeSprint._id);
    if (sprintTasks.length === 0) return null;
    const completed = sprintTasks.filter((t) => t.status === "done" || t.status === "COMPLETED").length;
    const blocked = sprintTasks.filter((t) => t.status === "blocked").length;
    const compRate = completed / sprintTasks.length;
    const blockedPenalty = (blocked / sprintTasks.length) * 40;
    return Math.max(0, Math.min(100, Math.round(compRate * 100 - blockedPenalty)));
  }, [hasLiveRecords, activeSprint, health, tasks]);

  // Backlog readiness calculation for pre-sprint / planning state
  const backlogReadiness = useMemo(() => {
    if (tasks.length === 0) return null;
    const estimated = tasks.filter((t) => (t.storyPoints || 0) > 0).length;
    const withAcceptance = tasks.filter((t) => Array.isArray(t.acceptanceCriteria) && t.acceptanceCriteria.length > 0).length;
    const estimatedPct = Math.round((estimated / tasks.length) * 100);
    const criteriaPct = Math.round((withAcceptance / tasks.length) * 100);
    const readinessScore = Math.round((estimatedPct + criteriaPct) / 2);
    return {
      total: tasks.length,
      estimated,
      withAcceptance,
      readinessScore,
    };
  }, [tasks]);

  // Factors calculation
  const healthFactors = useMemo(() => {
    if (isDemo) {
      return [
        { name: "Sprint Goal Trajectory", score: 88, status: "healthy", desc: "Sprint tasks on track to meet stated goal" },
        { name: "Capacity Alignment", score: 82, status: "healthy", desc: "Committed hours within team capacity limits" },
        { name: "Dependency Flow", score: 75, status: "attention", desc: "1 cross-sprint prerequisite identified" },
        { name: "Carry-over Risk", score: 90, status: "healthy", desc: "Low probability of unfinished story carry-over" },
      ];
    }

    if (!activeSprint || tasks.length === 0) {
      return [];
    }

    const sprintTasks = tasks.filter((t) => t.sprintId === activeSprint._id);
    if (sprintTasks.length === 0) return [];

    const totalPts = sprintTasks.reduce((acc, t) => acc + (t.storyPoints || 0), 0);
    const donePts = sprintTasks.filter((t) => t.status === "done" || t.status === "COMPLETED").reduce((acc, t) => acc + (t.storyPoints || 0), 0);
    const blockedTasks = sprintTasks.filter((t) => t.status === "blocked");

    const goalScore = totalPts > 0 ? Math.round((donePts / totalPts) * 100) : 0;
    const capScore = activeSprint.capacityHours && activeSprint.totalHours
      ? Math.max(0, Math.min(100, Math.round((1 - Math.max(0, activeSprint.totalHours - activeSprint.capacityHours) / activeSprint.capacityHours) * 100)))
      : 100;
    const depScore = blockedTasks.length === 0 ? 95 : Math.max(20, 100 - blockedTasks.length * 25);
    const carryScore = blockedTasks.length > 0 ? 60 : 90;

    return [
      { name: "Sprint Goal Trajectory", score: goalScore, status: goalScore >= 70 ? "healthy" : "attention", desc: `${donePts} of ${totalPts} story points completed` },
      { name: "Capacity Alignment", score: capScore, status: capScore >= 80 ? "healthy" : "attention", desc: activeSprint.capacityHours ? `${activeSprint.totalHours || 0}h committed / ${activeSprint.capacityHours}h capacity` : "Team capacity defined" },
      { name: "Dependency Flow", score: depScore, status: depScore >= 75 ? "healthy" : "warning", desc: `${blockedTasks.length} blocked tasks in sprint` },
      { name: "Carry-over Risk", score: carryScore, status: carryScore >= 75 ? "healthy" : "warning", desc: blockedTasks.length > 0 ? "Blocked items increase carry-over likelihood" : "Normal carry-over profile" },
    ];
  }, [isDemo, activeSprint, tasks]);

  // Velocity by completed sprint
  const completedSprintVelocity = useMemo(() => {
    const completed = sprints.filter((s) => s.status === "COMPLETED");
    if (completed.length === 0) return [];
    return completed.map((s) => {
      const sTasks = tasks.filter((t) => t.sprintId === s._id);
      const points = sTasks.filter((t) => t.status === "done" || t.status === "COMPLETED").reduce((acc, t) => acc + (t.storyPoints || 0), 0);
      return {
        sprintNumber: s.number,
        sprintName: s.name,
        velocityPoints: points || s.velocity || 0,
        taskCount: sTasks.length,
      };
    });
  }, [sprints, tasks]);

  // DAG nodes and edges
  const dagNodes: GraphNode[] = useMemo(() => {
    const sourceList = depData?.nodes && depData.nodes.length > 0 ? depData.nodes : tasks;
    return sourceList.map((t: any) => ({
      id: (t._id || t.id).toString(),
      title: t.title,
      status: (t.scrumStatus || t.status || "todo").toLowerCase().includes("done")
        ? "done"
        : (t.scrumStatus || t.status || "").toLowerCase().includes("prog")
        ? "in_progress"
        : "todo",
      priority: t.priorityScore || t.priority || 50,
      priorityLabel: t.priorityLabel || null,
      estimatedHours: t.estimatedHours || 0,
      assignee: t.assignedName || t.assignedTo || null,
      dueDate: t.dueDate || null,
      dependencies: (t.dependencies || []).map((d: any) => (typeof d === "string" ? d : d._id || d.id || String(d))),
    }));
  }, [depData, tasks]);

  const dagEdges: GraphEdge[] = useMemo(() => {
    if (depData?.edges && Array.isArray(depData.edges) && depData.edges.length > 0) {
      return depData.edges.map((e: any) => ({
        from: e.from?.toString(),
        to: e.to?.toString(),
      }));
    }
    const taskMap = new Map(tasks.map((t: any) => [(t._id || t.id)?.toString(), t]));
    const edges: GraphEdge[] = [];
    tasks.forEach((t: any) => {
      const targetId = (t._id || t.id)?.toString();
      (t.dependencies || []).forEach((dep: any) => {
        const depId = typeof dep === "string" ? dep : dep?._id?.toString() || dep?.id?.toString();
        if (depId && taskMap.has(depId) && targetId) {
          edges.push({ from: depId, to: targetId });
        }
      });
    });
    return edges;
  }, [depData, tasks]);

  const resolvedTasksWithDeps = useMemo(() => {
    const taskMap = new Map(tasks.map((t: any) => [(t._id || t.id)?.toString(), t]));
    return tasks
      .filter((t: any) => Array.isArray(t.dependencies) && t.dependencies.length > 0)
      .map((t: any) => ({
        ...t,
        resolvedPrereqs: (t.dependencies || []).map((depId: any) => {
          const dStr = typeof depId === "string" ? depId : depId?._id?.toString() || depId?.id?.toString() || String(depId);
          const prereq = taskMap.get(dStr);
          return prereq ? prereq.title : `Prerequisite (${dStr.slice(-4)})`;
        }),
      }));
  }, [tasks]);

  // Render SubTab Content
  const renderContent = () => {
    switch (activeSubTab) {
      // ── 1. Project Health ──────────────────────────────────────────────────
      // ── 1. Project Health (Waterfall-Parity Scrum Implementation) ──────────
      case "health": {
        const overallScore = health?.overallScore ?? health?.healthScore ?? liveHealthScore;
        const healthGrade = health?.grade || (overallScore !== null ? (overallScore >= 90 ? "A+" : overallScore >= 80 ? "A" : overallScore >= 70 ? "B" : overallScore >= 60 ? "C" : overallScore >= 50 ? "D" : "F") : "N/A");
        const healthStatus = health?.status || (overallScore !== null ? (overallScore >= 80 ? "HEALTHY" : overallScore >= 60 ? "NEEDS_ATTENTION" : "CRITICAL") : "INSUFFICIENT_DATA");
        const isPlanningScope = health?.assessmentScope === "PROJECT_PLANNING" || !activeSprint;
        const indicators = health?.indicators && health.indicators.length > 0 ? health.indicators : healthFactors;
        const warnings = health?.warnings || [];

        return (
          <View style={s.subSection}>
            {/* SECTION A — OVERALL SCRUM PROJECT HEALTH (Circular Health Score Gauge) */}
            <HealthScoreGauge
              score={overallScore}
              grade={healthGrade}
              status={healthStatus}
              assessmentScope={isPlanningScope ? "PROJECT PLANNING HEALTH" : "ACTIVE SPRINT DELIVERY"}
              methodologyLabel="Scrum"
              summary={health?.summary}
              calculatedAt={health?.calculatedAt || health?.timestamp || (health ? new Date() : null)}
              criticalFactors={health?.criticalFactors || warnings.filter((w: any) => w.severity === "CRITICAL" || w.severity === "HIGH").map((w: any) => w.message || w.title || w.finding)}
              onRecalculate={handleRecalculateHealth}
              isRecalculating={recalculatingHealth}
              title="Overall Scrum Project Health"
            />

            <View style={[s.metricCard, { marginTop: -4 }]}>
              {/* Scope Notice Banner */}
              {isPlanningScope ? (
                <View style={[s.emptyNoticeBox, { marginTop: 12, backgroundColor: "#eff6ff", borderColor: "#bfdbfe" }]}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.emptyNoticeTitle, { color: colors.primary }]}>Pre-Sprint Planning Health Active</Text>
                    <Text style={[s.emptyNoticeTxt, { color: "#1e40af" }]}>
                      Health is evaluated from Product Backlog readiness, estimation coverage, scope consistency, and team capacity feasibility. Sprint execution delivery metrics will track once an active sprint is running.
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Quick Stat Summary Pills */}
              <View style={[s.pillRow, { marginTop: 12 }]}>
                <View style={s.statPill}>
                  <Text style={s.statPillNum}>{health?.backlogReadiness?.score ?? backlogReadiness?.readinessScore ?? 0}%</Text>
                  <Text style={s.statPillLbl}>Backlog Readiness</Text>
                </View>
                <View style={s.statPill}>
                  <Text style={s.statPillNum}>{health?.workloadAndCapacity?.utilizationRate ?? 0}%</Text>
                  <Text style={s.statPillLbl}>Capacity Utilization</Text>
                </View>
                <View style={s.statPill}>
                  <Text style={[s.statPillNum, { color: riskCounts.open > 0 ? colors.warning : colors.success }]}>
                    {riskCounts.open}
                  </Text>
                  <Text style={s.statPillLbl}>Open Risks</Text>
                </View>
                <View style={s.statPill}>
                  <Text style={s.statPillNum}>
                    {activeSprint ? tasks.filter((t) => t.sprintId === activeSprint._id).length : tasks.length}
                  </Text>
                  <Text style={s.statPillLbl}>{activeSprint ? "Sprint Tasks" : "Total Stories"}</Text>
                </View>
              </View>
            </View>

            {/* SECTION B — CONTRIBUTING CONSTRAINTS & CRITICAL WARNINGS */}
            <SectionHead
              icon="warning-outline"
              tint="#ea580c"
              title="Contributing Constraints & Critical Warnings"
              sub="Immediate delivery constraints and advisories requiring Scrum Master / team intervention"
            />
            {warnings.length > 0 ? (
              <View style={{ gap: 8 }}>
                {warnings.map((w: any, idx: number) => {
                  const borderCol = w.severity === "CRITICAL" ? "#dc2626" : w.severity === "HIGH" ? "#ea580c" : colors.primary;
                  return (
                    <View key={w._id || idx} style={[s.warningCard, { borderLeftColor: borderCol }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Badge
                            label={w.severity}
                            variant={w.severity === "CRITICAL" ? "danger" : w.severity === "HIGH" ? "warning" : "info"}
                            size="sm"
                          />
                          <Badge label={w.category || "GENERAL"} variant="neutral" size="sm" />
                          <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.text }}>{w.title}</Text>
                        </View>
                      </View>

                      <Text style={{ fontSize: 12.5, color: colors.text, marginTop: 4, lineHeight: 18 }}>
                        {w.message}
                      </Text>

                      {w.evidence && (
                        <View style={s.warningEvidenceBox}>
                          <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "600" }}>
                            Evidence: {typeof w.evidence === "string" ? w.evidence : JSON.stringify(w.evidence)}
                          </Text>
                        </View>
                      )}

                      {w.recommendedAction && (
                        <View style={s.warningActionBox}>
                          <Ionicons name="bulb-outline" size={14} color={colors.primary} />
                          <Text style={{ fontSize: 11.5, color: colors.primary, fontWeight: "600", flex: 1 }}>
                            Action: {w.recommendedAction}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={s.safeRiskBox}>
                <Ionicons name="checkmark-circle-outline" size={22} color="#16a34a" />
                <View style={{ flex: 1 }}>
                  <Text style={s.safeRiskTitle}>No Critical Delivery Warnings Detected</Text>
                  <Text style={s.safeRiskTxt}>
                    Team capacity, task dependencies, and backlog definitions are aligned within normal operating bounds.
                  </Text>
                </View>
              </View>
            )}

            {/* SECTION C — CORE HEALTH INDICATORS */}
            <SectionHead
              icon="pulse-outline"
              tint={colors.primary}
              title="Core Health Indicators"
              sub="7 deterministic Scrum dimensions evaluating planning readiness, sprint delivery, and capacity"
            />
            <View style={s.metricCard}>
              <View style={{ gap: 12 }}>
                {indicators.map((factor: any, idx: number) => {
                  const isAvailable = factor.isAvailable !== false;
                  const scoreVal = typeof factor.score === "number" ? factor.score : 0;
                  const col = !isAvailable
                    ? "#94a3b8"
                    : scoreVal >= 75
                    ? "#16a34a"
                    : scoreVal >= 55
                    ? "#d97706"
                    : "#dc2626";

                  return (
                    <View key={factor.key || idx} style={s.factorRow}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={s.factorName}>{factor.name}</Text>
                            {!isAvailable && (
                              <Badge label="AWAITING SPRINT" variant="neutral" size="sm" />
                            )}
                          </View>
                          <Text style={[s.factorScore, { color: col }]}>
                            {isAvailable ? `${scoreVal}%` : "N/A"}
                          </Text>
                        </View>
                        <ProgressBar
                          progress={isAvailable ? scoreVal / 100 : 0}
                          color={col}
                        />
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={s.factorDesc}>{factor.desc}</Text>
                          {factor.denominator && (
                            <Text style={{ fontSize: 10, color: colors.textMuted }}>Scope: {factor.denominator}</Text>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* SECTION D — SPRINT LIFECYCLE STATE */}
            <SectionHead
              icon="repeat-outline"
              tint="#2563eb"
              title="Sprint Lifecycle State"
              sub="Current sprint commitment, completion, and task flow"
            />
            <View style={s.metricCard}>
              {activeSprint ? (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: 14.5, fontWeight: "800", color: colors.text }}>
                      Sprint {activeSprint.number || activeSprint.sprintNumber || 1}: {activeSprint.name}
                    </Text>
                    <Badge label={activeSprint.status} variant={activeSprint.status === "ACTIVE" ? "info" : "neutral"} />
                  </View>
                  {activeSprint.goal ? (
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                      <Text style={{ fontWeight: "700" }}>Sprint Goal: </Text>{activeSprint.goal}
                    </Text>
                  ) : null}
                  <View style={s.pillRow}>
                    <View style={s.statPill}>
                      <Text style={s.statPillNum}>{tasks.filter((t) => t.sprintId === activeSprint._id).length}</Text>
                      <Text style={s.statPillLbl}>Committed Tasks</Text>
                    </View>
                    <View style={s.statPill}>
                      <Text style={s.statPillNum}>
                        {tasks.filter((t) => t.sprintId === activeSprint._id && (t.status === "done" || t.status === "COMPLETED")).length}
                      </Text>
                      <Text style={s.statPillLbl}>Completed</Text>
                    </View>
                    <View style={s.statPill}>
                      <Text style={[s.statPillNum, { color: "#dc2626" }]}>
                        {tasks.filter((t) => t.sprintId === activeSprint._id && t.status === "blocked").length}
                      </Text>
                      <Text style={s.statPillLbl}>Blocked</Text>
                    </View>
                    <View style={s.statPill}>
                      <Text style={s.statPillNum}>
                        {tasks.filter((t) => t.sprintId === activeSprint._id).reduce((s, t) => s + (t.storyPoints || 0), 0)} pts
                      </Text>
                      <Text style={s.statPillLbl}>Total Points</Text>
                    </View>
                  </View>
                </View>
              ) : planningSprints.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: 14.5, fontWeight: "800", color: colors.text }}>
                      {planningSprints[0].name} (Planning Phase)
                    </Text>
                    <Badge label="PLANNING" variant="neutral" />
                  </View>
                  {planningSprints[0].goal ? (
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                      <Text style={{ fontWeight: "700" }}>Proposed Goal: </Text>{planningSprints[0].goal}
                    </Text>
                  ) : null}
                  <View style={s.pillRow}>
                    <View style={s.statPill}>
                      <Text style={s.statPillNum}>{tasks.filter((t) => t.sprintId === planningSprints[0]._id).length}</Text>
                      <Text style={s.statPillLbl}>Committed Stories</Text>
                    </View>
                    <View style={s.statPill}>
                      <Text style={s.statPillNum}>
                        {tasks.filter((t) => t.sprintId === planningSprints[0]._id).reduce((s, t) => s + (t.storyPoints || 0), 0)} pts
                      </Text>
                      <Text style={s.statPillLbl}>Committed Points</Text>
                    </View>
                    <View style={s.statPill}>
                      <Text style={s.statPillNum}>{tasks.filter((t) => !t.sprintId).length}</Text>
                      <Text style={s.statPillLbl}>Unassigned Backlog</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={s.emptyNoticeBox}>
                  <Text style={s.emptyNoticeTxt}>No active or planning sprint found. Use Sprint Planning to commit backlog work.</Text>
                </View>
              )}
            </View>
          </View>
        );
      }

      // ── 2. Sprint Analytics (Authoritative Grounded Experience) ───────────
      case "analytics": {
        const curSprint = analyticsData?.selectedSprint || activeSprint || (sprints.length > 0 ? sprints[0] : null);
        const availableSprints = analyticsData?.sprints || sprints;
        const ov = analyticsData?.overview || {
          totalCommittedStories: tasks.filter((t) => t.sprintId === curSprint?._id).length,
          totalCommittedPoints: tasks.filter((t) => t.sprintId === curSprint?._id).reduce((s: number, t: any) => s + (t.storyPoints || 0), 0),
          completedStories: tasks.filter((t) => t.sprintId === curSprint?._id && (t.status === "done" || t.status === "COMPLETED")).length,
          completedPoints: tasks.filter((t) => t.sprintId === curSprint?._id && (t.status === "done" || t.status === "COMPLETED")).reduce((s: number, t: any) => s + (t.storyPoints || 0), 0),
          remainingStories: 0,
          remainingPoints: 0,
          storyCompletionPct: 0,
          pointCompletionPct: 0,
          totalEstimatedHours: 0,
          actualLoggedHours: null,
          daysElapsed: null,
          daysRemaining: null,
          totalDurationDays: curSprint?.durationDays || 14,
        };

        const burndown = analyticsData?.burndown;
        const velocity = analyticsData?.velocity || {
          averageVelocity: 0,
          highestVelocity: 0,
          lowestVelocity: 0,
          totalCompletedStoryPoints: 0,
          completedSprintCount: 0,
          history: completedSprintVelocity.map((v) => ({
            sprintNumber: v.sprintNumber,
            name: v.sprintName,
            plannedPoints: v.velocityPoints,
            completedPoints: v.velocityPoints,
            completedTaskCount: v.taskCount,
          })),
        };

        const dist = analyticsData?.distribution || {
          todo: { count: 0, storyPoints: 0, percentage: 0 },
          in_progress: { count: 0, storyPoints: 0, percentage: 0 },
          in_review: { count: 0, storyPoints: 0, percentage: 0 },
          blocked: { count: 0, storyPoints: 0, percentage: 0 },
          done: { count: 0, storyPoints: 0, percentage: 0 },
          totalSprintTasks: 0,
        };

        const cap = analyticsData?.capacity;
        const scope = analyticsData?.scope;
        const prov = analyticsData?.provenance;

        const sumTasks = (dist.todo?.count || 0) + (dist.in_progress?.count || 0) + (dist.in_review?.count || 0) + (dist.blocked?.count || 0) + (dist.done?.count || 0);

        return (
          <View style={s.subSection}>
            {/* Header with Title and Provenance */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <View style={{ flex: 1, minWidth: 260 }}>
                <Text style={s.analyticsHeaderTitle}>Sprint Trajectory & Velocity</Text>
                <Text style={s.metricCardSub}>
                  Live burndown trajectories, capacity utilization, and velocity derived from authoritative MongoDB records
                </Text>
              </View>
              <View style={s.analyticsProvenanceBadge}>
                <Ionicons name="server-outline" size={13} color="#0284c7" />
                <Text style={s.analyticsProvenanceBadgeTxt}>
                  {prov?.isSnapshot ? "Historical Snapshot" : "Live MongoDB State"}
                </Text>
              </View>
            </View>

            {/* SPRINT SELECTOR */}
            <View style={s.sprintSelectorContainer}>
              <Text style={s.selectorLabel}>Select Sprint Scope:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {availableSprints.map((sp: any) => {
                  const isSelected = curSprint?._id?.toString() === sp._id?.toString();
                  const statusColors: any = {
                    ACTIVE: { bg: "#eff6ff", border: "#2563eb", text: "#1d4ed8" },
                    PLANNING: { bg: "#f8fafc", border: "#94a3b8", text: "#475569" },
                    COMPLETED: { bg: "#f0fdf4", border: "#16a34a", text: "#15803d" },
                    CANCELLED: { bg: "#fef2f2", border: "#ef4444", text: "#b91c1c" },
                  };
                  const col = statusColors[sp.status] || statusColors.PLANNING;
                  return (
                    <Pressable
                      key={sp._id}
                      onPress={() => handleSelectAnalyticsSprint(sp._id)}
                      style={[
                        s.sprintSelectPill,
                        isSelected && { borderColor: "#2563eb", borderWidth: 2, backgroundColor: "#eff6ff" },
                      ]}
                    >
                      <Text style={[s.sprintSelectPillTxt, isSelected && { fontWeight: "800", color: "#1e40af" }]}>
                        Sprint {sp.sprintNumber || ""}: {sp.name}
                      </Text>
                      <View style={[s.statusMiniBadge, { backgroundColor: col.bg, borderColor: col.border }]}>
                        <Text style={[s.statusMiniBadgeTxt, { color: col.text }]}>{sp.status}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* SPRINT OVERVIEW HEADER CARD */}
            {curSprint ? (
              <View style={s.sprintDetailsCard}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <View style={{ flex: 1, minWidth: 200 }}>
                    <Text style={s.sprintTitleTxt}>{curSprint.name}</Text>
                    {curSprint.goal ? (
                      <Text style={s.sprintGoalTxt}>
                        <Text style={{ fontWeight: "700" }}>Sprint Goal: </Text>
                        {curSprint.goal}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Badge label={curSprint.status} variant={curSprint.status === "ACTIVE" ? "info" : curSprint.status === "COMPLETED" ? "success" : "neutral"} />
                    {ov.daysRemaining !== null && curSprint.status === "ACTIVE" ? (
                      <Text style={s.daysRemainingTxt}>{ov.daysRemaining} days remaining in cycle</Text>
                    ) : curSprint.status === "COMPLETED" ? (
                      <Text style={s.daysRemainingTxt}>Sprint completed</Text>
                    ) : null}
                  </View>
                </View>

                {/* 6 Key Metrics Grid */}
                <View style={s.overviewMetricsGrid}>
                  <View style={s.overviewMetricBox}>
                    <Text style={s.overviewMetricNum}>{ov.totalCommittedStories}</Text>
                    <Text style={s.overviewMetricLbl}>Committed Stories</Text>
                  </View>
                  <View style={s.overviewMetricBox}>
                    <Text style={s.overviewMetricNum}>{ov.totalCommittedPoints} <Text style={{ fontSize: 13 }}>pts</Text></Text>
                    <Text style={s.overviewMetricLbl}>Committed Points</Text>
                  </View>
                  <View style={s.overviewMetricBox}>
                    <Text style={[s.overviewMetricNum, { color: "#16a34a" }]}>{ov.completedPoints} <Text style={{ fontSize: 13 }}>pts</Text></Text>
                    <Text style={s.overviewMetricLbl}>Completed Points ({ov.pointCompletionPct}%)</Text>
                  </View>
                  <View style={s.overviewMetricBox}>
                    <Text style={[s.overviewMetricNum, { color: ov.remainingPoints > 0 ? "#d97706" : "#64748b" }]}>{ov.remainingPoints} <Text style={{ fontSize: 13 }}>pts</Text></Text>
                    <Text style={s.overviewMetricLbl}>Remaining Points</Text>
                  </View>
                  <View style={s.overviewMetricBox}>
                    <Text style={s.overviewMetricNum}>{ov.completedStories} / {ov.totalCommittedStories}</Text>
                    <Text style={s.overviewMetricLbl}>Stories Done ({ov.storyCompletionPct}%)</Text>
                  </View>
                  <View style={s.overviewMetricBox}>
                    <Text style={s.overviewMetricNum}>{ov.totalEstimatedHours} <Text style={{ fontSize: 13 }}>h</Text></Text>
                    <Text style={s.overviewMetricLbl}>Estimated Effort</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={s.emptyNoticeBox}>
                <Ionicons name="information-circle-outline" size={20} color="#64748b" />
                <Text style={s.emptyNoticeTxt}>No sprint selected or available for analytics.</Text>
              </View>
            )}

            {/* SPRINT PROGRESS & BURNDOWN TRAJECTORY */}
            <View style={s.metricCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={s.metricCardTitle}>Sprint Progress & Burndown Trajectory</Text>
                  <Text style={s.metricCardSub}>Ideal linear burndown vs actual points remaining</Text>
                </View>
                <View style={s.burndownLegendRow}>
                  <View style={s.legendItem}>
                    <View style={[s.legendColorDot, { backgroundColor: "#94a3b8" }]} />
                    <Text style={s.legendTxt}>Ideal Trajectory</Text>
                  </View>
                  <View style={s.legendItem}>
                    <View style={[s.legendColorDot, { backgroundColor: "#2563eb" }]} />
                    <Text style={s.legendTxt}>Actual Remaining</Text>
                  </View>
                </View>
              </View>

              {/* Burndown Visual Bars */}
              {burndown?.idealTrajectory && burndown.idealTrajectory.length > 0 ? (
                <View style={s.burndownChartContainer}>
                  <View style={s.burndownBarsRow}>
                    {burndown.idealTrajectory.map((ideal: any) => {
                      const actual = burndown.actualTrajectory?.find((a: any) => a.day === ideal.day);
                      const maxPts = Math.max(1, ov.totalCommittedPoints || 10);
                      const idealHeight = Math.min(100, Math.max(6, Math.round((ideal.points / maxPts) * 100)));
                      const actualHeight = actual ? Math.min(100, Math.max(6, Math.round((actual.points / maxPts) * 100))) : null;

                      return (
                        <View key={ideal.day} style={s.burndownBarCol}>
                          <View style={s.burndownBarPair}>
                            {/* Ideal Bar */}
                            <View style={[s.burndownBarIdeal, { height: `${idealHeight}%` }]} />
                            {/* Actual Bar (if recorded for this day) */}
                            {actualHeight !== null ? (
                              <View style={[
                                s.burndownBarActual,
                                { height: `${actualHeight}%` },
                                actual?.isCurrent && { backgroundColor: "#3b82f6", borderColor: "#1d4ed8", borderWidth: 1 }
                              ]} />
                            ) : null}
                          </View>
                          <Text style={s.burndownDayLabel}>{ideal.label}</Text>
                          <Text style={s.burndownPtsLabel}>
                            {actual ? `${actual.points}p` : `${ideal.points}p*`}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                  <View style={s.burndownFooterNotice}>
                    <Ionicons name="information-circle-outline" size={14} color="#64748b" />
                    <Text style={s.burndownFooterTxt}>
                      {curSprint?.status === "COMPLETED"
                        ? `Sprint finished with ${ov.completedPoints} of ${ov.totalCommittedPoints} story points completed (${ov.pointCompletionPct}%).`
                        : ov.completedPoints === 0
                        ? `Sprint is active with ${ov.totalCommittedPoints} story points committed. Initial trajectory reflects ongoing development.`
                        : `Current velocity: ${ov.completedPoints} pts burnt, ${ov.remainingPoints} pts remaining across ${ov.daysRemaining || 0} remaining days.`}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={s.emptyNoticeBox}>
                  <Text style={s.emptyNoticeTxt}>No burndown trajectory points calculated for this sprint.</Text>
                </View>
              )}
            </View>

            {/* TASK FLOW DISTRIBUTION */}
            <View style={s.metricCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={s.metricCardTitle}>Task Flow Distribution</Text>
                <View style={s.integrityBadge}>
                  <Ionicons name="checkmark-done" size={13} color="#16a34a" />
                  <Text style={s.integrityBadgeTxt}>Sum: {sumTasks} Tasks (100% Accounted)</Text>
                </View>
              </View>
              <Text style={s.metricCardSub}>
                Authoritative breakdown of all tasks committed to Sprint {curSprint?.sprintNumber || ""}: {curSprint?.name}
              </Text>

              <View style={s.flowGridRow}>
                <View style={[s.flowMetricCard, { borderLeftColor: "#d97706" }]}>
                  <Text style={[s.flowMetricTitle, { color: "#d97706" }]}>To Do</Text>
                  <Text style={s.flowMetricCount}>{dist.todo?.count || 0}</Text>
                  <Text style={s.flowMetricSub}>{dist.todo?.storyPoints || 0} pts ({dist.todo?.percentage || 0}%)</Text>
                </View>
                <View style={[s.flowMetricCard, { borderLeftColor: "#2563eb" }]}>
                  <Text style={[s.flowMetricTitle, { color: "#2563eb" }]}>In Progress</Text>
                  <Text style={s.flowMetricCount}>{dist.in_progress?.count || 0}</Text>
                  <Text style={s.flowMetricSub}>{dist.in_progress?.storyPoints || 0} pts ({dist.in_progress?.percentage || 0}%)</Text>
                </View>
                <View style={[s.flowMetricCard, { borderLeftColor: "#9333ea" }]}>
                  <Text style={[s.flowMetricTitle, { color: "#9333ea" }]}>In Review</Text>
                  <Text style={s.flowMetricCount}>{dist.in_review?.count || 0}</Text>
                  <Text style={s.flowMetricSub}>{dist.in_review?.storyPoints || 0} pts ({dist.in_review?.percentage || 0}%)</Text>
                </View>
                <View style={[s.flowMetricCard, { borderLeftColor: "#dc2626" }]}>
                  <Text style={[s.flowMetricTitle, { color: "#dc2626" }]}>Blocked</Text>
                  <Text style={s.flowMetricCount}>{dist.blocked?.count || 0}</Text>
                  <Text style={s.flowMetricSub}>{dist.blocked?.storyPoints || 0} pts ({dist.blocked?.percentage || 0}%)</Text>
                </View>
                <View style={[s.flowMetricCard, { borderLeftColor: "#16a34a" }]}>
                  <Text style={[s.flowMetricTitle, { color: "#16a34a" }]}>Done</Text>
                  <Text style={s.flowMetricCount}>{dist.done?.count || 0}</Text>
                  <Text style={s.flowMetricSub}>{dist.done?.storyPoints || 0} pts ({dist.done?.percentage || 0}%)</Text>
                </View>
              </View>
            </View>

            {/* HISTORICAL SPRINT VELOCITY */}
            <View style={s.metricCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={s.metricCardTitle}>Historical Sprint Velocity</Text>
                  <Text style={s.metricCardSub}>
                    Derived strictly across genuinely completed sprints (Active & Planning sprints excluded)
                  </Text>
                </View>
                <Badge label={`${velocity.completedSprintCount || 0} Completed Sprints`} variant="neutral" />
              </View>

              {/* Velocity Summary Grid */}
              <View style={s.velocitySummaryGrid}>
                <View style={s.velocitySummaryBox}>
                  <Text style={s.velocitySummaryNum}>{velocity.averageVelocity || 0} <Text style={{ fontSize: 13 }}>pts</Text></Text>
                  <Text style={s.velocitySummaryLbl}>Average Velocity</Text>
                </View>
                <View style={s.velocitySummaryBox}>
                  <Text style={s.velocitySummaryNum}>{velocity.highestVelocity || 0} <Text style={{ fontSize: 13 }}>pts</Text></Text>
                  <Text style={s.velocitySummaryLbl}>Highest Recorded</Text>
                </View>
                <View style={s.velocitySummaryBox}>
                  <Text style={s.velocitySummaryNum}>{velocity.lowestVelocity || 0} <Text style={{ fontSize: 13 }}>pts</Text></Text>
                  <Text style={s.velocitySummaryLbl}>Lowest Recorded</Text>
                </View>
                <View style={s.velocitySummaryBox}>
                  <Text style={s.velocitySummaryNum}>{velocity.totalCompletedStoryPoints || 0} <Text style={{ fontSize: 13 }}>pts</Text></Text>
                  <Text style={s.velocitySummaryLbl}>Total Points Delivered</Text>
                </View>
              </View>

              {velocity.completedSprintCount === 0 ? (
                <View style={s.emptyNoticeBox}>
                  <Ionicons name="bar-chart-outline" size={20} color="#64748b" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.emptyNoticeTitle}>No Completed Sprints Yet</Text>
                    <Text style={s.emptyNoticeTxt}>
                      Sprint velocity is strictly calculated across completed sprints. Active and planning sprints do not contribute to completed velocity. NexusFlow never fabricates estimated velocity before real historical completions exist.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={{ gap: 8, marginTop: 12 }}>
                  {velocity.history.map((v: any, i: number) => (
                    <View key={i} style={s.velocityRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.velocitySprintName}>Sprint {v.sprintNumber}: {v.name || v.sprintName}</Text>
                        <Text style={s.velocityMeta}>
                          {v.completedTaskCount || v.taskCount || 0} tasks closed
                          {v.carryOverCount ? ` • ${v.carryOverCount} carry-over items` : ""}
                        </Text>
                      </View>
                      <View style={s.velocityPtsBadge}>
                        <Text style={s.velocityPtsTxt}>{v.completedPoints || v.velocityPoints} Story Pts</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* TEAM CAPACITY & WORKLOAD DISTRIBUTION */}
            {cap ? (
              <View style={s.metricCard}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={s.metricCardTitle}>Team Capacity & Workload Allocation</Text>
                    <Text style={s.metricCardSub}>
                      {cap.totalCommittedHours}h committed / {cap.totalCapacityHours}h available ({cap.capacityUtilizationPct}% utilization)
                    </Text>
                  </View>
                  <Badge
                    label={`${cap.capacityUtilizationPct}% Utilization`}
                    variant={cap.capacityUtilizationPct > 100 ? "danger" : cap.capacityUtilizationPct > 85 ? "warning" : "success"}
                  />
                </View>

                {/* Unassigned Work Alert */}
                {cap.unassignedTasksCount > 0 ? (
                  <View style={s.unassignedAlertBox}>
                    <Ionicons name="alert-circle-outline" size={18} color="#d97706" />
                    <Text style={s.unassignedAlertTxt}>
                      <Text style={{ fontWeight: "700" }}>{cap.unassignedTasksCount} unassigned tasks </Text>
                      in this sprint ({cap.unassignedHours}h). Assign to team members to balance workload.
                    </Text>
                  </View>
                ) : null}

                {/* Member Workload Cards */}
                <View style={{ gap: 8, marginTop: 10 }}>
                  {(cap.memberWorkloads || []).map((m: any, idx: number) => (
                    <View key={m.userId || idx} style={s.memberWorkloadRow}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={s.memberWorkloadName}>{m.name}</Text>
                          <Text style={s.memberWorkloadRole}>({m.role})</Text>
                          {m.overloaded ? (
                            <View style={s.overloadBadge}>
                              <Text style={s.overloadBadgeTxt}>OVERLOADED</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={s.memberWorkloadSub}>
                          {m.assignedTasksCount} tasks • {m.assignedHours}h allocated / {m.capacityHours}h capacity
                        </Text>
                      </View>
                      <View style={s.memberUtilBadge}>
                        <Text style={[s.memberUtilBadgeTxt, m.overloaded && { color: "#dc2626" }]}>
                          {m.utilizationPct}%
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* SCOPE CHANGES & CARRY-OVER */}
            {scope && (scope.carryOverItems?.length > 0 || scope.scopeChanges?.length > 0) ? (
              <View style={s.metricCard}>
                <Text style={s.metricCardTitle}>Scope & Carry-over Analysis</Text>
                {scope.carryOverItems?.length > 0 ? (
                  <View style={{ marginTop: 6, gap: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#b45309" }}>
                      Carried Over Items ({scope.carryOverItems.length}):
                    </Text>
                    {scope.carryOverItems.map((item: any, idx: number) => (
                      <View key={idx} style={s.carryOverItemRow}>
                        <Ionicons name="arrow-redo-outline" size={14} color="#b45309" />
                        <Text style={s.carryOverItemTxt}>{item.title || item.name || "Carried Task"}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      }

      // ── 3. Capability (Waterfall-Parity Scrum Implementation) ───────────────
      case "capability": {
        const members = team?.members || [];
        const isSolo = members.length <= 1;

        // Reconcile with active sprint and team capacity rules
        const sprintId = activeSprint?._id?.toString();
        const sprintTasksForCap = sprintId
          ? tasks.filter((t) => (t.sprintId?._id || t.sprintId)?.toString() === sprintId)
          : [];
        const backlogTasksForCap = tasks.filter((t) => !t.sprintId);

        const totalCapacityHours = capacityData?.capacity?.totalCapacityHours ??
          members.reduce((sum, m: any) => sum + (m.capacity || m.capacityHours || 40), 0);
        const totalCommittedHours = capacityData?.capacity?.totalCommittedHours ??
          sprintTasksForCap.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
        const teamUtilPct = capacityData?.capacity?.utilizationPct ??
          (totalCapacityHours > 0 ? Math.round((totalCommittedHours / totalCapacityHours) * 100) : 0);
        const backlogHours = capacityData?.capacity?.backlogHours ??
          backlogTasksForCap.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);

        const memberCards = capacityData?.members && capacityData.members.length > 0
          ? capacityData.members
          : members.map((m: any) => {
              const mUserId = (m.userId?._id || m.userId)?.toString();
              const mName = m.name || m.user?.name || "Developer";
              const assignedSprintTasks = sprintTasksForCap.filter((t) => {
                const tAssigned = (t.assignedTo?._id || t.assignedTo)?.toString();
                return (tAssigned && tAssigned === mUserId) || (t.assignedName && t.assignedName === mName);
              });
              const totalHours = assignedSprintTasks.reduce((acc, t) => acc + (t.estimatedHours || 0), 0);
              const memberCap = m.capacity || m.capacityHours || 40;
              const utilPct = memberCap > 0 ? Math.round((totalHours / memberCap) * 100) : 0;
              return {
                id: mUserId,
                userId: mUserId,
                name: mName,
                role: m.role || "Developer",
                capacityHours: memberCap,
                committedHours: totalHours,
                backlogAssignedHours: 0,
                utilizationPct: utilPct,
                verifiedSkills: [],
              };
            });

        const skillGaps = capacityData?.skillGaps || [];
        const assignments = capacityData?.assignments || [];

        return (
          <View style={s.subSection}>
            {/* SECTION 1: TEAM CAPABILITY & CAPACITY ALIGNMENT */}
            <View style={s.metricCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <View style={{ flex: 1, minWidth: 240 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={s.metricCardTitle}>Team Capability & Capacity Alignment</Text>
                    <Badge
                      label={activeSprint ? "ACTIVE SPRINT SCOPE" : "BACKLOG PLANNING SCOPE"}
                      variant={activeSprint ? "info" : "neutral"}
                      size="sm"
                    />
                  </View>
                  <Text style={s.metricCardSub}>
                    {activeSprint
                      ? "Evaluating active sprint execution workload against verified member capacity."
                      : "Evaluating eligible Product Backlog candidate stories for capacity planning and Branch & Bound recommendations."}
                  </Text>
                </View>
                <Badge
                  label={activeSprint ? `Sprint: ${totalCommittedHours}h / ${totalCapacityHours}h (${teamUtilPct}%)` : `Backlog: ${backlogHours}h / ${totalCapacityHours}h Cap`}
                  variant={teamUtilPct > 100 ? "danger" : "primary"}
                  size="sm"
                />
              </View>

              {isSolo && (
                <View style={s.soloBanner}>
                  <Ionicons name="person-outline" size={16} color="#4f46e5" />
                  <Text style={s.soloBannerTxt}>
                    Single-person project team: Capacity is strictly grounded in individual availability without fabricated peer metrics.
                  </Text>
                </View>
              )}

              {!activeSprint && (
                <View style={[s.soloBanner, { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", marginTop: 8 }]}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
                  <Text style={[s.soloBannerTxt, { color: "#1e40af" }]}>
                    No active sprint currently committed. Member loads reflect 0h of sprint execution. {backlogTasksForCap.length} approved Product Backlog stories are evaluated for dynamic assignment recommendations.
                  </Text>
                </View>
              )}

              {/* Member Capacity Cards */}
              <View style={{ gap: 10, marginTop: 12 }}>
                {memberCards.map((m: any, i: number) => {
                  const utilPct = m.utilizationPct ?? 0;
                  const committedHours = m.committedHours ?? 0;
                  const memberCap = m.capacityHours || 40;
                  const backlogAssigned = m.backlogAssignedHours ?? 0;

                  return (
                    <View key={m.userId || i} style={s.memberCapCard}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Ionicons name="person-circle" size={20} color="#4f46e5" />
                          <Text style={s.memberName}>{m.name}</Text>
                          {m.role ? <Badge label={m.role} variant="neutral" size="sm" /> : null}
                        </View>
                        <Text style={s.memberUtil}>
                          {committedHours}h / {memberCap}h ({utilPct}%)
                          {backlogAssigned > 0 ? ` · ${backlogAssigned}h backlog` : ""}
                        </Text>
                      </View>
                      <ProgressBar
                        progress={Math.min(1, utilPct / 100)}
                        color={utilPct > 100 ? "#dc2626" : utilPct >= 80 ? "#16a34a" : "#2563eb"}
                      />
                      {m.verifiedSkills && m.verifiedSkills.length > 0 ? (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                          {m.verifiedSkills.slice(0, 6).map((sk: string, skIdx: number) => (
                            <View key={skIdx} style={s.verifiedSkillPill}>
                              <Ionicons name="checkmark-circle" size={10} color={colors.success} />
                              <Text style={s.verifiedSkillTxt}>{sk}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>

            {/* SECTION 2: SKILL-GAP DETECTION */}
            <SectionHead
              icon="shield-half-outline"
              tint="#d97706"
              title="Skill-Gap Detection & Competency Coverage"
              sub="Real story requirements evaluated against verified team skill profiles"
            />
            {skillGaps.length > 0 ? (
              <View style={{ gap: 8 }}>
                {skillGaps.map((g: any, gIdx: number) => (
                  <View key={g.taskId ? `${g.taskId}-${g.skill}` : gIdx} style={s.gapCard}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Badge label={g.skill} variant="warning" size="sm" />
                        <Badge label={g.basis || "Story requirement"} variant="neutral" size="sm" />
                      </View>
                      <Badge label={g.scope || (activeSprint ? "Sprint Work" : "Backlog Work")} variant="neutral" size="sm" />
                    </View>
                    <Text style={s.gapTaskTitle}>Story: {g.taskTitle}</Text>
                    <Text style={s.gapFinding}>{g.missingCapability}</Text>
                    <View style={s.gapActionBox}>
                      <Ionicons name="bulb-outline" size={14} color="#b45309" />
                      <Text style={s.gapActionTxt}>{g.action}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={[s.emptyNoticeBox, { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }]}>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
                <Text style={[s.emptyNoticeTxt, { color: "#166534" }]}>
                  No competency gaps detected. Team holds verified skills for all analyzed story requirements.
                </Text>
              </View>
            )}

            {/* SECTION 3: BRANCH & BOUND DYNAMIC ASSIGNMENT RECOMMENDATIONS */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: spacing.md, marginBottom: 8 }}>
              <View style={{ flex: 1, minWidth: 240 }}>
                <SectionHead
                  icon="git-network-outline"
                  tint="#2563eb"
                  title="Branch & Bound Dynamic Assignments"
                  sub="Deterministic solver recommendations with Fit Scores and capacity impact"
                />
              </View>
              {assignments.length > 0 && isLeader && (
                <Button
                  title={`Accept All Eligible Assignments (${assignments.length})`}
                  icon="checkmark-done"
                  variant="primary"
                  small
                  onPress={() => {
                    setAllowOverrun(false);
                    setBulkSummary(null);
                    setShowBulkModal(true);
                  }}
                />
              )}
            </View>
            {assignments.length > 0 ? (
              <View style={{ gap: 10 }}>
                {assignments.map((a: any) => {
                  const isAccepting = acceptingAssignId === a.taskId;
                  const fitColor = a.fitScore >= 75 ? "#16a34a" : a.fitScore >= 50 ? "#d97706" : "#dc2626";
                  const fitBg = a.fitScore >= 75 ? "#dcfce7" : a.fitScore >= 50 ? "#fef3c7" : "#fee2e2";

                  return (
                    <View key={a.taskId} style={s.assignCard}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                        <View style={{ flex: 1, minWidth: 200 }}>
                          <Text style={s.assignTaskTitle}>{a.taskTitle}</Text>
                          <Text style={s.assignTaskSub}>
                            {a.storyPoints ? `${a.storyPoints} Story Points` : ""}
                            {a.storyPoints && a.estimatedHours ? " · " : ""}
                            {a.estimatedHours ? `~${a.estimatedHours}h effort` : ""}
                            {a.requiredSkills?.length ? ` · Required: ${a.requiredSkills.join(", ")}` : ""}
                          </Text>
                        </View>
                        <View style={[s.fitBadge, { backgroundColor: fitBg }]}>
                          <Text style={[s.fitBadgeTxt, { color: fitColor }]}>Fit {a.fitScore}%</Text>
                        </View>
                      </View>

                      {/* Candidate & Load Impact */}
                      <View style={s.impactBox}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <Ionicons name="person-circle" size={16} color="#4f46e5" />
                          <Text style={s.impactHeader}>
                            Recommended Assignee: <Text style={{ fontWeight: "800", color: "#1e293b" }}>{a.recommendedMemberName}</Text>
                          </Text>
                        </View>
                        <Text style={s.rationaleTxt}>• {a.skillEvidence || a.reason}</Text>
                        {a.capacityImpact ? (
                          <Text style={s.impactTxt}>
                            • Workload Impact: {a.capacityImpact.hoursBefore}h → {a.capacityImpact.hoursAfter}h (Weekly Capacity: {a.capacityImpact.capacity}h)
                          </Text>
                        ) : null}
                      </View>

                      {/* Alternative Candidates */}
                      {a.alternatives && a.alternatives.length > 0 ? (
                        <View style={s.altRow}>
                          <Text style={s.altLabel}>Alternatives: </Text>
                          {a.alternatives.map((alt: any) => (
                            <Pressable
                              key={alt.userId}
                              style={s.altChip}
                              disabled={isAccepting}
                              onPress={() => handleAcceptAssignment(a.taskId, alt.userId)}
                            >
                              <Text style={s.altTxt}>{alt.name} ({alt.fitScore}%)</Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}

                      {/* Accept Assign Action */}
                      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }}>
                        <Button
                          title={isAccepting ? "Assigning..." : "Accept Assign"}
                          variant="primary"
                          icon="checkmark"
                          small
                          disabled={isAccepting}
                          onPress={() => handleAcceptAssignment(a.taskId, a.recommendedMemberId)}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={[s.emptyNoticeBox, { backgroundColor: "#f8fafc", borderColor: colors.border }]}>
                <Ionicons name="checkmark-done-circle-outline" size={24} color={colors.primary} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.emptyNoticeTitle, { color: colors.text }]}>All Open Stories Assigned</Text>
                  <Text style={s.emptyNoticeTxt}>
                    All candidate stories under the current planning scope are assigned and balanced across team capacity.
                  </Text>
                </View>
              </View>
            )}
          </View>
        );
      }

      // ── 4. Risk Radar (Waterfall-Parity Scrum Implementation) ─────────────
      case "risks": {
        const criticalCount = scrumRisks.filter((r) => r.severity === "critical" && r.status === "open").length;
        const highCount = scrumRisks.filter((r) => r.severity === "high" && r.status === "open").length;
        const openCount = riskCounts.open;

        return (
          <View style={s.subSection}>
            {/* Header action bar */}
            <View style={s.metricCard}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <View style={{ flex: 1, minWidth: 260 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={s.metricCardTitle}>Scrum Risk Intelligence</Text>
                    {criticalCount > 0 && <Badge label={`${criticalCount} Critical`} variant="danger" size="sm" />}
                    {highCount > 0 && <Badge label={`${highCount} High`} variant="warning" size="sm" />}
                    {openCount === 0 && <Badge label="All Clear" variant="success" size="sm" />}
                  </View>
                  <Text style={[s.metricCardSub, { marginTop: 4 }]}>
                    Deterministic engine scans 12 Scrum risk triggers including sprint capacity, member overload, unassigned sprint tasks, and scope contradictions.
                  </Text>
                </View>
                <Button
                  title={scanningRisks ? "Scanning Risks..." : "Scan Risks"}
                  icon="shield-checkmark"
                  variant="primary"
                  onPress={handleScanRisks}
                  disabled={scanningRisks}
                />
              </View>

              {/* Filter Tabs with Live Authoritative Counts */}
              <View style={[s.filterRow, { marginTop: 14 }]}>
                {(["open", "acknowledged", "resolved", "all"] as const).map((f) => {
                  const isActive = riskFilter === f;
                  const count = riskCounts[f] ?? 0;
                  return (
                    <Pressable
                      key={f}
                      onPress={() => {
                        setRiskFilter(f);
                      }}
                      style={[s.filterPill, isActive && s.filterPillActive]}
                    >
                      <Text
                        style={[
                          font.small,
                          isActive ? { fontWeight: "700", color: colors.primary } : { color: colors.textMuted },
                        ]}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)} ({count})
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Risk Cards List / Empty States */}
            {scrumRisks.length === 0 ? (
              <EmptyState
                icon={riskFilter === "resolved" ? "checkmark-done-circle-outline" : "shield-checkmark-outline"}
                title={
                  riskFilter === "open"
                    ? "No Open Risks"
                    : riskFilter === "acknowledged"
                    ? "No Acknowledged Risks"
                    : riskFilter === "resolved"
                    ? "No Resolved Risks"
                    : "No Risks Detected"
                }
                message={
                  riskFilter === "open"
                    ? "All detected Scrum risk triggers have been reviewed or resolved."
                    : riskFilter === "acknowledged"
                    ? "No risks are currently awaiting resolution in acknowledged state."
                    : riskFilter === "resolved"
                    ? "No risks have been resolved yet."
                    : "Your Scrum project currently has no active risk triggers."
                }
                actionLabel="Scan Again"
                actionIcon="refresh"
                onAction={handleScanRisks}
              />
            ) : (
              <View style={{ gap: 10 }}>
                {scrumRisks.map((risk) => {
                  const sev = String(risk.severity || "medium").toLowerCase();
                  const sevBorder = sev === "critical" ? colors.danger : sev === "high" ? colors.warning : colors.primary;
                  const isBusy = updatingRiskId === risk._id;

                  return (
                    <View key={risk._id} style={[s.warningCard, { borderLeftColor: sevBorder }]}>
                      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1 }}>
                          <Badge
                            label={sev.toUpperCase()}
                            variant={sev === "critical" ? "danger" : sev === "high" ? "warning" : "info"}
                            size="sm"
                          />
                          {riskFilter === "all" && (
                            <Badge
                              label={String(risk.status || "open").toUpperCase()}
                              variant={risk.status === "resolved" ? "success" : risk.status === "acknowledged" ? "warning" : "neutral"}
                              size="sm"
                            />
                          )}
                          <Badge label={String(risk.category || "GENERAL").toUpperCase()} variant="neutral" size="sm" />
                          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text, flexShrink: 1 }}>
                            {risk.title}
                          </Text>
                        </View>

                        {/* Lifecycle Status Action Buttons */}
                        {risk.status === "open" ? (
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            <Button
                              title="Acknowledge"
                              variant="secondary"
                              small
                              disabled={isBusy}
                              onPress={() => handleUpdateRiskStatus(risk._id, "acknowledged")}
                            />
                            <Button
                              title="Resolve"
                              variant="ghost"
                              small
                              disabled={isBusy}
                              onPress={() => handleUpdateRiskStatus(risk._id, "resolved")}
                            />
                          </View>
                        ) : risk.status === "acknowledged" ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Badge label="ACKNOWLEDGED" variant="warning" size="sm" />
                            <Button
                              title="Resolve"
                              variant="primary"
                              small
                              disabled={isBusy}
                              onPress={() => handleUpdateRiskStatus(risk._id, "resolved")}
                            />
                          </View>
                        ) : (
                          <Badge label="RESOLVED" variant="success" size="sm" />
                        )}
                      </View>

                      <Text style={{ fontSize: 13, color: colors.text, marginTop: 4, lineHeight: 19 }}>
                        {risk.explanation}
                      </Text>

                      {!!risk.evidence && (
                        <View style={s.warningEvidenceBox}>
                          <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "600" }}>
                            Evidence: {typeof risk.evidence === "string" ? risk.evidence : JSON.stringify(risk.evidence)}
                          </Text>
                        </View>
                      )}

                      {!!risk.recommendation && (
                        <View style={s.warningActionBox}>
                          <Ionicons name="bulb-outline" size={14} color={colors.primary} />
                          <Text style={{ fontSize: 11.5, color: colors.primary, fontWeight: "600", flex: 1 }}>
                            Recommendation: {risk.recommendation}
                          </Text>
                        </View>
                      )}

                      {risk.status === "resolved" && (
                        <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>
                          Resolved on {new Date(risk.resolvedAt || risk.updatedAt || Date.now()).toLocaleDateString()}
                          {risk.resolutionReason ? ` — ${risk.resolutionReason}` : ""}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      }

      // ── 5. Dependency DAG ──────────────────────────────────────────────────
      case "dag": {
        const displayTasks = depData?.tasks && depData.tasks.length > 0 ? depData.tasks : tasks;
        const depCount = dagEdges.length;
        const topoGraph = {
          nodes: dagNodes,
          edges: dagEdges,
          topoResult: depData?.topoResult || { order: dagNodes.map((n) => n.id), hasCycle: false, cycles: [] },
        };

        return (
          <View style={s.subSection}>
            {/* ── Toolbar: title + dep count + Add Dependency ── */}
            <View style={s.toolbar}>
              <View style={{ flex: 1, minWidth: 220 }}>
                <Text style={font.h3}>Story & Task Dependency Graph</Text>
                <Text style={s.toolbarSub}>
                  {displayTasks.length} items · {depCount} dependencies
                </Text>
              </View>
              <Button
                title="Add Dependency"
                icon="git-merge"
                onPress={() => setShowAddDep(true)}
                small
              />
            </View>

            {/* ── Badges ── */}
            <View style={s.chipRow}>
              <AlgoChip icon="git-network-outline" label="Dependency Graph" value="Directed Acyclic Graph (DAG)" />
              <AlgoChip icon="swap-vertical-outline" label="Topological Sort" value="Kahn's Algorithm" />
              <AlgoChip icon="time-outline" label="Time Complexity" value="O(V + E)" />
              <AlgoChip icon="layers-outline" label="Space Complexity" value="O(V + E)" />
            </View>

            {displayTasks.length === 0 ? (
              <EmptyState
                icon="git-network-outline"
                title="No tasks to link"
                message="Create or approve Product Backlog stories first, then connect them with dependencies."
              />
            ) : (
              <>
                {/* ── SECTION 1 : Project Tasks ── */}
                <SectionHead
                  icon="albums-outline"
                  tint={colors.primary}
                  title="Project Tasks"
                  sub="All stories and tasks available for dependency linking"
                />
                <View style={s.grid}>
                  {displayTasks.map((t: any) => (
                    <TaskInfoCard
                      key={t._id || t.id}
                      task={t}
                      member={t.assignedName || (t.assignedTo ? memberMap.get(t.assignedTo.toString()) : null)}
                    />
                  ))}
                </View>

                {/* ── SECTION 2 : Dependency Graph (DAG) ── */}
                <SectionHead
                  icon="git-network-outline"
                  tint={colors.dfs}
                  title="Dependency Graph"
                  sub="Item = node · Dependency = directed edge · auto-layout, zoom, pan, minimap"
                />
                {depCount === 0 ? (
                  <View style={s.glassCard}>
                    <EmptyState
                      icon="git-network-outline"
                      title="No Dependencies Created"
                      message="Create dependencies between tasks to visualize the project execution graph."
                      actionLabel="Add Dependency"
                      actionIcon="git-merge"
                      onAction={() => setShowAddDep(true)}
                    />
                  </View>
                ) : (
                  <View style={s.graphCard}>
                    <DependencyFlowGraph nodes={dagNodes} edges={dagEdges} height={480} />
                  </View>
                )}

                {/* ── SECTION 3 : Execution Roadmap (Topological Sort) ── */}
                <SectionHead
                  icon="map-outline"
                  tint={colors.topo}
                  title="Execution Roadmap"
                  sub={`Topological Sort (Kahn's) · O(V + E) · ${depCount === 0 ? "waiting for dependencies" : `${topoGraph.topoResult.order.length} steps`}`}
                />
                <DependencyGraphPanel graph={topoGraph as any} />
              </>
            )}
          </View>
        );
      }

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── Data Provenance Indicator Banner ─────────────────────────────── */}
      <View style={[s.provenanceBanner, isDemo ? s.provenanceBannerDemo : s.provenanceBannerLive]}>
        <View style={s.provenanceLeft}>
          <View style={[s.provenanceIconCircle, isDemo ? s.provenanceIconDemo : s.provenanceIconLive]}>
            <Ionicons
              name={isDemo ? "flask-outline" : "shield-checkmark"}
              size={18}
              color={isDemo ? colors.accentDark : colors.success}
            />
          </View>
          <View style={{ flex: 1, minWidth: 200 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={s.provenanceTitle}>
                {isDemo ? "DEMONSTRATION & EXAMPLE INSIGHTS" : "LIVE PERSISTED SCRUM METRICS"}
              </Text>
              <View style={[s.provenanceBadge, isDemo ? s.provenanceBadgeDemo : s.provenanceBadgeLive]}>
                <Text style={[s.provenanceBadgeTxt, isDemo ? s.provenanceBadgeTxtDemo : s.provenanceBadgeTxtLive]}>
                  {isDemo ? "EXAMPLE MODE" : "ACTUAL DATA"}
                </Text>
              </View>
            </View>
            <Text style={s.provenanceDesc}>
              {isDemo
                ? "This Scrum workspace has not generated sprint execution tasks yet. Insights below display illustrative example data to preview analytical features."
                : `Analytical metrics below are computed directly from ${tasks.length} authoritative tasks and ${sprints.length} sprints in MongoDB.`}
            </Text>
          </View>
        </View>

        {!hasLiveRecords && (
          <View style={s.modeToggleGroup}>
            <Pressable
              onPress={() => setDataMode("example")}
              style={[s.modeToggleBtn, dataMode === "example" && s.modeToggleBtnActive]}
            >
              <Ionicons
                name="eye-outline"
                size={12}
                color={dataMode === "example" ? colors.primary : colors.textMuted}
              />
              <Text style={[s.modeToggleBtnTxt, dataMode === "example" && s.modeToggleBtnTxtActive]}>
                Example Demo
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setDataMode("actual")}
              style={[s.modeToggleBtn, dataMode === "actual" && s.modeToggleBtnActive]}
            >
              <Ionicons
                name="server-outline"
                size={12}
                color={dataMode === "actual" ? colors.primary : colors.textMuted}
              />
              <Text style={[s.modeToggleBtnTxt, dataMode === "actual" && s.modeToggleBtnTxtActive]}>
                Actual Project
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ── Sub-Navigation Bar ─────────────────────────────────────────────── */}
      <View style={s.navBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.navBarScroll}>
          {SUB_TABS.map((tab) => {
            const on = activeSubTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveSubTab(tab.key)}
                style={[
                  s.subTabBtn,
                  on && {
                    backgroundColor: tab.color + "16",
                    borderColor: tab.color + "44",
                  },
                ]}
              >
                <Ionicons name={tab.icon} size={15} color={on ? tab.color : colors.textFaint} />
                <Text style={[s.subTabTxt, on && { color: tab.color, fontWeight: "700" }]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Render Content View ────────────────────────────────────────────── */}
      {renderContent()}

      {/* ── Add Dependency modal (Scrum persistent) ── */}
      <ModalSheet visible={showAddDep} onClose={() => setShowAddDep(false)} title="Add Dependency">
        <View style={{ gap: 10 }}>
          <Text style={s.pickLabel}>Prerequisite — must finish first</Text>
          <TaskPicker
            tasks={depData?.tasks && depData.tasks.length > 0 ? depData.tasks : tasks}
            selected={depFirst}
            onSelect={setDepFirst}
            accent={colors.dfs}
          />
          <View style={s.arrow}><Ionicons name="arrow-down" size={18} color={colors.textFaint} /></View>
          <Text style={s.pickLabel}>Dependent — runs after</Text>
          <TaskPicker
            tasks={depData?.tasks && depData.tasks.length > 0 ? depData.tasks : tasks}
            selected={depThen}
            onSelect={setDepThen}
            accent={colors.topo}
          />
          <Button
            title={addingDep ? "Adding edge..." : "Add edge"}
            icon="checkmark"
            loading={addingDep}
            disabled={addingDep || !depFirst || !depThen}
            onPress={handleAddDependency}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </ModalSheet>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  loadingWrap: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  provenanceBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  provenanceBannerLive: {
    backgroundColor: "#f0fdf4",
    borderBottomColor: "#bbf7d0",
  },
  provenanceBannerDemo: {
    backgroundColor: "#fffbeb",
    borderBottomColor: "#fde68a",
  },
  provenanceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  provenanceIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  provenanceIconLive: {
    backgroundColor: "#dcfce7",
  },
  provenanceIconDemo: {
    backgroundColor: "#fef3c7",
  },
  provenanceTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.text,
  },
  provenanceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  provenanceBadgeLive: {
    backgroundColor: "#bbf7d0",
  },
  provenanceBadgeDemo: {
    backgroundColor: "#fde68a",
  },
  provenanceBadgeTxt: {
    fontSize: 9,
    fontWeight: "800",
  },
  provenanceBadgeTxtLive: {
    color: "#166534",
  },
  provenanceBadgeTxtDemo: {
    color: "#92400e",
  },
  provenanceDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  modeToggleGroup: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
    gap: 2,
  },
  modeToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.xs,
  },
  modeToggleBtnActive: {
    backgroundColor: colors.bg,
  },
  modeToggleBtnTxt: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  modeToggleBtnTxtActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  navBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.xs,
  },
  navBarScroll: {
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  subTabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  subTabTxt: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  subSection: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  metricCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  metricCardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  metricCardSub: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  gradeCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  gradeTxt: {
    fontSize: 16,
    fontWeight: "900",
  },
  sectionMiniHead: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textSecondary,
    textTransform: "uppercase",
  },
  factorRow: {
    paddingVertical: 4,
  },
  factorName: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  factorScore: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
  },
  factorDesc: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  statPill: {
    flex: 1,
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  statPillNum: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  statPillLbl: {
    fontSize: 10,
    color: colors.textMuted,
  },
  emptyNoticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 6,
  },
  emptyNoticeTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  emptyNoticeTxt: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  velocityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: colors.border,
  },
  velocitySprintName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  velocityMeta: {
    fontSize: 11,
    color: colors.textMuted,
  },
  velocityPtsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "#dbeafe",
  },
  velocityPtsTxt: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1e40af",
  },
  flowRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  flowCol: {
    flex: 1,
    alignItems: "center",
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  flowColorBar: {
    width: "100%",
    height: 3,
    borderRadius: 2,
  },
  flowCount: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  flowLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
    textAlign: "center",
  },
  actionItemCard: {
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  actionItemTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
  },
  actionItemOwner: {
    fontSize: 11,
    color: colors.textMuted,
  },
  actionItemDue: {
    fontSize: 11,
    color: colors.textMuted,
  },
  soloBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    marginTop: 6,
  },
  soloBannerTxt: {
    fontSize: 12,
    color: "#1e40af",
    flex: 1,
  },
  memberCapCard: {
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  memberName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  memberUtil: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  memberTaskMeta: {
    fontSize: 11,
    color: colors.textMuted,
  },
  safeRiskBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    marginTop: 6,
  },
  safeRiskTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#166534",
  },
  safeRiskTxt: {
    fontSize: 12,
    color: "#15803d",
    lineHeight: 16,
  },
  neutralRiskBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 6,
  },
  neutralRiskTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  neutralRiskTxt: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 16,
  },
  riskCard: {
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: "#fff5f5",
    borderWidth: 1,
    borderColor: "#fecaca",
    gap: 6,
  },
  riskTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#991b1b",
    flex: 1,
  },
  riskEvidence: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  riskActionBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ffffff",
    padding: 6,
    borderRadius: 4,
  },
  riskActionTxt: {
    fontSize: 11,
    color: "#1e40af",
    fontWeight: "600",
  },
  dagCard: {
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  dagTaskTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  dagDepTxt: {
    fontSize: 11,
    color: colors.textMuted,
  },
  toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm, marginBottom: 8 },
  toolbarSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  algoChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6,
  },
  algoChipLabel: { fontSize: 10.5, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.2 },
  algoChipValue: { fontSize: 10.5, fontWeight: "700", color: colors.primary },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md, marginBottom: 8 },
  sectionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  sectionSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  taskCard: {
    flexGrow: 1, flexBasis: 240, maxWidth: 420, gap: 8,
    backgroundColor: "rgba(255,255,255,0.82)", borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 5, padding: spacing.md,
  },
  taskTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  taskTitle: { flex: 1, fontSize: 13.5, fontWeight: "700", color: colors.text, lineHeight: 18 },
  taskMetaRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  metaTxt: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  glassCard: {
    backgroundColor: "rgba(255,255,255,0.72)", borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: 8,
  },
  graphCard: {
    borderRadius: radius.lg, overflow: "hidden",
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  pickLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  picker: { maxHeight: 150, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border, borderLeftWidth: 3, borderLeftColor: "transparent" },
  pickTxt: { flex: 1, fontSize: 13, color: colors.text, fontWeight: "500" },
  arrow: { alignItems: "center", paddingVertical: 2 },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
    marginBottom: spacing.xs,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primarySoft || "rgba(13,148,136,0.12)",
    borderColor: colors.primary,
  },
  warningCard: {
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    gap: 6,
    marginBottom: 8,
  },
  warningEvidenceBox: {
    backgroundColor: "rgba(0,0,0,0.03)",
    padding: 8,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  warningActionBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(13,148,136,0.08)",
    padding: 8,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  verifiedSkillPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full || 999,
  },
  verifiedSkillTxt: {
    fontSize: 11,
    color: "#166534",
    fontWeight: "600",
  },
  gapCard: {
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: "#d97706",
    gap: 6,
  },
  gapTaskTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  gapFinding: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  gapActionBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    padding: 8,
    borderRadius: radius.sm,
    marginTop: 2,
  },
  gapActionTxt: {
    fontSize: 12,
    color: "#92400e",
    flex: 1,
  },
  assignCard: {
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  assignTaskTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  assignTaskSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  fitBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  fitBadgeTxt: {
    fontSize: 12,
    fontWeight: "800",
  },
  impactBox: {
    backgroundColor: "rgba(0,0,0,0.02)",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    borderRadius: radius.sm,
    gap: 4,
  },
  impactHeader: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  rationaleTxt: {
    fontSize: 12,
    color: colors.text,
  },
  impactTxt: {
    fontSize: 12,
    color: colors.textMuted,
  },
  altRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  altLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  altChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.surfaceHover || "rgba(0,0,0,0.04)",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  altTxt: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "600",
  },

  analyticsHeaderTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  analyticsProvenanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  analyticsProvenanceBadgeTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0369a1",
  },
  sprintSelectorContainer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    gap: 8,
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  sprintSelectPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#ffffff",
  },
  sprintSelectPillTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  statusMiniBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusMiniBadgeTxt: {
    fontSize: 10,
    fontWeight: "800",
  },
  sprintDetailsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 16,
    gap: 12,
  },
  sprintTitleTxt: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
  },
  sprintGoalTxt: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  daysRemainingTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: 4,
  },
  overviewMetricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  overviewMetricBox: {
    flexGrow: 1,
    flexBasis: 140,
    padding: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    gap: 4,
  },
  overviewMetricNum: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  overviewMetricLbl: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  burndownLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendTxt: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  burndownChartContainer: {
    marginTop: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    gap: 12,
  },
  burndownBarsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 140,
    paddingTop: 10,
    paddingBottom: 6,
  },
  burndownBarCol: {
    flex: 1,
    alignItems: "center",
    height: "100%",
    justifyContent: "flex-end",
    gap: 4,
  },
  burndownBarPair: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: 100,
  },
  burndownBarIdeal: {
    width: 8,
    backgroundColor: "#cbd5e1",
    borderRadius: 3,
  },
  burndownBarActual: {
    width: 8,
    backgroundColor: "#2563eb",
    borderRadius: 3,
  },
  burndownDayLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    color: colors.textMuted,
  },
  burndownPtsLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  burndownFooterNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    padding: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  burndownFooterTxt: {
    fontSize: 11.5,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  integrityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  integrityBadgeTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166534",
  },
  flowGridRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  flowMetricCard: {
    flexGrow: 1,
    flexBasis: 120,
    padding: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderRadius: radius.sm,
    gap: 3,
  },
  flowMetricTitle: {
    fontSize: 12,
    fontWeight: "800",
  },
  flowMetricCount: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  flowMetricSub: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  velocitySummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  velocitySummaryBox: {
    flexGrow: 1,
    flexBasis: 140,
    padding: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    gap: 2,
  },
  velocitySummaryNum: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  velocitySummaryLbl: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  unassignedAlertBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    padding: 10,
    borderRadius: radius.sm,
    marginTop: 8,
  },
  unassignedAlertTxt: {
    fontSize: 12,
    color: "#92400e",
    flex: 1,
  },
  memberWorkloadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    gap: 10,
  },
  memberWorkloadName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.text,
  },
  memberWorkloadRole: {
    fontSize: 12,
    color: colors.textMuted,
  },
  memberWorkloadSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  overloadBadge: {
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fca5a5",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  overloadBadgeTxt: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#991b1b",
  },
  memberUtilBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: radius.pill,
  },
  memberUtilBadgeTxt: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  carryOverItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    backgroundColor: "#fef3c7",
    borderRadius: radius.sm,
  },
  carryOverItemTxt: {
    fontSize: 12,
    color: "#92400e",
    fontWeight: "600",
  },

  bulkSummaryBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  bulkSummaryTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  bulkSummarySub: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  bulkStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bulkStatPill: {
    flex: 1,
    minWidth: 80,
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  bulkStatNum: {
    fontSize: 18,
    fontWeight: "800",
  },
  bulkStatLbl: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: 2,
  },
  bulkResultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    gap: 8,
  },
  bulkResultTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.text,
  },
  bulkResultSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  bulkIntroBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  bulkIntroTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1e40af",
  },
  bulkIntroSub: {
    fontSize: 12,
    color: "#1d4ed8",
    marginTop: 2,
    lineHeight: 16,
  },
  overrunWarningBox: {
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    gap: 6,
  },
  overrunWarningTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#92400e",
  },
  overrunWarningTxt: {
    fontSize: 11.5,
    color: "#78350f",
    lineHeight: 16,
  },
  overrideToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    padding: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#fde68a",
    marginTop: 4,
  },
  overrideToggleTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: "#92400e",
    flex: 1,
  },
  bulkReviewHeader: {
    fontSize: 11.5,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  bulkPreviewCard: {
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  bulkPreviewTaskTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  bulkPreviewTaskSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  bulkPreviewAssignee: {
    fontSize: 11.5,
    color: colors.text,
  },
  bulkPreviewLoad: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "600",
  },
});

// ── Section header with icon well ─────────────────────────────────────────────
function SectionHead({ icon, tint, title, sub }: {
  icon: keyof typeof Ionicons.glyphMap; tint: string; title: string; sub: string;
}) {
  return (
    <View style={s.sectionHead}>
      <View style={[s.sectionIcon, { backgroundColor: tint + "1a" }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionSub}>{sub}</Text>
      </View>
    </View>
  );
}

// ── Informational algorithm chip (display only) ───────────────────────────────
function AlgoChip({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={s.algoChip}>
      <Ionicons name={icon} size={13} color={colors.primary} />
      <Text style={s.algoChipLabel}>{label}</Text>
      <Text style={s.algoChipValue}>{value}</Text>
    </View>
  );
}

// ── Section 1 card: name, priority, status, member, hours, points, sprint ───────
function TaskInfoCard({ task, member }: { task: any; member: string | null }) {
  const isBacklog = !task.sprintId;
  const sprintLabel = task.sprintName || (isBacklog ? "Product Backlog" : "Sprint Item");
  const prioColor = (task.priority || 50) >= 75 ? colors.danger : (task.priority || 50) >= 50 ? colors.warning : colors.primary;
  const statusLabel = task.scrumStatus || task.status || "TODO";

  return (
    <View style={[s.taskCard, { borderLeftColor: prioColor }]}>
      <View style={s.taskTop}>
        <Text style={s.taskTitle} numberOfLines={2}>{task.title}</Text>
        <Badge
          label={(task.priorityLabel || ((task.priority || 50) >= 75 ? "HIGH" : "MEDIUM")).toUpperCase()}
          variant={(task.priority || 50) >= 75 ? "danger" : "warning"}
          size="sm"
        />
      </View>
      <View style={s.taskMetaRow}>
        <View style={s.metaItem}>
          <View style={[s.statusDot, { backgroundColor: statusLabel.toLowerCase().includes("done") ? colors.success : colors.topo }]} />
          <Text style={s.metaTxt}>{statusLabel}</Text>
        </View>
        <View style={s.metaItem}>
          <Ionicons name="flag-outline" size={12} color={colors.textFaint} />
          <Text style={s.metaTxt} numberOfLines={1}>{sprintLabel}</Text>
        </View>
      </View>
      <View style={s.taskMetaRow}>
        <View style={s.metaItem}>
          <Ionicons name="person-outline" size={12} color={colors.textFaint} />
          <Text style={s.metaTxt} numberOfLines={1}>{member || "Unassigned"}</Text>
        </View>
        <View style={s.metaItem}>
          <Ionicons name="time-outline" size={12} color={colors.textFaint} />
          <Text style={s.metaTxt}>{task.storyPoints || 3} pts · ~{task.estimatedHours || 6}h</Text>
        </View>
      </View>
      {task.prerequisites && task.prerequisites.length > 0 && (
        <View style={{ marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: "600" }}>
            Prereqs: {task.prerequisites.map((p: any) => p.title).join(", ")}
          </Text>
        </View>
      )}
    </View>
  );
}

function TaskPicker({ tasks, selected, onSelect, accent }: {
  tasks: { _id: string; title: string; sprintName?: string }[];
  selected: string;
  onSelect: (id: string) => void;
  accent: string;
}) {
  return (
    <ScrollView style={s.picker} nestedScrollEnabled>
      {tasks.map((t) => {
        const isSel = selected === t._id;
        return (
          <Pressable
            key={t._id}
            onPress={() => onSelect(t._id)}
            style={[s.pickRow, isSel && { backgroundColor: accent + "14", borderColor: accent }]}
          >
            <Ionicons
              name={isSel ? "radio-button-on" : "radio-button-off"}
              size={16}
              color={isSel ? accent : colors.textFaint}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.pickTxt} numberOfLines={1}>{t.title}</Text>
              {t.sprintName && (
                <Text style={{ fontSize: 10, color: colors.textMuted }}>{t.sprintName}</Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
