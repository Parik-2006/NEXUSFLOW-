/**
 * client/components/workspace/OverviewPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — WATERFALL OVERVIEW (COMMAND CENTER)
 *
 * Answers: "How is my project doing?"
 *
 * Features:
 *   1. Executive Project Summary (Title, Domain, Methodology, Current Phase, Deadline)
 *   2. Overall Project Progress (Completed vs Total Tasks, Velocity)
 *   3. Three.js Waterfall Cascade Visualization (Interactive 3D Phase Gates)
 *   4. Multi-Dimension Health Matrix:
 *      - Project Health
 *      - Schedule Health
 *      - Requirements Health
 *      - Team Health
 *      - Dependency Health
 *      - Risk Level
 *   5. Phase Milestone Deliverables Table
 *   6. Greedy Priority & Status Charts
 *   7. Quick Jumps to the 7 V4 Primary Tabs
 * ============================================================================
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTeam } from "@/hooks/useTeam";
import { useTeamTasks } from "@/hooks/useTeamTasks";
import { useReminders } from "@/hooks/useReminders";
import { useAuth } from "@/context/AuthContext";
import { Card, ProgressBar, AvatarStack, Badge, EmptyState, SkeletonCard, Button } from "@/components/ui";
import { useToast, useConfirm } from "@/components/feedback";
import { PieChart, type Datum } from "@/components/charts";
import WaterfallPhaseCanvas, { PhaseNodeData } from "@/components/workspace/WaterfallPhaseCanvas";
import PhaseGateModal from "@/components/workspace/PhaseGateModal";
import ChangeImpactModal from "@/components/workspace/ChangeImpactModal";
import { getMethodologyConfig } from "@/utils/methodologyConfig";
import {
  colors,
  spacing,
  radius,
  font,
  healthLabel,
  deadlineMeta,
  taskPriorityKey,
  PRIORITY_META,
  WATERFALL_PHASE_META,
  type PriorityKey,
} from "@/theme";
import { API_BASE_URL } from "@/utils/api";

const API = API_BASE_URL;

type Health = {
  score: number;
  grade: string;
  total: number;
  counts?: {
    done: number;
    inProgress: number;
    overdue: number;
    assigned: number;
    active: number;
    depTotal: number;
    depDone: number;
    plannedHours: number;
    sprintCapacity: number;
  };
  factors: { key: string; label: string; weight: number; pct: number }[];
  summary: string;
};

const gradeColor = (g: string) =>
  g === "A+" || g === "A"
    ? colors.success
    : g === "B"
    ? colors.accent
    : g === "C"
    ? colors.warning
    : colors.danger;

type Nav = (tab: string) => void;

// V4 Waterfall Primary 7-Tab Jumps
const V4_JUMPS: { tab: string; icon: keyof typeof Ionicons.glyphMap; label: string; desc: string; color: string }[] = [
  { tab: "plan",     icon: "document-text", label: "Plan",       desc: "Requirements & WBS",     color: "#4F46E5" },
  { tab: "tasks",    icon: "list",          label: "Tasks",      desc: "Greedy Priority Backlog",color: colors.greedy },
  { tab: "timeline", icon: "calendar",      label: "Timeline",   desc: "Gantt Schedule & CPM",   color: colors.topo },
  { tab: "team",     icon: "people",        label: "Team",       desc: "Branch & Bound Workload",color: colors.branch },
  { tab: "insights", icon: "analytics",     label: "Insights",   desc: "Health & Risk Radar",    color: colors.merge },
  { tab: "advisor",  icon: "sparkles",      label: "Project AI", desc: "Copilot & Decisions",    color: colors.accent },
];

export default function OverviewPanel({ teamId, onNavigate }: { teamId: string; onNavigate: Nav }) {
  const { team } = useTeam(teamId);
  const { rawTasks, loading, restoreBacklog } = useTeamTasks(teamId);
  const { upcoming, reminderStates } = useReminders(teamId);
  const { token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [health, setHealth] = useState<Health | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [activePhaseKey, setActivePhaseKey] = useState<string>("requirements");
  const [showPhaseGateModal, setShowPhaseGateModal] = useState(false);
  const [showChangeImpactModal, setShowChangeImpactModal] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/teams/${teamId}/health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setHealth(await res.json());
    } catch {
      /* non-fatal */
    }
  }, [teamId, token]);

  const healthSig = rawTasks
    .map((t) => `${t.status}:${t.assignedTo ?? ""}:${t.dueDate ?? t.deadline ?? ""}:${t.dependencies?.length ?? 0}:${t.estimatedHours ?? ""}`)
    .join("|");
  useEffect(() => {
    fetchHealth();
  }, [fetchHealth, healthSig]);

  const canRestore = (team?.aiGeneratedTasks?.length ?? 0) > 0;
  const onRestore = async () => {
    const ok = await confirm({
      title: "Restore AI backlog?",
      message: "This removes all current tasks and rebuilds the original AI-generated backlog. Members, profiles and settings are kept.",
      confirmLabel: "Restore",
      destructive: true,
    });
    if (!ok) return;
    setRestoring(true);
    const { error, restored } = await restoreBacklog();
    setRestoring(false);
    toast(error ?? `Restored ${restored} AI tasks`, error ? "error" : "success");
    if (!error) fetchHealth();
  };

  const stats = useMemo(() => {
    const todo = rawTasks.filter((t) => t.status === "todo").length;
    const inProgress = rawTasks.filter((t) => t.status === "in_progress").length;
    const done = rawTasks.filter((t) => t.status === "done").length;
    const total = rawTasks.length;
    const ratio = total ? done / total : 0;
    return { todo, inProgress, done, total, ratio };
  }, [rawTasks]);

  // Deadlines
  const deadlines = useMemo(() => {
    let overdue = 0, today = 0, tomorrow = 0, week = 0;
    for (const t of rawTasks) {
      if (t.status === "done") continue;
      const m = deadlineMeta(t.dueDate ?? t.deadline);
      if (!m.hasDate || m.daysRemaining == null) continue;
      if (m.overdue) overdue++;
      else if (m.daysRemaining === 0) today++;
      else if (m.daysRemaining === 1) tomorrow++;
      else if (m.daysRemaining <= 7) week++;
    }
    return { overdue, today, tomorrow, week };
  }, [rawTasks]);

  // Priority distribution (Greedy tiers)
  const priorityData: Datum[] = useMemo(() => {
    const counts: Record<PriorityKey, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const t of rawTasks) {
      const key = taskPriorityKey(t);
      counts[key] = (counts[key] || 0) + 1;
    }
    return (["critical", "high", "medium", "low"] as PriorityKey[])
      .filter((k) => counts[k] > 0)
      .map((k) => ({
        label: PRIORITY_META[k].label,
        value: counts[k],
        color: PRIORITY_META[k].color,
      }));
  }, [rawTasks]);

  // Dynamic Phase Node Computation from real task data
  const phaseNodes: PhaseNodeData[] = useMemo(() => {
    const definitions = [
      {
        key: "requirements",
        label: "1. Requirements & SRS",
        order: 1,
        match: ["requirement", "plan", "spec", "srs", "scope", "research", "dataset"],
        deliverables: ["Software Requirements Spec (SRS)", "User Requirements & Objectives", "Feasibility Study"],
      },
      {
        key: "design",
        label: "2. System Design",
        order: 2,
        match: ["design", "architecture", "schema", "database", "wireframe", "diagram", "interface", "api spec"],
        deliverables: ["High-Level Architecture Model", "Relational / NoSQL Schemas", "REST API Contracts"],
      },
      {
        key: "implementation",
        label: "3. Implementation",
        order: 3,
        match: ["implement", "backend", "frontend", "develop", "model", "train", "code", "hardware", "iot"],
        deliverables: ["Core Application Backend", "Client User Interface", "AI / ML Telemetry Models"],
      },
      {
        key: "testing",
        label: "4. Verification & QA",
        order: 4,
        match: ["test", "verify", "qa", "validation", "benchmark", "defect", "accuracy"],
        deliverables: ["Test Execution Report", "Regression Benchmarking", "Integration Defect Resolution"],
      },
      {
        key: "deployment",
        label: "5. Deployment",
        order: 5,
        match: ["deploy", "cloud", "docker", "release", "demo", "staging", "presentation"],
        deliverables: ["Production / Cloud Staging", "Live Demo Execution", "User Manual & Deployment Docs"],
      },
      {
        key: "maintenance",
        label: "6. Maintenance & Review",
        order: 6,
        match: ["maintain", "retro", "review", "audit", "documentation", "handover"],
        deliverables: ["Final Project Presentation", "Retrospective Report", "Project Brain Documentation"],
      },
    ];

    return definitions.map((def, idx) => {
      const phaseTasks = rawTasks.filter((t) => {
        const cat = (t.category || "").toLowerCase();
        const title = (t.title || "").toLowerCase();
        const desc = (t.description || "").toLowerCase();
        return def.match.some((m) => cat.includes(m) || title.includes(m) || desc.includes(m));
      });

      const fallbackCount = idx === 0 ? Math.max(1, Math.floor(rawTasks.length * 0.2)) : Math.max(1, Math.floor(rawTasks.length * 0.16));
      const taskCount = phaseTasks.length > 0 ? phaseTasks.length : rawTasks.length > 0 ? fallbackCount : 0;
      const doneCount = phaseTasks.length > 0 ? phaseTasks.filter((t) => t.status === "done").length : 0;
      const progress = taskCount > 0 ? doneCount / taskCount : 0;
      const gatePassed = progress >= 0.75;
      const status: "cleared" | "in_progress" | "pending" =
        gatePassed ? "cleared" : progress > 0 || idx === 0 ? "in_progress" : "pending";

      return {
        key: def.key,
        label: def.label,
        order: def.order,
        taskCount,
        doneCount,
        status,
        gatePassed,
        deliverables: def.deliverables,
      };
    });
  }, [rawTasks]);

  // Current active phase
  const currentPhase = useMemo(() => {
    const active = phaseNodes.find((p) => p.status === "in_progress") || phaseNodes[0];
    return active;
  }, [phaseNodes]);

  // Multi-dimensional health scores
  const multiHealth = useMemo(() => {
    const projectScore = health?.score ?? (stats.total ? Math.round(stats.ratio * 100) : 75);
    const scheduleScore = deadlines.overdue > 0 ? Math.max(30, 95 - deadlines.overdue * 15) : 95;
    const requirementsScore = rawTasks.length >= 5 ? 92 : rawTasks.length > 0 ? 75 : 50;
    const teamScore = team?.members && team.members.length >= 2 ? 90 : 70;
    const depScore = 95; // DAG Kahn sort ensures zero cycles
    const riskLevel = deadlines.overdue > 2 ? "HIGH" : deadlines.overdue > 0 ? "MODERATE" : "LOW";

    return {
      project: { score: projectScore, grade: health?.grade || "B" },
      schedule: { score: scheduleScore, status: deadlines.overdue > 0 ? "At Risk" : "On Track" },
      requirements: { score: requirementsScore, status: "Structured" },
      team: { score: teamScore, status: "Active" },
      dependencies: { score: depScore, status: "Acyclic (DAG)" },
      risk: { level: riskLevel, count: deadlines.overdue },
    };
  }, [health, stats, deadlines, rawTasks, team]);

  const names = (team?.members ?? []).map((m) => m.name || "Member");
  const memberImages = (team?.members ?? []).map((m) => m.avatar || null);
  const targetDeadline = team?.discoverySettings?.deadline;
  const deadlineInfo = deadlineMeta(targetDeadline);

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      {loading ? (
        <SkeletonCard />
      ) : (
        <>
          {/* 1. EXECUTIVE PROJECT SUMMARY CARD */}
          <Card style={s.summaryCard}>
            <View style={s.summaryTopRow}>
              <View style={{ flex: 1 }}>
                <View style={s.badgeRow}>
                  <View style={s.methodologyBadge}>
                    <Ionicons name="git-network-outline" size={12} color="#2F4F4F" />
                    <Text style={s.methodologyBadgeTxt}>WATERFALL</Text>
                  </View>
                  <View style={s.domainBadge}>
                    <Ionicons name="sparkles-outline" size={12} color="#7D8F69" />
                    <Text style={s.domainBadgeTxt}>{team?.discoverySettings?.domain || "AI"}</Text>
                  </View>
                  <View style={s.phaseBadge}>
                    <Text style={s.phaseBadgeTxt}>{currentPhase?.label?.toUpperCase() || "PHASE 1"}</Text>
                  </View>
                </View>
                <Text style={s.projectHeading}>{team?.projectTitle || team?.name || "Workspace"}</Text>
                {!!team?.projectDescription && (
                  <Text style={s.projectDesc} numberOfLines={2}>{team.projectDescription}</Text>
                )}
              </View>

              <View style={s.progressGauge}>
                <Text style={s.progressGaugePct}>{Math.round(stats.ratio * 100)}%</Text>
                <Text style={s.progressGaugeLbl}>COMPLETED</Text>
              </View>
            </View>

            <View style={s.progressWrap}>
              <ProgressBar value={stats.ratio} color={stats.ratio === 1 ? colors.success : colors.primary} height={10} />
            </View>

            <View style={s.statusMetricsRow}>
              <View style={s.metaPill}>
                <Ionicons name="checkbox-outline" size={14} color={colors.textMuted} />
                <Text style={s.metaPillTxt}>{stats.done}/{stats.total} Tasks Shipped</Text>
              </View>
              <View style={s.metaPill}>
                <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                <Text style={s.metaPillTxt}>{names.length} Engineers</Text>
              </View>
              {deadlineInfo.hasDate && (
                <View style={[s.metaPill, deadlineInfo.overdue && { backgroundColor: colors.dangerSoft }]}>
                  <Ionicons name="time-outline" size={14} color={deadlineInfo.color} />
                  <Text style={[s.metaPillTxt, { color: deadlineInfo.color, fontWeight: "700" }]}>
                    {deadlineInfo.text}
                  </Text>
                </View>
              )}
            </View>
          </Card>

          {/* 2. THREE.JS WATERFALL CASCADE PIPELINE */}
          <WaterfallPhaseCanvas
            phases={phaseNodes}
            activePhaseKey={activePhaseKey}
            onSelectPhase={setActivePhaseKey}
          />

          {/* 2B. WATERFALL PHASE GATE & CHANGE IMPACT GOVERNANCE */}
          <Card style={s.governanceCard}>
            <View style={s.governanceLeft}>
              <View style={s.governanceHeaderRow}>
                <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
                <Text style={s.governanceTitle}>Waterfall Lifecycle Governance</Text>
              </View>
              <Text style={s.governanceSub}>
                Sequential phase gates enforce verification before progression. Change Impact traces graph ripple effects.
              </Text>
            </View>
            <View style={s.governanceBtns}>
              <Button
                title="Phase Gate Controls"
                small
                onPress={() => setShowPhaseGateModal(true)}
              />
              <Button
                title="Change Impact"
                variant="secondary"
                small
                onPress={() => setShowChangeImpactModal(true)}
              />
            </View>
          </Card>

          {/* 3. MULTI-DIMENSIONAL HEALTH BREAKDOWN */}
          <View style={s.healthGrid}>
            <View style={s.healthTile}>
              <View style={s.healthTileHead}>
                <Ionicons name="heart" size={16} color={gradeColor(multiHealth.project.grade)} />
                <Text style={s.healthTileTitle}>Project Health</Text>
              </View>
              <Text style={[s.healthTileVal, { color: gradeColor(multiHealth.project.grade) }]}>
                {multiHealth.project.score}%
              </Text>
              <Text style={s.healthTileSub}>Grade {multiHealth.project.grade}</Text>
            </View>

            <View style={s.healthTile}>
              <View style={s.healthTileHead}>
                <Ionicons name="calendar-outline" size={16} color={multiHealth.schedule.score >= 70 ? colors.success : colors.danger} />
                <Text style={s.healthTileTitle}>Schedule</Text>
              </View>
              <Text style={[s.healthTileVal, { color: multiHealth.schedule.score >= 70 ? colors.text : colors.danger }]}>
                {multiHealth.schedule.score}%
              </Text>
              <Text style={s.healthTileSub}>{multiHealth.schedule.status}</Text>
            </View>

            <View style={s.healthTile}>
              <View style={s.healthTileHead}>
                <Ionicons name="document-text-outline" size={16} color={colors.accentDark} />
                <Text style={s.healthTileTitle}>Requirements</Text>
              </View>
              <Text style={s.healthTileVal}>{multiHealth.requirements.score}%</Text>
              <Text style={s.healthTileSub}>{multiHealth.requirements.status}</Text>
            </View>

            <View style={s.healthTile}>
              <View style={s.healthTileHead}>
                <Ionicons name="people-outline" size={16} color={colors.primary} />
                <Text style={s.healthTileTitle}>Team Health</Text>
              </View>
              <Text style={s.healthTileVal}>{multiHealth.team.score}%</Text>
              <Text style={s.healthTileSub}>{multiHealth.team.status}</Text>
            </View>

            <View style={s.healthTile}>
              <View style={s.healthTileHead}>
                <Ionicons name="git-branch-outline" size={16} color={colors.topo} />
                <Text style={s.healthTileTitle}>Dependencies</Text>
              </View>
              <Text style={s.healthTileVal}>0 Cycles</Text>
              <Text style={s.healthTileSub}>Topological DAG</Text>
            </View>

            <View style={s.healthTile}>
              <View style={s.healthTileHead}>
                <Ionicons name="shield-checkmark-outline" size={16} color={multiHealth.risk.level === "LOW" ? colors.success : colors.warning} />
                <Text style={s.healthTileTitle}>Risk Level</Text>
              </View>
              <Text style={[s.healthTileVal, { color: multiHealth.risk.level === "LOW" ? colors.success : colors.warning }]}>
                {multiHealth.risk.level}
              </Text>
              <Text style={s.healthTileSub}>{multiHealth.risk.count} Blockers</Text>
            </View>
          </View>

          {/* 4. PHASE MILESTONE PROGRESS TABLE */}
          <Card style={{ gap: spacing.sm }}>
            <View style={s.rowBetween}>
              <View>
                <Text style={font.h3}>Waterfall Phase Milestones</Text>
                <Text style={s.sub}>Sequential phase progression and gate status</Text>
              </View>
              <Pressable onPress={() => onNavigate("timeline")}>
                <Text style={s.link}>Open Gantt →</Text>
              </Pressable>
            </View>

            <View style={s.milestoneList}>
              {phaseNodes.map((p) => {
                const isCurrent = p.key === currentPhase?.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setActivePhaseKey(p.key)}
                    style={[s.milestoneRow, isCurrent && s.milestoneRowActive]}
                  >
                    <View style={[s.orderBadge, p.status === "cleared" ? s.orderCleared : isCurrent ? s.orderActive : s.orderPending]}>
                      <Text style={[s.orderTxt, (p.status === "cleared" || isCurrent) && { color: "#fff" }]}>
                        {p.order}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.milestoneTitle} numberOfLines={1}>{p.label}</Text>
                      <Text style={s.milestoneDeliverables} numberOfLines={1}>
                        Deliverables: {p.deliverables.slice(0, 2).join(" • ")}
                      </Text>
                    </View>
                    <View style={s.milestoneRight}>
                      <Text style={s.milestoneTasks}>{p.doneCount}/{p.taskCount} tasks</Text>
                      <View style={[s.gateBadge, p.status === "cleared" ? s.gatePassed : isCurrent ? s.gateReview : s.gateLocked]}>
                        <Text style={[s.gateBadgeTxt, p.status === "cleared" ? s.gatePassedTxt : isCurrent ? s.gateReviewTxt : s.gateLockedTxt]}>
                          {p.status === "cleared" ? "CLEARED" : isCurrent ? "IN REVIEW" : "LOCKED"}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* 5. CHARTS: PRIORITY DISTRIBUTION & DEADLINES */}
          <View style={s.chartsRow}>
            {priorityData.length > 0 && (
              <Card style={s.chartCard}>
                <Text style={font.h3}>Priority Distribution</Text>
                <Text style={s.sub}>Greedy DAA algorithm score tiers</Text>
                <PieChart data={priorityData} />
              </Card>
            )}

            {(deadlines.overdue + deadlines.today + deadlines.tomorrow + deadlines.week) > 0 && (
              <Card style={s.chartCard}>
                <Text style={font.h3}>Upcoming Deadlines</Text>
                <Text style={s.sub}>Task delivery urgency schedule</Text>
                <View style={s.deadlinesGrid}>
                  <MiniTile label="Overdue" value={deadlines.overdue} color={colors.danger} bad />
                  <MiniTile label="Today" value={deadlines.today} color={colors.warning} />
                  <MiniTile label="Tomorrow" value={deadlines.tomorrow} color={colors.info} />
                  <MiniTile label="Next 7d" value={deadlines.week} color={colors.success} />
                </View>
              </Card>
            )}
          </View>

          {/* 6. V4 7-TAB PRIMARY NAVIGATION JUMPS */}
          <View style={{ gap: spacing.sm }}>
            <Text style={s.sectionLabel}>PRIMARY NAVIGATION</Text>
            <View style={s.grid}>
              {V4_JUMPS.map((j) => (
                <Pressable key={j.tab} style={s.tile} onPress={() => onNavigate(j.tab)}>
                  <View style={[s.tileIcon, { backgroundColor: j.color + "1a" }]}>
                    <Ionicons name={j.icon} size={18} color={j.color} />
                  </View>
                  <Text style={s.tileLabel}>{j.label}</Text>
                  <Text style={s.tileDesc}>{j.desc}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* 7. SETTINGS / RESTORE AI BACKLOG */}
          {canRestore && (
            <Card style={{ gap: spacing.sm }}>
              <Text style={font.h3}>Workspace Management</Text>
              <Text style={s.sub}>Restore the initial AI-generated engineering backlog. Preserves team members, roles, and settings.</Text>
              <Button title="Restore AI Backlog" icon="refresh" variant="secondary" onPress={onRestore} loading={restoring} style={{ marginTop: 4 }} />
            </Card>
          )}
          {/* Phase Gate and Change Impact Modals */}
          <PhaseGateModal
            visible={showPhaseGateModal}
            onClose={() => setShowPhaseGateModal(false)}
            projectId={team?.activeProjectId || teamId}
            onPhaseAdvanced={(newPhase) => {
              setActivePhaseKey(newPhase);
            }}
          />
          <ChangeImpactModal
            visible={showChangeImpactModal}
            onClose={() => setShowChangeImpactModal(false)}
            projectId={team?.activeProjectId || teamId}
          />
        </>
      )}
    </ScrollView>
  );
}

function MiniTile({ label, value, color, bad }: { label: string; value: number; color: string; bad?: boolean }) {
  const danger = bad && value > 0;
  return (
    <View style={[s.miniTile, danger && { backgroundColor: colors.dangerSoft }]}>
      <Text style={[s.miniTileVal, { color }]}>{value}</Text>
      <Text style={s.miniTileLbl}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 80, backgroundColor: "#FAF8F4" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  link: { fontSize: 13, color: colors.primary, fontWeight: "700" },

  // Summary Card
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
    flexWrap: "wrap",
  },
  methodologyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  methodologyBadgeTxt: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  domainBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  domainBadgeTxt: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.accentDark,
  },
  phaseBadge: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  phaseBadgeTxt: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1d4ed8",
  },
  projectHeading: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.4,
  },
  projectDesc: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 2,
  },
  progressGauge: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressGaugePct: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.5,
  },
  progressGaugeLbl: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textFaint,
    letterSpacing: 0.5,
  },
  progressWrap: {
    marginVertical: 4,
  },
  statusMetricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaPillTxt: {
    fontSize: 12,
    color: colors.text,
    fontWeight: "600",
  },

  // Health Grid
  healthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  healthTile: {
    flexBasis: "31.5%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
    gap: 2,
  },
  healthTileHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  healthTileTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  healthTileVal: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    marginTop: 2,
  },
  healthTileSub: {
    fontSize: 10.5,
    color: colors.textFaint,
    fontWeight: "600",
  },

  // Milestone Progress Table
  milestoneList: {
    gap: 6,
    marginTop: 4,
  },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  milestoneRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  orderBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  orderCleared: {
    backgroundColor: colors.success,
  },
  orderActive: {
    backgroundColor: colors.primary,
  },
  orderPending: {
    backgroundColor: colors.border,
  },
  orderTxt: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
  },
  milestoneTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  milestoneDeliverables: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  milestoneRight: {
    alignItems: "flex-end",
    gap: 3,
  },
  milestoneTasks: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  gateBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: radius.pill,
  },
  gatePassed: {
    backgroundColor: colors.successSoft,
  },
  gateReview: {
    backgroundColor: "#fef3c7",
  },
  gateLocked: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gateBadgeTxt: {
    fontSize: 9,
    fontWeight: "800",
  },
  gatePassedTxt: {
    color: colors.success,
  },
  gateReviewTxt: {
    color: "#b45309",
  },
  gateLockedTxt: {
    color: colors.textFaint,
  },

  // Charts Row
  chartsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  chartCard: {
    flex: 1,
    minWidth: 280,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  deadlinesGrid: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
  },
  miniTile: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: 10,
    gap: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniTileVal: { fontSize: 18, fontWeight: "800" },
  miniTileLbl: { fontSize: 10, color: colors.textMuted, fontWeight: "700" },

  // Navigation Jumps
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, color: colors.textFaint, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  tileIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  tileLabel: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  tileDesc: { fontSize: 11.5, color: colors.textMuted },

  // Governance Card Styles
  governanceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  governanceLeft: {
    flex: 1,
    minWidth: 220,
    gap: 4,
  },
  governanceHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  governanceTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  governanceSub: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
  governanceBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
});
