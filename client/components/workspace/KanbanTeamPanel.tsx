/**
 * client/components/workspace/KanbanTeamPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN TEAM INTELLIGENCE & PERSONAL WIP (Prompts 19, 20)
 *
 * Member capacity & personal flow allocation:
 *   - Personal WIP utilization (excludes blocked tasks from active penalty)
 *   - Active vs Blocked vs In Review work allocation
 *   - Verified member skills and capability profile
 *   - Overload indicators
 * ============================================================================
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/feedback";
import { Avatar, ProgressBar, Badge, SkeletonCard } from "@/components/ui";
import { fetchKanbanTeam } from "@/services/kanbanApiService";
import { colors, spacing, radius, font } from "@/theme";

interface KanbanTeamPanelProps {
  teamId: string;
}

export default function KanbanTeamPanel({ teamId }: KanbanTeamPanelProps) {
  const { token } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTeam = useCallback(async () => {
    try {
      const res = await fetchKanbanTeam(teamId, token);
      setData(res);
    } catch (err: any) {
      toast(err.message || "Failed to load team data", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, token, toast]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const onRefresh = () => {
    setRefreshing(true);
    loadTeam();
  };

  if (loading) {
    return (
      <View style={s.container}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  const personalWip = data?.personalWip || [];
  const enabled = data?.personalWipEnabled || false;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={s.headerCard}>
        <Ionicons name="people" size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Team Workload & Personal WIP</Text>
          <Text style={s.headerSub}>
            {personalWip.length} Member(s) · Personal WIP enforcement: {enabled ? "ENABLED" : "ADVISORY"}
          </Text>
        </View>
      </View>

      <View style={s.membersGrid}>
        {personalWip.map((m: any) => {
          const isOver = m.isOverloaded;
          const isSat = m.isSaturated;

          return (
            <View key={m.userId} style={[s.memberCard, isOver && s.memberCardOver]}>
              <View style={s.memberTop}>
                <Avatar name={m.name || "Member"} size={36} />
                <View style={s.memberInfo}>
                  <Text style={s.memberName}>{m.name}</Text>
                  <Text style={s.memberRole}>{m.role?.toUpperCase()}</Text>
                </View>

                <Badge
                  label={`${m.activeCount} / ${m.limit} WIP`}
                  color={isOver ? colors.danger : isSat ? colors.warning : colors.primary}
                />
              </View>

              {/* Progress bar */}
              <View style={s.progressWrap}>
                <ProgressBar value={m.utilization / 100} color={isOver ? colors.danger : isSat ? colors.warning : colors.primary} />
                <Text style={s.utilText}>{m.utilization}% capacity utilized</Text>
              </View>

              {/* Task Breakdown */}
              <View style={s.countsRow}>
                <Text style={s.countItem}>⚡ {m.activeCount} In Progress</Text>
                <Text style={s.countItem}>🔍 {m.inReviewCount} In Review</Text>
                {m.blockedCount > 0 && (
                  <Text style={[s.countItem, { color: colors.danger }]}>⚠️ {m.blockedCount} Blocked</Text>
                )}
                <Text style={s.countItem}>✅ {m.completedCount} Done</Text>
              </View>

              {isOver && (
                <Text style={s.overNotice}>
                  ⚠️ Exceeding personal WIP limit. Pulling additional work is restricted.
                </Text>
              )}
            </View>
          );
        })}
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
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
  membersGrid: {
    gap: spacing.md,
  },
  memberCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  memberCardOver: {
    borderColor: colors.danger + "55",
    backgroundColor: colors.danger + "05",
  },
  memberTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    ...font.caption,
    fontWeight: "700",
    color: colors.text,
  },
  memberRole: {
    fontSize: 10,
    color: colors.textFaint,
    fontWeight: "600",
  },
  progressWrap: {
    gap: 4,
    marginVertical: 4,
  },
  utilText: {
    fontSize: 10,
    color: colors.textFaint,
    alignSelf: "flex-end",
  },
  countsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border + "44",
  },
  countItem: {
    fontSize: 11,
    color: colors.textFaint,
    fontWeight: "500",
  },
  overNotice: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: "600",
    marginTop: 2,
  },
});
