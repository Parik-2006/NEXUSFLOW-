/**
 * client/components/workspace/KanbanFlowPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN FLOW & FORECASTING PANEL (Prompts 12, 14, 18)
 *
 * Deterministic flow intelligence:
 *   - Cycle time & Lead time percentiles (p50, p85, p95)
 *   - Flow efficiency duration breakdown (Active vs Waiting vs Blocked vs Review)
 *   - Throughput cadence
 *   - SLE Attainment tracking
 *   - Empirical completion window forecasting
 * ============================================================================
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/feedback";
import { Badge, SkeletonCard } from "@/components/ui";
import { fetchKanbanFlowMetrics } from "@/services/kanbanApiService";
import { colors, spacing, radius, font } from "@/theme";

interface KanbanFlowPanelProps {
  teamId: string;
}

export default function KanbanFlowPanel({ teamId }: KanbanFlowPanelProps) {
  const { token } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFlow = useCallback(async () => {
    try {
      const res = await fetchKanbanFlowMetrics(teamId, token);
      setData(res);
    } catch (err: any) {
      toast(err.message || "Failed to load flow metrics", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, token, toast]);

  useEffect(() => {
    loadFlow();
  }, [loadFlow]);

  const onRefresh = () => {
    setRefreshing(true);
    loadFlow();
  };

  if (loading) {
    return (
      <View style={s.container}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  const metrics = data?.flowMetrics || {};
  const forecast = data?.forecast || {};
  const efficiency = metrics.flowEfficiency || { percentage: 100, activeHours: 0, waitingHours: 0, blockedHours: 0, reviewHours: 0 };
  const percentiles = forecast.percentiles || {};
  const itemForecasts = forecast.itemForecasts || [];

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── 1. Top Percentile Forecast Cards ───────────────────────────────── */}
      <View style={s.card}>
        <View style={s.headerRow}>
          <Ionicons name="stats-chart" size={16} color={colors.primary} />
          <Text style={s.cardTitle}>Empirical Cycle Time Percentiles</Text>
        </View>
        <Text style={s.subText}>{forecast.disclaimer}</Text>

        <View style={s.percentilesRow}>
          <View style={s.pBox}>
            <Text style={s.pLabel}>50TH PERCENTILE (MEDIAN)</Text>
            <Text style={s.pValue}>{percentiles.p50Days ? `${percentiles.p50Days}d` : "N/A"}</Text>
            <Text style={s.pDesc}>Normal delivery baseline</Text>
          </View>
          <View style={[s.pBox, { borderColor: "#4F46E5" + "44", backgroundColor: "#4F46E5" + "08" }]}>
            <Text style={[s.pLabel, { color: "#4F46E5" }]}>85TH PERCENTILE (SLE TARGET)</Text>
            <Text style={[s.pValue, { color: "#4F46E5" }]}>{percentiles.p85Days ? `${percentiles.p85Days}d` : "N/A"}</Text>
            <Text style={s.pDesc}>High-confidence delivery window</Text>
          </View>
          <View style={s.pBox}>
            <Text style={s.pLabel}>95TH PERCENTILE (OUTLIER)</Text>
            <Text style={s.pValue}>{percentiles.p95Days ? `${percentiles.p95Days}d` : "N/A"}</Text>
            <Text style={s.pDesc}>Upper risk boundary</Text>
          </View>
        </View>
      </View>

      {/* ── 2. Flow Efficiency Duration Breakdown ──────────────────────────── */}
      <View style={s.card}>
        <View style={s.headerRow}>
          <Ionicons name="pie-chart-outline" size={16} color={colors.success} />
          <Text style={s.cardTitle}>Flow Efficiency: {efficiency.percentage}%</Text>
        </View>
        <Text style={s.subText}>Ratio of productive active execution time to total flow duration.</Text>

        <View style={s.durationsGrid}>
          <View style={s.durItem}>
            <Text style={s.durLabel}>ACTIVE WORK</Text>
            <Text style={[s.durValue, { color: colors.success }]}>{efficiency.activeHours}h</Text>
          </View>
          <View style={s.durItem}>
            <Text style={s.durLabel}>WAITING / QUEUE</Text>
            <Text style={[s.durValue, { color: colors.warning }]}>{efficiency.waitingHours}h</Text>
          </View>
          <View style={s.durItem}>
            <Text style={s.durLabel}>IMPEDIMENT BLOCKED</Text>
            <Text style={[s.durValue, { color: colors.danger }]}>{efficiency.blockedHours}h</Text>
          </View>
          <View style={s.durItem}>
            <Text style={s.durLabel}>IN REVIEW</Text>
            <Text style={[s.durValue, { color: colors.primary }]}>{efficiency.reviewHours}h</Text>
          </View>
        </View>
      </View>

      {/* ── 3. In-Flight Work Aging Forecast ──────────────────────────────── */}
      <View style={s.card}>
        <View style={s.headerRow}>
          <Ionicons name="time-outline" size={16} color={colors.text} />
          <Text style={s.cardTitle}>In-Flight Work Aging & Risk Signals</Text>
        </View>

        {itemForecasts.length === 0 ? (
          <Text style={s.emptyNotice}>No active work items in flow.</Text>
        ) : (
          itemForecasts.map((item: any) => {
            const isOutlier = item.riskSignal === "CRITICAL_OUTLIER";
            const isElevated = item.riskSignal === "ELEVATED_RISK";

            return (
              <View key={item.taskId} style={s.forecastItemRow}>
                <View style={s.itemMain}>
                  <Text style={s.itemTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.itemSub}>
                    Stage: {item.column.toUpperCase()} · Current Age: {item.currentAgeDays} days
                  </Text>
                  <Text style={s.itemExp}>{item.riskExplanation}</Text>
                </View>

                <Badge
                  label={item.riskSignal.replace("_", " ")}
                  color={isOutlier ? colors.danger : isElevated ? colors.warning : colors.primary}
                />
              </View>
            );
          })
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTitle: {
    ...font.caption,
    fontWeight: "700",
    color: colors.text,
  },
  subText: {
    fontSize: 11,
    color: colors.textFaint,
  },
  percentilesRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: spacing.xs,
  },
  pBox: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  pLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.textFaint,
    letterSpacing: 0.5,
  },
  pValue: {
    ...font.h2,
    color: colors.text,
    marginVertical: 4,
  },
  pDesc: {
    fontSize: 10,
    color: colors.textFaint,
  },
  durationsGrid: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: spacing.xs,
  },
  durItem: {
    flex: 1,
    minWidth: 110,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  durLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.textFaint,
  },
  durValue: {
    ...font.h3,
    marginTop: 4,
  },
  emptyNotice: {
    fontSize: 12,
    color: colors.textFaint,
    fontStyle: "italic",
    paddingVertical: spacing.sm,
  },
  forecastItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + "44",
    gap: spacing.sm,
  },
  itemMain: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  itemSub: {
    fontSize: 11,
    color: colors.textFaint,
  },
  itemExp: {
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 2,
  },
});
