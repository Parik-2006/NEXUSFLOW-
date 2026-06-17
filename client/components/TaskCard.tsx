/**
 * client/components/TaskCard.tsx  (MODIFIED – Greedy Priority Scheduling Engine)
 * ---------------------------------------------------------------------------------
 * Changes from original
 * ----------------------
 * 1. Renders a PriorityBadge showing the task's priorityScore (0-100) with
 *    a colour that reflects the greedy scheduling tier:
 *      ● 80-100  CRITICAL  #ef4444 (red)
 *      ● 55-79   HIGH      #f97316 (orange)
 *      ● 30-54   MEDIUM    #f59e0b (amber)
 *      ● 0-29    LOW       #9ca3af (grey)
 *
 * 2. Accepts an optional onSetPriority callback.  When provided, tapping
 *    the priority badge cycles urgency through 1 → 3 → 5 → 1 (three
 *    representative values) so a user can quickly re-rank without leaving
 *    the task list.  This wires to useTeamTasks.setTaskPriority.
 *
 * 3. All existing props (task, onCycle) and styling are preserved exactly.
 *    The new elements are additive below the existing row layout.
 *
 * Backward compatibility: onSetPriority is optional; omitting it renders
 * the badge as a non-interactive display, so existing screens that pass
 * only task + onCycle continue to work without changes.
 */

import { View, Text, Pressable, StyleSheet } from "react-native";
import type { Task } from "@/hooks/useTeamTasks";
import { colors, statusMeta, priorityTier } from "@/theme";

// ── Status cycling ────────────────────────────────────────────────────────

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

/**
 * Cycles urgency through [1, 3, 5] on tap.
 * Simple greedy UX: user sees three distinct priority bands.
 */
function nextUrgency(current: number): number {
  if (current <= 1) return 3;
  if (current <= 3) return 5;
  return 1;
}

// ── Component ─────────────────────────────────────────────────────────────

/** Splits text on a case-insensitive query match and bolds the matched run. */
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
}: {
  task: Task;
  onCycle: (next: Task["status"]) => void;
  /** Optional: called with (urgency, impact) when user taps priority badge. */
  onSetPriority?: (urgency: number, impact: number) => void;
  /** Optional: search query to highlight within the task title (Boyer-Moore). */
  highlight?: string;
}) {
  const score = task.priorityScore ?? 0;
  const tier = priorityTier(score);
  const tierColor = tier.color;
  const tierBg = tier.bg;

  const handlePriorityTap = () => {
    if (!onSetPriority) return;
    const newUrgency = nextUrgency(task.urgency ?? 1);
    // Keep impact at current value; user can use the REST endpoint or
    // a dedicated edit screen for fine-grained control.
    onSetPriority(newUrgency, task.impact ?? 1);
  };

  return (
    <View style={styles.card}>
      {/* ── Row 1: status dot · title · status badge (unchanged layout) ── */}
      <Pressable style={styles.row} onPress={() => onCycle(NEXT[task.status])}>
        <View style={[styles.dot, { backgroundColor: STATUS_COLOR[task.status] }]} />
        <HighlightedTitle
          text={task.title}
          query={highlight}
          style={[styles.title, task.status === "done" && styles.done]}
        />
        <Text style={[styles.badge, { color: STATUS_COLOR[task.status] }]}>
          {LABEL[task.status]}
        </Text>
      </Pressable>

      {/* ── Row 2: Greedy Priority Badge (new) ───────────────────────── */}
      <View style={styles.priorityRow}>
        {/* Score badge – tappable when onSetPriority is provided */}
        <Pressable
          style={[styles.priorityBadge, { backgroundColor: tierBg, borderColor: tierColor }]}
          onPress={handlePriorityTap}
          disabled={!onSetPriority}
        >
          <View style={[styles.priorityDot, { backgroundColor: tierColor }]} />
          <Text style={[styles.priorityLabel, { color: tierColor }]}>
            {tier.label}
          </Text>
          <Text style={[styles.priorityScore, { color: tierColor }]}>
            {score}
          </Text>
        </Pressable>

        {/* Urgency / Impact micro-indicators */}
        <Text style={styles.priorityMeta}>
          U:{task.urgency ?? 1} · I:{task.impact ?? 1} · D:{task.dependencyCount ?? 0}
        </Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

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
  // Row 1 – unchanged from original except padding moved to card.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.text },
  highlight: { backgroundColor: colors.warningSoft, color: colors.warning, fontWeight: "800" },
  done: { textDecorationLine: "line-through", color: colors.textFaint },
  badge: { fontSize: 12, fontWeight: "700" },

  // Row 2 – priority info (new).
  priorityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 20, // align with title (past dot + gap)
  },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  priorityLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  priorityScore: { fontSize: 10, fontWeight: "600" },
  priorityMeta: { fontSize: 10, color: colors.textFaint, fontWeight: "500" },
});
