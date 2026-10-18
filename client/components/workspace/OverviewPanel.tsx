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
import WaterfallGuideBanner from "@/components/WaterfallGuideBanner";
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

import PlanPanel from "@/components/workspace/PlanPanel";
import { useWaterfallPlanLifecycle } from "@/hooks/useWaterfallPlanLifecycle";

type Nav = (tab: string) => void;

// V4 Waterfall Primary 7-Tab Jumps (excluding current Overview tab)
const V4_JUMPS: { tab: string; icon: keyof typeof Ionicons.glyphMap; label: string; desc: string; color: string }[] = [
  { tab: "advisor",  icon: "sparkles",      label: "Project AI", desc: "Copilot & Decisions",    color: colors.accent },
  { tab: "team",     icon: "people",        label: "Team",       desc: "Branch & Bound Workload",color: colors.branch },
  { tab: "tasks",    icon: "list",          label: "Tasks",      desc: "Greedy Priority Backlog",color: colors.greedy },
  { tab: "timeline", icon: "calendar",      label: "Timeline",   desc: "Gantt Schedule & CPM",   color: colors.topo },
  { tab: "insights", icon: "analytics",     label: "Insights",   desc: "Health & Risk Radar",    color: colors.merge },
  { tab: "chat",      icon: "chatbubbles",  label: "Chat",       desc: "Team Collaboration",     color: colors.info },
];

export default function OverviewPanel({
  teamId,
  projectId,
  initialSection,
  onClearSection,
  onNavigate,
}: {
  teamId: string;
  projectId?: string;
  initialSection?: string | null;
  onClearSection?: () => void;
  onNavigate: Nav;
}) {
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

  const resolvedProjectId = projectId || team?.activeProjectId;
  const { lifecycle, readiness, refetchLifecycle } = useWaterfallPlanLifecycle(teamId, resolvedProjectId);
  const [activeSegment, setActiveSegment] = useState<"dashboard" | "plan">(
    initialSection === "plan" ? "plan" : "dashboard"
  );

  useEffect(() => {
    if (initialSection === "plan") {
      setActiveSegment("plan");
      if (onClearSection) onClearSection();
    }
  }, [initialSection, onClearSection]);

  const fetchHealth = useCallback(async () => {
    if (!teamId || typeof teamId !== "string" || !teamId.trim()) return;
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

    let priorCleared = true;
    let firstIncomplete: string | null = null;

    return definitions.map((def, idx) => {
      const phaseTasks = rawTasks.filter((t) => {
        const p = (t.phase || "").toLowerCase().trim();
        if (p === def.key) return true;
        const cat = (t.category || "").toLowerCase();
        const title = (t.title || "").toLowerCase();
        const desc = (t.description || "").toLowerCase();
        return def.match.some((m) => cat.includes(m) || title.includes(m) || desc.includes(m));
      });

      const taskCount = phaseTasks.length;
      const doneCount = phaseTasks.filter((t) => t.status === "done").length;
      const progress = taskCount > 0 ? doneCount / taskCount : (priorCleared && rawTasks.length > 0 ? 1 : 0);
      const gatePassed = taskCount > 0 ? doneCount >= taskCount : (rawTasks.length > 0 ? true : false);

      let status: "cleared" | "in_progress" | "pending" = "pending";
      if (rawTasks.length === 0) {
        status = idx === 0 ? "in_progress" : "pending";
      } else {
        if (idx === 0) {
          status = gatePassed ? "cleared" : "in_progress";
        } else {
          if (priorCleared) {
            status = gatePassed ? "cleared" : "in_progress";
          } else {
            status = "pending";
          }
        }
      }

      if (!gatePassed && !firstIncomplete) {
        firstIncomplete = def.key;
        priorCleared = false;
      }

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

  const isPlanFinalized = ["PLAN_FINALIZED", "TASKS_GENERATED", "IN_EXECUTION", "COMPLETED"].includes(
    lifecycle?.status || ""
  );

  const checklistSteps = useMemo(() => {
    const artifactCount = readiness?.details?.artifactCount ?? 0;
    const hasArtifacts = artifactCount > 0;
    const analysisDone = Boolean(
      readiness?.details?.analysisPerformed ||
      (lifecycle?.status && !["ARTIFACTS_PENDING", "ANALYSIS_PENDING"].includes(lifecycle.status))
    );
    const conflictsCount = readiness?.details?.unresolvedConflictCount ?? 0;
    const allApproved = Boolean(readiness?.details?.allArtifactsApproved);
    const approvedArtifactCount = readiness?.details?.approvedArtifactCount ?? 0;
    const planFinalized = isPlanFinalized;
    const tasksCount = rawTasks.length;
    const hasTasks = tasksCount > 0;
    const hasDeps = rawTasks.some((t) => t.dependencies && t.dependencies.length > 0);
    const allTasksDone = hasTasks && stats.done === stats.total;

    return [
      {
        number: 1,
        title: "Upload Project Artifacts",
        desc: hasArtifacts
          ? `${artifactCount} source document(s) uploaded and tracked in knowledge base.`
          : "Upload project briefs, SRS documents, teacher instructions, or architecture specs.",
        status: (hasArtifacts ? "COMPLETED" : "NOT_STARTED") as "COMPLETED" | "IN_PROGRESS" | "BLOCKED" | "NOT_STARTED",
        actionLabel: hasArtifacts ? "Manage Artifacts" : "Upload Artifact",
        onAction: () => setActiveSegment("plan"),
      },
      {
        number: 2,
        title: "Analyze Documents & Extract Requirements",
        desc: !hasArtifacts
          ? "Prerequisite: Upload at least one source document to analyze."
          : analysisDone
          ? "Document analysis complete. Functional requirements extracted and traceable."
          : "Run deterministic zero-cost AI extraction on uploaded documents.",
        status: (!hasArtifacts ? "BLOCKED" : analysisDone ? "COMPLETED" : "IN_PROGRESS") as "COMPLETED" | "IN_PROGRESS" | "BLOCKED" | "NOT_STARTED",
        actionLabel: analysisDone ? "View Requirements" : "Analyze Documents",
        onAction: () => setActiveSegment("plan"),
      },
      {
        number: 3,
        title: "Review Requirements & Resolve Conflicts",
        desc: !analysisDone
          ? "Prerequisite: Document analysis required before conflict evaluation."
          : conflictsCount > 0
          ? `${conflictsCount} scope contradiction(s) require human-in-the-loop resolution.`
          : "All detected scope contradictions and boundary overlaps resolved.",
        status: (!analysisDone ? "BLOCKED" : conflictsCount > 0 ? "BLOCKED" : "COMPLETED") as "COMPLETED" | "IN_PROGRESS" | "BLOCKED" | "NOT_STARTED",
        actionLabel: conflictsCount > 0 ? "Resolve Conflicts" : "Review Scope",
        onAction: () => setActiveSegment("plan"),
      },
      {
        number: 4,
        title: "Approve Required Artifacts & Requirements",
        desc: !analysisDone
          ? "Prerequisite: Extract specifications before approving baseline."
          : allApproved
          ? "All project artifacts and requirements have formal stakeholder approval."
          : `${approvedArtifactCount} of ${artifactCount} artifacts approved. Stakeholder sign-off pending.`,
        status: (!analysisDone ? "BLOCKED" : allApproved ? "COMPLETED" : approvedArtifactCount > 0 ? "IN_PROGRESS" : "NOT_STARTED") as "COMPLETED" | "IN_PROGRESS" | "BLOCKED" | "NOT_STARTED",
        actionLabel: allApproved ? "View Approvals" : "Approve Records",
        onAction: () => setActiveSegment("plan"),
      },
      {
        number: 5,
        title: "Finalize Waterfall Plan",
        desc: planFinalized
          ? "Plan baseline finalized. Phase boundaries and readiness prerequisites locked."
          : readiness?.isReady
          ? "All prerequisites satisfied! Plan is 100% ready for baseline finalization."
          : `${readiness?.blockers?.length || 1} readiness blocker(s) must be cleared first.`,
        status: (planFinalized ? "COMPLETED" : readiness?.isReady ? "IN_PROGRESS" : "BLOCKED") as "COMPLETED" | "IN_PROGRESS" | "BLOCKED" | "NOT_STARTED",
        actionLabel: planFinalized ? "Inspect Plan" : "Finalize Plan",
        onAction: () => setActiveSegment("plan"),
      },
      {
        number: 6,
        title: "Convert Approved Requirements to Tasks",
        desc: hasTasks
          ? `${tasksCount} active task(s) generated with DAA priority and requirement traceability.`
          : planFinalized
          ? "Plan is finalized! Click 'Convert All to Tasks' to generate active backlog."
          : "Prerequisite: Plan finalization required before bulk task conversion.",
        status: (hasTasks ? "COMPLETED" : planFinalized ? "IN_PROGRESS" : "BLOCKED") as "COMPLETED" | "IN_PROGRESS" | "BLOCKED" | "NOT_STARTED",
        actionLabel: hasTasks ? "View Tasks" : "Convert All to Tasks",
        onAction: hasTasks ? () => onNavigate("tasks") : () => setActiveSegment("plan"),
      },
      {
        number: 7,
        title: "Review Task Dependencies & Timeline",
        desc: !hasTasks
          ? "Prerequisite: Tasks must be generated before building timeline schedule."
          : hasDeps
          ? "Dependency DAG verified acyclic and CPM critical path calculated."
          : "Tasks active. Connect prerequisites and inspect Gantt schedule.",
        status: (!hasTasks ? "BLOCKED" : hasDeps ? "COMPLETED" : "IN_PROGRESS") as "COMPLETED" | "IN_PROGRESS" | "BLOCKED" | "NOT_STARTED",
        actionLabel: "Open Timeline",
        onAction: () => onNavigate("timeline"),
      },
      {
        number: 8,
        title: "Assign Work, Execute Tasks & Monitor Insights",
        desc: !hasTasks
          ? "Prerequisite: Generate tasks to begin team assignment and health tracking."
          : allTasksDone
          ? "100% of tasks completed across all sequential Waterfall phases!"
          : `${stats.done}/${stats.total} tasks completed (${Math.round(stats.ratio * 100)}%). Execution in progress.`,
        status: (!hasTasks ? "BLOCKED" : allTasksDone ? "COMPLETED" : "IN_PROGRESS") as "COMPLETED" | "IN_PROGRESS" | "BLOCKED" | "NOT_STARTED",
        actionLabel: allTasksDone ? "View Delivery" : "Execute Tasks",
        onAction: () => onNavigate("tasks"),
      },
    ];
  }, [readiness, lifecycle, isPlanFinalized, rawTasks, stats, onNavigate]);

  const completedChecklistCount = checklistSteps.filter((s) => s.status === "COMPLETED").length;

  // Multi-dimensional health scores
  const multiHealth = useMemo(() => {
    const isSetupMode = rawTasks.length === 0;
    const projectScore = isSetupMode
      ? (isPlanFinalized ? 50 : 25)
      : (health?.score ?? (stats.total ? Math.round(stats.ratio * 100) : 75));
    const projectGrade = isSetupMode
      ? (isPlanFinalized ? "B-" : "SETUP")
      : (health?.grade || (projectScore >= 80 ? "A" : projectScore >= 70 ? "B" : "C"));
    const scheduleScore = isSetupMode ? 0 : (deadlines.overdue > 0 ? Math.max(30, 95 - deadlines.overdue * 15) : 95);
    const scheduleStatus = isSetupMode ? "Awaiting Plan" : (deadlines.overdue > 0 ? "At Risk" : "On Track");
    const requirementsScore = readiness?.details?.allArtifactsApproved
      ? 100
      : readiness?.details?.hasArtifacts
      ? 50
      : 0;
    const requirementsStatus = readiness?.details?.allArtifactsApproved
      ? "Approved"
      : readiness?.details?.hasArtifacts
      ? "In Review"
      : "Pending Upload";
    const teamScore = team?.members && team.members.length >= 2 ? 90 : 70;
    const depScore = isSetupMode ? 0 : 95;
    const depStatus = isSetupMode ? "Awaiting Tasks" : "Acyclic (DAG)";
    const riskLevel = isSetupMode ? "LOW" : (deadlines.overdue > 2 ? "HIGH" : deadlines.overdue > 0 ? "MODERATE" : "LOW");
    const riskCount = isSetupMode ? (readiness?.blockers?.length ?? 0) : deadlines.overdue;

    return {
      project: { score: projectScore, grade: projectGrade },
      schedule: { score: scheduleScore, status: scheduleStatus },
      requirements: { score: requirementsScore, status: requirementsStatus },
      team: { score: teamScore, status: "Active" },
      dependencies: { score: depScore, status: depStatus },
      risk: { level: riskLevel, count: riskCount },
    };
  }, [health, stats, deadlines, rawTasks, team, isPlanFinalized, readiness]);

  const names = (team?.members ?? []).map((m) => m.name || "Member");
  const memberImages = (team?.members ?? []).map((m) => m.avatar || null);
  const targetDeadline = team?.discoverySettings?.deadline;
  const deadlineInfo = deadlineMeta(targetDeadline);

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      {loading ? (
        <SkeletonCard />
      ) : (        <>
          {/* Guide Entry Point */}
          <WaterfallGuideBanner onNavigateTab={onNavigate} style={{ marginBottom: spacing.sm }} />

          {/* Segment Switcher: Executive Dashboard vs Project Setup & Plan */}
          <View style={s.segmentBar}>
            <Pressable
              style={[s.segmentBtn, activeSegment === "dashboard" && s.segmentBtnActive]}
              onPress={() => setActiveSegment("dashboard")}
            >
              <Ionicons
                name="stats-chart"
                size={15}
                color={activeSegment === "dashboard" ? "#fff" : colors.textMuted}
              />
              <Text style={[s.segmentBtnTxt, activeSegment === "dashboard" && s.segmentBtnTxtActive]}>
                Executive Dashboard
              </Text>
            </Pressable>
            <Pressable
              style={[s.segmentBtn, activeSegment === "plan" && s.segmentBtnActive]}
              onPress={() => setActiveSegment("plan")}
            >
              <Ionicons
                name="document-text"
                size={15}
                color={activeSegment === "plan" ? colors.primary : colors.textMuted}
              />
              <Text style={[s.segmentBtnTxt, activeSegment === "plan" && s.segmentBtnTxtActive]}>
                Project Setup & Plan
              </Text>
              <View
                style={[
                  s.segmentBadge,
                  {
                    backgroundColor: isPlanFinalized
                      ? colors.success + "22"
                      : colors.warning + "22",
                  },
                ]}
              >
                <Text
                  style={[
                    s.segmentBadgeTxt,
                    { color: isPlanFinalized ? colors.success : colors.warning },
                  ]}
                >
                  {isPlanFinalized ? "Finalized" : "Setup"}
                </Text>
              </View>
            </Pressable>
          </View>

          {activeSegment === "plan" ? (
            <PlanPanel
              teamId={teamId}
              projectId={resolvedProjectId}
              isEmbedded
              onNavigateToTasks={() => onNavigate("tasks")}
            />
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
                        <Text style={s.domainBadgeTxt}>{team?.discoverySettings?.domain || "General"}</Text>
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

              {/* 2. PROJECT SETUP CHECKLIST */}
              <Card style={s.checklistCard}>
                <View style={s.checklistHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="list-circle" size={20} color={colors.primary} />
                      <Text style={font.h3}>Waterfall Project Setup & Progression</Text>
                    </View>
                    <Text style={s.sub}>
                      Sequential progression from raw artifacts to approved tasks and execution.
                    </Text>
                  </View>
                  <View style={s.checklistBadge}>
                    <Ionicons
                      name={completedChecklistCount === 8 ? "checkmark-circle" : "time-outline"}
                      size={14}
                      color={completedChecklistCount === 8 ? colors.success : colors.primary}
                    />
                    <Text
                      style={[
                        s.checklistBadgeTxt,
                        { color: completedChecklistCount === 8 ? colors.success : colors.primary },
                      ]}
                    >
                      {completedChecklistCount} of 8 Steps Complete
                    </Text>
                  </View>
                </View>

                <ProgressBar
                  value={completedChecklistCount / 8}
                  color={completedChecklistCount === 8 ? colors.success : colors.primary}
                  height={6}
                />

                <View style={s.stepsList}>
                  {checklistSteps.map((step) => {
                    const isComplete = step.status === "COMPLETED";
                    const isCurrent = step.status === "IN_PROGRESS";
                    const isBlocked = step.status === "BLOCKED";

                    const stepBg = isComplete
                      ? colors.successSoft
                      : isCurrent
                      ? colors.primarySoft
                      : isBlocked
                      ? colors.warningSoft
                      : colors.surfaceAlt;
                    const stepBorder = isComplete
                      ? colors.success + "44"
                      : isCurrent
                      ? colors.primary + "44"
                      : isBlocked
                      ? colors.warning + "44"
                      : colors.border;
                    const statusColor = isComplete
                      ? colors.success
                      : isCurrent
                      ? colors.primary
                      : isBlocked
                      ? colors.warning
                      : colors.textFaint;

                    return (
                      <View key={step.number} style={[s.stepItem, { borderColor: stepBorder, backgroundColor: stepBg }]}>
                        <View style={s.stepLeft}>
                          <View style={[s.stepNumCircle, { backgroundColor: statusColor }]}>
                            {isComplete ? (
                              <Ionicons name="checkmark" size={13} color="#fff" />
                            ) : isBlocked ? (
                              <Ionicons name="lock-closed" size={11} color="#fff" />
                            ) : (
                              <Text style={s.stepNumTxt}>{step.number}</Text>
                            )}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <Text style={[s.stepTitle, { color: colors.text }]}>{step.title}</Text>
                              <View style={[s.stepStatusPill, { backgroundColor: statusColor + "18", borderColor: statusColor + "44" }]}>
                                <Text style={[s.stepStatusTxt, { color: statusColor }]}>
                                  {step.status.replace("_", " ")}
                                </Text>
                              </View>
                            </View>
                            <Text style={s.stepDesc}>{step.desc}</Text>
                          </View>
                        </View>
                        {step.actionLabel && step.onAction && (
                          <Pressable
                            style={[s.stepActionBtn, isCurrent && s.stepActionBtnHighlight]}
                            onPress={step.onAction}
                          >
                            <Text style={[s.stepActionBtnTxt, isCurrent && s.stepActionBtnTxtHighlight]}>
                              {step.actionLabel}
                            </Text>
                            <Ionicons
                              name="arrow-forward"
                              size={12}
                              color={isCurrent ? "#fff" : colors.primary}
                            />
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              </Card>

              {/* Prominent Artifact Setup CTA when tasks are empty */}
              {rawTasks.length === 0 && (
                <Card style={s.setupPromptCard}>
                  <View style={s.setupPromptLeft}>
                    <View style={s.setupPromptIconCircle}>
                      <Ionicons name="document-attach" size={24} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={font.h3}>Upload Project Artifacts to Begin Planning</Text>
                      <Text style={s.sub}>
                        Waterfall requires uploaded source documents (SRS, client briefs, or architecture notes). Once uploaded, NexusFlow extracts requirements and allows plan finalization.
                      </Text>
                    </View>
                  </View>
                  <Button
                    title="Open Project Setup & Plan"
                    icon="arrow-forward"
                    onPress={() => setActiveSegment("plan")}
                    style={{ marginTop: spacing.xs }}
                  />
                </Card>
              )}

              {/* 3. THREE.JS WATERFALL CASCADE PIPELINE */}
              <WaterfallPhaseCanvas
                phases={phaseNodes}
                activePhaseKey={activePhaseKey}
                onSelectPhase={setActivePhaseKey}
              />

              {/* 3B. WATERFALL PHASE GATE & CHANGE IMPACT GOVERNANCE */}
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

              {/* 4. MULTI-DIMENSIONAL HEALTH BREAKDOWN */}
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
                  <Text style={s.healthTileVal}>{multiHealth.dependencies.score > 0 ? "0 Cycles" : "Pending"}</Text>
                  <Text style={s.healthTileSub}>{multiHealth.dependencies.status}</Text>
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

              {/* 5. PHASE MILESTONE PROGRESS TABLE */}
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

              {/* 6. CHARTS: PRIORITY DISTRIBUTION & DEADLINES */}
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

              {/* 7. V4 7-TAB PRIMARY NAVIGATION JUMPS */}
              <View style={{ gap: spacing.sm }}>
                <Text style={s.sectionLabel}>PRIMARY NAVIGATION JUMPS</Text>
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
                  <Pressable style={s.tile} onPress={() => setActiveSegment("plan")}>
                    <View style={[s.tileIcon, { backgroundColor: "#4F46E51a" }]}>
                      <Ionicons name="document-text" size={18} color="#4F46E5" />
                    </View>
                    <Text style={s.tileLabel}>Project Setup & Plan</Text>
                    <Text style={s.tileDesc}>Artifacts, SRS & Conversion</Text>
                  </Pressable>
                </View>
              </View>

              {/* 8. SETTINGS / RESTORE AI BACKLOG */}
              {canRestore && (
                <Card style={{ gap: spacing.sm }}>
                  <Text style={font.h3}>Workspace Management</Text>
                  <Text style={s.sub}>Restore the initial AI-generated engineering backlog. Preserves team members, roles, and settings.</Text>
                  <Button title="Restore AI Backlog" icon="refresh" variant="secondary" onPress={onRestore} loading={restoring} style={{ marginTop: 4 }} />
                </Card>
              )}
            </>
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

  // Waterfall Segmented Switch
  segmentBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "flex-start",
    gap: 4,
  },
  segmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.sm,
  },
  segmentBtnActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  segmentBtnTxt: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.textMuted,
  },
  segmentBtnTxtActive: {
    color: colors.primary,
  },
  segmentIconBadge: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  segmentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: radius.pill,
    marginLeft: 2,
  },
  segmentBadgeTxt: {
    fontSize: 10,
    fontWeight: "700",
  },

  // Setup Checklist
  checklistCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  checklistHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  checklistBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checklistBadgeTxt: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  stepsList: {
    gap: 6,
    marginTop: 4,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
    flexWrap: "wrap",
  },
  stepLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 240,
  },
  stepNumCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumTxt: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  stepStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  stepStatusTxt: {
    fontSize: 9.5,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  stepDesc: {
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 1,
  },
  stepActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stepActionBtnHighlight: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepActionBtnTxt: {
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.primary,
  },
  stepActionBtnTxtHighlight: {
    color: "#fff",
  },

  // Setup Prompt Card
  setupPromptCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary + "33",
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  setupPromptLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  setupPromptIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primary + "22",
  },
});

