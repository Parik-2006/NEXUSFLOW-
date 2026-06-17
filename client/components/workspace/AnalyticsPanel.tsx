/**
 * AnalyticsPanel — Task Analytics Engine.
 * Bubble Sort O(n²) vs Merge Sort O(n log n) execution metrics over the
 * team's current task set.
 */
import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTaskAnalytics } from "@/hooks/useTaskAnalytics";
import SortComparisonCard from "@/components/SortComparisonCard";
import { Button, EmptyState, SkeletonCard, Badge } from "@/components/ui";
import { colors, spacing, radius, font } from "@/theme";

export default function AnalyticsPanel({ teamId }: { teamId: string }) {
  const { analytics, loading, refetch } = useTaskAnalytics(teamId);

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 60 }}>
      <View style={s.head}>
        <View style={[s.icon, { backgroundColor: colors.merge + "1a" }]}><Ionicons name="stats-chart" size={20} color={colors.merge} /></View>
        <View style={{ flex: 1 }}>
          <Text style={font.h3}>Sort Analytics</Text>
          <Text style={s.sub}>Empirical complexity comparison</Text>
        </View>
        <Badge label="Merge O(n log n)" color={colors.merge} />
      </View>

      {loading ? (
        <SkeletonCard />
      ) : !analytics || analytics.n === 0 ? (
        <EmptyState icon="bar-chart-outline" title="No data yet" message="Add tasks to this team to compare Bubble Sort and Merge Sort performance." actionLabel="Refresh" actionIcon="refresh" onAction={refetch} />
      ) : (
        <SortComparisonCard analytics={analytics} />
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  icon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
});
