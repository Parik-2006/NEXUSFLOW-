/**
 * GraphPanel — Dependency Graph workspace (DAA showcase page).
 * ------------------------------------------------------------------------------
 * Three sections:
 *   1. TASK LIST          — clean task cards (no edges drawn here)
 *   2. DEPENDENCY GRAPH   — React Flow DAG with Dagre layout (web); layered
 *                           fallback on native. Empty-state until ≥1 edge.
 *   3. EXECUTION ROADMAP  — Topological Sort (Kahn's) step list.
 *
 * Backend untouched: same APIs (/dependency-graph, POST dependencies), same
 * validations (cycle / duplicate / self), same socket live-sync. The Add
 * Dependency modal keeps its original logic; errors surface as toasts.
 */
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTeamTasks, type Task } from "@/hooks/useTeamTasks";
import { useTeam } from "@/hooks/useTeam";
import { useDependencyGraph } from "@/hooks/useDependencyGraph";
import DependencyFlowGraph from "@/components/workspace/DependencyFlowGraph";
import DependencyGraphPanel from "@/components/DependencyGraphPanel";
import { Button, EmptyState, Badge } from "@/components/ui";
import { ModalSheet, useToast } from "@/components/feedback";
import { colors, spacing, radius, font, PRIORITY_META, taskPriorityKey, statusMeta } from "@/theme";

// Map backend validation codes → friendly toast copy (backend is untouched).
const DEP_ERRORS: Record<string, string> = {
  cycle_detected:             "Cycle detected — cannot create this dependency because it introduces a cycle.",
  dependency_already_exists:  "Duplicate dependency — this dependency already exists.",
  self_dependency_not_allowed:"Invalid dependency — a task cannot depend on itself.",
};

export default function GraphPanel({ teamId }: { teamId: string }) {
  const { tasks, loading, addDependency } = useTeamTasks(teamId);
  const { members } = useTeam(teamId);
  const { graph, loading: graphLoading, error: graphError, refetch } = useDependencyGraph(teamId);
  const toast = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [first, setFirst] = useState("");   // prerequisite (runs first)
  const [then, setThen] = useState("");     // dependent task

  const memberName = useMemo(
    () => new Map(members.map((m) => [m.userId, m.name])),
    [members],
  );
  const depCount = graph.edges.length;

  // Original submit flow: client pre-checks → POST → backend DFS cycle check
  // → save → refetch graph → React Flow + Topological roadmap update live.
  const submit = async () => {
    if (!first || !then) { toast("Pick both tasks", "error"); return; }
    if (first === then) { toast(DEP_ERRORS.self_dependency_not_allowed, "error"); return; }
    const { error } = await addDependency(then, first); // `then` depends on `first`
    if (error) { toast(DEP_ERRORS[error] ?? error, "error"); return; }
    toast("Dependency added successfully — graph updated.", "success");
    setFirst(""); setThen(""); setShowAdd(false);
    refetch(); // live update: DAG canvas + execution roadmap, no page refresh
  };

  if (loading && graphLoading) return <EmptyState icon="hourglass-outline" title="Loading graph…" />;

  return (
    <ScrollView contentContainerStyle={s.page}>
      {/* ── Header: title + algorithm info chips + Add Dependency ── */}
      <View style={s.toolbar}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Text style={font.h3}>Dependency Graph</Text>
          <Text style={s.sub}>{tasks.length} tasks · {depCount} dependencies</Text>
        </View>
        <Button title="Add Dependency" icon="git-merge" onPress={() => setShowAdd(true)} small />
      </View>

      <View style={s.chipRow}>
        <AlgoChip icon="git-network-outline" label="Dependency Graph" value="Directed Acyclic Graph (DAG)" />
        <AlgoChip icon="swap-vertical-outline" label="Topological Sort" value="Kahn's Algorithm" />
        <AlgoChip icon="time-outline" label="Time Complexity" value="O(V + E)" />
        <AlgoChip icon="layers-outline" label="Space Complexity" value="O(V + E)" />
      </View>

      {tasks.length === 0 ? (
        <EmptyState icon="git-network-outline" title="No tasks to link" message="Create tasks first, then connect them with dependencies." />
      ) : (
        <>
          {/* ── SECTION 1 : Task List ── */}
          <SectionHead icon="albums-outline" tint={colors.primary} title="Project Tasks" sub="All tasks available for dependency linking" />
          <View style={s.grid}>
            {tasks.map((t) => (
              <TaskInfoCard key={t._id} task={t} member={t.assignedTo ? memberName.get(t.assignedTo) ?? "Member" : null} />
            ))}
          </View>

          {/* ── SECTION 2 : Dependency Graph (DAG) ── */}
          <SectionHead icon="git-network-outline" tint={colors.dfs} title="Dependency Graph" sub="Task = node · Dependency = directed edge · auto-layout, zoom, pan, minimap" />
          {graphError ? (
            <View style={s.errBox}>
              <Text style={{ color: colors.danger, fontWeight: "600", fontSize: 12 }}>Failed to load graph: {graphError}</Text>
              <Button title="Retry" icon="refresh" onPress={refetch} small variant="ghost" />
            </View>
          ) : depCount === 0 ? (
            <View style={s.glassCard}>
              <EmptyState
                icon="git-network-outline"
                title="No Dependencies Created"
                message="Create dependencies between tasks to visualize the project execution graph."
                actionLabel="Add Dependency"
                actionIcon="git-merge"
                onAction={() => setShowAdd(true)}
              />
            </View>
          ) : (
            <View style={s.graphCard}>
              <DependencyFlowGraph nodes={graph.nodes} edges={graph.edges} height={480} />
            </View>
          )}

          {/* ── SECTION 3 : Execution Roadmap (Topological Sort) ── */}
          <SectionHead icon="map-outline" tint={colors.topo} title="Execution Roadmap" sub={`Topological Sort (Kahn's) · O(V + E) · ${depCount === 0 ? "waiting for dependencies" : `${graph.topoResult.order.length} steps`}`} />
          <DependencyGraphPanel graph={graph} />
        </>
      )}

      <View style={{ height: 32 }} />

      {/* ── Add Dependency modal (original logic preserved) ── */}
      <ModalSheet visible={showAdd} onClose={() => setShowAdd(false)} title="Add Dependency">
        <Text style={s.pickLabel}>Prerequisite — must finish first</Text>
        <TaskPicker tasks={tasks} selected={first} onSelect={setFirst} accent={colors.dfs} />
        <View style={s.arrow}><Ionicons name="arrow-down" size={18} color={colors.textFaint} /></View>
        <Text style={s.pickLabel}>Dependent — runs after</Text>
        <TaskPicker tasks={tasks} selected={then} onSelect={setThen} accent={colors.topo} />
        <Button title="Add edge" icon="checkmark" onPress={submit} style={{ marginTop: spacing.sm }} />
      </ModalSheet>
    </ScrollView>
  );
}

// ── Section header with icon well ─────────────────────────────────────────────
function SectionHead({ icon, tint, title, sub }: {
  icon: keyof typeof Ionicons.glyphMap; tint: string; title: string; sub: string;
}) {
  return (
    <View style={s.sectionHead}>
      <View style={[s.sectionIcon, { backgroundColor: tint + "1a" }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionSub}>{sub}</Text>
      </View>
    </View>
  );
}

// ── Informational algorithm chip (display only) ───────────────────────────────
function AlgoChip({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={s.algoChip}>
      <Ionicons name={icon} size={13} color={colors.primary} />
      <Text style={s.algoChipLabel}>{label}</Text>
      <Text style={s.algoChipValue}>{value}</Text>
    </View>
  );
}

// ── Section 1 card: name, priority, status, member, hours, business value ─────
function TaskInfoCard({ task, member }: { task: Task; member: string | null }) {
  const tier = PRIORITY_META[taskPriorityKey(task)];
  const st = statusMeta[task.status] ?? statusMeta.todo;
  return (
    <View style={[s.taskCard, { borderLeftColor: tier.color }]}>
      <View style={s.taskTop}>
        <Text style={s.taskTitle} numberOfLines={2}>{task.title}</Text>
        <Badge label={tier.label} color={tier.color} bg={tier.bg} />
      </View>
      <View style={s.taskMetaRow}>
        <View style={s.metaItem}>
          <View style={[s.statusDot, { backgroundColor: st.color }]} />
          <Text style={s.metaTxt}>{st.label}</Text>
        </View>
        <View style={s.metaItem}>
          <Ionicons name="person-outline" size={12} color={colors.textFaint} />
          <Text style={s.metaTxt} numberOfLines={1}>{member ?? "Unassigned"}</Text>
        </View>
      </View>
      <View style={s.taskMetaRow}>
        <View style={s.metaItem}>
          <Ionicons name="time-outline" size={12} color={colors.textFaint} />
          <Text style={s.metaTxt}>{task.estimatedHours ?? 0}h estimated</Text>
        </View>
        <View style={s.metaItem}>
          <Ionicons name="diamond-outline" size={12} color={colors.textFaint} />
          <Text style={s.metaTxt}>Value {task.businessValue ?? 0}</Text>
        </View>
      </View>
    </View>
  );
}

function TaskPicker({ tasks, selected, onSelect, accent }: {
  tasks: { _id: string; title: string }[]; selected: string; onSelect: (id: string) => void; accent: string;
}) {
  return (
    <ScrollView style={s.picker} nestedScrollEnabled>
      {tasks.map((t) => (
        <Pressable key={t._id} onPress={() => onSelect(t._id)} style={[s.pickRow, selected === t._id && { backgroundColor: accent + "14", borderColor: accent }]}>
          <Ionicons name={selected === t._id ? "radio-button-on" : "radio-button-off"} size={16} color={selected === t._id ? accent : colors.textFaint} />
          <Text style={s.pickTxt} numberOfLines={1}>{t.title}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, gap: spacing.md },

  toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  algoChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6,
  },
  algoChipLabel: { fontSize: 10.5, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.2 },
  algoChipValue: { fontSize: 10.5, fontWeight: "700", color: colors.primary },

  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md },
  sectionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  sectionSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  taskCard: {
    flexGrow: 1, flexBasis: 240, maxWidth: 420, gap: 8,
    backgroundColor: "rgba(255,255,255,0.82)", borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 5, padding: spacing.md,
  },
  taskTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  taskTitle: { flex: 1, fontSize: 13.5, fontWeight: "700", color: colors.text, lineHeight: 18 },
  taskMetaRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  metaTxt: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },

  glassCard: {
    backgroundColor: "rgba(255,255,255,0.72)", borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  graphCard: {
    borderRadius: radius.lg, overflow: "hidden",
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  errBox: {
    alignItems: "center", gap: 8, padding: 20, backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.danger + "44",
  },

  pickLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  picker: { maxHeight: 150, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border, borderLeftWidth: 3, borderLeftColor: "transparent" },
  pickTxt: { flex: 1, fontSize: 13, color: colors.text, fontWeight: "500" },
  arrow: { alignItems: "center", paddingVertical: 2 },
});
