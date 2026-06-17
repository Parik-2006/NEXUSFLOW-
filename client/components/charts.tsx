/**
 * charts.tsx — lightweight, dependency-free chart primitives (View/DOM based).
 * Used by the Analytics dashboard. All values are passed in by the caller and
 * derived from live project data — nothing here is hardcoded.
 *
 *   <BarChart data={[{label,value,color}]} />     horizontal bars
 *   <GroupedBarChart groups={…} series={…} />      grouped bars (growth compare)
 *   <PieChart data={[{label,value,color}]} />      conic pie on web, stacked native
 */
import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { colors, radius } from "@/theme";

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

// ── Grouped bar chart (e.g. growth: O(n²) vs O(n log n) across sizes) ─────────
export function GroupedBarChart({
  groups, series,
}: {
  groups: { label: string; values: number[] }[];
  series: { label: string; color: string }[];
}) {
  const max = Math.max(1, ...groups.flatMap((g) => g.values));
  return (
    <View style={{ gap: 10 }}>
      <View style={c.chartArea}>
        {groups.map((g) => (
          <View key={g.label} style={c.groupCol}>
            <View style={c.bars}>
              {g.values.map((v, i) => (
                <View key={i} style={[c.vBar, { height: `${(v / max) * 100}%`, backgroundColor: series[i]?.color ?? colors.primary }]} />
              ))}
            </View>
            <Text style={c.groupLabel}>{g.label}</Text>
          </View>
        ))}
      </View>
      <View style={c.legend}>
        {series.map((sd) => (
          <View key={sd.label} style={c.legendItem}>
            <View style={[c.swatch, { backgroundColor: sd.color }]} />
            <Text style={c.legendTxt}>{sd.label}</Text>
          </View>
        ))}
      </View>
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
export function RadarChart({
  axes, series, size = 220,
}: {
  axes: string[];
  series: { label: string; color: string; values: number[] }[]; // values 0..1 aligned to axes
  size?: number;
}) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 28;
  const n = axes.length;
  const pointAt = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * v * Math.cos(ang), cy + r * v * Math.sin(ang)];
  };

  if (Platform.OS === "web") {
    const grid = [0.25, 0.5, 0.75, 1].map((g, gi) =>
      React.createElement("polygon", {
        key: `g${gi}`,
        points: axes.map((_, i) => pointAt(i, g).join(",")).join(" "),
        fill: "none", stroke: colors.border, strokeWidth: 1,
      })
    );
    const spokes = axes.map((_, i) => {
      const [x, y] = pointAt(i, 1);
      return React.createElement("line", { key: `s${i}`, x1: cx, y1: cy, x2: x, y2: y, stroke: colors.border, strokeWidth: 1 });
    });
    const labels = axes.map((a, i) => {
      const [x, y] = pointAt(i, 1.16);
      return React.createElement("text", { key: `l${i}`, x, y, fill: colors.textMuted, fontSize: 9, fontWeight: 700, textAnchor: "middle" }, a);
    });
    const polys = series.map((sd, si) =>
      React.createElement("polygon", {
        key: `p${si}`,
        points: sd.values.map((v, i) => pointAt(i, Math.max(0, Math.min(1, v))).join(",")).join(" "),
        fill: sd.color + "22", stroke: sd.color, strokeWidth: 2,
      })
    );
    const svg = React.createElement("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}` }, [...grid, ...spokes, ...polys, ...labels]);
    return (
      <View style={{ alignItems: "center", gap: 8 }}>
        {svg as any}
        <View style={c.legend}>{series.map((sd) => (
          <View key={sd.label} style={c.legendItem}><View style={[c.swatch, { backgroundColor: sd.color }]} /><Text style={c.legendTxt}>{sd.label}</Text></View>
        ))}</View>
      </View>
    );
  }

  // Native fallback — per-axis grouped bars.
  return (
    <View style={{ gap: 8 }}>
      {axes.map((a, ai) => (
        <View key={a} style={c.barRow}>
          <Text style={c.barLabel} numberOfLines={1}>{a}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            {series.map((sd) => <View key={sd.label} style={[c.barFill, { height: 5, width: `${Math.round((sd.values[ai] ?? 0) * 100)}%`, backgroundColor: sd.color }]} />)}
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Line chart (web SVG polylines, native fallback to grouped bars) ───────────
export function LineChart({
  series, xLabels, height = 160,
}: {
  series: { label: string; color: string; points: number[] }[];
  xLabels: string[];
  height?: number;
}) {
  const max = Math.max(1, ...series.flatMap((s) => s.points));
  const n = Math.max(1, xLabels.length - 1);

  if (Platform.OS === "web") {
    const W = 320, H = height, padX = 8, padY = 10;
    const px = (i: number) => padX + (i * (W - 2 * padX)) / n;
    const py = (v: number) => H - padY - (v / max) * (H - 2 * padY);
    const lines = series.map((sd, si) =>
      React.createElement("polyline", {
        key: `pl${si}`,
        points: sd.points.map((v, i) => `${px(i)},${py(v)}`).join(" "),
        fill: "none", stroke: sd.color, strokeWidth: 2.5,
      })
    );
    const dots = series.flatMap((sd, si) => sd.points.map((v, i) =>
      React.createElement("circle", { key: `d${si}_${i}`, cx: px(i), cy: py(v), r: 3, fill: sd.color })
    ));
    const svg = React.createElement("svg", { width: "100%", height: H, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none" }, [...lines, ...dots]);
    return (
      <View style={{ gap: 8 }}>
        {svg as any}
        <View style={c.xLabels}>{xLabels.map((x) => <Text key={x} style={c.xLabel}>{x}</Text>)}</View>
        <View style={c.legend}>{series.map((sd) => (
          <View key={sd.label} style={c.legendItem}><View style={[c.swatch, { backgroundColor: sd.color }]} /><Text style={c.legendTxt}>{sd.label}</Text></View>
        ))}</View>
      </View>
    );
  }

  // Native fallback — grouped bars per x.
  return (
    <GroupedBarChart
      groups={xLabels.map((x, i) => ({ label: x, values: series.map((s) => s.points[i] ?? 0) }))}
      series={series.map((s) => ({ label: s.label, color: s.color }))}
    />
  );
}

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

  chartArea: { flexDirection: "row", alignItems: "flex-end", height: 140, gap: 10, paddingTop: 4 },
  groupCol: { flex: 1, alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: "100%" },
  vBar: { width: 14, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 2 },
  groupLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted },

  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendTxt: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  legendVal: { fontSize: 11, fontWeight: "800", color: colors.text, marginLeft: "auto" },

  pieRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  stack: { height: 24, borderRadius: 6, overflow: "hidden", flexDirection: "row" },

  xLabels: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 },
  xLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted },
});
