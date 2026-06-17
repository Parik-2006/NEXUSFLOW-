/**
 * GraphPanel — Dependency graph workspace.
 *   • Add / remove dependency edges (DFS cycle-check on the server)
 *   • DFS (cycle detection), BFS (levels), Topological Sort (execution order)
 *     rendered by the existing DependencyGraphPanel.
 *   • Empty state → Create Dependency.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTeamTasks } from "@/hooks/useTeamTasks";
import DependencyGraphPanel from "@/components/DependencyGraphPanel";
import { Button, EmptyState, Badge } from "@/components/ui";
import { ModalSheet, useToast } from "@/components/feedback";
import { colors, spacing, radius, font } from "@/theme";

export default function GraphPanel({ teamId }: { teamId: string }) {
  const { tasks, loading, addDependency } = useTeamTasks(teamId);
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [first, setFirst] = useState("");   // prerequisite (runs first)
  const [then, setThen] = useState("");     // dependent task
  const [reloadKey, setReloadKey] = useState(0);

  const depCount = tasks.reduce((n, t) => n + (t.dependencies?.length ?? 0), 0);

  const submit = async () => {
    if (!first || !then) { toast("Pick both tasks", "error"); return; }
    if (first === then) { toast("A task can't depend on itself", "error"); return; }
    const { error } = await addDependency(then, first); // `then` depends on `first`
    if (error) { toast(error === "cycle_detected" ? "That edge would create a cycle!" : error, "error"); return; }
    toast("Dependency added", "success");
    setFirst(""); setThen(""); setShowAdd(false);
    setReloadKey((k) => k + 1);
  };

  if (loading) return <EmptyState icon="hourglass-outline" title="Loading graph…" />;

  return (
    <View style={{ flex: 1 }}>
      <View style={s.toolbar}>
        <View style={{ flex: 1 }}>
          <Text style={font.h3}>Dependency Graph</Text>
          <Text style={s.sub}>{tasks.length} tasks · {depCount} dependencies</Text>
        </View>
        <Button title="Add Dependency" icon="git-merge" onPress={() => setShowAdd(true)} small />
      </View>

      {tasks.length === 0 ? (
        <EmptyState icon="git-network-outline" title="No tasks to link" message="Create tasks first, then connect them with dependencies." />
      ) : (
        <View key={reloadKey} style={s.graphWrap}>
          {depCount === 0 && (
            <View style={s.depHintBar}>
              <Text style={s.depHintTxt}>Add dependencies to unlock the dependency graph. The execution roadmap below works without them.</Text>
            </View>
          )}
          <DependencyGraphPanel teamId={teamId} />
        </View>
      )}

      <ModalSheet visible={showAdd} onClose={() => setShowAdd(false)} title="Add Dependency">
        <Text style={s.pickLabel}>Prerequisite — must finish first</Text>
        <TaskPicker tasks={tasks} selected={first} onSelect={setFirst} accent={colors.dfs} />
        <View style={s.arrow}><Ionicons name="arrow-down" size={18} color={colors.textFaint} /></View>
        <Text style={s.pickLabel}>Dependent — runs after</Text>
        <TaskPicker tasks={tasks} selected={then} onSelect={setThen} accent={colors.topo} />
        <Button title="Add edge" icon="checkmark" onPress={submit} style={{ marginTop: spacing.sm }} />
      </ModalSheet>
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
  toolbar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  graphWrap: { flex: 1, margin: spacing.lg, marginTop: 0, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  depHintBar: { backgroundColor: colors.accentSoft, padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  depHintTxt: { fontSize: 11, color: colors.accentDark, fontWeight: "600", lineHeight: 16 },
  pickLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  picker: { maxHeight: 150, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border, borderLeftWidth: 3, borderLeftColor: "transparent" },
  pickTxt: { flex: 1, fontSize: 13, color: colors.text, fontWeight: "500" },
  arrow: { alignItems: "center", paddingVertical: 2 },
});
