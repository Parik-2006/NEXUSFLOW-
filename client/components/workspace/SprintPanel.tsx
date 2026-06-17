/**
 * SprintPanel — 0/1 Knapsack Sprint Optimizer.
 * Capacity stepper → DP optimizer → selected task cards + utilization bar.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTeam, type SprintResult } from "@/hooks/useTeam";
import { Card, Button, Stepper, Badge, ProgressBar, EmptyState } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { colors, spacing, radius, font } from "@/theme";

export default function SprintPanel({ teamId }: { teamId: string }) {
  const { sprintOptimize } = useTeam(teamId);
  const toast = useToast();
  const [hours, setHours] = useState(40);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SprintResult | null>(null);

  const run = async () => {
    setLoading(true);
    const { result: r, error } = await sprintOptimize(hours);
    setLoading(false);
    if (error) { toast(error, "error"); return; }
    setResult(r!);
    if (r?.warning) toast(r.warning, "info");
  };

  const util = result?.utilizationPct ?? 0;
  const utilColor = util > 95 ? colors.danger : util > 80 ? colors.warning : colors.success;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 60 }}>
      <Card style={{ gap: spacing.md }}>
        <View style={s.head}>
          <View style={[s.icon, { backgroundColor: colors.knapsack + "1a" }]}><Ionicons name="rocket" size={20} color={colors.knapsack} /></View>
          <View style={{ flex: 1 }}>
            <Text style={font.h3}>Sprint Optimizer</Text>
            <Text style={s.sub}>0/1 Knapsack · maximises value within capacity</Text>
          </View>
          <Badge label="O(n·W)" color={colors.knapsack} />
        </View>
        <View style={s.capRow}>
          <Text style={s.capLabel}>Sprint capacity</Text>
          <Stepper value={hours} onChange={setHours} min={1} max={200} step={5} suffix="h" />
        </View>
        <Button title={loading ? "Optimizing…" : "Run Knapsack Optimizer"} icon="flash" onPress={run} loading={loading} />
      </Card>

      {result && (result.selectedTasks.length === 0 ? (
        <EmptyState icon="cube-outline" title="No eligible tasks" message={result.message ?? "Add estimated hours and business value to backlog tasks so the optimizer can select them."} />
      ) : (
        <Card style={{ gap: spacing.md }}>
          <View style={s.statRow}>
            <Metric label="Tasks" value={result.selectedTasks.length} color={colors.primary} />
            <Metric label="Value" value={result.totalValue} color={colors.success} />
            <Metric label="Hours" value={`${result.totalHours}/${result.sprintCapacity}`} color={colors.greedy} />
            <Metric label="Used" value={`${util}%`} color={utilColor} />
          </View>
          <View style={{ gap: 4 }}>
            <ProgressBar value={util / 100} color={utilColor} height={10} />
            <Text style={s.utilTxt}>{util}% capacity utilised</Text>
          </View>
          <Text style={s.selTitle}>Selected for this sprint</Text>
          {result.selectedTasks.map((t) => (
            <View key={t._id} style={s.taskRow}>
              <View style={[s.dot, { backgroundColor: colors.knapsack }]} />
              <Text style={s.taskTitle}>{t.title}</Text>
              <Text style={s.taskMeta}>{t.estimatedHours}h · V{t.businessValue}</Text>
            </View>
          ))}
        </Card>
      ))}

      {!result && !loading && (
        <EmptyState icon="rocket-outline" title="Plan your sprint" message="Set a capacity and run the Knapsack optimizer to pick the highest-value tasks that fit." />
      )}
    </ScrollView>
  );
}

function Metric({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={[s.metricVal, { color }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  icon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  capRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  capLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  statRow: { flexDirection: "row" },
  metricVal: { fontSize: 20, fontWeight: "800" },
  metricLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  utilTxt: { fontSize: 11, color: colors.textMuted, textAlign: "center", fontWeight: "600" },
  selTitle: { fontSize: 13, fontWeight: "700", color: colors.text, marginTop: 4 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  taskTitle: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text },
  taskMeta: { fontSize: 12, color: colors.textMuted },
});
