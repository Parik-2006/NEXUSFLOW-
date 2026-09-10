/**
 * client/components/workspace/KanbanInsightsPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN INSIGHTS & CONTINUOUS IMPROVEMENT (Prompts 22, 23, 24)
 *
 * Real flow analytics:
 *   - Continuous improvement recommendations based on empirical evidence
 *   - Bottleneck diagnosis
 *   - Continuous delivery records with DoD verification and teacher feedback
 * ============================================================================
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/feedback";
import { Badge, SkeletonCard } from "@/components/ui";
import {
  fetchKanbanContinuousImprovement,
  fetchKanbanContinuousDelivery,
} from "@/services/kanbanApiService";
import { colors, spacing, radius, font } from "@/theme";

interface KanbanInsightsPanelProps {
  teamId: string;
}

export default function KanbanInsightsPanel({ teamId }: KanbanInsightsPanelProps) {
  const { token } = useAuth();
  const toast = useToast();
  const [ciData, setCiData] = useState<any>(null);
  const [deliveryData, setDeliveryData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [ciRes, delRes] = await Promise.all([
        fetchKanbanContinuousImprovement(teamId, token),
        fetchKanbanContinuousDelivery(teamId, token),
      ]);
      setCiData(ciRes);
      setDeliveryData(delRes);
    } catch (err: any) {
      toast(err.message || "Failed to load insights", "error");
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
        <SkeletonCard />
      </View>
    );
  }

  const recommendations = ciData?.recommendations || [];
  const deliveredItems = deliveryData?.deliveredItems || [];

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── 1. Continuous Improvement Recommendations ──────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
          <Text style={s.cardTitle}>Evidence-Based Flow Improvement Actions</Text>
        </View>

        {recommendations.length === 0 ? (
          <Text style={s.emptyNotice}>
            No flow policy anomalies detected. Work is executing in alignment with WIP and SLE targets.
          </Text>
        ) : (
          recommendations.map((rec: any, idx: number) => (
            <View key={idx} style={s.recItem}>
              <View style={s.recTop}>
                <Badge
                  label={rec.category.replace("_", " ")}
                  color={rec.severity === "CRITICAL" ? colors.danger : colors.warning}
                />
                {rec.stage && <Text style={s.stageText}>Stage: {rec.stage}</Text>}
              </View>
              <Text style={s.actionText}>💡 {rec.action}</Text>
              <Text style={s.evidenceText}>Evidence: {rec.evidence}</Text>
            </View>
          ))
        )}
      </View>

      {/* ── 2. Continuous Delivery Verification ────────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Ionicons name="checkmark-done-circle-outline" size={18} color={colors.success} />
          <Text style={s.cardTitle}>Continuous Delivery & Verification ({deliveredItems.length})</Text>
        </View>

        {deliveredItems.length === 0 ? (
          <Text style={s.emptyNotice}>No work items marked Done yet.</Text>
        ) : (
          deliveredItems.map((item: any) => (
            <View key={item._id} style={s.deliveredItem}>
              <View style={s.delivTop}>
                <Text style={s.delivTitle}>{item.title}</Text>
                <Badge label="VERIFIED" color={colors.success} />
              </View>

              {item.deliveryEvidence && item.deliveryEvidence.length > 0 && (
                <View style={s.evidenceWrap}>
                  <Text style={s.evidenceLabel}>Artifacts / Evidence:</Text>
                  {item.deliveryEvidence.map((e: string, i: number) => (
                    <Text key={i} style={s.evidenceBullet}>• {e}</Text>
                  ))}
                </View>
              )}

              {item.teacherFeedback ? (
                <View style={s.feedbackBox}>
                  <Text style={s.feedbackLabel}>Faculty / Teacher Feedback:</Text>
                  <Text style={s.feedbackText}>{item.teacherFeedback}</Text>
                </View>
              ) : null}
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  cardTitle: {
    ...font.caption,
    fontWeight: "700",
    color: colors.text,
  },
  emptyNotice: {
    fontSize: 12,
    color: colors.textFaint,
    fontStyle: "italic",
    paddingVertical: spacing.sm,
  },
  recItem: {
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  recTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stageText: {
    fontSize: 11,
    color: colors.textFaint,
    fontWeight: "600",
  },
  actionText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  evidenceText: {
    fontSize: 11,
    color: colors.textFaint,
  },
  deliveredItem: {
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  delivTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  delivTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  evidenceWrap: {
    marginTop: 2,
  },
  evidenceLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text,
  },
  evidenceBullet: {
    fontSize: 11,
    color: colors.textFaint,
    marginLeft: 4,
  },
  feedbackBox: {
    marginTop: 4,
    padding: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  feedbackLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
  },
  feedbackText: {
    fontSize: 11,
    color: colors.text,
    marginTop: 1,
  },
});
