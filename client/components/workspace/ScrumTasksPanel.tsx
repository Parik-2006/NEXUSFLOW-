/**
 * client/components/workspace/ScrumTasksPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM TASKS & SPRINT EXECUTION WORKSPACE
 *
 * Implements:
 *   1. Sprint Navigation Selector (Active, Planned, Completed, Backlog/Unassigned)
 *   2. Sprint Details: Sprint Goal, Dates, Days Elapsed/Remaining, Capacity & Progress
 *   3. 4-Column Scrum Board (To Do, In Progress, In Review, Done) + Blocked Filter
 *   4. Safe Task State Transitions & Blocker Audit Flagging
 *   5. Daily Scrum Standup Modal & Persistent Check-in History
 *   6. Story-to-Task Decomposition Modal
 *   7. Safe non-locking empty states with navigation to Sprint Planning
 * ============================================================================
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { SkeletonCard, Button, Badge, ProgressBar } from "@/components/ui";
import {
  fetchSprints,
  fetchScrumBacklog,
  fetchScrumOverview,
  updateScrumTaskStatus,
  createBacklogItem,
  commitSprintPlan,
  startSprint,
  completeSprint,
  deleteSprint,
  fetchSprintStandup,
  submitSprintStandup,
  decomposeStory,
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

  const [sprints, setSprints] = useState<any[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string>("active");
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterBlockedOnly, setFilterBlockedOnly] = useState(false);
  const boardScrollRef = useRef<ScrollView | null>(null);

  const scrollBoard = (direction: "left" | "right") => {
    if (!boardScrollRef.current) return;
    boardScrollRef.current.scrollTo({
      x: direction === "left" ? 0 : 640,
      animated: true,
    });
  };

  // Quick task modal
  const [newTaskModal, setNewTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPoints, setNewTaskPoints] = useState("3");
  const [newTaskHours, setNewTaskHours] = useState("6");
  const [creating, setCreating] = useState(false);

  // Task detail modal
  const [detailTask, setDetailTask] = useState<any | null>(null);

  // Daily Scrum Standup Modal
  const [standupModal, setStandupModal] = useState(false);
  const [standupRecords, setStandupRecords] = useState<any[]>([]);
  const [standupLoading, setStandupLoading] = useState(false);
  const [standupSubmitting, setStandupSubmitting] = useState(false);
  const [standupGoal, setStandupGoal] = useState("");
  const [standupYesterday, setStandupYesterday] = useState("");
  const [standupToday, setStandupToday] = useState("");
  const [standupBlockers, setStandupBlockers] = useState("");

  // Decompose Story Modal
  const [decomposeModal, setDecomposeModal] = useState(false);
  const [targetDecomposeTask, setTargetDecomposeTask] = useState<any | null>(null);
  const [subtasksList, setSubtasksList] = useState<{ title: string; estimatedHours: string }[]>([
    { title: "", estimatedHours: "3" },
  ]);
  const [decomposing, setDecomposing] = useState(false);

  // Manage Sprint Backlog modal state
  const [manageBacklogModal, setManageBacklogModal] = useState(false);
  const [selectedBacklogStoryIds, setSelectedBacklogStoryIds] = useState<string[]>([]);
  const [manageBacklogBusy, setManageBacklogBusy] = useState(false);

  // Delete Sprint modal state (Team Leader Only)
  const [deleteSprintModal, setDeleteSprintModal] = useState(false);
  const [deletingSprint, setDeletingSprint] = useState(false);
  const [teamData, setTeamData] = useState<any | null>(null);

  // Lifecycle action state
  const [lifecycleLoading, setLifecycleLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [sprintRes, backlogRes, overviewRes] = await Promise.all([
        fetchSprints(teamId, token),
        fetchScrumBacklog(teamId, token),
        fetchScrumOverview(teamId, token).catch(() => null),
      ]);

      const loadedSprints = sprintRes.sprints || [];
      setSprints(loadedSprints);
      setAllTasks(backlogRes.items || []);
      if (sprintRes?.team) {
        setTeamData(sprintRes.team);
      } else if (overviewRes?.team) {
        setTeamData(overviewRes.team);
      }

      // If active selection requested or current selection invalid, find appropriate sprint
      if (selectedSprintId === "active") {
        const active = loadedSprints.find((s: any) => s.status === "ACTIVE");
        if (active) {
          setSelectedSprintId(active._id);
        } else if (loadedSprints.length > 0) {
          // Default to the most recent sprint
          setSelectedSprintId(loadedSprints[0]._id);
        } else {
          setSelectedSprintId("backlog");
        }
      }
    } catch (err: any) {
      toast(err.message || "Failed to load Sprint tasks", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, token, toast, selectedSprintId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Determine currently selected sprint
  const currentSprint = useMemo(() => {
    if (selectedSprintId === "backlog") return null;
    return sprints.find((s) => s._id === selectedSprintId) || null;
  }, [sprints, selectedSprintId]);

  // Determine if authenticated user is authorized team leader
  const isTeamLeader = useMemo(() => {
    const role = (user?.role || "").toLowerCase();
    if (role === "leader" || role === "lead" || role === "manager" || role === "scrum_master" || role === "admin") {
      return true;
    }
    const uId = (user?._id || user?.id)?.toString();
    if (teamData?.ownerId && teamData.ownerId.toString() === uId) {
      return true;
    }
    const myMember = (teamData?.members || []).find((m: any) => {
      const mId = (m.userId?._id || m.userId)?.toString();
      return mId === uId;
    });
    const mRole = (myMember?.role || "").toLowerCase();
    return mRole === "leader" || mRole === "lead" || mRole === "manager" || mRole === "scrum_master";
  }, [user, teamData]);

  // Tasks isolated to selected sprint (or backlog)
  const currentSprintTasks = useMemo(() => {
    if (selectedSprintId === "backlog") {
      return allTasks.filter((t) => !t.sprintId);
    }
    if (!currentSprint) return [];
    return allTasks.filter((t) => t.sprintId === currentSprint._id);
  }, [allTasks, currentSprint, selectedSprintId]);

  // Sprint Progress & Metrics
  const sprintStats = useMemo(() => {
    if (!currentSprint) return null;
    const totalCommitted = currentSprintTasks.reduce((acc, t) => acc + (t.storyPoints || 0), 0);
    const completedTasks = currentSprintTasks.filter((t) => t.status === "done" || t.status === "COMPLETED" || t.scrumStatus === "DONE");
    const completedPoints = completedTasks.reduce((acc, t) => acc + (t.storyPoints || 0), 0);
    const progressPct = totalCommitted > 0 ? Math.round((completedPoints / totalCommitted) * 100) : 0;

    let daysRemaining = null;
    let daysElapsed = null;
    if (currentSprint.startDate && currentSprint.endDate) {
      const start = new Date(currentSprint.startDate).getTime();
      const end = new Date(currentSprint.endDate).getTime();
      const now = Date.now();
      const totalDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
      daysElapsed = Math.max(0, Math.min(totalDays, Math.round((now - start) / (1000 * 60 * 60 * 24))));
      daysRemaining = Math.max(0, Math.round((end - now) / (1000 * 60 * 60 * 24)));
    }

    return {
      totalTasks: currentSprintTasks.length,
      completedTasksCount: completedTasks.length,
      totalCommitted,
      completedPoints,
      progressPct,
      daysElapsed,
      daysRemaining,
    };
  }, [currentSprint, currentSprintTasks]);

  // State Transition handler
  const handleMoveStatus = async (taskId: string, targetStatus: string) => {
    try {
      const res = await updateScrumTaskStatus(taskId, targetStatus, token);
      const updated = res?.task || res;
      setAllTasks((prev) =>
        prev.map((t) =>
          t._id === taskId
            ? { ...t, ...updated, status: targetStatus, scrumStatus: targetStatus.toUpperCase() }
            : t
        )
      );
      toast(`Task moved to ${targetStatus.replace("_", " ")}`, "success");
      if (detailTask?._id === taskId) {
        setDetailTask((prev: any) => ({
          ...prev,
          ...updated,
          status: targetStatus,
          scrumStatus: targetStatus.toUpperCase(),
        }));
      }
      loadData();
    } catch (err: any) {
      toast(err.message || "Cannot transition task state", "error");
    }
  };

  // Delete Sprint Action (Authorized Team Leader Only)
  const handleDeleteSprint = async () => {
    if (!currentSprint) return;
    setDeletingSprint(true);
    try {
      const res = await deleteSprint(currentSprint._id, token);
      toast(res.message || `Sprint ${currentSprint.name} deleted successfully`, "success");
      setDeleteSprintModal(false);

      // Select a sensible remaining sprint or backlog
      const remainingSprints = sprints.filter((s) => s._id !== currentSprint._id);
      const active = remainingSprints.find((s) => s.status === "ACTIVE");
      if (active) {
        setSelectedSprintId(active._id);
      } else if (remainingSprints.length > 0) {
        setSelectedSprintId(remainingSprints[0]._id);
      } else {
        setSelectedSprintId("backlog");
      }
      await loadData();
    } catch (err: any) {
      toast(err.message || "Failed to delete sprint", "error");
    } finally {
      setDeletingSprint(false);
    }
  };

  // Toggle blocker state
  const handleToggleBlocker = async (task: any) => {
    const nextStatus = task.status === "blocked" ? "todo" : "blocked";
    await handleMoveStatus(task._id, nextStatus);
  };

  // Start Sprint Action
  const handleStartSprint = async () => {
    if (!currentSprint) return;
    setLifecycleLoading(true);
    try {
      await startSprint(currentSprint._id, token);
      toast(`Sprint ${currentSprint.number} started successfully`, "success");
      await loadData();
    } catch (err: any) {
      toast(err.message || "Failed to start sprint", "error");
    } finally {
      setLifecycleLoading(false);
    }
  };

  // Complete Sprint Action
  const handleCompleteSprint = async () => {
    if (!currentSprint) return;
    setLifecycleLoading(true);
    try {
      await completeSprint(currentSprint._id, { carryOverAction: "BACKLOG" }, token);
      toast(`Sprint ${currentSprint.number} increment closed and archived`, "success");
      await loadData();
    } catch (err: any) {
      toast(err.message || "Failed to complete sprint", "error");
    } finally {
      setLifecycleLoading(false);
    }
  };

  // Manage Sprint Backlog: commit approved stories to existing planning sprint
  const handleOpenManageBacklog = () => {
    if (!currentSprint) return;
    const initialIds = currentSprintTasks.map((t) => t._id);
    setSelectedBacklogStoryIds(initialIds);
    setManageBacklogModal(true);
  };

  const handleCommitManageBacklog = async () => {
    if (!currentSprint) return;
    if (selectedBacklogStoryIds.length === 0) {
      toast("Please select at least one backlog story for the sprint", "error");
      return;
    }
    if (manageBacklogBusy) return;
    setManageBacklogBusy(true);
    try {
      await commitSprintPlan(
        teamId,
        {
          sprintId: currentSprint._id,
          name: currentSprint.name,
          sprintGoal: currentSprint.goal || "Sprint Increment Delivery",
          durationDays: currentSprint.durationDays || 14,
          committedTaskIds: selectedBacklogStoryIds,
        },
        token
      );
      toast(`Successfully committed ${selectedBacklogStoryIds.length} stories to ${currentSprint.name}!`, "success");
      setManageBacklogModal(false);
      await loadData();
    } catch (err: any) {
      toast(err.message || "Failed to commit stories to sprint", "error");
    } finally {
      setManageBacklogBusy(false);
    }
  };

  // Open Daily Scrum Standup
  const handleOpenStandup = async () => {
    if (!currentSprint) return;
    setStandupModal(true);
    setStandupLoading(true);
    try {
      const data = await fetchSprintStandup(currentSprint._id, token);
      setStandupRecords(data.checkins || []);
    } catch (err: any) {
      toast("Could not load standup history", "info");
    } finally {
      setStandupLoading(false);
    }
  };

  // Submit Standup checkin
  const handleSubmitStandup = async () => {
    if (!currentSprint) return;
    if (!standupYesterday.trim() && !standupToday.trim()) {
      toast("Please share what you worked on or plan to do today", "error");
      return;
    }
    setStandupSubmitting(true);
    try {
      const res = await submitSprintStandup(
        currentSprint._id,
        {
          goalProgress: standupGoal.trim(),
          yesterdayWork: standupYesterday.trim(),
          todayPlan: standupToday.trim(),
          blockers: standupBlockers.trim(),
        },
        token
      );
      toast("Daily Scrum check-in recorded", "success");
      setStandupRecords(res.checkins || []);
      setStandupGoal("");
      setStandupYesterday("");
      setStandupToday("");
      setStandupBlockers("");
    } catch (err: any) {
      toast(err.message || "Failed to record check-in", "error");
    } finally {
      setStandupSubmitting(false);
    }
  };

  // Open Decompose Story modal
  const handleOpenDecompose = (task: any) => {
    setTargetDecomposeTask(task);
    setSubtasksList([{ title: "", estimatedHours: "3" }]);
    setDecomposeModal(true);
  };

  // Submit Decompose Story
  const handleSubmitDecompose = async () => {
    if (!targetDecomposeTask) return;
    const validSubs = subtasksList
      .filter((s) => s.title.trim().length > 0)
      .map((s) => ({
        title: s.title.trim(),
        estimatedHours: parseFloat(s.estimatedHours) || 3,
        storyPoints: 1,
      }));

    if (validSubs.length === 0) {
      toast("Please enter at least one subtask title", "error");
      return;
    }

    setDecomposing(true);
    try {
      await decomposeStory(targetDecomposeTask._id, validSubs, token);
      toast(`Created ${validSubs.length} execution tasks for story`, "success");
      setDecomposeModal(false);
      setTargetDecomposeTask(null);
      await loadData();
    } catch (err: any) {
      toast(err.message || "Failed to decompose story", "error");
    } finally {
      setDecomposing(false);
    }
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
          sprintId: currentSprint?._id || undefined,
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
      return currentSprintTasks.filter((t) => t.status === "blocked");
    }
    return currentSprintTasks;
  }, [currentSprintTasks, filterBlockedOnly]);

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
      {/* ── Sprint Selector & Scope Switcher ─────────────────────────────── */}
      <View style={s.sprintSelectorBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sprintPillRow}>
          {sprints.map((sp) => {
            const isSel = selectedSprintId === sp._id;
            const statusColor =
              sp.status === "ACTIVE"
                ? "#2563eb"
                : sp.status === "COMPLETED"
                ? "#16a34a"
                : "#d97706";

            return (
              <Pressable
                key={sp._id}
                onPress={() => setSelectedSprintId(sp._id)}
                style={[
                  s.sprintPill,
                  isSel && s.sprintPillSelected,
                  isSel && { borderColor: statusColor },
                ]}
              >
                <View style={[s.pillDot, { backgroundColor: statusColor }]} />
                <Text style={[s.sprintPillTxt, isSel && { color: "#1c1917", fontWeight: "700" }]}>
                  Sprint {sp.number}: {sp.name}
                </Text>
                <View style={[s.statusMiniBadge, { backgroundColor: statusColor + "18" }]}>
                  <Text style={[s.statusMiniTxt, { color: statusColor }]}>{sp.status}</Text>
                </View>
              </Pressable>
            );
          })}

          <Pressable
            onPress={() => setSelectedSprintId("backlog")}
            style={[
              s.sprintPill,
              selectedSprintId === "backlog" && s.sprintPillSelected,
              selectedSprintId === "backlog" && { borderColor: "#4f46e5" },
            ]}
          >
            <Ionicons
              name="layers-outline"
              size={13}
              color={selectedSprintId === "backlog" ? "#4f46e5" : "#78716c"}
            />
            <Text
              style={[
                s.sprintPillTxt,
                selectedSprintId === "backlog" && { color: "#4f46e5", fontWeight: "700" },
              ]}
            >
              Unassigned Backlog
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* ── Sprint Details Command Header ─────────────────────────────────── */}
      {currentSprint ? (
        <View style={s.sprintHeaderCard}>
          <View style={s.sprintHeaderTop}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={s.sprintHeaderTitle}>
                  Sprint {currentSprint.number}: {currentSprint.name}
                </Text>
                <Badge
                  label={currentSprint.status}
                  variant={
                    currentSprint.status === "ACTIVE"
                      ? "info"
                      : currentSprint.status === "COMPLETED"
                      ? "success"
                      : "warning"
                  }
                />
              </View>
              {currentSprint.goal ? (
                <Text style={s.sprintGoalTxt} numberOfLines={2}>
                  <Text style={{ fontWeight: "700", color: "#1e293b" }}>Sprint Goal: </Text>
                  {currentSprint.goal}
                </Text>
              ) : null}
            </View>

            {/* Action buttons */}
            <View style={s.sprintHeaderActions}>
              {currentSprint.status === "PLANNING" && (
                <>
                  <Button
                    title="Add Backlog Stories"
                    icon="layers-outline"
                    onPress={handleOpenManageBacklog}
                    variant="secondary"
                    size="sm"
                  />
                  <Button
                    title="Start Sprint"
                    icon="play"
                    loading={lifecycleLoading}
                    onPress={handleStartSprint}
                    variant="primary"
                    size="sm"
                  />
                  {isTeamLeader && (
                    <Button
                      title="Delete Sprint"
                      icon="trash-outline"
                      onPress={() => setDeleteSprintModal(true)}
                      variant="danger"
                      size="sm"
                    />
                  )}
                </>
              )}

              {currentSprint.status === "ACTIVE" && (
                <>
                  <Button
                    title="Daily Scrum"
                    icon="chatbubbles-outline"
                    onPress={handleOpenStandup}
                    variant="secondary"
                    small
                  />
                  <Button
                    title="Complete"
                    icon="checkmark-done"
                    loading={lifecycleLoading}
                    onPress={handleCompleteSprint}
                    variant="secondary"
                    small
                  />
                  {isTeamLeader && (
                    <Button
                      title="Delete Sprint"
                      icon="trash-outline"
                      disabled={true}
                      onPress={() => {
                        toast("Active sprints cannot be deleted. Sprints in active execution must be completed or cancelled through review.", "info");
                      }}
                      variant="secondary"
                      size="sm"
                    />
                  )}
                </>
              )}

              {(currentSprint.status === "COMPLETED" || currentSprint.status === "REVIEW") && (
                <>
                  {isTeamLeader && (
                    <Button
                      title="Delete Sprint"
                      icon="trash-outline"
                      disabled={true}
                      onPress={() => {
                        toast("Historical sprint records are protected for audit trail and velocity metrics.", "info");
                      }}
                      variant="secondary"
                      size="sm"
                    />
                  )}
                </>
              )}

              <Button
                title="Add Task"
                icon="add"
                onPress={() => setNewTaskModal(true)}
                small
              />
            </View>
          </View>

          {/* Progress & Trajectory Bar */}
          {sprintStats && (
            <View style={s.statsRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={s.statsLabel}>
                    Completion: {sprintStats.completedPoints} of {sprintStats.totalCommitted} pts ({sprintStats.progressPct}%)
                  </Text>
                  {sprintStats.daysRemaining !== null && (
                    <Text style={s.daysMeta}>
                      {sprintStats.daysElapsed}d elapsed · {sprintStats.daysRemaining}d remaining
                    </Text>
                  )}
                </View>
                <ProgressBar
                  value={sprintStats.totalCommitted > 0 ? sprintStats.progressPct / 100 : 0}
                  color={sprintStats.progressPct >= 100 ? "#16a34a" : "#2563eb"}
                />
              </View>
            </View>
          )}
        </View>
      ) : (
        <View style={s.unassignedHeaderCard}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.sprintHeaderTitle}>Product Backlog (Unassigned Items)</Text>
            <Text style={s.sprintGoalTxt}>
              Items waiting to be assigned to a sprint. Use Overview → Project Setup & Plan to plan your next sprint.
            </Text>
          </View>
          {onNavigatePlan && (
            <Button
              title="Sprint Planning"
              icon="calendar"
              onPress={onNavigatePlan}
              small
              variant="secondary"
            />
          )}
        </View>
      )}

      {/* ── Filter & Navigation Bar ────────────────────────────────────────── */}
      <View style={s.filterBar}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={s.filterBarCount}>
            Showing {filteredTasks.length} {filteredTasks.length === 1 ? "task" : "tasks"}
          </Text>
          <View style={s.scrollControls}>
            <Pressable
              onPress={() => scrollBoard("left")}
              style={s.scrollNavBtn}
              accessibilityLabel="Scroll board left"
            >
              <Ionicons name="chevron-back" size={14} color={colors.text} />
              <Text style={s.scrollNavBtnTxt}>To Do</Text>
            </Pressable>
            <Pressable
              onPress={() => scrollBoard("right")}
              style={s.scrollNavBtn}
              accessibilityLabel="Scroll board right"
            >
              <Text style={s.scrollNavBtnTxt}>Done</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() => setFilterBlockedOnly((v) => !v)}
          style={[s.filterBtn, filterBlockedOnly && s.filterBtnActive]}
        >
          <Ionicons
            name="warning-outline"
            size={13}
            color={filterBlockedOnly ? "#ffffff" : "#dc2626"}
          />
          <Text style={[s.filterBtnTxt, filterBlockedOnly && { color: "#ffffff" }]}>
            {filterBlockedOnly ? "Show All Tasks" : "Filter Blocked Only"}
          </Text>
        </Pressable>
      </View>

      {/* ── Empty State if No Sprints & No Tasks ─────────────────────────── */}
      {sprints.length === 0 && allTasks.length === 0 ? (
        <View style={s.noSprintCard}>
          <Ionicons name="calendar-outline" size={44} color={colors.textMuted} />
          <Text style={s.noSprintTitle}>No Sprints or Tasks Created Yet</Text>
          <Text style={s.noSprintSub}>
            Start by uploading project artifacts and generating story suggestions in Overview → Project Setup & Plan, or add an initial story manually below.
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            {onNavigatePlan && (
              <Button
                title="Go to Sprint Planning"
                icon="arrow-forward"
                onPress={onNavigatePlan}
              />
            )}
            <Button
              title="+ Add Story"
              icon="add"
              variant="secondary"
              onPress={() => setNewTaskModal(true)}
            />
          </View>
        </View>
      ) : (
        /* ── 4-Column Scrum Board ─────────────────────────────────────────── */
        <ScrollView
          ref={boardScrollRef}
          horizontal
          showsHorizontalScrollIndicator={true}
          contentContainerStyle={s.boardScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {SCRUM_COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => {
              const raw = (t.scrumStatus || t.status || "todo").toLowerCase();
              if (col.id === "todo") return raw === "todo" || raw === "backlog" || raw === "selected_for_sprint";
              if (col.id === "in_progress") return raw === "in_progress" || raw === "inprogress" || (raw === "blocked" && t.status !== "todo");
              if (col.id === "in_review") return raw === "in_review" || raw === "inreview" || raw === "review";
              if (col.id === "done") return raw === "done" || raw === "completed";
              return false;
            });
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
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled
                >
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
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={s.taskPts}>{t.storyPoints || 3} pts</Text>
                            {t.priority && (
                              <Badge
                                label={t.priority}
                                color={
                                  t.priority === "URGENT" || t.priority === "HIGH"
                                    ? colors.danger
                                    : t.priority === "MEDIUM"
                                    ? colors.warning
                                    : colors.textMuted
                                }
                              />
                            )}
                          </View>
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
                          <Text style={s.taskCardStory} numberOfLines={2}>
                            {t.userStory}
                          </Text>
                        ) : null}

                        {/* Provenance Tag */}
                        {(t.sourceArtifact || t.source === "approved_suggestion") && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                            <Ionicons name="document-attach-outline" size={11} color={colors.textMuted} />
                            <Text style={{ fontSize: 10, color: colors.textMuted, fontStyle: "italic" }} numberOfLines={1}>
                              {t.sourceArtifact ? `Artifact: ${t.sourceArtifact}` : "AI Approved Story"}
                            </Text>
                          </View>
                        )}

                        {/* Card footer: Assignee & Action arrows */}
                        <View style={s.cardFooter}>
                          <View style={s.assigneeWrap}>
                            <Ionicons name="person-circle-outline" size={16} color="#78716c" />
                            <Text style={s.assigneeTxt} numberOfLines={1}>
                              {t.assignedName || "Unassigned"}
                            </Text>
                          </View>

                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            {/* Decompose trigger */}
                            <Pressable
                              onPress={() => handleOpenDecompose(t)}
                              hitSlop={6}
                              style={s.subtaskBtn}
                            >
                              <Ionicons name="git-branch-outline" size={12} color="#4f46e5" />
                              <Text style={s.subtaskBtnTxt}>Breakdown</Text>
                            </Pressable>

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
                                  <Ionicons name="arrow-back" size={12} color="#78716c" />
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
                                  <Ionicons name="arrow-forward" size={12} color="#4f46e5" />
                                </Pressable>
                              )}
                            </View>
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

      {/* ── Daily Scrum Standup Modal ───────────────────────────────────────── */}
      <ModalSheet
        visible={standupModal}
        onClose={() => setStandupModal(false)}
        title={`Daily Scrum Check-in · Sprint ${currentSprint?.number || ""}`}
      >
        <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 14 }}>
          {currentSprint?.goal && (
            <View style={s.standupGoalBanner}>
              <Ionicons name="flag-outline" size={15} color="#2563eb" />
              <Text style={s.standupGoalBannerTxt}>Sprint Goal: {currentSprint.goal}</Text>
            </View>
          )}

          {/* Form */}
          <View style={s.standupFormBox}>
            <Text style={s.standupSectionHead}>Record Your 3 Standup Questions</Text>

            <View style={{ gap: 4 }}>
              <Text style={s.inputLabel}>1. What did you complete since yesterday?</Text>
              <TextInput
                style={[s.textInput, { minHeight: 48 }]}
                value={standupYesterday}
                onChangeText={setStandupYesterday}
                placeholder="Finished authentication route validation..."
                multiline
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={s.inputLabel}>2. What will you work on today towards the Sprint Goal?</Text>
              <TextInput
                style={[s.textInput, { minHeight: 48 }]}
                value={standupToday}
                onChangeText={setStandupToday}
                placeholder="Connecting story suggestion approval to database..."
                multiline
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={s.inputLabel}>3. Any blockers or impediments slowing you down?</Text>
              <TextInput
                style={[s.textInput, { minHeight: 48 }]}
                value={standupBlockers}
                onChangeText={setStandupBlockers}
                placeholder="None, or waiting for API schema review..."
                multiline
              />
            </View>

            <Button
              title="Submit Standup Check-in"
              icon="send"
              loading={standupSubmitting}
              onPress={handleSubmitStandup}
            />
          </View>

          {/* History */}
          <View style={{ gap: 8 }}>
            <Text style={s.standupSectionHead}>
              Recent Team Check-ins ({standupRecords.length})
            </Text>
            {standupLoading ? (
              <SkeletonCard />
            ) : standupRecords.length === 0 ? (
              <Text style={s.emptyColTxt}>No check-ins recorded for this sprint yet.</Text>
            ) : (
              standupRecords.map((ck, idx) => (
                <View key={idx} style={s.checkinCard}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={s.checkinAuthor}>{ck.userName || "Team Member"}</Text>
                    <Text style={s.checkinDate}>
                      {ck.date ? new Date(ck.date).toLocaleDateString() : "Today"}
                    </Text>
                  </View>
                  {ck.yesterdayWork ? (
                    <Text style={s.checkinItem}>
                      <Text style={{ fontWeight: "700" }}>Yesterday: </Text>{ck.yesterdayWork}
                    </Text>
                  ) : null}
                  {ck.todayPlan ? (
                    <Text style={s.checkinItem}>
                      <Text style={{ fontWeight: "700" }}>Today: </Text>{ck.todayPlan}
                    </Text>
                  ) : null}
                  {ck.blockers ? (
                    <Text style={[s.checkinItem, { color: "#dc2626" }]}>
                      <Text style={{ fontWeight: "700" }}>Blockers: </Text>{ck.blockers}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </ModalSheet>

      {/* ── Decompose Story Modal ───────────────────────────────────────────── */}
      <ModalSheet
        visible={decomposeModal}
        onClose={() => setDecomposeModal(false)}
        title="Break Down Story into Execution Tasks"
      >
        <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 12 }}>
          {targetDecomposeTask && (
            <View style={s.targetStoryBox}>
              <Text style={s.targetStoryHead}>Parent Story</Text>
              <Text style={s.targetStoryTitle}>{targetDecomposeTask.title}</Text>
            </View>
          )}

          <Text style={s.subtaskIntro}>
            Create granular execution tasks associated with this story.
          </Text>

          {subtasksList.map((st, idx) => (
            <View key={idx} style={s.subtaskRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <TextInput
                  style={s.textInput}
                  value={st.title}
                  onChangeText={(val) => {
                    const next = [...subtasksList];
                    next[idx].title = val;
                    setSubtasksList(next);
                  }}
                  placeholder={`Subtask ${idx + 1} title (e.g. Write unit tests)`}
                />
              </View>
              <View style={{ width: 70, gap: 4 }}>
                <TextInput
                  style={s.textInput}
                  value={st.estimatedHours}
                  onChangeText={(val) => {
                    const next = [...subtasksList];
                    next[idx].estimatedHours = val;
                    setSubtasksList(next);
                  }}
                  placeholder="Hours"
                  keyboardType="numeric"
                />
              </View>
              {subtasksList.length > 1 && (
                <Pressable
                  onPress={() => setSubtasksList(subtasksList.filter((_, i) => i !== idx))}
                  style={s.removeSubtaskBtn}
                >
                  <Ionicons name="close-circle" size={18} color="#ef4444" />
                </Pressable>
              )}
            </View>
          ))}

          <Button
            title="+ Add Another Subtask"
            variant="secondary"
            small
            onPress={() =>
              setSubtasksList([...subtasksList, { title: "", estimatedHours: "3" }])
            }
          />

          <Button
            title="Save Execution Tasks"
            icon="checkmark"
            loading={decomposing}
            onPress={handleSubmitDecompose}
            style={{ marginTop: 8 }}
          />
        </ScrollView>
      </ModalSheet>

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
        title={`Add Task to ${currentSprint ? `Sprint ${currentSprint.number}` : "Backlog"}`}
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

      {/* ── Manage Sprint Backlog Modal ────────────────────────────────────── */}
      <ModalSheet
        visible={manageBacklogModal}
        onClose={() => setManageBacklogModal(false)}
        title={`Add Backlog Stories — ${currentSprint?.name || "Sprint"}`}
      >
        <ScrollView style={{ maxHeight: 520 }}>
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 13, color: colors.textSecondary }}>
              Select approved Product Backlog stories to commit to {currentSprint?.name || "this Sprint"}.
            </Text>

            {/* Workload summary */}
            <View style={{ padding: 12, backgroundColor: "#f8fafc", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#1e293b" }}>Selected Workload</Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#2563eb" }}>
                  {allTasks.filter((t) => selectedBacklogStoryIds.includes(t._id)).reduce((acc, t) => acc + (t.storyPoints || 0), 0)} pts · ~{allTasks.filter((t) => selectedBacklogStoryIds.includes(t._id)).reduce((acc, t) => acc + (t.estimatedHours || 0), 0)}h
                </Text>
              </View>
            </View>

            {/* List */}
            {allTasks.filter((t) => !t.sprintId || t.sprintId === currentSprint?._id).length === 0 ? (
              <Text style={{ fontSize: 12, color: colors.textMuted, marginVertical: 8 }}>
                No eligible Product Backlog stories available to assign.
              </Text>
            ) : (
              <View style={{ gap: 6 }}>
                {allTasks
                  .filter((t) => !t.sprintId || t.sprintId === currentSprint?._id)
                  .map((story) => {
                    const isSelected = selectedBacklogStoryIds.includes(story._id);
                    return (
                      <Pressable
                        key={story._id}
                        onPress={() => {
                          if (isSelected) {
                            setSelectedBacklogStoryIds((prev) => prev.filter((id) => id !== story._id));
                          } else {
                            setSelectedBacklogStoryIds((prev) => [...prev, story._id]);
                          }
                        }}
                        style={[
                          {
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                            padding: 10,
                            borderRadius: radius.md,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: colors.surface,
                          },
                          isSelected && { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
                        ]}
                      >
                        <Ionicons
                          name={isSelected ? "checkbox" : "square-outline"}
                          size={18}
                          color={isSelected ? "#2563eb" : colors.textMuted}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[{ fontSize: 13, color: colors.text }, isSelected && { fontWeight: "700" }]}>
                            {story.title}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                            {story.storyPoints || 3} Pts · ~{story.estimatedHours || 6}h · {(story.priorityLabel || story.priority || "medium").toString().toUpperCase()}
                            {story.dependencies?.length > 0 ? ` · ${story.dependencies.length} prerequisite(s)` : ""}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
              </View>
            )}

            <Button
              title={manageBacklogBusy ? "Committing..." : `Commit ${selectedBacklogStoryIds.length} Stories to ${currentSprint?.name || "Sprint"}`}
              icon="rocket"
              loading={manageBacklogBusy}
              disabled={manageBacklogBusy || selectedBacklogStoryIds.length === 0}
              onPress={handleCommitManageBacklog}
              style={{ marginTop: 8 }}
            />
          </View>
        </ScrollView>
      </ModalSheet>

      {/* ── Delete Planning Sprint Confirmation Modal (Team Leader Only) ── */}
      <ModalSheet
        visible={deleteSprintModal && !!currentSprint}
        onClose={() => !deletingSprint && setDeleteSprintModal(false)}
        title="Delete Planning Sprint"
      >
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: "#fef2f2", borderRadius: radius.md, borderWidth: 1, borderColor: "#fca5a5" }}>
            <Ionicons name="warning-outline" size={24} color="#dc2626" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "800", color: "#b91c1c" }}>
                Confirm Deletion of {currentSprint?.name}
              </Text>
              <Text style={{ fontSize: 12, color: "#991b1b", marginTop: 2 }}>
                Current lifecycle state: {currentSprint?.status}
              </Text>
            </View>
          </View>

          <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19 }}>
            You are about to delete <Text style={{ fontWeight: "700", color: colors.text }}>{currentSprint?.name}</Text>.
            {" "}This action is restricted to authorized team leaders.
          </Text>

          {currentSprintTasks.length > 0 ? (
            <View style={{ padding: 12, backgroundColor: "#eff6ff", borderRadius: radius.md, borderWidth: 1, borderColor: "#bfdbfe", gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#1e40af" }}>
                Delete {currentSprint?.name}?
              </Text>
              <Text style={{ fontSize: 12.5, color: "#1e3a8a", lineHeight: 18 }}>
                Its {currentSprintTasks.length} eligible {currentSprintTasks.length === 1 ? "story" : "stories"} ({sprintStats?.totalCommitted || 0} story points) will return to the Unassigned Backlog. Existing story/task records, acceptance criteria, assignments, and their source history will be preserved.
              </Text>
              <Text style={{ fontSize: 11.5, color: "#2563eb", fontWeight: "600", marginTop: 2 }}>
                ✓ Official IDs, story points, acceptance criteria, assignments, dependencies, and audit history are strictly preserved.
              </Text>
            </View>
          ) : (
            <View style={{ padding: 12, backgroundColor: "#f8fafc", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 12.5, color: colors.textMuted, lineHeight: 18 }}>
                Sprint is empty (0 committed stories). Only this individual planning sprint container will be safely removed.
              </Text>
            </View>
          )}

          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() => setDeleteSprintModal(false)}
              disabled={deletingSprint}
            />
            <Button
              title={deletingSprint ? "Deleting..." : "Delete Sprint"}
              variant="danger"
              icon="trash-outline"
              loading={deletingSprint}
              onPress={handleDeleteSprint}
            />
          </View>
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
    padding: spacing.lg,
    gap: spacing.md,
  },
  sprintSelectorBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sprintPillRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  sprintPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sprintPillSelected: {
    backgroundColor: colors.surfaceHover || "#f8fafc",
    borderWidth: 1.5,
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  sprintPillTxt: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  statusMiniBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  statusMiniTxt: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  sprintHeaderCard: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 10,
  },
  unassignedHeaderCard: {
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sprintHeaderTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sprintHeaderTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  sprintGoalTxt: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  sprintHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statsLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  daysMeta: {
    fontSize: 11,
    color: colors.textMuted,
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterBarCount: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff5f5",
  },
  filterBtnActive: {
    backgroundColor: "#dc2626",
    borderColor: "#dc2626",
  },
  filterBtnTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: "#dc2626",
  },
  noSprintCard: {
    margin: spacing.xl,
    padding: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    gap: 8,
  },
  noSprintTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  noSprintSub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 420,
    lineHeight: 19,
  },
  boardScroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  scrollControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scrollNavBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scrollNavBtnTxt: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text,
  },
  column: {
    width: 290,
    height: 600,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  colHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  colDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  colTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  colBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  colBadgeTxt: {
    fontSize: 11,
    fontWeight: "700",
  },
  colPts: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  emptyCol: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  emptyColTxt: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  taskCard: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    gap: 6,
  },
  taskPts: {
    fontSize: 11,
    fontWeight: "800",
    color: "#4f46e5",
  },
  blockedBadge: {
    backgroundColor: "#fee2e2",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  blockedBadgeTxt: {
    fontSize: 9,
    fontWeight: "800",
    color: "#b91c1c",
  },
  taskHours: {
    fontSize: 11,
    color: colors.textMuted,
  },
  taskCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 18,
  },
  taskCardStory: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: "italic",
    lineHeight: 15,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border + "88",
  },
  assigneeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  assigneeTxt: {
    fontSize: 11,
    color: colors.textMuted,
  },
  subtaskBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: "#eef2ff",
  },
  subtaskBtnTxt: {
    fontSize: 10,
    fontWeight: "700",
    color: "#4f46e5",
  },
  moveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  navArrow: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: colors.border + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  detailStoryBox: {
    backgroundColor: "#f8fafc",
    padding: 10,
    borderRadius: radius.sm,
    gap: 3,
  },
  detailStoryHead: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textSecondary,
    textTransform: "uppercase",
  },
  detailStoryTxt: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 17,
  },
  statusSelectLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
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
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  statusOptionTxt: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  blockerToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  blockerToggleTxt: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
  },
  standupGoalBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  standupGoalBannerTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e40af",
    flex: 1,
  },
  standupFormBox: {
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  standupSectionHead: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  checkinCard: {
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  checkinAuthor: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  checkinDate: {
    fontSize: 11,
    color: colors.textMuted,
  },
  checkinItem: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  targetStoryBox: {
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: "#f1f5f9",
    gap: 3,
  },
  targetStoryHead: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  targetStoryTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  subtaskIntro: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  subtaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  removeSubtaskBtn: {
    padding: 4,
  },
});
