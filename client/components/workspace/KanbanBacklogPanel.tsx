/**
 * client/components/workspace/KanbanBacklogPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN BACKLOG & REPLENISHMENT PANEL (Prompts 7, 21)
 *
 * Continuous replenishment engine:
 *   - Backlog ranked deterministically by DAA dynamic priority
 *   - Definition of Ready (DoR) compliance checks
 *   - Quality inspection (oversized, stale, missing acceptance criteria)
 *   - Batch replenishment into Ready queue
 * ============================================================================
 */

import React, { useCallback, useEffect, useState } from "react";
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
import { useToast } from "@/components/feedback";
import { Badge, Button, SkeletonCard } from "@/components/ui";
import { fetchKanbanBacklog, replenishKanbanBacklog } from "@/services/kanbanApiService";
import { colors, spacing, radius, font } from "@/theme";

interface KanbanBacklogPanelProps {
  teamId: string;
  onNavigateBoard?: () => void;
}

export default function KanbanBacklogPanel({ teamId, onNavigateBoard }: KanbanBacklogPanelProps) {
  const { token } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [replenishing, setReplenishing] = useState(false);

  const loadBacklog = useCallback(async () => {
    try {
      const res = await fetchKanbanBacklog(teamId, token);
      setData(res);
      // Auto-select recommended candidates by default
      const recIds = (res.replenishment?.recommendedForReplenish || []).map((r: any) => r.taskId);
      setSelectedTaskIds(recIds);
    } catch (err: any) {
      toast(err.message || "Failed to load backlog", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, token, toast]);

  useEffect(() => {
    loadBacklog();
  }, [loadBacklog]);

  const onRefresh = () => {
    setRefreshing(true);
    loadBacklog();
  };

  const toggleSelect = (taskId: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const handleReplenish = async () => {
    if (selectedTaskIds.length === 0) return;
    setReplenishing(true);
    try {
      await replenishKanbanBacklog(teamId, selectedTaskIds, token);
      toast(`Replenished ${selectedTaskIds.length} item(s) into Ready queue`, "success");
      loadBacklog();
    } catch (err: any) {
      toast(err.message || "Replenishment failed", "error");
    } finally {
      setReplenishing(false);
    }
  };

  if (loading) {
    return (
      <View style={s.container}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  const backlogCount = data?.backlogCount || 0;
  const availableSlots = data?.availableReadySlots || 0;
  const rankedItems = data?.rankedBacklog || [];
  const replenishment = data?.replenishment || {};

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── 1. Replenishment Header ────────────────────────────────────────── */}
      <View style={s.replenishHeader}>
        <View style={s.headerLeft}>
          <Text style={s.headerTitle}>Continuous Backlog Replenishment</Text>
          <Text style={s.headerSub}>
            Backlog items: {backlogCount} · Available slots in Ready: {availableSlots}
          </Text>
        </View>
        <Button
          title={replenishing ? "Replenishing..." : `Replenish Selected (${selectedTaskIds.length})`}
          icon="arrow-forward-circle"
          disabled={selectedTaskIds.length === 0 || replenishing}
          onPress={handleReplenish}
        />
      </View>

      {/* ── 2. Ranked Backlog Items ─────────────────────────────────────────── */}
      <View style={s.listCard}>
        <Text style={s.sectionTitle}>DAA Priority-Ranked Work Items</Text>

        {rankedItems.length === 0 ? (
          <Text style={s.emptyNotice}>Backlog is empty. Create new items to replenish.</Text>
        ) : (
          rankedItems.map((r: any, idx: number) => {
            const task = r.task;
            const isSelected = selectedTaskIds.includes(task._id);
            const quality = replenishment.allCandidates?.find((c: any) => c.taskId === task._id);
            const isRec = quality?.isRecommended;

            return (
              <View key={task._id} style={[s.itemRow, isSelected && s.itemRowSelected]}>
                {/* Checkbox */}
                <Pressable
                  onPress={() => toggleSelect(task._id)}
                  style={s.checkbox}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                >
                  <Ionicons
                    name={isSelected ? "checkbox" : "square-outline"}
                    size={20}
                    color={isSelected ? colors.primary : colors.textFaint}
                  />
                </Pressable>

                {/* Main Content */}
                <View style={s.itemContent}>
                  <View style={s.itemTitleRow}>
                    <Text style={s.rankNum}>#{idx + 1}</Text>
                    <Text style={s.itemTitle} numberOfLines={1}>{task.title}</Text>
                    {isRec && (
                      <Badge label="RECOMMENDED" color={colors.success} />
                    )}
                  </View>

                  <Text style={s.itemExplanation}>{r.explanation}</Text>

                  {/* Badges / Factors */}
                  <View style={s.badgesRow}>
                    <Badge label={`Priority: ${r.score}`} color={colors.primary} />
                    <Badge label={`DoR: ${quality?.dorScore ?? 80}%`} color={colors.primary} />
                    {task.estimatedHours && (
                      <Text style={s.metaText}>{task.estimatedHours}h estimated</Text>
                    )}
                    {task.classOfService && task.classOfService !== "standard" && (
                      <Badge label={task.classOfService.toUpperCase()} color={colors.warning} />
                    )}
                  </View>

                  {/* Quality Warnings */}
                  {quality?.qualityStatus === "NEEDS_REFINEMENT" && (
                    <Text style={s.qualityWarning}>
                      ⚠️ Needs refinement: {quality.issues?.join(" · ")}
                    </Text>
                  )}
                </View>
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
  replenishHeader: {
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
  headerLeft: {
    flex: 1,
    minWidth: 220,
  },
  headerTitle: {
    ...font.h3,
    color: colors.text,
  },
  headerSub: {
    ...font.caption,
    color: colors.textFaint,
    marginTop: 2,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...font.caption,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyNotice: {
    fontSize: 12,
    color: colors.textFaint,
    fontStyle: "italic",
    paddingVertical: spacing.md,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemRowSelected: {
    backgroundColor: colors.primary + "08",
    borderColor: colors.primary + "44",
  },
  checkbox: {
    paddingTop: 2,
  },
  itemContent: {
    flex: 1,
    gap: 4,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  rankNum: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    flexShrink: 1,
  },
  itemExplanation: {
    fontSize: 11,
    color: colors.textFaint,
  },
  badgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 2,
  },
  metaText: {
    fontSize: 11,
    color: colors.textFaint,
  },
  qualityWarning: {
    fontSize: 11,
    color: colors.warning,
    fontWeight: "500",
    marginTop: 2,
  },
});
