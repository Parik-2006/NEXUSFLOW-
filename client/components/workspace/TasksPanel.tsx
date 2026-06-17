/**
 * TasksPanel — Tasks tab.
 *   • Greedy priority ordering (priorityScore via TaskCard badges)
 *   • Merge Sort comparator modes (Priority / Deadline / Progress)
 *   • Boyer-Moore search with highlighted matches
 *   • Create task (urgency/impact → Greedy, hours/value → Knapsack)
 *   • Empty state → Generate Tasks with AI
 */
import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTeamTasks, SortMode } from "@/hooks/useTeamTasks";
import TaskCard from "@/components/TaskCard";
import { searchTasks } from "@/utils/boyerMoore";
import { SearchBar, Chip, FAB, EmptyState, Badge, Field, Button, Stepper, Skeleton } from "@/components/ui";
import { ModalSheet, useToast } from "@/components/feedback";
import { colors, spacing, font, radius } from "@/theme";

const SORTS: { mode: SortMode; label: string }[] = [
  { mode: SortMode.PRIORITY, label: "Priority" },
  { mode: SortMode.DEADLINE, label: "Deadline" },
  { mode: SortMode.PROGRESS, label: "Progress" },
];

export default function TasksPanel({ teamId, onGenerateAI }: { teamId: string; onGenerateAI: () => void }) {
  const { tasks, loading, sortMode, setSortMode, setStatus, setTaskPriority, createTask } = useTeamTasks(teamId);
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const trimmed = query.trim();
  const active = trimmed.length > 0;
  const visible = active ? searchTasks(tasks, trimmed).map((r) => r.task) : tasks;

  // create form
  const [title, setTitle] = useState("");
  const [urgency, setUrgency] = useState(3);
  const [impact, setImpact] = useState(3);
  const [hours, setHours] = useState(4);
  const [value, setValue] = useState(6);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) { toast("Task title required", "error"); return; }
    setBusy(true);
    const { error } = await createTask(title.trim(), { urgency, impact, estimatedHours: hours, businessValue: value });
    setBusy(false);
    if (error) { toast(error, "error"); return; }
    toast("Task created", "success");
    setTitle(""); setUrgency(3); setImpact(3); setHours(4); setValue(6);
    setShowCreate(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={s.toolbar}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search tasks (Boyer-Moore)…" />
        <View style={s.sortRow}>
          <Text style={s.sortLabel}>Merge Sort:</Text>
          {SORTS.map((x) => <Chip key={x.label} label={x.label} active={sortMode === x.mode} onPress={() => setSortMode(x.mode)} />)}
        </View>
        {active && (
          <View style={s.searchInfo}>
            <Badge label="Boyer-Moore active" color={colors.boyer} />
            <Text style={s.count}>{visible.length} result{visible.length !== 1 ? "s" : ""} · O(n/m) avg</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={{ padding: spacing.lg, gap: spacing.sm }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} height={72} />)}
        </View>
      ) : visible.length === 0 ? (
        active ? (
          <EmptyState icon="search-outline" title="No matches" message={`No tasks match "${trimmed}".`} />
        ) : (
          <EmptyState icon="clipboard-outline" title="No Tasks Yet" message="Generate a task plan with AI from your project description, or add one manually." actionLabel="Generate Tasks with AI" actionIcon="sparkles" onAction={onGenerateAI} />
        )
      ) : (
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: 120 }}>
          {!active && <Text style={s.orderLabel}>↓ Greedy priority order</Text>}
          {visible.map((item) => (
            <TaskCard
              key={item._id}
              task={item}
              highlight={active ? trimmed : undefined}
              onCycle={(next) => setStatus(item._id, next)}
              onSetPriority={(u, i) => setTaskPriority(item._id, u, i)}
            />
          ))}
        </View>
      )}

      <FAB icon="add" onPress={() => setShowCreate(true)} />

      <ModalSheet visible={showCreate} onClose={() => setShowCreate(false)} title="New Task">
        <Field label="Title" placeholder="e.g. Build payment webhook" value={title} onChangeText={setTitle} />
        <Row label="Urgency (Greedy)"><Stepper value={urgency} onChange={setUrgency} min={1} max={5} /></Row>
        <Row label="Impact (Greedy)"><Stepper value={impact} onChange={setImpact} min={1} max={5} /></Row>
        <Row label="Est. hours (Knapsack)"><Stepper value={hours} onChange={setHours} min={1} max={40} /></Row>
        <Row label="Business value (Knapsack)"><Stepper value={value} onChange={setValue} min={1} max={10} /></Row>
        <Button title="Create task" icon="checkmark" onPress={submit} loading={busy} style={{ marginTop: spacing.sm }} />
      </ModalSheet>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.formRow}>
      <Text style={s.formLabel}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  toolbar: { padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  sortLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginRight: 2 },
  searchInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  count: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  orderLabel: { fontSize: 11, fontWeight: "700", color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  formRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  formLabel: { fontSize: 14, fontWeight: "600", color: colors.text },
});
