/**
 * client/components/workspace/ScrumPlanPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM PLAN & PRODUCT BACKLOG PANEL
 *
 * Prompts 5 & 6:
 *   1. Product Backlog Management (User Stories, story points, value, risk, criteria)
 *   2. Dynamic DAA Priority Engine Ranking & Explainability Breakdown
 *   3. Sprint Planning Wizard & Knapsack-style Capacity Candidate Scorer
 *   4. Safe Commitment: Team reviews and confirms Sprint plan
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
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast, ModalSheet } from "@/components/feedback";
import { Card, Button, Badge, SkeletonCard, ProgressBar } from "@/components/ui";
import {
  fetchScrumBacklog,
  createBacklogItem,
  updateBacklogItem,
  deleteBacklogItem,
  calculatePlanningCandidates,
  commitSprintPlan,
  fetchSprints,
} from "@/services/scrumApiService";
import { colors, spacing, radius, font } from "@/theme";

interface ScrumPlanPanelProps {
  teamId: string;
  projectId: string;
}

export default function ScrumPlanPanel({ teamId, projectId }: ScrumPlanPanelProps) {
  const { token } = useAuth();
  const toast = useToast();

  const [items, setItems] = useState<any[]>([]);
  const [sprints, setSprints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Active planning modal & DAA recommendations
  const [planningModal, setPlanningModal] = useState(false);
  const [sprintGoal, setSprintGoal] = useState("");
  const [sprintDuration, setSprintDuration] = useState(14);
  const [capacityHours, setCapacityHours] = useState(80);
  const [planningResult, setPlanningResult] = useState<any>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [planningBusy, setPlanningBusy] = useState(false);

  // New item modal
  const [createModal, setCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [newWant, setNewWant] = useState("");
  const [newBenefit, setNewBenefit] = useState("");
  const [newStoryPoints, setNewStoryPoints] = useState("3");
  const [newBusinessValue, setNewBusinessValue] = useState("50");
  const [newEstHours, setNewEstHours] = useState("8");
  const [newAcceptanceCriteria, setNewAcceptanceCriteria] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  // Selected item for factor explanation
  const [inspectedItem, setInspectedItem] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [backlogRes, sprintRes] = await Promise.all([
        fetchScrumBacklog(teamId, token),
        fetchSprints(teamId, token),
      ]);
      setItems(backlogRes.items || []);
      setSprints(sprintRes.sprints || []);
    } catch (err: any) {
      toast(err.message || "Failed to load Product Backlog", "error");
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

  // Run deterministic DAA candidate analysis
  const handleRunPlanningDAA = async () => {
    setPlanningBusy(true);
    try {
      const res = await calculatePlanningCandidates(
        teamId,
        {
          sprintDurationDays: sprintDuration,
          teamCapacityHours: capacityHours,
          sprintGoal,
        },
        token
      );
      setPlanningResult(res);
      // Pre-select recommended tasks
      const recIds = (res.candidates || [])
        .filter((c: any) => c.recommended)
        .map((c: any) => c.taskId);
      setSelectedTaskIds(recIds);
    } catch (err: any) {
      toast(err.message || "DAA calculation failed", "error");
    } finally {
      setPlanningBusy(false);
    }
  };

  // Commit chosen candidates to new Sprint
  const handleCommitSprint = async () => {
    if (!selectedTaskIds.length) {
      toast("Please select at least one item for the Sprint", "error");
      return;
    }
    setPlanningBusy(true);
    try {
      await commitSprintPlan(
        teamId,
        {
          sprintGoal: sprintGoal.trim() || "Sprint Delivery Increment",
          durationDays: sprintDuration,
          committedTaskIds: selectedTaskIds,
          capacityHours,
        },
        token
      );
      toast("Sprint plan committed successfully!", "success");
      setPlanningModal(false);
      setPlanningResult(null);
      loadData();
    } catch (err: any) {
      toast(err.message || "Failed to commit Sprint plan", "error");
    } finally {
      setPlanningBusy(false);
    }
  };

  // Create new Product Backlog Item
  const handleCreateItem = async () => {
    if (!newTitle.trim()) {
      toast("Title is required", "error");
      return;
    }
    setCreateBusy(true);
    try {
      const storyText = newWant.trim()
        ? `As a ${newRole}, I want ${newWant} so that ${newBenefit}`
        : "";
      const criteriaList = newAcceptanceCriteria
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      await createBacklogItem(
        teamId,
        {
          title: newTitle.trim(),
          userStory: storyText,
          storyPoints: parseInt(newStoryPoints) || 3,
          businessValue: parseInt(newBusinessValue) || 50,
          estimatedHours: parseFloat(newEstHours) || 8,
          acceptanceCriteria: criteriaList,
        },
        token
      );
      toast("Backlog item created", "success");
      setCreateModal(false);
      setNewTitle("");
      setNewWant("");
      setNewBenefit("");
      setNewAcceptanceCriteria("");
      loadData();
    } catch (err: any) {
      toast(err.message || "Failed to create backlog item", "error");
    } finally {
      setCreateBusy(false);
    }
  };

  const handleDeleteItem = async (taskId: string) => {
    try {
      await deleteBacklogItem(taskId, token);
      toast("Item removed from Backlog", "success");
      setItems((prev) => prev.filter((i) => i._id !== taskId));
    } catch (err: any) {
      toast(err.message || "Failed to delete item", "error");
    }
  };

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── Top Header & Actions ───────────────────────────────────────────── */}
      <View style={s.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>Product Backlog & Sprint Planning</Text>
          <Text style={s.pageSub}>
            {items.length} backlog item{items.length !== 1 ? "s" : ""} · DAA dynamic priority ranked
          </Text>
        </View>
        <View style={s.btnRow}>
          <Button
            title="Sprint Planning"
            icon="calendar-outline"
            variant="secondary"
            onPress={() => {
              setPlanningModal(true);
              handleRunPlanningDAA();
            }}
          />
          <Button
            title="Add Story"
            icon="add"
            onPress={() => setCreateModal(true)}
          />
        </View>
      </View>

      {/* ── Product Backlog Item List ──────────────────────────────────────── */}
      <View style={s.backlogList}>
        {items.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="layers-outline" size={40} color={colors.textMuted} />
            <Text style={s.emptyTitle}>Product Backlog is Empty</Text>
            <Text style={s.emptySub}>
              Create your first User Story to prioritize valuable increments for the team.
            </Text>
            <Button title="Add First Story" icon="add" onPress={() => setCreateModal(true)} style={{ marginTop: 8 }} />
          </View>
        ) : (
          items.map((item, index) => {
            const hasStory = Boolean(item.userStory);
            const isCommitted = Boolean(item.sprintId);
            return (
              <Pressable
                key={item._id}
                onPress={() => setInspectedItem(item)}
                style={[
                  s.itemCard,
                  inspectedItem?._id === item._id && s.itemCardActive,
                ]}
              >
                {/* Rank number */}
                <View style={s.rankBadge}>
                  <Text style={s.rankTxt}>#{index + 1}</Text>
                </View>

                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={s.itemTitle}>{item.title}</Text>
                    {isCommitted ? (
                      <View style={[s.tagBadge, { backgroundColor: "#e0e7ff" }]}>
                        <Text style={[s.tagTxt, { color: "#4338ca" }]}>In Sprint</Text>
                      </View>
                    ) : (
                      <View style={[s.tagBadge, { backgroundColor: "#fef3c7" }]}>
                        <Text style={[s.tagTxt, { color: "#b45309" }]}>Backlog</Text>
                      </View>
                    )}
                  </View>

                  {hasStory && (
                    <Text style={s.storyTxt} numberOfLines={2}>
                      {item.userStory}
                    </Text>
                  )}

                  {/* Metadata Chips */}
                  <View style={s.metaRow}>
                    <View style={s.chip}>
                      <Ionicons name="ribbon-outline" size={12} color="#4f46e5" />
                      <Text style={s.chipTxt}>{item.storyPoints || 3} pts</Text>
                    </View>
                    <View style={s.chip}>
                      <Ionicons name="trending-up-outline" size={12} color="#059669" />
                      <Text style={s.chipTxt}>Value: {item.businessValue || 50}</Text>
                    </View>
                    <View style={s.chip}>
                      <Ionicons name="time-outline" size={12} color="#78716c" />
                      <Text style={s.chipTxt}>{item.estimatedHours || 8}h</Text>
                    </View>
                    <View style={[s.chip, { backgroundColor: "#f5f3ff" }]}>
                      <Ionicons name="speedometer-outline" size={12} color="#7c3aed" />
                      <Text style={[s.chipTxt, { color: "#7c3aed", fontWeight: "700" }]}>
                        Score: {item.priorityScore || 50}
                      </Text>
                    </View>
                  </View>
                </View>

                <Pressable
                  onPress={() => handleDeleteItem(item._id)}
                  hitSlop={8}
                  style={s.delBtn}
                >
                  <Ionicons name="trash-outline" size={16} color="#dc2626" />
                </Pressable>
              </Pressable>
            );
          })
        )}
      </View>

      {/* ── Item Factor Breakdown Sheet (DAA Explainability) ─────────────────── */}
      {inspectedItem && (
        <View style={s.explainBox}>
          <View style={s.explainHead}>
            <View style={{ flex: 1 }}>
              <Text style={s.explainTitle}>DAA Priority Factor Breakdown</Text>
              <Text style={s.explainSub}>{inspectedItem.title}</Text>
            </View>
            <Pressable onPress={() => setInspectedItem(null)} style={{ padding: 4 }}>
              <Ionicons name="close" size={18} color="#78716c" />
            </Pressable>
          </View>

          <View style={s.explainGrid}>
            <View style={s.explainCard}>
              <Text style={s.factorLbl}>Business Value</Text>
              <Text style={s.factorVal}>{inspectedItem.businessValue || 50}/100</Text>
            </View>
            <View style={s.explainCard}>
              <Text style={s.factorLbl}>Effort / Points</Text>
              <Text style={s.factorVal}>{inspectedItem.storyPoints || 3} pts</Text>
            </View>
            <View style={s.explainCard}>
              <Text style={s.factorLbl}>Estimated Hours</Text>
              <Text style={s.factorVal}>{inspectedItem.estimatedHours || 8}h</Text>
            </View>
            <View style={s.explainCard}>
              <Text style={s.factorLbl}>Deterministic Score</Text>
              <Text style={[s.factorVal, { color: "#4f46e5" }]}>
                {inspectedItem.priorityScore || 50}
              </Text>
            </View>
          </View>

          {inspectedItem.acceptanceCriteria?.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text style={s.critTitle}>Acceptance Criteria (Definition of Done)</Text>
              {inspectedItem.acceptanceCriteria.map((c: string, i: number) => (
                <View key={i} style={s.critRow}>
                  <Ionicons name="checkmark-circle-outline" size={14} color="#059669" />
                  <Text style={s.critTxt}>{c}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── Sprint Planning Modal (Prompt 5) ────────────────────────────────── */}
      <ModalSheet
        visible={planningModal}
        onClose={() => setPlanningModal(false)}
        title="Sprint Planning Wizard"
      >
        <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 12 }}>
          <Text style={s.modalHint}>
            DAA deterministically optimizes candidate backlog items against capacity, priority, and dependencies.
          </Text>

          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>Sprint Goal</Text>
            <TextInput
              style={s.textInput}
              value={sprintGoal}
              onChangeText={setSprintGoal}
              placeholder="e.g. Build and integrate the student prediction API"
            />
          </View>

          <View style={s.rowInputs}>
            <View style={[s.inputGroup, { flex: 1 }]}>
              <Text style={s.inputLabel}>Duration (Days)</Text>
              <TextInput
                style={s.textInput}
                value={String(sprintDuration)}
                onChangeText={(v) => setSprintDuration(parseInt(v) || 14)}
                keyboardType="numeric"
              />
            </View>
            <View style={[s.inputGroup, { flex: 1 }]}>
              <Text style={s.inputLabel}>Capacity (Hours)</Text>
              <TextInput
                style={s.textInput}
                value={String(capacityHours)}
                onChangeText={(v) => setCapacityHours(parseInt(v) || 80)}
                keyboardType="numeric"
              />
            </View>
          </View>

          <Button
            title="Recalculate DAA Candidates"
            icon="calculator-outline"
            variant="secondary"
            loading={planningBusy}
            onPress={handleRunPlanningDAA}
          />

          {/* Candidate list */}
          {planningResult && (
            <View style={s.candidateSection}>
              <Text style={s.candidateHeader}>
                Recommended Candidates ({selectedTaskIds.length} chosen · {planningResult.summary?.plannedHours || 0}h)
              </Text>
              <View style={{ gap: 8 }}>
                {(planningResult.candidates || []).map((cand: any) => {
                  const checked = selectedTaskIds.includes(cand.taskId);
                  return (
                    <Pressable
                      key={cand.taskId}
                      onPress={() => {
                        setSelectedTaskIds((prev) =>
                          checked ? prev.filter((id) => id !== cand.taskId) : [...prev, cand.taskId]
                        );
                      }}
                      style={[s.candRow, checked && s.candRowActive]}
                    >
                      <Ionicons
                        name={checked ? "checkbox" : "square-outline"}
                        size={20}
                        color={checked ? colors.primary : "#a8a29e"}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={s.candTitle}>{cand.title}</Text>
                        <Text style={s.candMeta}>
                          {cand.storyPoints} pts · {cand.estimatedHours}h · Score: {cand.score}
                        </Text>
                        {cand.reason && <Text style={s.candReason}>{cand.reason}</Text>}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <Button
                title="Commit Selected Work to Sprint"
                icon="checkmark"
                loading={planningBusy}
                onPress={handleCommitSprint}
                style={{ marginTop: 12 }}
              />
            </View>
          )}
        </ScrollView>
      </ModalSheet>

      {/* ── Create Story Modal ─────────────────────────────────────────────── */}
      <ModalSheet
        visible={createModal}
        onClose={() => setCreateModal(false)}
        title="New User Story"
      >
        <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 12 }}>
          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>Story Title</Text>
            <TextInput
              style={s.textInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="e.g. Student prediction result API"
            />
          </View>

          <View style={s.storyBuilderBox}>
            <Text style={s.storyBuilderHead}>User Story Format</Text>
            <View style={s.inputGroup}>
              <Text style={s.inputSubLabel}>As a ...</Text>
              <TextInput
                style={s.textInput}
                value={newRole}
                onChangeText={setNewRole}
                placeholder="teacher / student / admin"
              />
            </View>
            <View style={s.inputGroup}>
              <Text style={s.inputSubLabel}>I want ...</Text>
              <TextInput
                style={s.textInput}
                value={newWant}
                onChangeText={setNewWant}
                placeholder="student risk assessment scores"
              />
            </View>
            <View style={s.inputGroup}>
              <Text style={s.inputSubLabel}>So that ...</Text>
              <TextInput
                style={s.textInput}
                value={newBenefit}
                onChangeText={setNewBenefit}
                placeholder="I can schedule timely interventions"
              />
            </View>
          </View>

          <View style={s.rowInputs}>
            <View style={[s.inputGroup, { flex: 1 }]}>
              <Text style={s.inputLabel}>Story Points (Fibonacci)</Text>
              <TextInput
                style={s.textInput}
                value={newStoryPoints}
                onChangeText={setNewStoryPoints}
                keyboardType="numeric"
              />
            </View>
            <View style={[s.inputGroup, { flex: 1 }]}>
              <Text style={s.inputLabel}>Business Value (1-100)</Text>
              <TextInput
                style={s.textInput}
                value={newBusinessValue}
                onChangeText={setNewBusinessValue}
                keyboardType="numeric"
              />
            </View>
            <View style={[s.inputGroup, { flex: 1 }]}>
              <Text style={s.inputLabel}>Est. Hours</Text>
              <TextInput
                style={s.textInput}
                value={newEstHours}
                onChangeText={setNewEstHours}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>Acceptance Criteria (one per line)</Text>
            <TextInput
              style={[s.textInput, { height: 80 }]}
              value={newAcceptanceCriteria}
              onChangeText={setNewAcceptanceCriteria}
              placeholder={"- Returns HTTP 200 with prediction JSON\n- Latency under 200ms\n- Unit tests pass"}
              multiline
            />
          </View>

          <Button
            title="Save to Backlog"
            icon="save-outline"
            loading={createBusy}
            onPress={handleCreateItem}
          />
        </ScrollView>
      </ModalSheet>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: 100,
  },
  loadingWrap: {
    padding: spacing.md,
    gap: spacing.md,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1c1917",
  },
  pageSub: {
    fontSize: 12,
    color: "#78716c",
    marginTop: 2,
  },
  btnRow: {
    flexDirection: "row",
    gap: 8,
  },
  backlogList: {
    gap: 8,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: 12,
    gap: 12,
  },
  itemCardActive: {
    borderColor: "#4f46e5",
    backgroundColor: "#faf5ff",
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#f5f5f4",
    alignItems: "center",
    justifyContent: "center",
  },
  rankTxt: {
    fontSize: 12,
    fontWeight: "800",
    color: "#78716c",
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1c1917",
  },
  tagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  tagTxt: {
    fontSize: 10,
    fontWeight: "700",
  },
  storyTxt: {
    fontSize: 12,
    color: "#57534e",
    fontStyle: "italic",
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f5f5f4",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  chipTxt: {
    fontSize: 11,
    color: "#44403c",
    fontWeight: "600",
  },
  delBtn: {
    padding: 6,
  },
  emptyBox: {
    backgroundColor: "#ffffff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1c1917",
  },
  emptySub: {
    fontSize: 12,
    color: "#78716c",
    textAlign: "center",
    maxWidth: 280,
  },
  explainBox: {
    backgroundColor: "#ffffff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    padding: spacing.md,
    gap: 10,
  },
  explainHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  explainTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#4f46e5",
    textTransform: "uppercase",
  },
  explainSub: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e1b4b",
    marginTop: 1,
  },
  explainGrid: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  explainCard: {
    flex: 1,
    minWidth: 110,
    backgroundColor: "#f5f3ff",
    borderRadius: radius.sm,
    padding: 8,
    gap: 2,
  },
  factorLbl: {
    fontSize: 10,
    color: "#6b7280",
    fontWeight: "600",
  },
  factorVal: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1c1917",
  },
  critTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#44403c",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  critRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  critTxt: {
    fontSize: 12,
    color: "#374151",
  },
  modalHint: {
    fontSize: 12,
    color: "#78716c",
    lineHeight: 16,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1c1917",
  },
  inputSubLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
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
  rowInputs: {
    flexDirection: "row",
    gap: 8,
  },
  candidateSection: {
    gap: 8,
    marginTop: 8,
  },
  candidateHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1c1917",
    textTransform: "uppercase",
  },
  candRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#f5f5f4",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: radius.md,
    padding: 10,
    gap: 10,
  },
  candRowActive: {
    borderColor: "#4f46e5",
    backgroundColor: "#eef2ff",
  },
  candTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1c1917",
  },
  candMeta: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
  },
  candReason: {
    fontSize: 11,
    color: "#4f46e5",
    marginTop: 2,
    fontStyle: "italic",
  },
  storyBuilderBox: {
    backgroundColor: "#f5f3ff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#ddd6fe",
    padding: 10,
    gap: 8,
  },
  storyBuilderHead: {
    fontSize: 11,
    fontWeight: "800",
    color: "#4f46e5",
    textTransform: "uppercase",
  },
});
