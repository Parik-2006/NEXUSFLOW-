import { View, Text, StyleSheet } from "react-native";
import type { TaskAnalytics } from "@/hooks/useTaskAnalytics";

/**
 * SortComparisonCard — DAA Task Analytics Engine visualization.
 * Renders execution metrics for Bubble Sort O(n^2) vs Merge Sort O(n log n)
 * over the team's current task set.
 */
export default function SortComparisonCard({ analytics }: { analytics: TaskAnalytics }) {
  if (analytics.skippedBubbleSort) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Task Sort Analytics</Text>
        <Text style={styles.note}>{analytics.reason}</Text>
        <Text style={styles.note}>Merge Sort (O(n log n)) used — n = {analytics.n}</Text>
      </View>
    );
  }

  const bubble = analytics.bubbleSort;
  const merge = analytics.mergeSort;
  if (!bubble || !merge) return null;

  const maxTime = Math.max(bubble.timeMs, merge.timeMs, 0.001);
  const maxComparisons = Math.max(bubble.comparisons, merge.comparisons, 1);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Task Sort Analytics</Text>
      <Text style={styles.sub}>Bubble Sort O(n²) vs Merge Sort O(n log n) — n = {analytics.n}</Text>

      <MetricRow
        label="Execution Time (ms)"
        leftLabel={`Bubble: ${bubble.timeMs}`}
        rightLabel={`Merge: ${merge.timeMs}`}
        leftRatio={bubble.timeMs / maxTime}
        rightRatio={merge.timeMs / maxTime}
      />

      <MetricRow
        label="Comparisons"
        leftLabel={`Bubble: ${bubble.comparisons}`}
        rightLabel={`Merge: ${merge.comparisons}`}
        leftRatio={bubble.comparisons / maxComparisons}
        rightRatio={merge.comparisons / maxComparisons}
      />

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: "#f59e0b" }]} />
          <Text style={styles.legendText}>Bubble Sort — O(n²), {bubble.swaps} swaps</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: "#4f46e5" }]} />
          <Text style={styles.legendText}>Merge Sort — O(n log n), stable</Text>
        </View>
      </View>
    </View>
  );
}

function MetricRow({
  label,
  leftLabel,
  rightLabel,
  leftRatio,
  rightRatio,
}: {
  label: string;
  leftLabel: string;
  rightLabel: string;
  leftRatio: number;
  rightRatio: number;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.barRow}>
        <Text style={styles.barCaption}>{leftLabel}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(100, leftRatio * 100)}%`, backgroundColor: "#f59e0b" }]} />
        </View>
      </View>
      <View style={styles.barRow}>
        <Text style={styles.barCaption}>{rightLabel}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(100, rightRatio * 100)}%`, backgroundColor: "#4f46e5" }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff", borderRadius: 14, padding: 16, gap: 10,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  title: { fontSize: 18, fontWeight: "700" },
  sub: { fontSize: 13, color: "#667085" },
  note: { fontSize: 13, color: "#667085" },
  metric: { gap: 6, marginTop: 4 },
  metricLabel: { fontSize: 13, fontWeight: "600", color: "#344054" },
  barRow: { gap: 4 },
  barCaption: { fontSize: 12, color: "#475467" },
  track: { height: 8, borderRadius: 4, backgroundColor: "#e5e7eb", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 12, color: "#475467" },
});
