/**
 * client/components/workspace/WaterfallTimelinePanel.tsx
 * ============================================================================
 * V4 WATERFALL TIMELINE TAB — INTERACTIVE GANTT & CRITICAL PATH METHOD (CPM)
 *
 * Implements Prompt 10 & Phase 7 of NexusFlow V4.0:
 * - Sequential Gantt-style timeline across the 6 Waterfall phases
 * - Real task durations, start/due dates, and progress fills
 * - Deterministic DAA Critical Path Method (CPM) calculation:
 *   identifies zero-slack / zero-float tasks that determine project deadline
 * - Visual dependency flows and delay warnings
 * - Warm editorial aesthetic adhering to theme tokens
 * ============================================================================
 */

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTeamTasks, type Task } from "@/hooks/useTeamTasks";
import { useTeam } from "@/hooks/useTeam";
import { useDependencyGraph } from "@/hooks/useDependencyGraph";
import { colors, spacing, radius, font, WATERFALL_PHASE_META, PRIORITY_META, taskPriorityKey } from "@/theme";
import { WhyButton, AlgoExplainSheet, type AlgoEntry } from "@/components/AlgoExplain";

interface WaterfallTimelinePanelProps {
  teamId: string;
  projectId?: string;
  onSelectTask?: (taskId: string) => void;
}

export default function WaterfallTimelinePanel({ teamId, projectId, onSelectTask }: WaterfallTimelinePanelProps) {
  const { tasks, rawTasks, loading } = useTeamTasks(teamId);
  const { team, members } = useTeam(teamId);
  const { graph } = useDependencyGraph(teamId);

  const [explain, setExplain] = useState<AlgoEntry[] | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<string>("all");
  const [filterCriticalOnly, setFilterCriticalOnly] = useState(false);

  // Map member IDs to names
  const memberMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      if (m.userId) map.set(m.userId, m.name || "Member");
    }
    return map;
  }, [members]);

  // ── DAA Critical Path Method (CPM) Calculation ──────────────────────────────
  // Computes Early Start (ES), Early Finish (EF), Late Start (LS), Late Finish (LF)
  // and Slack / Float = LF - EF. Zero slack = Critical Path.
  const cpmAnalysis = useMemo(() => {
    if (!rawTasks.length) {
      return { criticalTaskIds: new Set<string>(), criticalTasks: [], totalDurationHours: 0, criticalPathOrder: [] };
    }

    const taskDuration = (t: Task) => Math.max(1, t.estimatedHours || 8);
    const inDeps = new Map<string, string[]>(); // tId -> array of prereq IDs
    const outDeps = new Map<string, string[]>(); // tId -> array of dependent IDs

    for (const t of rawTasks) {
      inDeps.set(t._id, []);
      outDeps.set(t._id, []);
    }

    for (const edge of graph.edges || []) {
      if (inDeps.has(edge.to)) inDeps.get(edge.to)!.push(edge.from);
      if (outDeps.has(edge.from)) outDeps.get(edge.from)!.push(edge.to);
    }

    // Forward Pass: Early Start & Early Finish
    const ES = new Map<string, number>();
    const EF = new Map<string, number>();

    // Kahn's-like or topological ordering for forward pass
    const inDegrees = new Map<string, number>();
    for (const t of rawTasks) inDegrees.set(t._id, inDeps.get(t._id)?.length || 0);

    const queue: string[] = [];
    for (const [id, deg] of inDegrees.entries()) {
      if (deg === 0) queue.push(id);
    }

    const topoOrder: string[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      topoOrder.push(u);

      const prereqs = inDeps.get(u) || [];
      let maxPrereqEF = 0;
      for (const p of prereqs) {
        maxPrereqEF = Math.max(maxPrereqEF, EF.get(p) || 0);
      }
      ES.set(u, maxPrereqEF);

      const tObj = rawTasks.find((x) => x._id === u);
      const dur = tObj ? taskDuration(tObj) : 8;
      EF.set(u, maxPrereqEF + dur);

      for (const v of outDeps.get(u) || []) {
        inDegrees.set(v, (inDegrees.get(v) || 1) - 1);
        if (inDegrees.get(v) === 0) queue.push(v);
      }
    }

    // Max project finish time
    let maxProjectEF = 0;
    for (const ef of EF.values()) maxProjectEF = Math.max(maxProjectEF, ef);

    // Backward Pass: Late Start & Late Finish
    const LF = new Map<string, number>();
    const LS = new Map<string, number>();

    for (const id of topoOrder) {
      LF.set(id, maxProjectEF);
    }

    for (let i = topoOrder.length - 1; i >= 0; i--) {
      const u = topoOrder[i];
      const dependents = outDeps.get(u) || [];
      if (dependents.length > 0) {
        let minDepLS = Infinity;
        for (const d of dependents) {
          minDepLS = Math.min(minDepLS, LS.get(d) ?? maxProjectEF);
        }
        LF.set(u, minDepLS);
      } else {
        LF.set(u, maxProjectEF);
      }

      const tObj = rawTasks.find((x) => x._id === u);
      const dur = tObj ? taskDuration(tObj) : 8;
      LS.set(u, (LF.get(u) || maxProjectEF) - dur);
    }

    // Zero-Slack Identification (Float <= 0)
    const criticalTaskIds = new Set<string>();
    const criticalTasks: Task[] = [];
    const criticalPathOrder: Task[] = [];

    for (const id of topoOrder) {
      const ef = EF.get(id) || 0;
      const lf = LF.get(id) || 0;
      const slack = lf - ef;
      if (slack <= 0.5) {
        // Zero float
        criticalTaskIds.add(id);
        const tObj = rawTasks.find((x) => x._id === id);
        if (tObj) {
          criticalTasks.push(tObj);
          criticalPathOrder.push(tObj);
        }
      }
    }

    return {
      criticalTaskIds,
      criticalTasks,
      totalDurationHours: maxProjectEF,
      criticalPathOrder,
    };
  }, [rawTasks, graph.edges]);

  // Filter tasks based on phase and critical path toggle
  const visibleTasks = useMemo(() => {
    return rawTasks.filter((t) => {
      const matchesPhase = selectedPhase === "all" || (t.phase || "requirements") === selectedPhase;
      const matchesCrit = !filterCriticalOnly || cpmAnalysis.criticalTaskIds.has(t._id);
      return matchesPhase && matchesCrit;
    });
  }, [rawTasks, selectedPhase, filterCriticalOnly, cpmAnalysis.criticalTaskIds]);

  const totalTasks = rawTasks.length;
  const doneTasks = rawTasks.filter((t) => t.status === "done").length;
  const overallProgress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.contentContainer}>
      {/* Header Banner */}
      <View style={s.headerBanner}>
        <View style={s.badgeRow}>
          <View style={s.waterfallBadge}>
            <Ionicons name="calendar-outline" size={14} color={colors.primary} />
            <Text style={s.waterfallBadgeText}>WATERFALL TIMELINE · TAB 4</Text>
          </View>
          <View style={s.cpmBadge}>
            <Ionicons name="git-commit-outline" size={13} color={colors.warning} />
            <Text style={s.cpmBadgeText}>CPM CRITICAL PATH ACTIVE</Text>
          </View>
        </View>

        <Text style={font.h1}>Sequential Schedule & Critical Path</Text>
        <Text style={s.headerSubtitle}>
          Mathematical Critical Path Method (CPM) calculates earliest/latest schedules and zero-float
          tasks. Any delay on the highlighted Critical Path directly delays project delivery.
        </Text>

        {/* Milestone & Metrics Row */}
        <View style={s.metricsRow}>
          <View style={s.metricBox}>
            <Text style={s.metricValue}>{cpmAnalysis.totalDurationHours}h</Text>
            <Text style={s.metricLabel}>TOTAL CRITICAL EFFORT</Text>
          </View>
          <View style={s.metricBox}>
            <Text style={[s.metricValue, { color: colors.warning }]}>{cpmAnalysis.criticalTasks.length}</Text>
            <Text style={s.metricLabel}>ZERO-SLACK TASKS</Text>
          </View>
          <View style={s.metricBox}>
            <Text style={[s.metricValue, { color: colors.success }]}>{overallProgress}%</Text>
            <Text style={s.metricLabel}>SCHEDULE PROGRESS</Text>
          </View>
          <View style={s.metricBox}>
            <Text style={s.metricValue}>{team?.deadline ? new Date(team.deadline).toLocaleDateString() : "Set in Team"}</Text>
            <Text style={s.metricLabel}>FINAL DEADLINE</Text>
          </View>
        </View>
      </View>

      {/* Critical Path Flow Strip */}
      {cpmAnalysis.criticalPathOrder.length > 0 && (
        <View style={s.cpmCard}>
          <View style={s.cpmCardHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <Ionicons name="warning" size={18} color={colors.warning} />
              <Text style={font.h3}>Critical Path Chain (Zero Slack)</Text>
            </View>
            <WhyButton
              color={colors.warning}
              onPress={() =>
                setExplain([
                  {
                    algo: "topo",
                    input: "Forward & Backward DAG traversal of task durations and prerequisites",
                    output: "Slack = Late Finish - Early Finish. Zero slack = Critical Path",
                    reason: "These tasks have zero float. A 1-day delay on any task in this sequence pushes the final milestone delivery date.",
                  },
                ])
              }
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cpmChainRow}>
            {cpmAnalysis.criticalPathOrder.map((t, idx) => {
              const pMeta = WATERFALL_PHASE_META[(t.phase || "requirements") as keyof typeof WATERFALL_PHASE_META] || {
                label: t.phase || "Phase",
                color: colors.primary,
              };
              return (
                <React.Fragment key={t._id}>
                  <View style={[s.cpmChainItem, t.status === "done" && s.cpmChainItemDone]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      {t.requirementId && (
                        <View style={s.reqTagSmall}>
                          <Text style={s.reqTagSmallText}>{t.requirementId}</Text>
                        </View>
                      )}
                      <View style={[s.phaseDot, { backgroundColor: pMeta.color }]} />
                    </View>
                    <Text style={s.cpmChainTitle} numberOfLines={1}>{t.title}</Text>
                    <Text style={s.cpmChainDur}>{t.estimatedHours || 8}h · {t.status.toUpperCase()}</Text>
                  </View>
                  {idx < cpmAnalysis.criticalPathOrder.length - 1 && (
                    <Ionicons name="arrow-forward" size={16} color={colors.warning} style={{ alignSelf: "center" }} />
                  )}
                </React.Fragment>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Filter & Controls Toolbar */}
      <View style={s.toolbarCard}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          <Pressable
            style={[s.phaseTab, selectedPhase === "all" && s.phaseTabActive]}
            onPress={() => setSelectedPhase("all")}
          >
            <Text style={[s.phaseTabText, selectedPhase === "all" && s.phaseTabTextActive]}>All Phases</Text>
          </Pressable>
          {Object.keys(WATERFALL_PHASE_META).map((pKey) => {
            const pMeta = WATERFALL_PHASE_META[pKey as keyof typeof WATERFALL_PHASE_META];
            const isActive = selectedPhase === pKey;
            return (
              <Pressable
                key={pKey}
                style={[s.phaseTab, isActive && { backgroundColor: pMeta.color + "18", borderColor: pMeta.color }]}
                onPress={() => setSelectedPhase(pKey)}
              >
                <Text style={[s.phaseTabText, isActive && { color: pMeta.color, fontWeight: "700" }]}>
                  {pMeta.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          style={[s.critFilterBtn, filterCriticalOnly && s.critFilterBtnActive]}
          onPress={() => setFilterCriticalOnly(!filterCriticalOnly)}
        >
          <Ionicons
            name={filterCriticalOnly ? "shield-checkmark" : "shield-outline"}
            size={14}
            color={filterCriticalOnly ? "#FFF" : colors.warning}
          />
          <Text style={[s.critFilterBtnText, filterCriticalOnly && { color: "#FFF" }]}>
            {filterCriticalOnly ? "Showing Critical Path Only" : "Filter Critical Path"}
          </Text>
        </Pressable>
      </View>

      {/* Gantt Timeline Lanes Grouped by Phase */}
      <View style={s.ganttContainer}>
        {Object.keys(WATERFALL_PHASE_META).map((pKey) => {
          if (selectedPhase !== "all" && selectedPhase !== pKey) return null;

          const pMeta = WATERFALL_PHASE_META[pKey as keyof typeof WATERFALL_PHASE_META];
          const phaseTasks = visibleTasks.filter((t) => (t.phase || "requirements") === pKey);
          const doneCount = phaseTasks.filter((t) => t.status === "done").length;
          const totalCount = phaseTasks.length;
          const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

          return (
            <View key={pKey} style={s.phaseLane}>
              {/* Phase Lane Header */}
              <View style={s.phaseLaneHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                  <View style={[s.phaseColorBar, { backgroundColor: pMeta.color }]} />
                  <Text style={[font.h3, { color: pMeta.color }]}>{pMeta.label}</Text>
                  <View style={[s.countBadge, { backgroundColor: pMeta.bg }]}>
                    <Text style={[s.countBadgeText, { color: pMeta.color }]}>
                      {doneCount}/{totalCount} Completed ({pct}%)
                    </Text>
                  </View>
                </View>
              </View>

              {/* Tasks Gantt Bars */}
              {totalCount === 0 ? (
                <View style={s.emptyLane}>
                  <Text style={s.emptyLaneText}>No scheduled tasks in this phase.</Text>
                </View>
              ) : (
                <View style={s.laneContent}>
                  {phaseTasks.map((t) => {
                    const isCritical = cpmAnalysis.criticalTaskIds.has(t._id);
                    const isDone = t.status === "done";
                    const isInProgress = t.status === "in_progress";
                    const progressVal = isDone ? 100 : isInProgress ? 50 : 0;
                    const assignee = memberMap.get(t.assignedTo || "") || "Unassigned";
                    const pKeyTier = taskPriorityKey(t);
                    const tier = PRIORITY_META[pKeyTier];

                    return (
                      <Pressable
                        key={t._id}
                        style={[
                          s.ganttTaskRow,
                          isCritical && s.ganttTaskRowCritical,
                          isDone && s.ganttTaskRowDone,
                        ]}
                        onPress={() => onSelectTask && onSelectTask(t._id)}
                      >
                        {/* Task Info Column */}
                        <View style={s.taskInfoCol}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            {t.requirementId && (
                              <View style={s.reqBadge}>
                                <Text style={s.reqBadgeText}>{t.requirementId}</Text>
                              </View>
                            )}
                            {isCritical && (
                              <View style={s.critBadge}>
                                <Ionicons name="flame" size={11} color={colors.warning} />
                                <Text style={s.critBadgeText}>CPM CRITICAL</Text>
                              </View>
                            )}
                            <Text style={s.taskTitle} numberOfLines={1}>{t.title}</Text>
                          </View>

                          <View style={s.taskSubRow}>
                            <Text style={s.taskMeta}>
                              Est: {t.estimatedHours || 8}h · Priority: {t.priorityScore ?? 50}pts · Assigned: {assignee}
                            </Text>
                            {t.dueDate && (
                              <Text style={s.taskDueDate}>
                                Due: {new Date(t.dueDate).toLocaleDateString()}
                              </Text>
                            )}
                          </View>
                        </View>

                        {/* Gantt Bar Visualization Column */}
                        <View style={s.ganttBarCol}>
                          <View style={s.ganttTrack}>
                            <View
                              style={[
                                s.ganttFill,
                                {
                                  width: `${progressVal}%`,
                                  backgroundColor: isDone
                                    ? colors.success
                                    : isCritical
                                    ? colors.warning
                                    : pMeta.color,
                                },
                              ]}
                            />
                          </View>
                          <Text style={s.progressText}>{progressVal}%</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </View>

      <AlgoExplainSheet visible={!!explain} onClose={() => setExplain(null)} entries={explain ?? []} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  contentContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },

  // Header Banner
  headerBanner: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  waterfallBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary + "18",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    gap: 4,
  },
  waterfallBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  cpmBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    gap: 4,
  },
  cpmBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.warning,
  },
  headerSubtitle: {
    ...font.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 20,
  },

  metricsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metricBox: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.textFaint,
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // Critical Path Card
  cpmCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warning + "66",
    marginBottom: spacing.lg,
  },
  cpmCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  cpmChainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 4,
  },
  cpmChainItem: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.sm,
    borderRadius: radius.sm,
    minWidth: 160,
    maxWidth: 220,
  },
  cpmChainItemDone: {
    borderColor: colors.success,
    opacity: 0.85,
  },
  reqTagSmall: {
    backgroundColor: colors.surface,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reqTagSmallText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.text,
  },
  phaseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cpmChainTitle: {
    ...font.caption,
    fontWeight: "700",
    color: colors.text,
    marginTop: 3,
  },
  cpmChainDur: {
    fontSize: 10,
    color: colors.textFaint,
    marginTop: 2,
  },

  // Toolbar Card
  toolbarCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  filterRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  phaseTab: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  phaseTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  phaseTabText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  phaseTabTextActive: {
    color: "#FFF",
    fontWeight: "700",
  },
  critFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  critFilterBtnActive: {
    backgroundColor: colors.warning,
  },
  critFilterBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.warning,
  },

  // Gantt Lanes
  ganttContainer: {
    gap: spacing.lg,
  },
  phaseLane: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  phaseLaneHeader: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  phaseColorBar: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  emptyLane: {
    padding: spacing.lg,
    alignItems: "center",
  },
  emptyLaneText: {
    ...font.caption,
    color: colors.textFaint,
    fontStyle: "italic",
  },
  laneContent: {
    padding: spacing.sm,
    gap: spacing.xs,
  },

  ganttTaskRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  ganttTaskRowCritical: {
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft + "33",
  },
  ganttTaskRowDone: {
    opacity: 0.75,
  },
  taskInfoCol: {
    flex: 1,
  },
  reqBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reqBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.text,
  },
  critBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  critBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.warning,
  },
  taskTitle: {
    ...font.h3,
    fontSize: 13,
    color: colors.text,
    flexShrink: 1,
  },
  taskSubRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  taskMeta: {
    fontSize: 11,
    color: colors.textFaint,
  },
  taskDueDate: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },

  ganttBarCol: {
    width: 140,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  ganttTrack: {
    flex: 1,
    height: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 5,
    overflow: "hidden",
  },
  ganttFill: {
    height: "100%",
    borderRadius: 5,
  },
  progressText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    width: 32,
    textAlign: "right",
  },
});
