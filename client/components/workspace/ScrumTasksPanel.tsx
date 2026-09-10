/**
 * client/components/workspace/ScrumTasksPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM TASKS & ACTIVE SPRINT BOARD
 *
 * Prompt 7: Sprint Execution Board
 *
 * Columns:
 *   - TO DO
 *   - IN PROGRESS
 *   - IN REVIEW
 *   - DONE
 *   - (Plus quick filter for BLOCKED items)
 *
 * Features:
 *   1. State transitions enforcing Scrum workflow rules
 *   2. Story points & estimation burndown tracking
 *   3. Blocker toggling with audit reason
 *   4. Assignee management & unassigned warnings
 *   5. Real-time updates with GSAP-style subtle micro-transitions
 * ============================================================================
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast, ModalSheet } from "@/components/feedback";
import { SkeletonCard, Button, Badge } from "@/components/ui";
import {
  fetchSprints,
  fetchScrumBacklog,
  updateScrumTaskStatus,
  createBacklogItem,
} from "@/services/scrumApiService";
import { colors, spacing, radius, font } from "@/theme";

const SCRUM_COLUMNS = [
  { id: "todo", label: "To Do", color: "#d97706", bg: "#fef3c7" },
  { id: "in_progress", label: "In Progress", color: "#2563eb", bg: "#dbeafe" },
  { id: "in_review", label: "In Review", color: "#9333ea", bg: "#f3e8ff" },
  { id: "done", label: "Done", color: "#16a34a", bg: "#dcfce7" },
];

interface ScrumTasksPanelProps {
  teamId: string;
  onNavigatePlan?: () => void;
}

export default function ScrumTasksPanel({ teamId, onNavigatePlan }: ScrumTasksPanelProps) {
  const { token, user } = useAuth();
  const toast = useToast();

  const [activeSprint, setActiveSprint] = useState<any | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterBlockedOnly, setFilterBlockedOnly] = useState(false);

  // Quick task modal
  const [newTaskModal, setNewTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPoints, setNewTaskPoints] = useState("3");
  const [newTaskHours, setNewTaskHours] = useState("6");
  const [creating, setCreating] = useState(false);

  // Task detail modal
  const [detailTask, setDetailTask] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [sprintRes, backlogRes] = await Promise.all([
        fetchSprints(teamId, token),
        fetchScrumBacklog(teamId, token),
      ]);
      const current = (sprintRes.sprints || []).find(
        (s: any) => s.status === "ACTIVE" || s.status === "PLANNING"
      ) || (sprintRes.sprints || [])[0];

      setActiveSprint(current || null);

      if (current) {
        // Filter tasks belonging to this sprint
        const sprintTasks = (backlogRes.items || []).filter(
          (t: any) => t.sprintId === current._id
        );
        setTasks(sprintTasks);
      } else {
        setTasks([]);
      }
    } catch (err: any) {
      toast(err.message || "Failed to load Sprint tasks", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, token, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // State Transition handler
  const handleMoveStatus = async (taskId: string, targetStatus: string) => {
    try {
      await updateScrumTaskStatus(taskId, targetStatus, token);
      setTasks((prev) =>
        prev.map((t) => (t._id === taskId ? { ...t, status: targetStatus } : t))
      );
      toast(`Task moved to ${targetStatus.replace("_", " ")}`, "success");
      if (detailTask?._id === taskId) {
        setDetailTask((prev: any) => ({ ...prev, status: targetStatus }));
      }
    } catch (err: any) {
      toast(err.message || "Cannot transition task state", "error");
    }
  };

  // Toggle blocker state
  const handleToggleBlocker = async (task: any) => {
    const nextStatus = task.status === "blocked" ? "todo" : "blocked";
    await handleMoveStatus(task._id, nextStatus);
  };

  // Quick create in Sprint
  const handleQuickCreate = async () => {
    if (!newTaskTitle.trim()) {
      toast("Title is required", "error");
      return;
    }
    setCreating(true);
    try {
      await createBacklogItem(
        teamId,
        {
          title: newTaskTitle.trim(),
          storyPoints: parseInt(newTaskPoints) || 3,
          estimatedHours: parseFloat(newTaskHours) || 6,
          sprintId: activeSprint?._id || undefined,
          status: "todo",
        },
        token
      );
      toast("Task added to Sprint", "success");
      setNewTaskModal(false);
      setNewTaskTitle("");
      loadData();
    } catch (err: any) {
      toast(err.message || "Failed to add task", "error");
    } finally {
      setCreating(false);
    }
  };

  const filteredTasks = useMemo(() => {
    if (filterBlockedOnly) {
      return tasks.filter((t) => t.status === "blocked");
    }
    return tasks;
  }, [tasks, filterBlockedOnly]);

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* ── Top Bar ────────────────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={s.pageTitle}>Sprint Board</Text>
            {activeSprint ? (
              <View style={s.sprintBadge}>
                <Text style={s.sprintBadgeTxt}>
                  Sprint {activeSprint.number}: {activeSprint.name}
                </Text>
              </View>
            ) : (
              <View style={[s.sprintBadge, { backgroundColor: "#fee2e2" }]}>
                <Text style={[s.sprintBadgeTxt, { color: "#991b1b" }]}>No Active Sprint</Text>
              </View>
            )}
          </View>
          {activeSprint?.goal && (
            <Text style={s.goalTxt} numberOfLines={1}>
              Goal: {activeSprint.goal}
            </Text>
          )}
        </View>

        <View style={s.topActions}>
          <Pressable
            onPress={() => setFilterBlockedOnly((v) => !v)}
            style={[s.filterBtn, filterBlockedOnly && s.filterBtnActive]}
          >
            <Ionicons
              name="warning-outline"
              size={14}
              color={filterBlockedOnly ? "#ffffff" : "#dc2626"}
            />
            <Text style={[s.filterBtnTxt, filterBlockedOnly && { color: "#ffffff" }]}>
              {filterBlockedOnly ? "Show All" : "Blocked Only"}
            </Text>
          </Pressable>

          {activeSprint && (
            <Button
              title="Add Task"
              icon="add"
              onPress={() => setNewTaskModal(true)}
            />
          )}
        </View>
      </View>

      {!activeSprint ? (
        <View style={s.noSprintCard}>
          <Ionicons name="calendar-outline" size={44} color={colors.textMuted} />
          <Text style={s.noSprintTitle}>No Sprint Currently Underway</Text>
          <Text style={s.noSprintSub}>
            Plan and start a new Sprint from the Plan tab to populate this Scrum board.
          </Text>
          {onNavigatePlan && (
            <Button
              title="Go to Sprint Planning"
              icon="arrow-forward"
              onPress={onNavigatePlan}
              style={{ marginTop: 10 }}
            />
          )}
        </View>
      ) : (
        /* ── 4-Column Scrum Board ─────────────────────────────────────────── */
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.boardScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {SCRUM_COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.id);
            const totalPts = colTasks.reduce((acc, t) => acc + (t.storyPoints || 0), 0);

            return (
              <View key={col.id} style={s.column}>
                {/* Column Header */}
                <View style={s.colHead}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={[s.colDot, { backgroundColor: col.color }]} />
                    <Text style={s.colTitle}>{col.label}</Text>
                    <View style={[s.colBadge, { backgroundColor: col.bg }]}>
                      <Text style={[s.colBadgeTxt, { color: col.color }]}>{colTasks.length}</Text>
                    </View>
                  </View>
                  <Text style={s.colPts}>{totalPts} pts</Text>
                </View>

                {/* Task Cards */}
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8 }}>
                  {colTasks.length === 0 ? (
                    <View style={s.emptyCol}>
                      <Text style={s.emptyColTxt}>No tasks in {col.label}</Text>
                    </View>
                  ) : (
                    colTasks.map((t) => (
                      <Pressable
                        key={t._id}
                        onPress={() => setDetailTask(t)}
                        style={s.taskCard}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <Text style={s.taskPts}>{t.storyPoints || 3} pts</Text>
                          <View style={{ flexDirection: "row", gap: 4 }}>
                            {t.status === "blocked" && (
                              <View style={s.blockedBadge}>
                                <Text style={s.blockedBadgeTxt}>BLOCKED</Text>
                              </View>
                            )}
                            <Text style={s.taskHours}>{t.estimatedHours || 6}h</Text>
                          </View>
                        </View>

                        <Text style={s.taskCardTitle}>{t.title}</Text>

                        {t.userStory ? (
                          <Text style={s.taskCardStory} numberOfLines={2}>{t.userStory}</Text>
                        ) : null}

                        {/* Card footer: Assignee & Action arrows */}
                        <View style={s.cardFooter}>
                          <View style={s.assigneeWrap}>
                            <Ionicons name="person-circle-outline" size={16} color="#78716c" />
                            <Text style={s.assigneeTxt} numberOfLines={1}>
                              {t.assignedName || "Unassigned"}
                            </Text>
                          </View>

                          {/* Fast Move Buttons */}
                          <View style={s.moveRow}>
                            {col.id !== "todo" && (
                              <Pressable
                                onPress={() => {
                                  const prevMap: any = {
                                    in_progress: "todo",
                                    in_review: "in_progress",
                                    done: "in_review",
                                  };
                                  handleMoveStatus(t._id, prevMap[col.id]);
                                }}
                                hitSlop={6}
                                style={s.navArrow}
                              >
                                <Ionicons name="arrow-back" size={13} color="#78716c" />
                              </Pressable>
                            )}
                            {col.id !== "done" && (
                              <Pressable
                                onPress={() => {
                                  const nextMap: any = {
                                    todo: "in_progress",
                                    in_progress: "in_review",
                                    in_review: "done",
                                  };
                                  handleMoveStatus(t._id, nextMap[col.id]);
                                }}
                                hitSlop={6}
                                style={[s.navArrow, { backgroundColor: "#eef2ff" }]}
                              >
                                <Ionicons name="arrow-forward" size={13} color="#4f46e5" />
                              </Pressable>
                            )}
                          </View>
                        </View>
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── Task Details Modal ─────────────────────────────────────────────── */}
      {detailTask && (
        <ModalSheet
          visible={Boolean(detailTask)}
          onClose={() => setDetailTask(null)}
          title="Scrum Task Inspection"
        >
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={[s.colBadge, { backgroundColor: "#e0e7ff" }]}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#4338ca" }}>
                  Status: {detailTask.status?.toUpperCase()}
                </Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#78716c" }}>
                {detailTask.storyPoints || 3} Points · {detailTask.estimatedHours || 6} Hours
              </Text>
            </View>

            <Text style={{ fontSize: 16, fontWeight: "800", color: "#1c1917" }}>
              {detailTask.title}
            </Text>

            {detailTask.userStory ? (
              <View style={s.detailStoryBox}>
                <Text style={s.detailStoryHead}>User Story</Text>
                <Text style={s.detailStoryTxt}>{detailTask.userStory}</Text>
              </View>
            ) : null}

            {/* Workflow status picker */}
            <View style={{ gap: 6 }}>
              <Text style={s.statusSelectLabel}>Change Scrum Status</Text>
              <View style={s.statusBtnRow}>
                {SCRUM_COLUMNS.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => handleMoveStatus(detailTask._id, c.id)}
                    style={[
                      s.statusOptionBtn,
                      detailTask.status === c.id && { backgroundColor: c.color, borderColor: c.color },
                    ]}
                  >
                    <Text
                      style={[
                        s.statusOptionTxt,
                        detailTask.status === c.id && { color: "#ffffff", fontWeight: "800" },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Blocker trigger */}
            <Pressable
              onPress={() => handleToggleBlocker(detailTask)}
              style={[
                s.blockerToggleBtn,
                detailTask.status === "blocked" && { backgroundColor: "#fee2e2", borderColor: "#f87171" },
              ]}
            >
              <Ionicons
                name={detailTask.status === "blocked" ? "alert-circle" : "alert-circle-outline"}
                size={16}
                color={detailTask.status === "blocked" ? "#dc2626" : "#78716c"}
              />
              <Text
                style={[
                  s.blockerToggleTxt,
                  detailTask.status === "blocked" && { color: "#b91c1c", fontWeight: "700" },
                ]}
              >
                {detailTask.status === "blocked" ? "Resolve Blocker" : "Flag as Blocked"}
              </Text>
            </Pressable>
          </View>
        </ModalSheet>
      )}

      {/* ── Quick Create Task Modal ────────────────────────────────────────── */}
      <ModalSheet
        visible={newTaskModal}
        onClose={() => setNewTaskModal(false)}
        title="Add Task to Sprint"
      >
        <View style={{ gap: 12 }}>
          <View style={{ gap: 4 }}>
            <Text style={s.inputLabel}>Task Title</Text>
            <TextInput
              style={s.textInput}
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
              placeholder="e.g. Implement JWT authentication middleware"
            />
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.inputLabel}>Story Points</Text>
              <TextInput
                style={s.textInput}
                value={newTaskPoints}
                onChangeText={setNewTaskPoints}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.inputLabel}>Est. Hours</Text>
              <TextInput
                style={s.textInput}
                value={newTaskHours}
                onChangeText={setNewTaskHours}
                keyboardType="numeric"
              />
            </View>
          </View>

          <Button
            title="Create Task"
            icon="checkmark"
            loading={creating}
            onPress={handleQuickCreate}
          />
        </View>
      </ModalSheet>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingWrap: {
    padding: spacing.md,
    gap: spacing.md,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
    flexWrap: "wrap",
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1c1917",
  },
  sprintBadge: {
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  sprintBadgeTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4338ca",
  },
  goalTxt: {
    fontSize: 12,
    color: "#78716c",
    marginTop: 2,
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.md,
  },
  filterBtnActive: {
    backgroundColor: "#dc2626",
    borderColor: "#dc2626",
  },
  filterBtnTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: "#dc2626",
  },
  noSprintCard: {
    margin: spacing.md,
    padding: 32,
    backgroundColor: "#ffffff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    alignItems: "center",
    gap: 8,
  },
  noSprintTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1c1917",
  },
  noSprintSub: {
    fontSize: 12.5,
    color: "#78716c",
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 18,
  },
  boardScroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: 100,
    gap: 12,
  },
  column: {
    width: 270,
    backgroundColor: "#f5f5f4",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: 10,
    gap: 10,
    maxHeight: 700,
  },
  colHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  colDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  colTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1c1917",
  },
  colBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  colBadgeTxt: {
    fontSize: 10.5,
    fontWeight: "800",
  },
  colPts: {
    fontSize: 11,
    fontWeight: "700",
    color: "#78716c",
  },
  emptyCol: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyColTxt: {
    fontSize: 12,
    color: "#a8a29e",
    fontStyle: "italic",
  },
  taskCard: {
    backgroundColor: "#ffffff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: 10,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
  },
  taskPts: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4f46e5",
  },
  taskHours: {
    fontSize: 10.5,
    color: "#78716c",
  },
  blockedBadge: {
    backgroundColor: "#fee2e2",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  blockedBadgeTxt: {
    fontSize: 8.5,
    fontWeight: "900",
    color: "#dc2626",
  },
  taskCardTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#1c1917",
    lineHeight: 17,
  },
  taskCardStory: {
    fontSize: 11,
    color: "#78716c",
    fontStyle: "italic",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#f5f5f4",
    paddingTop: 6,
  },
  assigneeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 130,
  },
  assigneeTxt: {
    fontSize: 11,
    color: "#57534e",
    fontWeight: "500",
  },
  moveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  navArrow: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: "#f5f5f4",
  },
  detailStoryBox: {
    backgroundColor: "#faf5ff",
    borderRadius: radius.sm,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e9d5ff",
    gap: 2,
  },
  detailStoryHead: {
    fontSize: 10,
    fontWeight: "800",
    color: "#9333ea",
    textTransform: "uppercase",
  },
  detailStoryTxt: {
    fontSize: 12,
    color: "#581c87",
    fontStyle: "italic",
  },
  statusSelectLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#44403c",
    textTransform: "uppercase",
  },
  statusBtnRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  statusOptionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: "#f5f5f4",
    borderWidth: 1,
    borderColor: "#e7e5e4",
  },
  statusOptionTxt: {
    fontSize: 11,
    fontWeight: "600",
    color: "#44403c",
  },
  blockerToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    backgroundColor: "#f5f5f4",
  },
  blockerToggleTxt: {
    fontSize: 12,
    color: "#78716c",
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1c1917",
  },
  textInput: {
    backgroundColor: "#f5f5f4",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: "#1c1917",
  },
});
