/**
 * KanbanBoard.tsx — Feature 2: real drag-and-drop Progress board.
 * ---------------------------------------------------------------------------------
 * TO DO · IN PROGRESS · DONE columns with draggable cards built on React
 * Native's core PanResponder + Animated (no extra dependency; works on web and
 * native). Dragging a card to another column persists the new status over the
 * socket immediately (onMove → setStatus → DB + broadcast). A short tap still
 * advances the card to the next column as a fallback affordance.
 *
 * Pure UX layer — the task status model and all DAA algorithms are unchanged.
 */
import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, PanResponder, Animated } from "react-native";
import type { Task } from "@/hooks/useTeamTasks";
import { dueLabel } from "@/components/TaskCard";
import { colors, spacing, radius, statusMeta, PRIORITY_META, taskPriorityKey } from "@/theme";

const COLS: Task["status"][] = ["todo", "in_progress", "done"];
const NEXT: Record<Task["status"], Task["status"]> = { todo: "in_progress", in_progress: "done", done: "todo" };

export default function KanbanBoard({ tasks, onMove }: { tasks: Task[]; onMove: (id: string, status: Task["status"]) => void }) {
  const boardRef = useRef<View>(null);
  const layout = useRef({ left: 0, colWidth: 0 });
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  const measure = () => {
    // measureInWindow is supported on web (react-native-web) and native.
    (boardRef.current as any)?.measureInWindow?.((x: number, _y: number, w: number) => {
      if (w > 0) layout.current = { left: x, colWidth: w / 3 };
    });
  };

  return (
    <View ref={boardRef} onLayout={measure} style={s.board}>
      {COLS.map((col, ci) => {
        const items = tasks.filter((t) => t.status === col);
        const meta = statusMeta[col];
        const isHover = hoverCol === ci && dragId != null;
        return (
          <View key={col} style={[s.column, isHover && s.columnHover]}>
            <View style={s.colHead}>
              <View style={[s.dot, { backgroundColor: meta.color }]} />
              <Text style={s.colTitle}>{meta.label.toUpperCase()}</Text>
              <Text style={s.colCount}>{items.length}</Text>
            </View>
            {items.length === 0 ? (
              <Text style={[s.empty, isHover && { color: meta.color }]}>{isHover ? "Drop here" : "—"}</Text>
            ) : (
              items.map((t) => (
                <DraggableCard
                  key={t._id}
                  task={t}
                  active={dragId === t._id}
                  layout={layout}
                  measure={measure}
                  onStart={() => setDragId(t._id)}
                  onHover={setHoverCol}
                  onEnd={(targetIdx, isTap) => {
                    setDragId(null);
                    setHoverCol(null);
                    if (isTap) { onMove(t._id, NEXT[t.status]); return; }
                    const target = targetIdx != null ? COLS[targetIdx] : null;
                    if (target && target !== t.status) onMove(t._id, target);
                  }}
                />
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}

function DraggableCard({
  task, active, layout, measure, onStart, onHover, onEnd,
}: {
  task: Task;
  active: boolean;
  layout: React.MutableRefObject<{ left: number; colWidth: number }>;
  measure: () => void;
  onStart: () => void;
  onHover: (idx: number | null) => void;
  onEnd: (targetIdx: number | null, isTap: boolean) => void;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const lift = useRef(new Animated.Value(0)).current;

  const colFromX = (moveX: number): number | null => {
    const { left, colWidth } = layout.current;
    if (!colWidth) return null;
    return Math.min(2, Math.max(0, Math.floor((moveX - left) / colWidth)));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
      onPanResponderGrant: () => {
        measure();
        onStart();
        Animated.spring(lift, { toValue: 1, useNativeDriver: false, friction: 7 }).start();
      },
      onPanResponderMove: (_e, g) => {
        pan.setValue({ x: g.dx, y: g.dy });
        onHover(colFromX(g.moveX));
      },
      onPanResponderRelease: (_e, g) => {
        const isTap = Math.abs(g.dx) < 5 && Math.abs(g.dy) < 5;
        const targetIdx = colFromX(g.moveX);
        Animated.parallel([
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 7 }),
          Animated.spring(lift, { toValue: 0, useNativeDriver: false, friction: 7 }),
        ]).start();
        onEnd(targetIdx, isTap);
      },
      onPanResponderTerminate: () => {
        Animated.parallel([
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }),
          Animated.spring(lift, { toValue: 0, useNativeDriver: false }),
        ]).start();
        onEnd(null, false);
      },
    })
  ).current;

  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const m = PRIORITY_META[taskPriorityKey(task)];
  const due = dueLabel(task.dueDate ?? task.deadline);

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        s.card,
        active && s.cardActive,
        { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }], zIndex: active ? 999 : 1 },
      ]}
    >
      <Text style={s.cardTitle} numberOfLines={2}>{task.title}</Text>
      <View style={s.cardMeta}>
        <View style={[s.priority, { backgroundColor: m.bg }]}>
          <Text style={[s.priorityTxt, { color: m.color }]}>{m.label}</Text>
        </View>
        {due ? <Text style={[s.due, { color: due.color }]}>{due.text}</Text> : null}
      </View>
      <Text style={s.hint}>drag → · tap to advance</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  board: { flexDirection: "row", gap: spacing.sm },
  column: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  columnHover: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  colHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  colTitle: { flex: 1, fontSize: 11, fontWeight: "800", color: colors.text, letterSpacing: 0.3 },
  colCount: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  empty: { fontSize: 12, color: colors.textFaint, textAlign: "center", paddingVertical: 14 },

  card: { backgroundColor: colors.surface, borderRadius: radius.sm, padding: 10, borderWidth: 1, borderColor: colors.border, gap: 6 },
  cardActive: { borderColor: colors.primary, shadowColor: "#2F4F4F", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  cardTitle: { fontSize: 12.5, fontWeight: "700", color: colors.text },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  priority: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  priorityTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  due: { fontSize: 10, fontWeight: "700" },
  hint: { fontSize: 9, color: colors.textFaint, fontWeight: "600" },
});
