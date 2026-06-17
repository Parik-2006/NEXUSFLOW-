/**
 * TasksPanel — complete task management surface.
 *
 * Four views (DAA-backed):
 *   • All Tasks  — full backlog, Merge-Sort ordered, Boyer-Moore search,
 *                  rich cards (source/due/effort/value/deps/assignee) + actions.
 *   • Priority   — grouped CRITICAL / HIGH / MEDIUM / LOW (Red/Orange/Yellow/Green).
 *   • Deadline   — grouped Overdue / Due today / This week / Later (countdowns).
 *   • Progress   — Kanban: To do / In progress / Completed (tap card to advance).
 *
 * Create / Edit / Delete / Duplicate all persist to MongoDB, emit socket updates
 * and trigger algorithm recomputation (Greedy/Topo) on the server.
 */
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTeamTasks, Task, TaskFields } from "@/hooks/useTeamTasks";
import { useTeam } from "@/hooks/useTeam";
import TaskCard from "@/components/TaskCard";
import KanbanBoard from "@/components/workspace/KanbanBoard";
import DatePicker from "@/components/DatePicker";
import { WhyButton, AlgoExplainSheet, type AlgoEntry } from "@/components/AlgoExplain";
import { searchTasks } from "@/utils/boyerMoore";
import { SearchBar, Chip, FAB, EmptyState, Badge, Field, Button, Stepper, Skeleton } from "@/components/ui";
import { ModalSheet, useToast, useConfirm } from "@/components/feedback";
import { colors, spacing, radius, PRIORITY_META, PriorityKey, taskPriorityKey, deadlineMeta, deadlineScore, greedyBreakdown } from "@/theme";

type TaskView = "all" | "priority" | "deadline" | "progress";
const VIEWS: { key: TaskView; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "all", label: "All Tasks", icon: "list" },
  { key: "priority", label: "Priority", icon: "flag" },
  { key: "deadline", label: "Deadline", icon: "calendar" },
  { key: "progress", label: "Progress", icon: "grid" },
];

const PRIORITY_ORDER: PriorityKey[] = ["critical", "high", "medium", "low"];

type Draft = {
  title: string; description: string; priorityLabel: PriorityKey;
  urgency: number; impact: number; hours: number; value: number;
  startDate: string; dueDate: string; assignedTo: string | null;
  status: Task["status"]; reminderDate: string; reminderTime: string;
};
const EMPTY_DRAFT: Draft = {
  title: "", description: "", priorityLabel: "medium",
  urgency: 3, impact: 3, hours: 4, value: 6,
  startDate: "", dueDate: "", assignedTo: null,
  status: "todo", reminderDate: "", reminderTime: "09:00",
};

const STATUS_ORDER: Task["status"][] = ["todo", "in_progress", "done"];
const STATUS_LABEL: Record<Task["status"], string> = { todo: "To Do", in_progress: "In Progress", done: "Done" };

const toIso = (s: string) => (s.trim() && !Number.isNaN(new Date(s).getTime()) ? new Date(s).toISOString() : null);
const fromIso = (s?: string | null) => (s ? new Date(s).toISOString().slice(0, 10) : "");
// Combine a YYYY-MM-DD date + HH:mm time into an ISO reminder timestamp.
const toReminderIso = (date: string, time: string) => {
  if (!date.trim()) return null;
  const dt = new Date(`${date}T${(time || "09:00")}`);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
};
const reminderParts = (iso?: string | null) => {
  if (!iso) return { date: "", time: "09:00" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "09:00" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};

export default function TasksPanel({ teamId, onGenerateAI }: { teamId: string; onGenerateAI: () => void }) {
  const { tasks, rawTasks, loading, setStatus, setTaskPriority, createTask, updateTask, deleteTask, duplicateTask } = useTeamTasks(teamId);
  const { members } = useTeam(teamId);
  const toast = useToast();
  const confirm = useConfirm();

  const [view, setView] = useState<TaskView>("all");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [explain, setExplain] = useState<AlgoEntry[] | null>(null);

  const memberName = (id?: string | null) => members.find((m) => m.userId === id)?.name;

  const trimmed = query.trim();
  const searching = trimmed.length > 0;
  const visible = searching ? searchTasks(rawTasks, trimmed).map((r) => r.task) : tasks;

  // ── Create / edit form ──────────────────────────────────────────────────────
  const openCreate = () => { setEditId(null); setDraft(EMPTY_DRAFT); setShowForm(true); };
  const openEdit = (t: Task) => {
    setEditId(t._id);
    const rp = reminderParts(t.reminderAt);
    setDraft({
      title: t.title, description: t.description ?? "",
      priorityLabel: taskPriorityKey(t),
      urgency: t.urgency ?? 3, impact: t.impact ?? 3,
      hours: t.estimatedHours ?? 4, value: t.businessValue ?? 6,
      startDate: fromIso(t.startDate), dueDate: fromIso(t.dueDate ?? t.deadline),
      assignedTo: t.assignedTo ?? null,
      status: t.status, reminderDate: rp.date, reminderTime: rp.time,
    });
    setShowForm(true);
  };

  const submit = async () => {
    if (!draft.title.trim()) { toast("Task title required", "error"); return; }
    setBusy(true);
    if (editId) {
      const fields: TaskFields = {
        title: draft.title.trim(), description: draft.description.trim(),
        priorityLabel: draft.priorityLabel, estimatedHours: draft.hours, businessValue: draft.value,
        startDate: toIso(draft.startDate), dueDate: toIso(draft.dueDate), assignedTo: draft.assignedTo,
        status: draft.status, reminderAt: toReminderIso(draft.reminderDate, draft.reminderTime),
      };
      const { error } = await updateTask(editId, fields);
      setBusy(false);
      if (error) return toast(error, "error");
      toast("Task updated", "success");
    } else {
      const { error } = await createTask(draft.title.trim(), {
        description: draft.description.trim(), priorityLabel: draft.priorityLabel,
        urgency: draft.urgency, impact: draft.impact, estimatedHours: draft.hours, businessValue: draft.value,
        startDate: toIso(draft.startDate), dueDate: toIso(draft.dueDate),
        status: draft.status, assignedTo: draft.assignedTo,
        reminderAt: toReminderIso(draft.reminderDate, draft.reminderTime),
      });
      setBusy(false);
      if (error) return toast(error, "error");
      toast("Task created", "success");
    }
    setShowForm(false);
  };

  const onDelete = async (t: Task) => {
    const ok = await confirm({ title: `Delete "${t.title}"?`, message: "This removes the task and recomputes the dependency graph, execution order and sprint plan.", confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    const { error } = await deleteTask(t._id);
    toast(error ?? "Task deleted", error ? "error" : "success");
  };

  const onDuplicate = async (t: Task) => {
    const { error } = await duplicateTask(t._id, false);
    toast(error ?? "Task duplicated", error ? "error" : "success");
  };

  // Common card renderer for the All view.
  const renderCard = (t: Task) => (
    <TaskCard
      key={t._id}
      task={t}
      showMeta
      assigneeName={memberName(t.assignedTo)}
      highlight={searching ? trimmed : undefined}
      onCycle={(next) => setStatus(t._id, next)}
      onSetPriority={(u, i) => setTaskPriority(t._id, u, i)}
      onEdit={() => openEdit(t)}
      onDelete={() => onDelete(t)}
      onDuplicate={() => onDuplicate(t)}
    />
  );

  if (loading) {
    return <View style={{ padding: spacing.lg, gap: spacing.sm }}>{[1, 2, 3].map((i) => <Skeleton key={i} height={84} />)}</View>;
  }

  const empty = rawTasks.length === 0;

  return (
    <View style={{ flex: 1 }}>
      {/* View tabs */}
      <View style={s.viewBar}>
        {VIEWS.map((v) => {
          const on = view === v.key;
          return (
            <Pressable key={v.key} onPress={() => setView(v.key)} style={[s.viewTab, on && s.viewTabOn]}>
              <Ionicons name={v.icon} size={14} color={on ? colors.primary : colors.textFaint} />
              <Text style={[s.viewTabTxt, on && { color: colors.primary }]}>{v.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Toolbar */}
      <View style={s.toolbar}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search tasks (Boyer-Moore)…" />
        {searching && <Badge label={`Boyer-Moore · ${visible.length} match${visible.length !== 1 ? "es" : ""}`} color={colors.boyer} />}
      </View>

      {empty ? (
        <EmptyState icon="clipboard-outline" title="No Tasks Yet" message="Generate a task plan with AI from your project description, or add one manually." actionLabel="Generate Tasks with AI" actionIcon="sparkles" onAction={onGenerateAI} />
      ) : searching && visible.length === 0 ? (
        <EmptyState icon="search-outline" title="No matches" message={`No tasks match "${trimmed}".`} />
      ) : (
        <ScrollView contentContainerStyle={s.scroll}>
          {/* ── All Tasks ── */}
          {view === "all" && visible.map(renderCard)}

          {/* ── Priority groups (Greedy score visible) ── */}
          {view === "priority" && (
            <View style={s.algoNote}>
              <Text style={s.algoNoteTxt}>Greedy Priority Scheduler · grouped by score tier</Text>
              <WhyButton color={colors.greedy} onPress={() => setExplain([{
                algo: "greedy",
                input: "Each task's urgency (1–5), impact (1–5) and dependency fan-in",
                output: "priorityScore 0–100 → Critical / High / Medium / Low tiers",
                reason: "Score = 0.50·urgency + 0.35·impact + 0.15·dependencyWeight (normalised). Highest urgency × impact bubbles to Critical.",
              }])} />
            </View>
          )}
          {view === "priority" && PRIORITY_ORDER.map((key) => {
            const group = visible.filter((t) => taskPriorityKey(t) === key);
            if (!group.length) return null;
            const meta = PRIORITY_META[key];
            return (
              <View key={key} style={{ gap: spacing.sm }}>
                <View style={s.groupHead}>
                  <View style={[s.groupDot, { backgroundColor: meta.color }]} />
                  <Text style={[s.groupTitle, { color: meta.color }]}>{meta.label}</Text>
                  <Badge label={`${group.length}`} color={meta.color} bg={meta.bg} />
                </View>
                {group.map((t) => (
                  <View key={t._id} style={{ gap: 4 }}>
                    {renderCard(t)}
                    <GreedyBar task={t} />
                  </View>
                ))}
              </View>
            );
          })}

          {/* ── Deadline intelligence (Feature 3) ── */}
          {view === "deadline" && (() => {
            const buckets: { key: string; title: string; items: Task[] }[] = [
              { key: "overdue", title: "Overdue", items: [] },
              { key: "today", title: "Due today", items: [] },
              { key: "week", title: "Due this week", items: [] },
              { key: "later", title: "Later", items: [] },
              { key: "none", title: "No due date", items: [] },
            ];
            const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            const today = startOfDay(new Date());
            for (const t of visible) {
              const iso = t.dueDate ?? t.deadline;
              if (!iso) { buckets[4].items.push(t); continue; }
              const days = Math.round((startOfDay(new Date(iso)) - today) / 86_400_000);
              if (days < 0) buckets[0].items.push(t);
              else if (days === 0) buckets[1].items.push(t);
              else if (days <= 7) buckets[2].items.push(t);
              else buckets[3].items.push(t);
            }
            // Rank each bucket by Deadline Score (BusinessValue / DaysRemaining) desc.
            const score = (t: Task) => deadlineScore(t.businessValue, deadlineMeta(t.dueDate ?? t.deadline).daysRemaining);
            return (
              <>
                <View style={s.algoNote}>
                  <Text style={s.algoNoteTxt}>Deadline Score = Business Value ÷ Days Remaining · ranks urgency</Text>
                </View>
                {buckets.filter((b) => b.items.length).map((b) => {
                  const ranked = [...b.items].sort((a, c) => score(c) - score(a));
                  return (
                    <View key={b.key} style={{ gap: spacing.sm }}>
                      <View style={s.groupHead}>
                        <Text style={s.groupTitle}>{b.title}</Text>
                        <Badge label={`${b.items.length}`} color={colors.primary} bg={colors.primarySoft} />
                      </View>
                      {ranked.map((t) => <DeadlineCard key={t._id} task={t} onEdit={() => openEdit(t)} />)}
                    </View>
                  );
                })}
              </>
            );
          })()}

          {/* ── Progress (drag-and-drop Kanban, Feature 2) ── */}
          {view === "progress" && <KanbanBoard tasks={visible} onMove={(id, status) => setStatus(id, status)} />}
        </ScrollView>
      )}

      <FAB icon="add" label="Task" onPress={openCreate} />

      {/* Create / Edit modal */}
      <ModalSheet visible={showForm} onClose={() => setShowForm(false)} title={editId ? "Edit Task" : "New Task"}>
        <Field label="Title" placeholder="e.g. Build payment webhook" value={draft.title} onChangeText={(v) => setDraft((d) => ({ ...d, title: v }))} />
        <Field label="Description" placeholder="What needs to happen and why." value={draft.description} onChangeText={(v) => setDraft((d) => ({ ...d, description: v }))} multiline />

        <View style={{ gap: 8 }}>
          <Text style={s.formLabel}>Priority</Text>
          <View style={s.chipRow}>
            {PRIORITY_ORDER.map((k) => (
              <Chip key={k} label={PRIORITY_META[k].label} color={PRIORITY_META[k].color} active={draft.priorityLabel === k} onPress={() => setDraft((d) => ({ ...d, priorityLabel: k }))} />
            ))}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={s.formLabel}>Status</Text>
          <View style={s.chipRow}>
            {STATUS_ORDER.map((st) => (
              <Chip key={st} label={STATUS_LABEL[st]} color={colors.info} active={draft.status === st} onPress={() => setDraft((d) => ({ ...d, status: st }))} />
            ))}
          </View>
        </View>

        <View style={s.dateRow}>
          <View style={{ flex: 1 }}><DatePicker label="Start date" value={draft.startDate} onChange={(v) => setDraft((d) => ({ ...d, startDate: v }))} /></View>
          <View style={{ flex: 1 }}><DatePicker label="Due date" value={draft.dueDate} min={draft.startDate || undefined} onChange={(v) => setDraft((d) => ({ ...d, dueDate: v }))} /></View>
        </View>

        <View style={s.dateRow}>
          <View style={{ flex: 1 }}><DatePicker label="Reminder date" value={draft.reminderDate} onChange={(v) => setDraft((d) => ({ ...d, reminderDate: v }))} /></View>
          <View style={{ width: 120 }}><DatePicker label="Time" mode="time" value={draft.reminderTime} onChange={(v) => setDraft((d) => ({ ...d, reminderTime: v }))} /></View>
        </View>
        {draft.reminderDate ? (
          <Pressable onPress={() => setDraft((d) => ({ ...d, reminderDate: "" }))}><Text style={s.clearReminder}>Clear reminder</Text></Pressable>
        ) : null}

        {!editId && (
          <>
            <Row label="Urgency (Greedy)"><Stepper value={draft.urgency} onChange={(v) => setDraft((d) => ({ ...d, urgency: v }))} min={1} max={5} /></Row>
            <Row label="Impact (Greedy)"><Stepper value={draft.impact} onChange={(v) => setDraft((d) => ({ ...d, impact: v }))} min={1} max={5} /></Row>
            <View style={s.greedyNote}>
              <Ionicons name="information-circle-outline" size={14} color={colors.greedy} />
              <Text style={s.greedyNoteTxt}>Priority is determined automatically by the Greedy Scheduler from urgency × impact + dependency weight.</Text>
            </View>
          </>
        )}
        <Row label="Est. hours (Knapsack)"><Stepper value={draft.hours} onChange={(v) => setDraft((d) => ({ ...d, hours: v }))} min={1} max={80} /></Row>
        <Row label="Business value (Knapsack)"><Stepper value={draft.value} onChange={(v) => setDraft((d) => ({ ...d, value: v }))} min={1} max={20} /></Row>

        {members.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={s.formLabel}>Assignee</Text>
            <View style={s.chipRow}>
              <Chip label="Unassigned" active={!draft.assignedTo} onPress={() => setDraft((d) => ({ ...d, assignedTo: null }))} />
              {members.map((m) => <Chip key={m.userId} label={m.name ?? "Member"} color={colors.branch} active={draft.assignedTo === m.userId} onPress={() => setDraft((d) => ({ ...d, assignedTo: m.userId }))} />)}
            </View>
          </View>
        )}

        <Button title={editId ? "Save changes" : "Create task"} icon="checkmark" onPress={submit} loading={busy} style={{ marginTop: spacing.sm }} />
      </ModalSheet>

      <AlgoExplainSheet visible={!!explain} onClose={() => setExplain(null)} entries={explain ?? []} />
    </View>
  );
}

// ── Feature 7: Greedy score breakdown bar ─────────────────────────────────────
function GreedyBar({ task }: { task: Task }) {
  const b = greedyBreakdown(task);
  return (
    <View style={s.greedyBar}>
      <Text style={s.greedyScore}>{b.score}</Text>
      <View style={s.greedySegTrack}>
        <View style={[s.greedySeg, { flex: Math.max(b.uPts, 1), backgroundColor: colors.greedy }]} />
        <View style={[s.greedySeg, { flex: Math.max(b.iPts, 1), backgroundColor: colors.knapsack }]} />
        <View style={[s.greedySeg, { flex: Math.max(b.dPts, 1), backgroundColor: colors.topo }]} />
        <View style={{ flex: Math.max(100 - b.uPts - b.iPts - b.dPts, 0.01) }} />
      </View>
      <Text style={s.greedyLegend}>U{b.urgency}·{b.uPts}  I{b.impact}·{b.iPts}  D{b.deps}·{b.dPts}</Text>
    </View>
  );
}

// ── Feature 3: deadline-intelligence card ─────────────────────────────────────
function DeadlineCard({ task, onEdit }: { task: Task; onEdit: () => void }) {
  const iso = task.dueDate ?? task.deadline;
  const m = deadlineMeta(iso);
  const score = deadlineScore(task.businessValue, m.daysRemaining);
  const tier = PRIORITY_META[taskPriorityKey(task)];
  const fmt = (s?: string | null) => (s ? new Date(s).toISOString().slice(0, 10) : "—");
  return (
    <Pressable style={[s.dlCard, { borderLeftColor: m.color }]} onPress={onEdit}>
      <View style={s.dlHead}>
        <Text style={s.dlTitle} numberOfLines={1}>{task.title}</Text>
        <View style={[s.dlBadge, { backgroundColor: m.color + "1a" }]}>
          <Text style={[s.dlBadgeTxt, { color: m.color }]}>{m.text}</Text>
        </View>
      </View>
      <View style={s.dlGrid}>
        <DlStat label="Start" value={fmt(task.startDate)} />
        <DlStat label="Due" value={fmt(iso)} />
        <DlStat label="Value" value={task.businessValue ? String(task.businessValue) : "—"} />
        <DlStat label="Score" value={m.hasDate ? String(score) : "—"} color={m.color} />
      </View>
      <View style={s.dlFooter}>
        <View style={[s.dlChip, { backgroundColor: tier.bg }]}><Text style={[s.dlChipTxt, { color: tier.color }]}>{tier.label}</Text></View>
        <Text style={s.dlProgress}>{task.progress ?? 0}% done</Text>
        {m.overdue ? <Text style={s.dlOverdue}>⚠ overdue</Text> : null}
      </View>
    </Pressable>
  );
}

function DlStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.dlStat}>
      <Text style={s.dlStatLabel}>{label}</Text>
      <Text style={[s.dlStatValue, color && { color }]}>{value}</Text>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.formRow}>
      <Text style={s.formLabelInline}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  viewBar: { flexDirection: "row", gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  viewTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: radius.md, borderWidth: 1, borderColor: "transparent", backgroundColor: colors.surfaceAlt },
  viewTabOn: { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder },
  viewTabTxt: { fontSize: 12, fontWeight: "700", color: colors.textFaint },

  toolbar: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },

  scroll: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.xs },
  groupDot: { width: 9, height: 9, borderRadius: 5 },
  groupTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 0.4, color: colors.text },

  kanban: { flexDirection: "row", gap: spacing.sm },
  column: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  colHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  colTitle: { flex: 1, fontSize: 12, fontWeight: "800", color: colors.text },
  colCount: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  colEmpty: { fontSize: 12, color: colors.textFaint, textAlign: "center", paddingVertical: 8 },
  kanbanCard: { backgroundColor: colors.surface, borderRadius: radius.sm, padding: 10, borderWidth: 1, borderColor: colors.border, gap: 6 },
  kanbanTitle: { fontSize: 12.5, fontWeight: "700", color: colors.text },
  kanbanMeta: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  kanbanPriority: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  kanbanPriorityTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  kanbanDue: { fontSize: 10, fontWeight: "700" },
  kanbanHint: { fontSize: 9, color: colors.textFaint, fontWeight: "600" },

  formRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  formLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  formLabelInline: { fontSize: 14, fontWeight: "600", color: colors.text },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  dateRow: { flexDirection: "row", gap: spacing.sm },
  clearReminder: { fontSize: 12, fontWeight: "700", color: colors.danger, marginTop: -4 },
  greedyNote: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 8 },
  greedyNoteTxt: { flex: 1, fontSize: 11, color: colors.textMuted, lineHeight: 15, fontWeight: "600" },

  algoNote: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  algoNoteTxt: { flex: 1, fontSize: 11, fontWeight: "700", color: colors.textMuted },

  greedyBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 20, marginTop: -2, marginBottom: 2 },
  greedyScore: { fontSize: 12, fontWeight: "800", color: colors.greedy, width: 24 },
  greedySegTrack: { flex: 1, flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: colors.border },
  greedySeg: { height: "100%" },
  greedyLegend: { fontSize: 9, fontWeight: "700", color: colors.textFaint },

  dlCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, padding: spacing.md, gap: 8 },
  dlHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  dlTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.text },
  dlBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  dlBadgeTxt: { fontSize: 11, fontWeight: "800" },
  dlGrid: { flexDirection: "row", gap: spacing.sm },
  dlStat: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingVertical: 6, alignItems: "center" },
  dlStatLabel: { fontSize: 9, fontWeight: "700", color: colors.textFaint, letterSpacing: 0.3 },
  dlStatValue: { fontSize: 12, fontWeight: "800", color: colors.text, marginTop: 1 },
  dlFooter: { flexDirection: "row", alignItems: "center", gap: 8 },
  dlChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  dlChipTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  dlProgress: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  dlOverdue: { fontSize: 11, fontWeight: "800", color: colors.danger, marginLeft: "auto" },
});
