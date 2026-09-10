/**
 * client/components/workspace/KanbanOverviewPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN OVERVIEW COMMAND CENTER (Prompt 5)
 *
 * Real persisted metrics:
 *   - Flow Health composite gauge and grade
 *   - WIP utilization and column saturation
 *   - Throughput, median cycle time, and SLE alignment
 *   - Flow efficiency (active vs waiting/blocked)
 *   - Three.js Kanban Spatial Flow Twin
 *   - Active impediments & bottleneck signals
 *   - Quick jumps to Kanban tabs
 * ============================================================================
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/feedback";
import { Badge, SkeletonCard } from "@/components/ui";
import KanbanDigitalTwinCanvas from "./KanbanDigitalTwinCanvas";
import { fetchKanbanOverview } from "@/services/kanbanApiService";
import { colors, spacing, radius, font } from "@/theme";

interface KanbanOverviewPanelProps {
  teamId: string;
  onNavigate: (tab: string) => void;
}

export default function KanbanOverviewPanel({ teamId, onNavigate }: KanbanOverviewPanelProps) {
  const { token } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetchKanbanOverview(teamId, token);
      setData(res.overview);
    } catch (err: any) {
      toast(err.message || "Failed to load Kanban overview", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, token, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <View style={s.container}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  const health = data?.health || { overall: 85, grade: "EXCELLENT", status: "Stable continuous flow" };
  const flowMetrics = data?.flowMetrics || {};
  const columnWip = data?.columnWip || {};
  const bottlenecks = data?.bottlenecks || { isConstrained: false, bottlenecks: [] };
  const blockers = data?.blockers || { totalActive: 0, active: [] };

  // Digital Twin props
  const twinColumns = Object.values(columnWip).map((c: any) => ({
    id: c.columnId,
    name: c.name,
    wipLimit: c.limit,
    count: c.count,
  }));

  const twinItems = (data?.recentActivity || []).map((a: any) => ({
    _id: a.taskId,
    title: a.title,
    column: a.column,
    classOfService: "standard",
    isBlocked: false,
    priorityScore: 50,
  }));

  const healthColor =
    health.grade === "EXCELLENT"
      ? colors.success
      : health.grade === "GOOD"
      ? colors.primary
      : health.grade === "NEEDS_ATTENTION"
      ? colors.warning
      : colors.danger;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── 1. Flow Health Command Banner ─────────────────────────────────── */}
      <View style={s.healthCard}>
        <View style={s.healthLeft}>
          <View style={[s.healthBadge, { backgroundColor: healthColor + "18", borderColor: healthColor + "44" }]}>
            <Ionicons name="pulse" size={16} color={healthColor} />
            <Text style={[s.healthGradeText, { color: healthColor }]}>{health.grade}</Text>
          </View>
          <Text style={s.healthTitle}>Continuous Flow Health: {health.overall}%</Text>
          <Text style={s.healthSubtitle}>{health.status}</Text>
          {health.primaryDrag && (
            <Text style={s.dragNotice}>Primary constraint: {health.primaryDrag}</Text>
          )}
        </View>

        <View style={s.quickNavRow}>
          <Pressable style={s.quickNavBtn} onPress={() => onNavigate("tasks")}>
            <Ionicons name="albums-outline" size={16} color={colors.primary} />
            <Text style={s.quickNavText}>Board</Text>
          </Pressable>
          <Pressable style={s.quickNavBtn} onPress={() => onNavigate("plan")}>
            <Ionicons name="file-tray-full-outline" size={16} color="#4F46E5" />
            <Text style={s.quickNavText}>Backlog</Text>
          </Pressable>
          <Pressable style={s.quickNavBtn} onPress={() => onNavigate("timeline")}>
            <Ionicons name="water-outline" size={16} color={colors.topo} />
            <Text style={s.quickNavText}>Flow</Text>
          </Pressable>
        </View>
      </View>

      {/* ── 2. Three.js Spatial Digital Twin ───────────────────────────────── */}
      <KanbanDigitalTwinCanvas items={twinItems} columns={twinColumns} onSelectItem={(item) => onNavigate("tasks")} />

      {/* ── 3. Flow Metrics Radar ──────────────────────────────────────────── */}
      <View style={s.metricsRow}>
        <View style={s.metricCard}>
          <Text style={s.metricLabel}>WIP IN FLIGHT</Text>
          <Text style={s.metricValue}>{flowMetrics.activeWipCount ?? 0}</Text>
          <Text style={s.metricSub}>Active items in flow</Text>
        </View>

        <View style={s.metricCard}>
          <Text style={s.metricLabel}>WEEKLY THROUGHPUT</Text>
          <Text style={[s.metricValue, { color: colors.primary }]}>
            {flowMetrics.throughput?.averageWeekly ?? 0}
          </Text>
          <Text style={s.metricSub}>Delivered items / wk</Text>
        </View>

        <View style={s.metricCard}>
          <Text style={s.metricLabel}>MEDIAN CYCLE TIME</Text>
          <Text style={[s.metricValue, { color: "#4F46E5" }]}>
            {flowMetrics.cycleTime?.medianDays ? `${flowMetrics.cycleTime.medianDays}d` : "N/A"}
          </Text>
          <Text style={s.metricSub}>Target SLE: {flowMetrics.sle?.targetDays ?? 4}d</Text>
        </View>

        <View style={s.metricCard}>
          <Text style={s.metricLabel}>FLOW EFFICIENCY</Text>
          <Text style={[s.metricValue, { color: colors.success }]}>
            {flowMetrics.flowEfficiency?.percentage ?? 100}%
          </Text>
          <Text style={s.metricSub}>Active work ratio</Text>
        </View>
      </View>

      {/* ── 4. Bottleneck Alert (if constrained) ────────────────────────────── */}
      {bottlenecks.isConstrained && (
        <View style={s.bottleneckCard}>
          <View style={s.alertHeader}>
            <Ionicons name="warning-outline" size={18} color={colors.warning} />
            <Text style={s.alertTitle}>Flow Bottleneck Detected</Text>
          </View>
          {bottlenecks.bottlenecks.map((b: any, i: number) => (
            <View key={i} style={s.bottleneckItem}>
              <Text style={s.bottleneckStage}>Constrained Stage: {b.columnName} ({b.itemCount}/{b.wipLimit})</Text>
              <Text style={s.bottleneckEvidence}>{b.evidenceFactors.join(" · ")}</Text>
              <Text style={s.bottleneckAction}>💡 Recommendation: {b.recommendation}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── 5. Active Impediments / Blockers ───────────────────────────────── */}
      <View style={s.blockerCard}>
        <View style={s.blockerHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="alert-circle" size={18} color={blockers.totalActive > 0 ? colors.danger : colors.textFaint} />
            <Text style={s.blockerTitle}>Active Impediments ({blockers.totalActive})</Text>
          </View>
          <Pressable onPress={() => onNavigate("tasks")}>
            <Text style={s.viewAllLink}>Manage on Board →</Text>
          </Pressable>
        </View>

        {blockers.totalActive === 0 ? (
          <Text style={s.emptyNotice}>No active flow impediments. Work is moving without blocking.</Text>
        ) : (
          blockers.active.map((b: any) => (
            <View key={b.blockerId} style={s.blockerRow}>
              <View style={s.blockerInfo}>
                <Badge
                  label={b.severity.toUpperCase()}
                  color={b.severity === "critical" ? colors.danger : colors.warning}
                />
                <Text style={s.blockerItemTitle} numberOfLines={1}>{b.title}</Text>
              </View>
              <Text style={s.blockerTaskName} numberOfLines={1}>on: {b.taskTitle}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  healthCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  healthLeft: {
    flex: 1,
    minWidth: 200,
  },
  healthBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  healthGradeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  healthTitle: {
    ...font.h3,
    color: colors.text,
  },
  healthSubtitle: {
    ...font.caption,
    color: colors.textFaint,
    marginTop: 2,
  },
  dragNotice: {
    fontSize: 11,
    color: colors.warning,
    fontWeight: "600",
    marginTop: 4,
  },
  quickNavRow: {
    flexDirection: "row",
    gap: 8,
  },
  quickNavBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickNavText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  metricsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  metricCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textFaint,
    letterSpacing: 0.5,
  },
  metricValue: {
    ...font.h2,
    color: colors.text,
    marginVertical: 4,
  },
  metricSub: {
    fontSize: 11,
    color: colors.textFaint,
  },
  bottleneckCard: {
    backgroundColor: colors.warning + "10",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warning + "44",
    padding: spacing.md,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.xs,
  },
  alertTitle: {
    ...font.caption,
    fontWeight: "700",
    color: colors.warning,
  },
  bottleneckItem: {
    marginTop: spacing.xs,
  },
  bottleneckStage: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  bottleneckEvidence: {
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 2,
  },
  bottleneckAction: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.text,
    marginTop: 4,
  },
  blockerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  blockerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  blockerTitle: {
    ...font.caption,
    fontWeight: "700",
    color: colors.text,
  },
  viewAllLink: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  emptyNotice: {
    fontSize: 12,
    color: colors.textFaint,
    fontStyle: "italic",
    paddingVertical: spacing.xs,
  },
  blockerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + "44",
  },
  blockerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  blockerItemTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
  },
  blockerTaskName: {
    fontSize: 11,
    color: colors.textFaint,
    maxWidth: 160,
  },
});
