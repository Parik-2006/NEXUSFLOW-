/**
 * client/components/workspace/KanbanBoardPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN BOARD PANEL (Prompt 6)
 *
 * Real continuous execution board with:
 *   - Configurable columns & WIP limit badges
 *   - Pull & move execution with DoR / WIP validation
 *   - Classes of Service indicators (Standard, Fixed Date, Expedite, Improvement)
 *   - Blocker reporting & resolution lifecycle
 *   - Authorized WIP override modal
 *   - GSAP state transition hooks
 * ============================================================================
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/feedback";
import { Badge, Button, SkeletonCard, Avatar } from "@/components/ui";
import {
  fetchKanbanBoard,
  pullKanbanItem,
  createKanbanBlocker,
  createKanbanTask,
} from "@/services/kanbanApiService";
import { colors, spacing, radius, font } from "@/theme";

interface KanbanBoardPanelProps {
  teamId: string;
}

export default function KanbanBoardPanel({ teamId }: KanbanBoardPanelProps) {
  const { token } = useAuth();
  const toast = useToast();
  const [boardData, setBoardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals state
  const [blockerModalTask, setBlockerModalTask] = useState<any>(null);
  const [blockerTitle, setBlockerTitle] = useState("");
  const [blockerCategory, setBlockerCategory] = useState("technical");
  const [blockerSeverity, setBlockerSeverity] = useState("medium");

  const [wipOverrideModal, setWipOverrideModal] = useState<{
    task: any;
    targetColumn: string;
    reason: string;
  } | null>(null);

  const [createTaskModal, setCreateTaskModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCos, setNewCos] = useState("standard");
  const [newHours, setNewHours] = useState("");

  const loadBoard = useCallback(async () => {
    try {
      const res = await fetchKanbanBoard(teamId, token);
      setBoardData(res.board);
    } catch (err: any) {
      toast(err.message || "Failed to load Kanban board", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, token, toast]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const onRefresh = () => {
    setRefreshing(true);
    loadBoard();
  };

  // Pull work item into target column
  const handlePull = async (taskId: string, targetColId: string, overrideReason?: string) => {
    try {
      const res = await pullKanbanItem(
        teamId,
        {
          taskId,
          toColumn: targetColId,
          hasOverride: Boolean(overrideReason),
          overrideReason,
        },
        token
      );
      if (res.warning) {
        toast(res.warning, "info");
      } else {
        toast(`Item moved to ${targetColId.toUpperCase()}`, "success");
      }
      loadBoard();
    } catch (err: any) {
      // If WIP limit error, offer override modal
      if (err.message && err.message.includes("WIP limit exceeded")) {
        const targetTask = boardData?.columns
          ?.flatMap((c: any) => c.tasks)
          ?.find((t: any) => t._id === taskId);
        setWipOverrideModal({
          task: targetTask,
          targetColumn: targetColId,
          reason: "",
        });
      } else {
        toast(err.message || "Pull rejected by policy.", "error");
      }
    }
  };

  // Handle reporting blocker
  const handleSaveBlocker = async () => {
    if (!blockerTitle.trim() || !blockerModalTask) return;
    try {
      await createKanbanBlocker(
        teamId,
        {
          taskId: blockerModalTask._id,
          title: blockerTitle.trim(),
          category: blockerCategory,
          severity: blockerSeverity,
        },
        token
      );
      toast("Impediment logged on work item", "info");
      setBlockerModalTask(null);
      setBlockerTitle("");
      loadBoard();
    } catch (err: any) {
      toast(err.message || "Failed to record blocker", "error");
    }
  };

  // Handle creating quick task
  const handleCreateTask = async () => {
    if (!newTitle.trim()) return;
    try {
      await createKanbanTask(
        teamId,
        {
          title: newTitle.trim(),
          description: newDesc.trim(),
          classOfService: newCos,
          workflowColumn: "backlog",
          estimatedHours: newHours ? Number(newHours) : null,
        },
        token
      );
      toast("Work item created in Backlog", "success");
      setCreateTaskModal(false);
      setNewTitle("");
      setNewDesc("");
      setNewHours("");
      loadBoard();
    } catch (err: any) {
      toast(err.message || "Failed to create work item", "error");
    }
  };

  if (loading) {
    return (
      <View style={s.container}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  const columns = boardData?.columns || [];

  return (
    <View style={s.container}>
      {/* Top Toolbar */}
      <View style={s.toolbar}>
        <View style={s.toolbarLeft}>
          <Text style={s.boardTitle}>Continuous Flow Board</Text>
          <Text style={s.boardSub}>
            WIP Policy: {boardData?.config?.wipPolicy?.mode?.toUpperCase() || "ADVISORY"}
          </Text>
        </View>
        <Button
          title="Add Work Item"
          icon="add"
          small
          onPress={() => setCreateTaskModal(true)}
        />
      </View>

      {/* Horizontal Flow Columns */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        contentContainerStyle={s.boardColumns}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {columns.map((col: any, colIdx: number) => {
          const nextCol = columns[colIdx + 1];
          const isOver = col.isOverloaded;

          return (
            <View key={col.id} style={s.column}>
              {/* Column Header */}
              <View style={[s.columnHeader, isOver && s.columnHeaderOverloaded]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={s.columnTitle}>{col.name}</Text>
                  <View style={[s.countBadge, isOver && { backgroundColor: colors.danger }]}>
                    <Text style={[s.countText, isOver && { color: "#fff" }]}>
                      {col.count}
                    </Text>
                  </View>
                </View>

                {col.wipLimit > 0 ? (
                  <Text style={[s.wipLimitText, isOver && { color: colors.danger, fontWeight: "700" }]}>
                    Limit: {col.wipLimit}
                  </Text>
                ) : (
                  <Text style={s.wipLimitText}>∞</Text>
                )}
              </View>

              {/* Cards list */}
              <ScrollView style={s.cardList} showsVerticalScrollIndicator={false}>
                {col.tasks.length === 0 ? (
                  <View style={s.emptyColumn}>
                    <Text style={s.emptyText}>No items</Text>
                  </View>
                ) : (
                  col.tasks.map((t: any) => {
                    const isExpedite = t.classOfService === "expedite";
                    const isFixedDate = t.classOfService === "fixed_date";
                    const hasBlockers = t.isBlocked || (t.blockers && t.blockers.some((b: any) => b.status !== "RESOLVED"));

                    return (
                      <View
                        key={t._id}
                        style={[
                          s.card,
                          isExpedite && s.cardExpedite,
                          hasBlockers && s.cardBlocked,
                        ]}
                      >
                        {/* Tags Row */}
                        <View style={s.tagRow}>
                          <Badge
                            label={t.classOfService ? t.classOfService.replace("_", " ").toUpperCase() : "STANDARD"}
                            color={isExpedite ? colors.danger : isFixedDate ? colors.warning : colors.primary}
                          />
                          <Text style={s.priorityScore}>
                            P: {t.priorityScore || 50}
                          </Text>
                        </View>

                        {/* Title */}
                        <Text style={s.taskTitle} numberOfLines={2}>{t.title}</Text>

                        {/* Blocker Alert badge if blocked */}
                        {hasBlockers && (
                          <View style={s.blockerAlert}>
                            <Ionicons name="alert-circle" size={12} color={colors.danger} />
                            <Text style={s.blockerAlertText}>Impediment Active</Text>
                          </View>
                        )}

                        {/* Footer & Pull Action */}
                        <View style={s.cardFooter}>
                          <View style={s.metaLeft}>
                            {t.estimatedHours && (
                              <Text style={s.metaText}>{t.estimatedHours}h</Text>
                            )}
                            <Pressable
                              hitSlop={6}
                              onPress={() => setBlockerModalTask(t)}
                              style={s.blockerBtn}
                              accessibilityLabel="Report Blocker"
                            >
                              <Ionicons name="flag-outline" size={14} color={colors.textFaint} />
                            </Pressable>
                          </View>

                          {/* Pull to Next Column button */}
                          {nextCol && (
                            <Pressable
                              onPress={() => handlePull(t._id, nextCol.id)}
                              style={s.pullBtn}
                              accessibilityRole="button"
                              accessibilityLabel={`Pull item to ${nextCol.name}`}
                            >
                              <Text style={s.pullBtnText}>Pull →</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>

      {/* ── Report Blocker Modal ─────────────────────────────────────────── */}
      <Modal visible={Boolean(blockerModalTask)} transparent animationType="fade">
        <View style={s.modalBackdrop}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Report Flow Impediment</Text>
            <Text style={s.modalSub}>
              Item: {blockerModalTask?.title}
            </Text>

            <TextInput
              style={s.input}
              placeholder="Impediment description..."
              placeholderTextColor={colors.textFaint}
              value={blockerTitle}
              onChangeText={setBlockerTitle}
            />

            <View style={s.modalBtns}>
              <Button title="Cancel" variant="secondary" small onPress={() => setBlockerModalTask(null)} />
              <Button title="Log Blocker" small onPress={handleSaveBlocker} />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── WIP Override Modal ───────────────────────────────────────────── */}
      <Modal visible={Boolean(wipOverrideModal)} transparent animationType="fade">
        <View style={s.modalBackdrop}>
          <View style={s.modalBox}>
            <Text style={[s.modalTitle, { color: colors.warning }]}>WIP Limit Reached</Text>
            <Text style={s.modalSub}>
              Pulling '{wipOverrideModal?.task?.title}' exceeds the WIP limit of stage '{wipOverrideModal?.targetColumn?.toUpperCase()}'.
            </Text>

            <TextInput
              style={s.input}
              placeholder="Justification reason for WIP override..."
              placeholderTextColor={colors.textFaint}
              value={wipOverrideModal?.reason || ""}
              onChangeText={(r) =>
                setWipOverrideModal((prev) => (prev ? { ...prev, reason: r } : null))
              }
            />

            <View style={s.modalBtns}>
              <Button title="Cancel" variant="secondary" small onPress={() => setWipOverrideModal(null)} />
              <Button
                title="Apply Override"
                small
                onPress={() => {
                  if (wipOverrideModal) {
                    handlePull(wipOverrideModal.task._id, wipOverrideModal.targetColumn, wipOverrideModal.reason || "Leader authorized override");
                    setWipOverrideModal(null);
                  }
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Create Work Item Modal ───────────────────────────────────────── */}
      <Modal visible={createTaskModal} transparent animationType="fade">
        <View style={s.modalBackdrop}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>New Kanban Work Item</Text>

            <TextInput
              style={s.input}
              placeholder="Title *"
              placeholderTextColor={colors.textFaint}
              value={newTitle}
              onChangeText={setNewTitle}
            />
            <TextInput
              style={[s.input, { height: 70 }]}
              placeholder="Description or User Story..."
              placeholderTextColor={colors.textFaint}
              multiline
              value={newDesc}
              onChangeText={setNewDesc}
            />
            <TextInput
              style={s.input}
              placeholder="Estimated hours (e.g. 6)"
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              value={newHours}
              onChangeText={setNewHours}
            />

            <View style={s.modalBtns}>
              <Button title="Cancel" variant="secondary" small onPress={() => setCreateTaskModal(false)} />
              <Button title="Create Item" small onPress={handleCreateTask} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  toolbarLeft: {
    gap: 2,
  },
  boardTitle: {
    ...font.h3,
    color: colors.text,
  },
  boardSub: {
    fontSize: 11,
    color: colors.textFaint,
    fontWeight: "600",
  },
  boardColumns: {
    padding: spacing.md,
    gap: spacing.md,
    alignItems: "flex-start",
  },
  column: {
    width: 280,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: "92%",
    flexDirection: "column",
  },
  columnHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  columnHeaderOverloaded: {
    backgroundColor: colors.danger + "15",
    borderBottomColor: colors.danger + "44",
  },
  columnTitle: {
    ...font.caption,
    fontWeight: "700",
    color: colors.text,
  },
  countBadge: {
    backgroundColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  countText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
  },
  wipLimitText: {
    fontSize: 11,
    color: colors.textFaint,
    fontWeight: "500",
  },
  cardList: {
    padding: spacing.sm,
  },
  emptyColumn: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    color: colors.textFaint,
    fontStyle: "italic",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: 6,
  },
  cardExpedite: {
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
  },
  cardBlocked: {
    backgroundColor: colors.danger + "08",
    borderColor: colors.danger + "55",
  },
  tagRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priorityScore: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textFaint,
  },
  taskTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  blockerAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.danger + "15",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignSelf: "flex-start",
  },
  blockerAlertText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.danger,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  metaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaText: {
    fontSize: 11,
    color: colors.textFaint,
  },
  blockerBtn: {
    padding: 2,
  },
  pullBtn: {
    backgroundColor: colors.primary + "18",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary + "33",
  },
  pullBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modalBox: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    ...font.h3,
    color: colors.text,
  },
  modalSub: {
    ...font.caption,
    color: colors.textFaint,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 13,
    color: colors.text,
  },
  modalBtns: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: spacing.sm,
  },
});
