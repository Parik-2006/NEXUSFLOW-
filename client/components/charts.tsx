/**
 * charts.tsx — lightweight, dependency-free chart primitives (View/DOM based).
 * Used by the Analytics dashboard. All values are passed in by the caller and
 * derived from live project data — nothing here is hardcoded.
 *
 *   <BarChart data={[{label,value,color}]} />     horizontal bars
 *   <PieChart data={[{label,value,color}]} />      conic pie on web, stacked native
 */
import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { colors } from "@/theme";

export type Datum = { label: string; value: number; color: string; sub?: string };

// ── Horizontal bar chart ──────────────────────────────────────────────────────
export function BarChart({ data, unit = "" }: { data: Datum[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ gap: 8 }}>
      {data.map((d) => (
        <View key={d.label} style={c.barRow}>
          <Text style={c.barLabel} numberOfLines={1}>{d.label}</Text>
          <View style={c.barTrack}>
            <View style={[c.barFill, { width: `${(d.value / max) * 100}%`, backgroundColor: d.color }]} />
          </View>
          <Text style={c.barValue}>{formatNum(d.value)}{unit}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Pie chart (conic-gradient on web, stacked bar fallback on native) ─────────
export function PieChart({ data, size = 120 }: { data: Datum[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const withPct = data.map((d) => ({ ...d, pct: (d.value / total) * 100 }));

  let pie: React.ReactNode;
  if (Platform.OS === "web") {
    let acc = 0;
    const stops = withPct.map((d) => {
      const seg = `${d.color} ${acc}% ${acc + d.pct}%`;
      acc += d.pct;
      return seg;
    }).join(", ");
    pie = React.createElement("div", {
      style: { width: size, height: size, borderRadius: "50%", background: `conic-gradient(${stops})` },
    });
  } else {
    pie = (
      <View style={[c.stack, { width: size }]}>
        {withPct.map((d) => <View key={d.label} style={{ flex: Math.max(d.pct, 0.01), backgroundColor: d.color }} />)}
      </View>
    );
  }

  return (
    <View style={c.pieRow}>
      {pie}
      <View style={{ flex: 1, gap: 6 }}>
        {withPct.map((d) => (
          <View key={d.label} style={c.legendItem}>
            <View style={[c.swatch, { backgroundColor: d.color }]} />
            <Text style={c.legendTxt}>{d.label}</Text>
            <Text style={c.legendVal}>{Math.round(d.pct)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Radar chart (web SVG polygons, native fallback to per-axis bars) ──────────
function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n * 1000) / 1000}`;
}

const c = StyleSheet.create({
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: { width: 96, fontSize: 12, fontWeight: "600", color: colors.textMuted },
  barTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: colors.border, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 6 },
  barValue: { width: 64, fontSize: 11, fontWeight: "800", color: colors.text, textAlign: "right" },

  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendTxt: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  legendVal: { fontSize: 11, fontWeight: "800", color: colors.text, marginLeft: "auto" },

  pieRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  stack: { height: 24, borderRadius: 6, overflow: "hidden", flexDirection: "row" },
});
