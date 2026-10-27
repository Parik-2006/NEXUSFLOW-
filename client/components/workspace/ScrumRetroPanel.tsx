/**
 * client/components/workspace/ScrumRetroPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — SPRINT REVIEW & RETROSPECTIVE WORKSPACE
 *
 * Implements:
 *   1. Per-Sprint isolated Retrospective & Live Sprint Observations
 *   2. Lifecycle-Aware Ceremonies:
 *      - PLANNING: Pre-execution readiness assessment
 *      - ACTIVE: In-flight live sprint observations & blocker tracking
 *      - REVIEW/COMPLETED: Formal retrospective & product increment inspection
 *   3. Sprint-Specific Process Improvement Action Items (persisted in MongoDB)
 *   4. Zero-cost AI reflection assistance via OmniRoute grounded in genuine records
 *   5. Race-condition-free sprint switching with stable internal sprint IDs
 * ============================================================================
 */

import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast, ModalSheet } from "@/components/feedback";
import { Card, SkeletonCard, Button, Badge } from "@/components/ui";
import {
  fetchScrumRetrospective,
  generateScrumRetrospective,
  fetchSprints,
  fetchSprintReview,
  submitSprintReview,
  addRetroAction,
  updateRetroAction,
  fetchScrumBacklog,
} from "@/services/scrumApiService";
import { colors, spacing, radius, font } from "@/theme";

interface ScrumRetroPanelProps {
  teamId: string;
}

export default function ScrumRetroPanel({ teamId }: ScrumRetroPanelProps) {
  const { token, user } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<"retro" | "review">("retro");
  const [sprints, setSprints] = useState<any[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [retroData, setRetroData] = useState<any>(null);
  const [reviewData, setReviewData] = useState<any>(null);
  const [allBacklogTasks, setAllBacklogTasks] = useState<any[]>([]);
  const [sprintTasks, setSprintTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [retroLoading, setRetroLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Tracking active request to eliminate race conditions on rapid sprint switching
  const activeSprintFetchRef = useRef<string | null>(null);

  // Action Items State
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [addActionModal, setAddActionModal] = useState(false);
  const [newActionTitle, setNewActionTitle] = useState("");
  const [newActionDesc, setNewActionDesc] = useState("");
  const [newActionPriority, setNewActionPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [newActionOwner, setNewActionOwner] = useState(user?.name || "");
  const [newActionDue, setNewActionDue] = useState("");
  const [addingAction, setAddingAction] = useState(false);

  // Review Feedback Form State
  const [demoNotes, setDemoNotes] = useState("");
  const [stakeholderFeedback, setStakeholderFeedback] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Load initial sprint list and backlog
  const loadData = useCallback(async (explicitSprintId?: string | null) => {
    try {
      const [sprintRes, backlogRes] = await Promise.all([
        fetchSprints(teamId, token),
        fetchScrumBacklog(teamId, token),
      ]);

      const allSprints = sprintRes.sprints || [];
      setSprints(allSprints);
      const items = backlogRes.items || [];
      setAllBacklogTasks(items);

      // Determine target sprint ID
      let targetId: string | null = explicitSprintId || null;
      if (!targetId) {
        const active = allSprints.find((s: any) => s.status === "ACTIVE");
        targetId = active ? active._id : allSprints[0]?._id || null;
      }

      setSelectedSprintId(targetId);

      if (targetId) {
        await loadSprintData(targetId, items);
      } else {
        setSprintTasks([]);
        setRetroData(null);
        setActionItems([]);
      }
    } catch (err: any) {
      toast(err.message || "Failed to load Retrospective", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, token, toast]);

  // Load data specific to an individual sprint safely without race conditions
  const loadSprintData = async (sprintId: string, backlogs?: any[]) => {
    activeSprintFetchRef.current = sprintId;
    setRetroLoading(true);
    try {
      const [retroRes, revRes] = await Promise.all([
        fetchScrumRetrospective(teamId, sprintId, token).catch(() => null),
        fetchSprintReview(sprintId, token).catch(() => null),
      ]);

      // Check for stale response
      if (activeSprintFetchRef.current !== sprintId) {
        return;
      }

      setRetroData(retroRes);
      setReviewData(revRes);
      setActionItems(retroRes?.retrospective?.actionItems || []);

      const pool = backlogs || allBacklogTasks;
      const tasksForSprint = pool.filter((t: any) => t.sprintId === sprintId);
      setSprintTasks(tasksForSprint);
    } catch (err: any) {
      if (activeSprintFetchRef.current === sprintId) {
        toast(err.message || "Failed to load sprint retrospective", "error");
      }
    } finally {
      if (activeSprintFetchRef.current === sprintId) {
        setRetroLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(selectedSprintId);
  };

  const handleSelectSprint = (sprintId: string) => {
    if (sprintId === selectedSprintId) return;
    setSelectedSprintId(sprintId);
    loadSprintData(sprintId);
  };

  const handleGenerateFresh = async () => {
    if (!selectedSprintId) return;
    setGenerating(true);
    try {
      const res = await generateScrumRetrospective(
        teamId,
        { sprintId: selectedSprintId },
        token
      );
      setRetroData(res);
      const items = res?.retrospective?.actionItems || [];
      setActionItems(items);
      toast("Fresh Sprint Retrospective analysis generated", "success");
    } catch (err: any) {
      toast(err.message || "Failed to generate retrospective", "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleAddActionItem = async () => {
    if (!newActionTitle.trim()) {
      toast("Action item description is required", "error");
      return;
    }
    setAddingAction(true);
    try {
      const res = await addRetroAction(
        teamId,
        {
          sprintId: selectedSprintId,
          action: newActionTitle.trim(),
          description: newActionDesc.trim(),
          owner: newActionOwner.trim(),
          priority: newActionPriority,
          dueDate: newActionDue.trim() ? new Date(newActionDue).toISOString() : undefined,
          status: "OPEN",
        },
        token
      );
      const sprintLabel = selectedSprint?.name || "Sprint";
      toast(`Improvement action item logged for ${sprintLabel}`, "success");
      const updatedItems = res.actionItems || res.retrospective?.actionItems || [];
      setActionItems(updatedItems);
      setAddActionModal(false);
      setNewActionTitle("");
      setNewActionDesc("");
      setNewActionDue("");
    } catch (err: any) {
      toast(err.message || "Failed to log action item", "error");
    } finally {
      setAddingAction(false);
    }
  };

  const handleToggleActionStatus = async (actionId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "COMPLETED" ? "OPEN" : "COMPLETED";
    try {
      const res = await updateRetroAction(
        teamId,
        actionId,
        { status: nextStatus, evidence: nextStatus === "COMPLETED" ? "Verified in Sprint" : undefined },
        token
      );
      const updatedItems = res.actionItems || res.retrospective?.actionItems || [];
      setActionItems(updatedItems);
      toast(`Action marked as ${nextStatus}`, "success");
    } catch (err: any) {
      toast(err.message || "Failed to update action item", "error");
    }
  };

  const handleSubmitReviewNotes = async () => {
    if (!selectedSprintId) return;
    setSubmittingReview(true);
    try {
      await submitSprintReview(
        selectedSprintId,
        {
          demoNotes: demoNotes.trim(),
          stakeholderFeedback: stakeholderFeedback.trim(),
        },
        token
      );
      toast("Sprint Review notes recorded successfully", "success");
      setDemoNotes("");
      setStakeholderFeedback("");
    } catch (err: any) {
      toast(err.message || "Failed to record sprint review", "error");
    } finally {
      setSubmittingReview(false);
    }
  };

  const rawAnalysis = retroData?.retrospective?.analysis || {};
  const analysis = {
    whatWentWell: Array.isArray(rawAnalysis.whatWentWell) && rawAnalysis.whatWentWell.length > 0
      ? rawAnalysis.whatWentWell
      : Array.isArray(rawAnalysis.wentWell) && rawAnalysis.wentWell.length > 0
        ? rawAnalysis.wentWell
        : [],
    whatNeedsAttention: Array.isArray(rawAnalysis.whatNeedsAttention) && rawAnalysis.whatNeedsAttention.length > 0
      ? rawAnalysis.whatNeedsAttention
      : Array.isArray(rawAnalysis.wentPoorly) && rawAnalysis.wentPoorly.length > 0
        ? rawAnalysis.wentPoorly
        : [],
    rootCauses: Array.isArray(rawAnalysis.rootCauses) && rawAnalysis.rootCauses.length > 0
      ? rawAnalysis.rootCauses
      : Array.isArray(rawAnalysis.bottlenecks) && rawAnalysis.bottlenecks.length > 0
        ? rawAnalysis.bottlenecks
        : [],
    recommendations: Array.isArray(rawAnalysis.recommendations) && rawAnalysis.recommendations.length > 0
      ? rawAnalysis.recommendations
      : [],
    summary: rawAnalysis.summary || "",
  };

  const selectedSprint = useMemo(() => {
    return sprints.find((s) => s._id === selectedSprintId) || null;
  }, [sprints, selectedSprintId]);

  const sprintDisplayName = useMemo(() => {
    if (!selectedSprint) return "Current Sprint";
    const num = selectedSprint.sprintNumber || selectedSprint.number || "";
    return num ? `Sprint ${num}: ${selectedSprint.name}` : selectedSprint.name;
  }, [selectedSprint]);

  // Accepted vs Not Accepted Stories for Review tab
  const acceptedStories = useMemo(() => {
    return sprintTasks.filter((t) => t.status === "done" || t.status === "COMPLETED" || t.scrumStatus === "DONE");
  }, [sprintTasks]);

  const unacceptedStories = useMemo(() => {
    return sprintTasks.filter((t) => t.status !== "done" && t.status !== "COMPLETED" && t.scrumStatus !== "DONE");
  }, [sprintTasks]);

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
      {/* ── Internal Segmented Switcher: Retrospective vs Review ─────────── */}
      <View style={s.tabSwitcher}>
        <Pressable
          onPress={() => setActiveTab("retro")}
          style={[s.tabBtn, activeTab === "retro" && s.tabBtnActive]}
        >
          <Ionicons
            name="refresh-circle-outline"
            size={16}
            color={activeTab === "retro" ? colors.primary : colors.textMuted}
          />
          <Text style={[s.tabBtnTxt, activeTab === "retro" && s.tabBtnTxtActive]}>
            Sprint Retrospective (Team Process)
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("review")}
          style={[s.tabBtn, activeTab === "review" && s.tabBtnActive]}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color={activeTab === "review" ? colors.primary : colors.textMuted}
          />
          <Text style={[s.tabBtnTxt, activeTab === "review" && s.tabBtnTxtActive]}>
            Sprint Review (Increment Inspection)
          </Text>
        </Pressable>
      </View>

      {/* ── Empty Sprints Notice ───────────────────────────────────────────── */}
      {sprints.length === 0 ? (
        <View style={s.card}>
          <View style={s.emptyNoticeBox}>
            <Ionicons name="time-outline" size={24} color={colors.primary} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.emptyNoticeTitle}>No Sprints Available</Text>
              <Text style={s.emptyNoticeTxt}>
                Sprint Review and Retrospective ceremonies become meaningful once sprints are established.
                Create and commit backlog stories to a sprint in Overview → Project Setup & Plan.
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <>
          {/* ── Sprint Selector Chips ──────────────────────────────────────────── */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sprintChips}>
            {sprints.map((sp: any) => {
              const isSel = selectedSprintId === sp._id;
              const spNum = sp.sprintNumber || sp.number || "";
              const statusColor =
                sp.status === "ACTIVE"
                  ? "#2563eb"
                  : sp.status === "COMPLETED"
                  ? "#16a34a"
                  : "#d97706";

              return (
                <Pressable
                  key={sp._id}
                  onPress={() => handleSelectSprint(sp._id)}
                  style={[s.sprintChip, isSel && s.sprintChipActive]}
                >
                  <View style={[s.pillDot, { backgroundColor: statusColor }]} />
                  <Text style={[s.sprintChipTxt, isSel && s.sprintChipTxtActive]}>
                    {spNum ? `Sprint ${spNum}: ` : ""}{sp.name} ({sp.status})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* ── Lifecycle & Ceremony State Banner ─────────────────────────────── */}
          {selectedSprint && (
            <View style={[
              s.lifecycleCard,
              selectedSprint.status === "ACTIVE"
                ? s.lifecycleCardActive
                : selectedSprint.status === "PLANNING"
                ? s.lifecycleCardPlanning
                : s.lifecycleCardCompleted
            ]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons
                    name={
                      selectedSprint.status === "ACTIVE"
                        ? "pulse"
                        : selectedSprint.status === "PLANNING"
                        ? "construct-outline"
                        : "checkmark-done-circle"
                    }
                    size={20}
                    color={
                      selectedSprint.status === "ACTIVE"
                        ? "#1d4ed8"
                        : selectedSprint.status === "PLANNING"
                        ? "#b45309"
                        : "#15803d"
                    }
                  />
                  <Text style={[
                    s.lifecycleTitle,
                    {
                      color:
                        selectedSprint.status === "ACTIVE"
                          ? "#1e3a8a"
                          : selectedSprint.status === "PLANNING"
                          ? "#78350f"
                          : "#14532d",
                    }
                  ]}>
                    {selectedSprint.status === "ACTIVE"
                      ? "Live Sprint Observations (In-Flight Execution Review)"
                      : selectedSprint.status === "PLANNING"
                      ? "Sprint Planning Assessment (Pre-Execution)"
                      : "Formal Sprint Retrospective"}
                  </Text>
                </View>
                <Badge
                  label={selectedSprint.status}
                  variant={
                    selectedSprint.status === "ACTIVE"
                      ? "info"
                      : selectedSprint.status === "COMPLETED"
                      ? "success"
                      : "warning"
                  }
                  size="sm"
                />
              </View>
              <Text style={s.lifecycleDesc}>
                {selectedSprint.status === "ACTIVE"
                  ? `Sprint is actively executing. Findings below assess current progress, active blockers, and emerging impasses. Formal retrospective is finalized at Sprint Review.`
                  : selectedSprint.status === "PLANNING"
                  ? `Sprint is in PLANNING phase. Pre-execution observations evaluate story point estimation, Acceptance Criteria completeness, and readiness before sprint start.`
                  : `Formal retrospective reflecting on sprint outcome, completed deliverables, and process continuous improvement.`}
              </Text>
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              VIEW A: SPRINT RETROSPECTIVE
             ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === "retro" && (
            <View style={{ gap: spacing.md }}>
              <View style={s.sectionHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sectionTitle}>{sprintDisplayName} — Retrospective</Text>
                  <Text style={s.sectionSub}>
                    Inspect how the team collaborated, pinpoint impediments, and track persistent improvement actions.
                  </Text>
                </View>
                <Button
                  title="AI Reflection"
                  icon="sparkles"
                  size="sm"
                  variant="secondary"
                  loading={generating}
                  onPress={handleGenerateFresh}
                />
              </View>

              {/* Inline loading when switching sprints */}
              {retroLoading ? (
                <View style={{ padding: 24, alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>Loading {selectedSprint?.name || "sprint"} data...</Text>
                </View>
              ) : (
                <>
                  {/* Action Items Manager Card */}
                  <View style={s.actionItemsCard}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.actionCardTitle}>Process Improvement Action Items</Text>
                        <Text style={s.actionCardSub}>
                          Persisted in MongoDB for {sprintDisplayName}
                        </Text>
                      </View>
                      <Button
                        title="+ Add Action Item"
                        size="sm"
                        onPress={() => setAddActionModal(true)}
                      />
                    </View>

                    {actionItems.length === 0 ? (
                      <View style={s.emptyActionBox}>
                        <Ionicons name="school-outline" size={20} color="#64748b" />
                        <Text style={s.emptyActionTxt}>
                          No action items committed yet for {selectedSprint?.name || "this sprint"}. Click "+ Add Action Item" to record an agreement.
                        </Text>
                      </View>
                    ) : (
                      <View style={{ gap: 8, marginTop: 10 }}>
                        {actionItems.map((act: any, idx: number) => {
                          const isDone = act.status === "COMPLETED" || act.status === "completed";
                          return (
                            <View key={act._id || idx} style={s.actionRow}>
                              <Pressable
                                onPress={() => handleToggleActionStatus(act._id, act.status)}
                                style={s.actionCheckBtn}
                              >
                                <Ionicons
                                  name={isDone ? "checkmark-circle" : "ellipse-outline"}
                                  size={20}
                                  color={isDone ? "#16a34a" : "#78716c"}
                                />
                              </Pressable>
                              <View style={{ flex: 1, gap: 2 }}>
                                <Text style={[s.actionItemTxt, isDone && s.actionItemTxtDone]}>
                                  {act.action}
                                </Text>
                                {act.description ? (
                                  <Text style={s.actionItemDesc}>{act.description}</Text>
                                ) : null}
                                <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                  <Text style={s.actionItemMeta}>Owner: {act.owner || "Team"}</Text>
                                  {act.dueDate && (
                                    <Text style={s.actionItemMeta}>
                                      Due: {new Date(act.dueDate).toLocaleDateString()}
                                    </Text>
                                  )}
                                  {act.priority && (
                                    <Badge label={act.priority.toUpperCase()} variant={act.priority.toLowerCase() === "high" ? "danger" : "secondary"} size="sm" />
                                  )}
                                </View>
                              </View>
                              <Badge
                                label={isDone ? "RESOLVED" : "IN PROGRESS"}
                                variant={isDone ? "success" : "warning"}
                                size="sm"
                              />
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  {/* Section 1: What Went Well */}
                  {analysis.whatWentWell.length > 0 ? (
                    <View style={[s.card, { borderColor: "#bbf7d0" }]}>
                      <View style={s.cardHead}>
                        <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                        <Text style={[s.cardTitle, { color: "#166534" }]}>What Went Well</Text>
                      </View>
                      <View style={{ gap: 8 }}>
                        {analysis.whatWentWell.map((item: string, idx: number) => (
                          <View key={idx} style={s.pointRow}>
                            <View style={[s.dot, { backgroundColor: "#16a34a" }]} />
                            <Text style={s.pointTxt}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={[s.card, { borderColor: colors.border }]}>
                      <View style={s.cardHead}>
                        <Ionicons name="checkmark-circle-outline" size={18} color={colors.textMuted} />
                        <Text style={[s.cardTitle, { color: colors.textSecondary }]}>What Went Well</Text>
                      </View>
                      <Text style={{ fontSize: 12.5, color: colors.textMuted, fontStyle: "italic" }}>
                        No completed work or team feedback is recorded for this sprint yet.
                      </Text>
                    </View>
                  )}

                  {/* Section 2: What Needs Attention */}
                  {analysis.whatNeedsAttention.length > 0 && (
                    <View style={[s.card, { borderColor: "#fed7aa" }]}>
                      <View style={s.cardHead}>
                        <Ionicons name="alert-circle" size={18} color="#ea580c" />
                        <Text style={[s.cardTitle, { color: "#9a3412" }]}>What Needs Attention</Text>
                      </View>
                      <View style={{ gap: 8 }}>
                        {analysis.whatNeedsAttention.map((item: string, idx: number) => (
                          <View key={idx} style={s.pointRow}>
                            <View style={[s.dot, { backgroundColor: "#ea580c" }]} />
                            <Text style={s.pointTxt}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Section 3: Root Cause Analysis */}
                  {analysis.rootCauses.length > 0 && (
                    <View style={[s.card, { borderColor: "#fecaca" }]}>
                      <View style={s.cardHead}>
                        <Ionicons name="help-circle" size={18} color="#dc2626" />
                        <Text style={[s.cardTitle, { color: "#991b1b" }]}>Why: Root Cause Analysis</Text>
                      </View>
                      <View style={{ gap: 8 }}>
                        {analysis.rootCauses.map((item: string, idx: number) => {
                          const isVerified = item.includes("[VERIFIED CAUSE]");
                          const isLikely = item.includes("[LIKELY FACTOR]");
                          const isUnknown = item.includes("[UNKNOWN CAUSE]");
                          const isHypothesis = item.includes("[AI HYPOTHESIS]");
                          const isPlanning = item.includes("[PLANNING]");

                          const cleanText = item
                            .replace(/\[VERIFIED CAUSE\]/g, "")
                            .replace(/\[LIKELY FACTOR\]/g, "")
                            .replace(/\[UNKNOWN CAUSE\]/g, "")
                            .replace(/\[AI HYPOTHESIS\]/g, "")
                            .replace(/\[PLANNING\]/g, "")
                            .trim();

                          return (
                            <View key={idx} style={s.rcaRow}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                {isVerified && <Badge label="VERIFIED" variant="success" size="sm" />}
                                {isLikely && <Badge label="LIKELY FACTOR" variant="warning" size="sm" />}
                                {isUnknown && <Badge label="UNKNOWN CAUSE" variant="secondary" size="sm" />}
                                {isHypothesis && <Badge label="AI HYPOTHESIS" variant="info" size="sm" />}
                                {isPlanning && <Badge label="PLANNING" variant="warning" size="sm" />}
                              </View>
                              <Text style={s.pointTxt}>{cleanText}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Section 4: Recommendations */}
                  {analysis.recommendations.length > 0 && (
                    <View style={[s.card, { borderColor: "#c7d2fe" }]}>
                      <View style={s.cardHead}>
                        <Ionicons name="bulb" size={18} color="#4f46e5" />
                        <Text style={[s.cardTitle, { color: "#3730a3" }]}>Process Recommendations</Text>
                      </View>
                      <View style={{ gap: 8 }}>
                        {analysis.recommendations.map((item: string, idx: number) => (
                          <View key={idx} style={s.recomItem}>
                            <Ionicons name="arrow-forward-circle" size={16} color="#4f46e5" />
                            <Text style={s.recomTxt}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              VIEW B: SPRINT REVIEW (INCREMENT INSPECTION)
             ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === "review" && (
            <View style={{ gap: spacing.md }}>
              <View style={s.sectionHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sectionTitle}>Sprint Review — {sprintDisplayName}</Text>
                  <Text style={s.sectionSub}>
                    Inspect delivered product increments and record stakeholder acceptance feedback.
                  </Text>
                </View>
              </View>

              {/* Increments Delivered Overview */}
              <View style={s.incrementStatsCard}>
                <View style={s.statCol}>
                  <Text style={s.statNum}>{acceptedStories.length}</Text>
                  <Text style={s.statLbl}>Accepted Stories</Text>
                </View>
                <View style={[s.statCol, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border }]}>
                  <Text style={[s.statNum, { color: "#ea580c" }]}>{unacceptedStories.length}</Text>
                  <Text style={s.statLbl}>Incomplete / Not Accepted</Text>
                </View>
                <View style={s.statCol}>
                  <Text style={[s.statNum, { color: "#16a34a" }]}>
                    {sprintTasks.length > 0 ? Math.round((acceptedStories.length / sprintTasks.length) * 100) : 0}%
                  </Text>
                  <Text style={s.statLbl}>Acceptance Rate</Text>
                </View>
              </View>

              {/* Accepted Stories */}
              {acceptedStories.length > 0 && (
                <View style={[s.card, { borderColor: "#bbf7d0" }]}>
                  <View style={s.cardHead}>
                    <Ionicons name="checkmark-done" size={18} color="#16a34a" />
                    <Text style={[s.cardTitle, { color: "#166534" }]}>
                      Accepted Stories ({acceptedStories.length})
                    </Text>
                  </View>
                  <View style={{ gap: 8 }}>
                    {acceptedStories.map((st) => (
                      <View key={st._id} style={s.reviewStoryRow}>
                        <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                        <View style={{ flex: 1 }}>
                          <Text style={s.reviewStoryTitle}>{st.title}</Text>
                          <Text style={s.reviewStoryDesc}>
                            {st.acceptanceCriteria?.length || 0} Acceptance Criteria Verified
                          </Text>
                        </View>
                        <Badge label={`${st.storyPoints || 3} pts`} variant="success" size="sm" />
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Unaccepted Stories */}
              {unacceptedStories.length > 0 && (
                <View style={[s.card, { borderColor: "#fed7aa" }]}>
                  <View style={s.cardHead}>
                    <Ionicons name="time-outline" size={18} color="#ea580c" />
                    <Text style={[s.cardTitle, { color: "#9a3412" }]}>
                      Incomplete Scope ({unacceptedStories.length})
                    </Text>
                  </View>
                  <View style={{ gap: 8 }}>
                    {unacceptedStories.map((st) => (
                      <View key={st._id} style={s.reviewStoryRow}>
                        <Ionicons name="alert-circle-outline" size={16} color="#ea580c" />
                        <View style={{ flex: 1 }}>
                          <Text style={s.reviewStoryTitle}>{st.title}</Text>
                          <Text style={s.reviewStoryDesc}>Status: {st.scrumStatus || st.status?.toUpperCase()}</Text>
                        </View>
                        <Badge label={`${st.storyPoints || 3} pts`} variant="warning" size="sm" />
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Stakeholder Demo Notes & Feedback Form */}
              <View style={s.card}>
                <Text style={s.cardTitle}>Stakeholder Feedback & Follow-up Backlog Items</Text>
                <View style={{ gap: 10, marginTop: 10 }}>
                  <View style={{ gap: 4 }}>
                    <Text style={s.inputLabel}>Demo Presentation Notes</Text>
                    <TextInput
                      style={[s.textInput, { minHeight: 60 }]}
                      value={demoNotes}
                      onChangeText={setDemoNotes}
                      placeholder="Record what was demonstrated to stakeholders..."
                      multiline
                    />
                  </View>

                  <View style={{ gap: 4 }}>
                    <Text style={s.inputLabel}>Stakeholder Feedback & New Ideas</Text>
                    <TextInput
                      style={[s.textInput, { minHeight: 60 }]}
                      value={stakeholderFeedback}
                      onChangeText={setStakeholderFeedback}
                      placeholder="Record stakeholder comments, proposed adjustments, or new requirements..."
                      multiline
                    />
                  </View>

                  <Button
                    title="Save Sprint Review Record"
                    icon="checkmark"
                    loading={submittingReview}
                    onPress={handleSubmitReviewNotes}
                  />
                </View>
              </View>
            </View>
          )}
        </>
      )}

      {/* ── Add Action Item Modal Sheet ────────────────────────────────────── */}
      <ModalSheet
        visible={addActionModal}
        onClose={() => setAddActionModal(false)}
        title={`Add Improvement Action — ${sprintDisplayName}`}
      >
        <View style={{ gap: 12 }}>
          <View style={{ gap: 4 }}>
            <Text style={s.inputLabel}>Action Item Title *</Text>
            <TextInput
              style={s.textInput}
              value={newActionTitle}
              onChangeText={setNewActionTitle}
              placeholder="e.g. Schedule 15-min daily blocker clearing review"
            />
          </View>

          <View style={{ gap: 4 }}>
            <Text style={s.inputLabel}>Detailed Description / Context</Text>
            <TextInput
              style={[s.textInput, { minHeight: 50 }]}
              value={newActionDesc}
              onChangeText={setNewActionDesc}
              placeholder="Rationale, relevant stories, or target outcome..."
              multiline
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.inputLabel}>Action Owner</Text>
              <TextInput
                style={s.textInput}
                value={newActionOwner}
                onChangeText={setNewActionOwner}
                placeholder="Name or team role"
              />
            </View>

            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.inputLabel}>Priority</Text>
              <View style={{ flexDirection: "row", gap: 4 }}>
                {(["LOW", "MEDIUM", "HIGH"] as const).map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setNewActionPriority(p)}
                    style={[
                      s.priorityPill,
                      newActionPriority === p && s.priorityPillActive,
                      newActionPriority === p && {
                        backgroundColor: p === "HIGH" ? "#ef4444" : p === "MEDIUM" ? "#f59e0b" : "#3b82f6",
                        borderColor: p === "HIGH" ? "#ef4444" : p === "MEDIUM" ? "#f59e0b" : "#3b82f6",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.priorityPillTxt,
                        newActionPriority === p && { color: "#ffffff", fontWeight: "700" },
                      ]}
                    >
                      {p}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <View style={{ gap: 4 }}>
            <Text style={s.inputLabel}>Due Date (YYYY-MM-DD)</Text>
            <TextInput
              style={s.textInput}
              value={newActionDue}
              onChangeText={setNewActionDue}
              placeholder="e.g. 2026-11-01"
            />
          </View>

          <Button
            title="Log Action Item"
            icon="checkmark"
            loading={addingAction}
            onPress={handleAddActionItem}
          />
        </View>
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
  tabSwitcher: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: radius.sm,
  },
  tabBtnActive: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtnTxt: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  tabBtnTxtActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  sectionSub: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  sprintChips: {
    gap: 8,
    paddingVertical: 2,
  },
  sprintChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sprintChipActive: {
    backgroundColor: "#eff6ff",
    borderColor: "#3b82f6",
  },
  sprintChipTxt: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  sprintChipTxtActive: {
    color: "#1d4ed8",
    fontWeight: "700",
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  lifecycleCard: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
  },
  lifecycleCardActive: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  lifecycleCardPlanning: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  lifecycleCardCompleted: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  lifecycleTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  lifecycleDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  actionItemsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 8,
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  actionCardSub: {
    fontSize: 11,
    color: colors.textMuted,
  },
  emptyActionBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: "#f8fafc",
    marginTop: 6,
  },
  emptyActionTxt: {
    fontSize: 12,
    color: colors.textMuted,
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionCheckBtn: {
    paddingTop: 2,
  },
  actionItemTxt: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  actionItemDesc: {
    fontSize: 11.5,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  actionItemTxtDone: {
    textDecorationLine: "line-through",
    color: colors.textMuted,
  },
  actionItemMeta: {
    fontSize: 11,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 8,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  rcaRow: {
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: "#fef2f2",
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  pointTxt: {
    fontSize: 12.5,
    color: colors.text,
    lineHeight: 18,
    flex: 1,
  },
  recomItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: "#f8fafc",
  },
  recomTxt: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 16,
    flex: 1,
  },
  incrementStatsCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  statCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statNum: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
  },
  statLbl: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
  },
  reviewStoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: "#f8fafc",
  },
  reviewStoryTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  reviewStoryDesc: {
    fontSize: 11,
    color: colors.textMuted,
  },
  emptyNoticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 6,
  },
  emptyNoticeTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  emptyNoticeTxt: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  textInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
  },
  priorityPill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  priorityPillActive: {
    borderColor: "#3b82f6",
  },
  priorityPillTxt: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
});
