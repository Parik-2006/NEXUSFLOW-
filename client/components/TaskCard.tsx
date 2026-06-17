/**
 * client/components/TaskCard.tsx — task list row.
 * ---------------------------------------------------------------------------------
 * • Greedy priority badge (priorityScore 0–100 → Critical/High/Medium/Low tier,
 *   coloured Red/Orange/Yellow/Green; explicit priorityLabel overrides the score).
 * • Status dot/badge (tap row to cycle todo → in_progress → done).
 * • Optional source badge (AI / Manual), due-date countdown, effort/value, deps,
 *   assignee — shown when `showMeta` is set (All Tasks view).
 * • Optional Edit / Duplicate / Delete actions.
 * Backward compatible: every new prop is optional.
 */
import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Task } from "@/hooks/useTeamTasks";
import { colors, statusMeta, taskPriorityKey, PRIORITY_META, deadlineMeta } from "@/theme";

const NEXT: Record<Task["status"], Task["status"]> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
};

const LABEL: Record<Task["status"], string> = {
  todo: statusMeta.todo.label,
  in_progress: statusMeta.in_progress.label,
  done: statusMeta.done.label,
};

const STATUS_COLOR: Record<Task["status"], string> = {
  todo: statusMeta.todo.color,
  in_progress: statusMeta.in_progress.color,
  done: statusMeta.done.color,
};

function nextUrgency(current: number): number {
  if (current <= 1) return 3;
  if (current <= 3) return 5;
  return 1;
}

/** Human countdown for a due date — unified Feature-3 deadline color bands. */
export function dueLabel(iso?: string | null): { text: string; color: string } | null {
  const m = deadlineMeta(iso);
  if (!m.hasDate) return null;
  return { text: m.text, color: m.color };
}

function HighlightedTitle({ text, query, style }: { text: string; query?: string; style: any }) {
  if (!query) return <Text style={style}>{text}</Text>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return <Text style={style}>{text}</Text>;
  return (
    <Text style={style}>
      {text.slice(0, idx)}
      <Text style={styles.highlight}>{text.slice(idx, idx + q.length)}</Text>
      {text.slice(idx + q.length)}
    </Text>
  );
}

export default function TaskCard({
  task,
  onCycle,
  onSetPriority,
  highlight,
  showMeta,
  assigneeName,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  task: Task;
  onCycle: (next: Task["status"]) => void;
  onSetPriority?: (urgency: number, impact: number) => void;
  highlight?: string;
  /** Show extended metadata (source, due, effort, value, deps, assignee). */
  showMeta?: boolean;
  assigneeName?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}) {
  const score = task.priorityScore ?? 0;
  const key = taskPriorityKey(task);
  const tier = PRIORITY_META[key];
  const [menu, setMenu] = useState(false);
  const hasActions = !!(onEdit || onDelete || onDuplicate);

  const handlePriorityTap = () => {
    if (!onSetPriority) return;
    onSetPriority(nextUrgency(task.urgency ?? 1), task.impact ?? 1);
  };

  const due = dueLabel(task.dueDate ?? task.deadline);
  const reminder = task.reminderAt
    ? new Date(task.reminderAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <View style={styles.card}>
      <Pressable style={styles.row} onPress={() => onCycle(NEXT[task.status])}>
        <View style={[styles.dot, { backgroundColor: STATUS_COLOR[task.status] }]} />
        <HighlightedTitle
          text={task.title}
          query={highlight}
          style={[styles.title, task.status === "done" && styles.done]}
        />
        <Text style={[styles.badge, { color: STATUS_COLOR[task.status] }]}>{LABEL[task.status]}</Text>
        {hasActions && (
          <Pressable hitSlop={8} onPress={() => setMenu((m) => !m)} style={styles.kebab}>
            <Ionicons name="ellipsis-vertical" size={16} color={colors.textFaint} />
          </Pressable>
        )}
      </Pressable>

      {showMeta && task.description ? (
        <Text style={styles.desc} numberOfLines={2}>{task.description}</Text>
      ) : null}

      <View style={styles.priorityRow}>
        <Pressable
          style={[styles.priorityBadge, { backgroundColor: tier.bg, borderColor: tier.color }]}
          onPress={handlePriorityTap}
          disabled={!onSetPriority}
        >
          <View style={[styles.priorityDot, { backgroundColor: tier.color }]} />
          <Text style={[styles.priorityLabel, { color: tier.color }]}>{tier.label}</Text>
          {!task.priorityLabel && <Text style={[styles.priorityScore, { color: tier.color }]}>{score}</Text>}
        </Pressable>

        {showMeta && task.source ? (
          <View style={[styles.tag, task.source === "ai" ? styles.tagAi : styles.tagManual]}>
            <Ionicons name={task.source === "ai" ? "sparkles" : "create-outline"} size={10} color={task.source === "ai" ? colors.accentDark : colors.textMuted} />
            <Text style={[styles.tagTxt, { color: task.source === "ai" ? colors.accentDark : colors.textMuted }]}>
              {task.source === "ai" ? "AI" : "Manual"}
            </Text>
          </View>
        ) : null}

        {showMeta ? (
          due ? <Text style={[styles.metaPill, { color: due.color }]}>{due.text}</Text> : null
        ) : (
          <Text style={styles.priorityMeta}>U:{task.urgency ?? 1} · I:{task.impact ?? 1} · D:{task.dependencyCount ?? 0}</Text>
        )}
      </View>

      {showMeta ? (
        <View style={styles.metaRow}>
          {task.category && task.category !== "General" ? <Meta icon="layers-outline" text={task.category} /> : null}
          {task.estimatedHours ? <Meta icon="time-outline" text={`${task.estimatedHours}h`} /> : null}
          {task.businessValue ? <Meta icon="trending-up-outline" text={`value ${task.businessValue}`} /> : null}
          {(task.dependencies?.length ?? 0) > 0 ? <Meta icon="git-branch-outline" text={`${task.dependencies!.length} deps`} /> : null}
          {assigneeName ? <Meta icon="person-outline" text={assigneeName} /> : null}
          {reminder ? <Meta icon="notifications-outline" text={reminder} color={colors.accentDark} /> : null}
        </View>
      ) : null}

      {menu && hasActions && (
        <View style={styles.menu}>
          {onEdit && <MenuItem icon="create-outline" label="Edit" onPress={() => { setMenu(false); onEdit(); }} />}
          {onDuplicate && <MenuItem icon="copy-outline" label="Duplicate" onPress={() => { setMenu(false); onDuplicate(); }} />}
          {onDelete && <MenuItem icon="trash-outline" label="Delete" danger onPress={() => { setMenu(false); onDelete(); }} />}
        </View>
      )}
    </View>
  );
}

function Meta({ icon, text, color }: { icon: any; text: string; color?: string }) {
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={12} color={color ?? colors.textFaint} />
      <Text style={[styles.metaTxt, color && { color }]}>{text}</Text>
    </View>
  );
}

function MenuItem({ icon, label, onPress, danger }: { icon: any; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={16} color={danger ? colors.danger : colors.text} />
      <Text style={[styles.menuTxt, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.text },
  highlight: { backgroundColor: colors.warningSoft, color: colors.warning, fontWeight: "800" },
  done: { textDecorationLine: "line-through", color: colors.textFaint },
  badge: { fontSize: 12, fontWeight: "700" },
  kebab: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },

  desc: { fontSize: 12, color: colors.textMuted, lineHeight: 17, paddingLeft: 20 },

  priorityRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 20, flexWrap: "wrap" },
  priorityBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  priorityLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  priorityScore: { fontSize: 10, fontWeight: "600" },
  priorityMeta: { fontSize: 10, color: colors.textFaint, fontWeight: "500" },
  metaPill: { fontSize: 11, fontWeight: "700" },

  tag: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  tagAi: { backgroundColor: colors.accentSoft },
  tagManual: { backgroundColor: colors.surfaceAlt },
  tagTxt: { fontSize: 10, fontWeight: "700" },

  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingLeft: 20, marginTop: 2 },
  meta: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaTxt: { fontSize: 11, color: colors.textMuted, fontWeight: "500" },

  menu: { marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, gap: 2 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 4 },
  menuTxt: { fontSize: 13, fontWeight: "600", color: colors.text },
});
