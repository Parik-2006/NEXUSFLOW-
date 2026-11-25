/**
 * DAA Insights — education / demo mode.
 * A dedicated, self-contained reference screen kept OUT of the normal user
 * workflow (reachable only from Profile). For every algorithm it documents
 * purpose, where it runs in the product, sample input/output, complexity and
 * a tiny inline visualization. Intended for mentors and demos.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, Badge } from "@/components/ui";
import { colors, spacing, radius, font, layout } from "@/theme";
import benchmarkData from "@/constants/daaBenchmarks.json";

type Viz = "bars" | "graph" | "grid" | "search";

type Algo = {
  name: string; tag: string; color: string; viz: Viz;
  purpose: string; where: string; input: string; output: string;
  time: string; space: string;
  guarantee: string; // exact / approximate behaviour, stated precisely
};

const ALGOS: Algo[] = [
  {
    name: "Greedy Scheduler", tag: "Task Prioritization", color: colors.greedy, viz: "bars",
    purpose: "Rank the backlog so the highest-leverage work surfaces first.",
    where: "Tasks tab — every task's priority score (urgency, impact, dependencies).",
    input: "Urgency (1–5), impact (1–5) and the number of tasks each task directly unblocks.",
    output: "A 0–100 score: round(100·(0.50·u + 0.35·i + 0.15·d)), each weight applied once; all-max inputs give exactly 100.",
    time: "O(1) per task + O(n log n) sort", space: "O(n)",
    guarantee: "Deterministic. Ties: score → older first (stable merge sort). Unfinished prerequisites make a task ineligible regardless of score.",
  },
  {
    name: "0/1 Knapsack", tag: "Sprint Planning", color: colors.knapsack, viz: "grid",
    purpose: "Pick the set of tasks that maximises delivered value within a capacity.",
    where: "Sprint tab — 'Run Knapsack Optimizer' against a capacity in hours.",
    input: "Dependency-ready tasks with estimated hours and business value, plus a capacity in hours.",
    output: "The highest-value subset that fits; hours are counted in 0.01 h units (task hours rounded up, capacity down), so the plan never exceeds capacity.",
    time: "O(n·W), W = capacity in 0.01 h", space: "O(W) + n·W bits",
    guarantee: "Exact optimum (pseudo-polynomial). Above 20 M DP cells it switches to a labelled approximation guaranteed ≥ 50% of optimum.",
  },
  {
    name: "Depth-First Search", tag: "Cycle Detection", color: colors.dfs, viz: "graph",
    purpose: "Detect circular dependencies before they break execution order.",
    where: "Dependency graph + adding a dependency — blocks cycles.",
    input: "The task dependency graph. Edge A → B means A must finish before B.",
    output: "Discovery / finish times and post-order; adding an edge that would close a cycle is refused.",
    time: "O(V + E)", space: "O(V)",
    guarantee: "Exact. Iterative, so very long dependency chains cannot overflow the call stack.",
  },
  {
    name: "Breadth-First Search", tag: "Reachability", color: colors.bfs, viz: "graph",
    purpose: "Find which tasks are reachable from the starting tasks and their shortest hop distance.",
    where: "Dependency graph API (bfsResult) — reachability only.",
    input: "The dependency graph and its source tasks (no prerequisites).",
    output: "Shortest-hop level per task (-1 when only reachable through a cycle).",
    time: "O(V + E)", space: "O(V)",
    guarantee: "Exact shortest-hop distances. These are NOT safe execution waves — see the next card.",
  },
  {
    name: "Execution Waves", tag: "Parallel Work Levels", color: colors.bfs, viz: "graph",
    purpose: "Group tasks into waves that can run in parallel without violating any dependency.",
    where: "Dependency graph (wavesResult), Scrum dependency analysis, sprint recommendation.",
    input: "A directed acyclic dependency graph.",
    output: "level(v) = max(level(u) + 1) over prerequisites u; sources are wave 0.",
    time: "O(E + V log V)", space: "O(V + E)",
    guarantee: "Every prerequisite is in a strictly earlier wave. A cyclic graph yields no schedule (cycle members are reported).",
  },
  {
    name: "Topological Sort", tag: "Execution Order", color: colors.topo, viz: "graph",
    purpose: "Produce a valid order so no task starts before its prerequisites.",
    where: "Dependency graph 'execution order' + AI sprint sequencing.",
    input: "A directed acyclic dependency graph.",
    output: "A linear order respecting every dependency; ties broken by smallest task id (binary min-heap of ready tasks).",
    time: "O(E + V log V)", space: "O(V + E)",
    guarantee: "Exact and deterministic. On a cycle the partial order is NOT presented as a schedule; cycle members are separated from tasks merely blocked by them.",
  },
  {
    name: "Branch & Bound", tag: "Task Assignment", color: colors.branch, viz: "grid",
    purpose: "Assign tasks to members at the lowest total skill-gap cost.",
    where: "Members tab — 'Run Assignment' over the skill cost matrix.",
    input: "Skill-gap cost per member × task, member hour capacity and current load.",
    output: "Assigns as many tasks as capacity allows at the lowest total skill-gap cost, with per-task reasons and node statistics.",
    time: "O(mⁿ) worst case", space: "O(m·n)",
    guarantee: "Proven optimal when the search completes (≤ 16 tasks, ≤ 200 000 nodes); otherwise the result is labelled approximate with the reason. Pruning does not make it polynomial.",
  },
  {
    name: "Merge Sort", tag: "Task Ordering", color: colors.merge, viz: "bars",
    purpose: "Stable, predictable ordering of tasks by any comparator.",
    where: "Tasks tab sort modes (Priority / Deadline / Progress); analytics.",
    input: "A task list and a comparator (priority, deadline or progress).",
    output: "A stably sorted task list (Θ(n log n) every time).",
    time: "O(n log n)", space: "O(n)",
    guarantee: "Exact and stable: equal keys keep their original order.",
  },
  {
    name: "Boyer–Moore–Horspool", tag: "Task Search", color: colors.boyer, viz: "search",
    purpose: "Fast substring search across task titles as you type.",
    where: "Tasks tab + AI panel search boxes; the same variant runs on the server.",
    input: "A query (≤ 512 characters) and task titles, both NFC-normalised and lower-cased.",
    output: "Tasks whose title or description contains the query.",
    time: "O(n·m) worst, ≈ n/m typical", space: "O(min(m, σ))",
    guarantee: "Exact substring matching on UTF-16 code units (works for Kannada, accents and emoji); not grapheme-aware.",
  },
];

export default function DAAInsights() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={font.h3}>DAA Insights</Text>
          <Text style={s.headerSub}>Education & demo mode · {ALGOS.length} algorithms</Text>
        </View>
        <View style={s.demoTag}><Ionicons name="school" size={14} color={colors.primary} /><Text style={s.demoTagTxt}>Demo</Text></View>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.container}>
          <Text style={s.intro}>
            NexusFlow uses these algorithms behind ordinary product actions — you
            never see them directly. This reference explains what each one does and
            where it runs.
          </Text>
          {ALGOS.map((a) => <AlgoCard key={a.name} a={a} />)}
          <WavesExample />
          <BenchmarkSection />
        </View>
      </ScrollView>
    </View>
  );
}

function AlgoCard({ a }: { a: Algo }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ gap: spacing.sm, borderLeftWidth: 3, borderLeftColor: a.color }}>
      <Pressable style={s.cardHead} onPress={() => setOpen((v) => !v)}>
        <View style={[s.vizWrap, { backgroundColor: a.color + "14" }]}><Viz kind={a.viz} color={a.color} /></View>
        <View style={{ flex: 1 }}>
          <Text style={font.h3}>{a.name}</Text>
          <Text style={[s.tag, { color: a.color }]}>{a.tag}</Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textFaint} />
      </Pressable>

      <Text style={s.purpose}>{a.purpose}</Text>
      <View style={s.complexityRow}>
        <Badge label={`Time ${a.time}`} color={a.color} />
        <Badge label={`Space ${a.space}`} color={colors.textMuted} bg={colors.surfaceAlt} />
      </View>

      {open && (
        <View style={s.detail}>
          <Detail icon="navigate-outline" label="Where it runs" value={a.where} />
          <Detail icon="enter-outline" label="Input" value={a.input} />
          <Detail icon="exit-outline" label="Output" value={a.output} />
          <Detail icon="shield-checkmark-outline" label="Guarantee" value={a.guarantee} />
        </View>
      )}
    </Card>
  );
}

function Detail({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Ionicons name={icon} size={15} color={colors.textMuted} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={s.detailLabel}>{label}</Text>
        <Text style={s.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

// ── Illustrative example (static, educational) ───────────────────────────────
function WavesExample() {
  const Row = ({ label, waves, ok }: { label: string; waves: string[][]; ok: boolean }) => (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name={ok ? "checkmark-circle" : "close-circle"} size={15} color={ok ? colors.success : colors.danger} />
        <Text style={s.detailLabel}>{label}</Text>
      </View>
      <View style={s.waveRow}>
        {waves.map((w, i) => (
          <View key={i} style={s.waveBox}>
            <Text style={s.waveTitle}>Wave {i}</Text>
            <Text style={s.waveTasks}>{w.join(", ")}</Text>
          </View>
        ))}
      </View>
    </View>
  );
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="git-branch-outline" size={18} color={colors.primary} />
        <Text style={[font.h3, { flex: 1 }]}>Why BFS levels are not execution waves</Text>
        <Badge label="Illustrative example" color={colors.textMuted} bg={colors.surfaceAlt} />
      </View>
      <Text style={s.purpose}>Dependencies A → B, A → C and B → C (C needs both A and B).</Text>
      <Row label="First-discovery BFS (shortest hops)" waves={[["A"], ["B", "C"]]} ok={false} />
      <Text style={s.caption}>C would start alongside B, before its prerequisite B has finished.</Text>
      <Row label="Longest-prerequisite waves (used by NEXUSFLOW)" waves={[["A"], ["B"], ["C"]]} ok />
    </Card>
  );
}

// ── Measured synthetic benchmarks (offline CLI output) ───────────────────────
type BenchRow = {
  algorithm: string; variant: string; size: Record<string, number>;
  complexity: { time: string; space: string };
  current: { medianMs: number; p90Ms: number; ops?: Record<string, number>; [k: string]: unknown };
  baseline?: { medianMs?: number; variant?: string; constraintViolations?: number; sameOrderAsCurrent?: boolean | null; [k: string]: unknown };
  exact: boolean;
};

const BENCH_GROUPS: { key: string; title: string; filter: (r: BenchRow) => boolean; note?: string }[] = [
  { key: "kahn", title: "Kahn topological sort", filter: (r) => r.algorithm === "Kahn topological sort", note: "Before: the ready list was re-sorted at every step. Same output order." },
  { key: "waves", title: "Execution waves vs old BFS levels", filter: (r) => r.algorithm === "Dependency execution waves", note: "Bars show runtime; the old BFS levels put many prerequisites in the same or a later level." },
  { key: "knap", title: "0/1 Knapsack (fractional hours)", filter: (r) => r.algorithm === "0/1 Knapsack" && r.variant.includes("fractional"), note: "The old DP could not index fractional hours, so it missed fitting tasks." },
  { key: "bnb", title: "Branch and Bound assignment", filter: (r) => r.algorithm === "Branch and Bound assignment", note: "Old and new solve different problems (the old overflow ignored capacity), so costs are not comparable." },
  { key: "bmh", title: "Boyer–Moore–Horspool (absent pattern, full scan)", filter: (r) => r.algorithm === "Boyer–Moore–Horspool" },
  { key: "rank", title: "Task Intelligence ranking", filter: (r) => r.algorithm === "Task Intelligence ranking" },
];

const sizeLabel = (size: Record<string, number>) =>
  Object.entries(size).map(([k, v]) => `${k}=${v.toLocaleString()}`).join(" · ");

function BenchmarkSection() {
  const data = benchmarkData as unknown as { generatedAt: string; environment: { node: string; cpu: string; platform: string }; method: { repetitions: number; warmup: number }; results: BenchRow[] };
  if (!data?.results?.length) {
    return (
      <Card><Text style={s.purpose}>Benchmark results are unavailable. Run `npm run bench` in the server folder to generate them.</Text></Card>
    );
  }
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="speedometer-outline" size={18} color={colors.primary} />
        <Text style={[font.h3, { flex: 1 }]}>Measured benchmarks</Text>
        <Badge label="Synthetic data" color={colors.warning} />
      </View>
      <Text style={s.caption}>
        Seeded synthetic datasets, not your project data. Median of {data.method.repetitions} runs after {data.method.warmup} warm-ups ·
        Node {data.environment.node} · {data.environment.cpu} · {new Date(data.generatedAt).toLocaleDateString()}.
        "Before" is the pre-Phase-3 implementation on the identical dataset.
      </Text>
      {BENCH_GROUPS.map((g) => {
        const rows = data.results.filter(g.filter);
        if (!rows.length) return null;
        const max = Math.max(...rows.map((r) => Math.max(r.current.medianMs, typeof r.baseline?.medianMs === "number" ? r.baseline.medianMs : 0)), 0.001);
        return (
          <View key={g.key} style={{ gap: 6 }}>
            <Text style={s.benchTitle}>{g.title}</Text>
            <Text style={s.caption}>{rows[0].complexity.time} · {rows.every((r) => r.exact) ? "exact" : "includes approximate rows"}</Text>
            {rows.map((r, i) => (
              <View key={i} style={{ gap: 3 }}>
                <Text style={s.benchSize}>{sizeLabel(r.size)}</Text>
                <Bar label="Now" ms={r.current.medianMs} max={max} color={colors.primary} />
                {typeof r.baseline?.medianMs === "number" ? <Bar label="Before" ms={r.baseline.medianMs} max={max} color={colors.textFaint} /> : null}
                {typeof r.baseline?.constraintViolations === "number" ? (
                  <Text style={s.caption}>Dependency violations — now 0, before {r.baseline.constraintViolations.toLocaleString()}</Text>
                ) : null}
                {r.current.ops ? <Text style={s.caption}>{Object.entries(r.current.ops).map(([k, v]) => `${k}: ${Number(v).toLocaleString()}`).join(" · ")}</Text> : null}
              </View>
            ))}
            {g.note ? <Text style={s.caption}>{g.note}</Text> : null}
          </View>
        );
      })}
    </Card>
  );
}

function Bar({ label, ms, max, color }: { label: string; ms: number; max: number; color: string }) {
  const pct = Math.max(2, Math.min(100, (ms / max) * 100));
  return (
    <View style={s.barRow}>
      <Text style={s.barLabel}>{label}</Text>
      <View style={s.barTrack}><View style={[s.barFill, { width: `${pct}%`, backgroundColor: color }]} /></View>
      <Text style={s.barValue}>{ms < 1 ? ms.toFixed(3) : ms.toFixed(1)} ms</Text>
    </View>
  );
}

// Tiny inline visualizations — purely decorative, illustrate the shape of the data.
function Viz({ kind, color }: { kind: Viz; color: string }) {
  if (kind === "bars") {
    const hs = [10, 18, 26, 14, 22];
    return (
      <View style={s.bars}>
        {hs.map((h, i) => <View key={i} style={{ width: 4, height: h, borderRadius: 2, backgroundColor: color }} />)}
      </View>
    );
  }
  if (kind === "grid") {
    return (
      <View style={s.gridViz}>
        {Array.from({ length: 9 }).map((_, i) => (
          <View key={i} style={[s.gridCell, { backgroundColor: i % 4 === 0 ? color : color + "44" }]} />
        ))}
      </View>
    );
  }
  if (kind === "search") {
    return <Ionicons name="search" size={22} color={color} />;
  }
  // graph
  return (
    <View style={s.graphViz}>
      <View style={[s.node, { backgroundColor: color, top: 2, left: 12 }]} />
      <View style={[s.node, { backgroundColor: color, top: 20, left: 2 }]} />
      <View style={[s.node, { backgroundColor: color, top: 20, left: 22 }]} />
      <View style={[s.edge, { backgroundColor: color + "66", top: 10, left: 8, transform: [{ rotate: "55deg" }] }]} />
      <View style={[s.edge, { backgroundColor: color + "66", top: 10, left: 20, transform: [{ rotate: "-55deg" }] }]} />
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  demoTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  demoTagTxt: { fontSize: 11, fontWeight: "700", color: colors.primary },

  scroll: { padding: spacing.lg, alignItems: "center" },
  container: { width: "100%", maxWidth: layout.maxWidth, gap: spacing.md },
  intro: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },

  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  vizWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  tag: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  purpose: { fontSize: 13, color: colors.text, lineHeight: 19 },
  complexityRow: { flexDirection: "row", gap: 6 },

  detail: { gap: spacing.sm, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  detailRow: { flexDirection: "row", gap: 8 },
  detailLabel: { fontSize: 11, fontWeight: "700", color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.5 },
  detailValue: { fontSize: 13, color: colors.text, lineHeight: 19, marginTop: 1 },

  bars: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 28 },
  gridViz: { width: 28, height: 28, flexDirection: "row", flexWrap: "wrap", gap: 2 },
  gridCell: { width: 7, height: 7, borderRadius: 1.5 },
  graphViz: { width: 32, height: 32 },
  node: { position: "absolute", width: 8, height: 8, borderRadius: 4 },
  edge: { position: "absolute", width: 14, height: 2, borderRadius: 1 },

  caption: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  waveRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  waveBox: { minWidth: 64, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  waveTitle: { fontSize: 10, fontWeight: "700", color: colors.textFaint, textTransform: "uppercase" },
  waveTasks: { fontSize: 13, fontWeight: "700", color: colors.text },
  benchTitle: { fontSize: 14, fontWeight: "700", color: colors.text, marginTop: 4 },
  benchSize: { fontSize: 11, fontWeight: "700", color: colors.textFaint },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: { width: 46, fontSize: 11, color: colors.textMuted },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  barValue: { width: 72, fontSize: 11, color: colors.text, textAlign: "right" },
});
