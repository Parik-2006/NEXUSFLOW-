/**
 * client/components/workspace/ScrumSetupPlanPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM PROJECT SETUP & PLANNING WORKSPACE
 *
 * Primary Scrum Planning Control Center:
 *   Section A: Project Artifacts & Knowledge Base (SRS, Specs, Architecture docs)
 *   Section B: Safe Document Processing & Storage
 *   Section C: AI Project Analysis (OmniRoute $0 cost extraction of scope & constraints)
 *   Section D: AI Planning Generation (Generate INVEST-compliant Scrum User Stories)
 *   Section 6: AI Suggestion Review & Approval (13-point server validation, duplicate prevention)
 *   Section 7: Official Product Backlog (Refinement, manual addition, DAA priority engine)
 *   Section 8: Sprint Planning Wizard (Goal, dates, backlog selection, capacity warning, commitment)
 * ============================================================================
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast, useConfirm, ModalSheet } from "@/components/feedback";
import { Card, Button, Badge, SkeletonCard, ProgressBar } from "@/components/ui";
import {
  fetchScrumPlan,
  analyzeScrumPlan,
  generateScrumPlan,
  approveStorySuggestion,
  bulkApproveStorySuggestions,
  rejectStorySuggestion,
  updateDraftSuggestion,
  createBacklogItem,
  updateBacklogItem,
  deleteBacklogItem,
  commitSprintPlan,
  calculatePlanningCandidates,
  fetchScrumPlanReadiness,
  finalizeScrumPlan,
  resolveScrumConflict,
  approveArtifact,
  approveAllArtifacts,
} from "@/services/scrumApiService";
import { API_BASE_URL } from "@/utils/api";
import { colors, spacing, radius, font } from "@/theme";

interface ScrumSetupPlanPanelProps {
  teamId: string;
  projectId?: string;
  onNavigateToTasks?: () => void;
}

export default function ScrumSetupPlanPanel({
  teamId,
  projectId,
  onNavigateToTasks,
}: ScrumSetupPlanPanelProps) {
  const { token, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);

  // Active section inside Setup & Plan
  type SectionKey = "artifacts" | "analysis" | "suggestions" | "backlog" | "planning" | "readiness";
  const [activeSubSection, setActiveSubSection] = useState<SectionKey>("backlog");

  // Artifact state
  const [showArtifactModal, setShowArtifactModal] = useState(false);
  const [artifactName, setArtifactName] = useState("");
  const [artifactType, setArtifactType] = useState("srs");
  const [artifactContent, setArtifactContent] = useState("");
  const [artifactScope, setArtifactScope] = useState<"persistent" | "temporary">("persistent");
  const [artifactSaving, setArtifactSaving] = useState(false);
  const [artifactSearch, setArtifactSearch] = useState("");
  const [viewingArtifact, setViewingArtifact] = useState<any | null>(null);

  // AI Analysis state
  const [analyzing, setAnalyzing] = useState(false);

  // AI Generation & Suggestion state
  const [generating, setGenerating] = useState(false);
  const [editingSuggestion, setEditingSuggestion] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editRole, setEditRole] = useState("user");
  const [editWant, setEditWant] = useState("");
  const [editBenefit, setEditBenefit] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPoints, setEditPoints] = useState("3");
  const [editHours, setEditHours] = useState("8");
  const [editPriority, setEditPriority] = useState<"critical" | "high" | "medium" | "low">("medium");
  const [editCriteria, setEditCriteria] = useState("");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Backlog state
  const [backlogSearch, setBacklogSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [showAddStoryModal, setShowAddStoryModal] = useState(false);
  const [newStoryTitle, setNewStoryTitle] = useState("");
  const [newStoryRole, setNewStoryRole] = useState("user");
  const [newStoryWant, setNewStoryWant] = useState("");
  const [newStoryBenefit, setNewStoryBenefit] = useState("");
  const [newStoryPoints, setNewStoryPoints] = useState("3");
  const [newStoryHours, setNewStoryHours] = useState("8");
  const [newStoryPriority, setNewStoryPriority] = useState<"critical" | "high" | "medium" | "low">("medium");
  const [newStoryCriteria, setNewStoryCriteria] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [inspectedStory, setInspectedStory] = useState<any | null>(null);

  // Sprint Planning Wizard state
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [selectedSprintTargetId, setSelectedSprintTargetId] = useState<string>("new");
  const [sprintNumber, setSprintNumber] = useState<number>(1);
  const [sprintGoal, setSprintGoal] = useState("");
  const [sprintDays, setSprintDays] = useState<number>(14);
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [teamCapacityHours, setTeamCapacityHours] = useState<number>(80);
  const [planningBusy, setPlanningBusy] = useState(false);

  // Bulk Story Approval state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);

  // Fix 5: Artifact Approval state
  const [approvingArtifactId, setApprovingArtifactId] = useState<string | null>(null);
  const [approvingAllArtifacts, setApprovingAllArtifacts] = useState(false);

  // Fix 5: Conflict Resolution state
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [selectedResolutions, setSelectedResolutions] = useState<{ [id: string]: string }>({});
  const [customResolutionNotes, setCustomResolutionNotes] = useState<{ [id: string]: string }>({});

  // Fix 5: Scrum Plan Finalization state
  const [finalizingPlan, setFinalizingPlan] = useState(false);
  const [finalizationResult, setFinalizationResult] = useState<any | null>(null);

  // Load entire planning workspace state
  const loadPlanData = useCallback(async () => {
    try {
      const res = await fetchScrumPlan(teamId, token);
      setData(res);

      const nextSprintNum = (res.sprints?.length || 0) + 1;
      setSprintNumber(nextSprintNum);

      // Default sub-section routing
      if (!res.artifacts?.length && !res.suggestions?.length && !res.backlog?.length) {
        setActiveSubSection("artifacts");
      }
    } catch (err: any) {
      toast(err.message || "Failed to load Scrum plan", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, token, toast]);

  useEffect(() => {
    loadPlanData();
  }, [loadPlanData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPlanData();
  };

  const resolvedProjectId = projectId || data?.project?._id || teamId;
  const artifacts = data?.artifacts || [];
  const analysis = data?.analysis || data?.planLifecycle?.analysis || {};
  const suggestions = data?.suggestions || data?.planLifecycle?.suggestions || [];
  const conflicts = data?.conflicts || data?.planLifecycle?.conflicts || [];
  const readiness = data?.readiness || null;
  const planLifecycle = data?.planLifecycle || {};
  const isPlanFinalized = planLifecycle?.status === "PLAN_FINALIZED";
  const backlog = data?.backlog || [];
  const sprints = data?.sprints || [];

  const planningSprints = useMemo(() => {
    return sprints.filter((sp: any) => sp.status === "PLANNING");
  }, [sprints]);

  const eligibleBacklogStories = useMemo(() => {
    return backlog.filter((b: any) => !b.sprintId || b.sprintId === selectedSprintTargetId);
  }, [backlog, selectedSprintTargetId]);

  // Filtered artifacts
  const filteredArtifacts = useMemo(() => {
    if (!artifactSearch.trim()) return artifacts;
    const q = artifactSearch.toLowerCase();
    return artifacts.filter((a: any) =>
      (a.name || "").toLowerCase().includes(q) ||
      (a.artifactType || "").toLowerCase().includes(q)
    );
  }, [artifacts, artifactSearch]);

  // Filtered backlog
  const filteredBacklog = useMemo(() => {
    return backlog.filter((b: any) => {
      if (priorityFilter !== "all") {
        const p = (b.priorityLabel || "medium").toLowerCase();
        if (p !== priorityFilter.toLowerCase()) return false;
      }
      if (backlogSearch.trim()) {
        const q = backlogSearch.toLowerCase();
        const matchesTitle = (b.title || "").toLowerCase().includes(q);
        const matchesStory = (b.userStory || "").toLowerCase().includes(q);
        const matchesDesc = (b.description || "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesStory && !matchesDesc) return false;
      }
      return true;
    });
  }, [backlog, priorityFilter, backlogSearch]);

  // Draft suggestions vs Approved
  const draftSuggestions = useMemo(() => {
    return suggestions.filter((s: any) => s.status === "draft");
  }, [suggestions]);

  const approvedSuggestions = useMemo(() => {
    return suggestions.filter((s: any) => s.status === "approved");
  }, [suggestions]);

  // ── Handler: Upload Artifact ────────────────────────────────────────────────
  const handleSaveArtifact = async () => {
    if (artifactSaving) return;
    if (!artifactName.trim()) {
      toast("Document title is required", "error");
      return;
    }
    if (!artifactContent.trim()) {
      toast("Document content cannot be empty", "error");
      return;
    }

    setArtifactSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/artifacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: artifactName.trim(),
          artifactType,
          scope: artifactScope,
          content: artifactContent.trim(),
          summary: `Uploaded ${artifactName.trim()} for Scrum sprint planning`,
        }),
      });

      if (res.ok) {
        toast("Project document uploaded to Knowledge Base", "success");
        setShowArtifactModal(false);
        setArtifactName("");
        setArtifactContent("");
        loadPlanData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast(err.error || "Failed to save document", "error");
      }
    } catch (err: any) {
      toast(err.message || "Upload network failure", "error");
    } finally {
      setArtifactSaving(false);
    }
  };

  // ── Handler: Delete Artifact ────────────────────────────────────────────────
  const handleDeleteArtifact = async (artifactId: string, artName: string) => {
    const ok = await confirm({
      title: "Delete Document",
      message: `Are you sure you want to remove "${artName}" from the project knowledge base?`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/artifacts/${artifactId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast("Document removed", "info");
        loadPlanData();
      } else {
        toast("Failed to delete document", "error");
      }
    } catch (err: any) {
      toast(err.message || "Network error deleting artifact", "error");
    }
  };

  // ── Fix 5: Approve Individual Artifact ──────────────────────────────────────
  const handleApproveArtifact = async (artId: string, artName: string) => {
    if (approvingArtifactId) return;
    setApprovingArtifactId(artId);
    try {
      await approveArtifact(resolvedProjectId, artId, token);
      toast(`Artifact "${artName}" approved`, "success");
      await loadPlanData();
    } catch (err: any) {
      toast(err.message || "Failed to approve artifact", "error");
    } finally {
      setApprovingArtifactId(null);
    }
  };

  // ── Fix 5: Bulk Approve All Artifacts ───────────────────────────────────────
  const handleApproveAllArtifacts = async () => {
    const unapproved = artifacts.filter((a: any) => a.approvalStatus !== "approved");
    if (unapproved.length === 0) {
      toast("All artifacts are already approved", "info");
      return;
    }

    const ok = await confirm({
      title: "Approve All Artifacts",
      message: `Approve all ${unapproved.length} project artifact(s)? This authorizes them as verified planning sources.`,
      confirmText: "Approve All",
    });
    if (!ok) return;

    setApprovingAllArtifacts(true);
    try {
      await approveAllArtifacts(resolvedProjectId, token);
      toast(`All ${unapproved.length} artifacts approved`, "success");
      await loadPlanData();
    } catch (err: any) {
      toast(err.message || "Failed to approve all artifacts", "error");
    } finally {
      setApprovingAllArtifacts(false);
    }
  };

  // ── Fix 5: Resolve Scope Contradiction / Conflict ───────────────────────────
  const handleResolveConflict = async (conflict: any) => {
    const chosen = selectedResolutions[conflict.id];
    const note = customResolutionNotes[conflict.id] || "";
    const resolution = chosen || note;

    if (!resolution || !resolution.trim()) {
      toast("Please select an authoritative interpretation or enter a custom rationale", "error");
      return;
    }

    setResolvingConflictId(conflict.id);
    try {
      await resolveScrumConflict(
        teamId,
        conflict.id,
        resolution.trim(),
        note.trim(),
        chosen ? "decision_selection" : "custom_rationale",
        token
      );
      toast(`Conflict "${conflict.title}" resolved`, "success");
      await loadPlanData();
    } catch (err: any) {
      toast(err.message || "Failed to resolve conflict", "error");
    } finally {
      setResolvingConflictId(null);
    }
  };

  // ── Fix 5: Finalize Scrum Plan ──────────────────────────────────────────────
  const handleFinalizePlan = async () => {
    if (finalizingPlan) return;

    if (readiness && !readiness.isReady) {
      toast(`Cannot finalize: ${readiness.blockers?.[0] || "Prerequisites not met"}`, "error");
      return;
    }

    const ok = await confirm({
      title: "Finalize Scrum Plan & Enable Workspace",
      message: `Finalize the initial Scrum plan with ${backlog.length} official Product Backlog stories? This marks the initial planning gate as completed and unlocks operational workspace features.`,
      confirmText: "Finalize Plan",
    });
    if (!ok) return;

    setFinalizingPlan(true);
    try {
      const res = await finalizeScrumPlan(teamId, token);
      setFinalizationResult(res);
      toast(res.message || "Scrum plan finalized successfully! Workspace operational features unlocked.", "success");
      await loadPlanData();
    } catch (err: any) {
      toast(err.message || "Plan finalization failed", "error");
    } finally {
      setFinalizingPlan(false);
    }
  };

  // ── Handler: Run AI Analysis ────────────────────────────────────────────────
  const handleRunAnalysis = async () => {
    setAnalyzing(true);
    try {
      const res = await analyzeScrumPlan(teamId, token);
      toast("AI Project analysis complete!", "success");
      loadPlanData();
      setActiveSubSection("analysis");
    } catch (err: any) {
      toast(err.message || "AI Analysis failed", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Handler: Generate Scrum Story Suggestions ───────────────────────────────
  const handleGenerateStories = async () => {
    setGenerating(true);
    try {
      const res = await generateScrumPlan(teamId, token);
      const msg =
        res.message ||
        (res.newCount > 0
          ? `Generated ${res.newCount} new story suggestions!`
          : "No additional unique stories were found. Your current backlog already covers the analyzed requirements.");
      toast(msg, res.newCount === 0 ? "info" : "success");
      await loadPlanData();
      setActiveSubSection("suggestions");
    } catch (err: any) {
      toast(err.message || "Story generation failed", "error");
    } finally {
      setGenerating(false);
    }
  };

  // ── Handler: Approve Suggestion ─────────────────────────────────────────────
  const handleApprove = async (suggestion: any) => {
    setActionInProgress(suggestion.suggestionId);
    try {
      const res = await approveStorySuggestion(teamId, suggestion.suggestionId, null, token);
      toast(res.message || `Story "${suggestion.title}" approved to Product Backlog`, "success");
      await loadPlanData();
    } catch (err: any) {
      toast(err.message || "Approval failed", "error");
    } finally {
      setActionInProgress(null);
    }
  };

  // ── Handler: Bulk Approve All Eligible Suggestions ────────────────────────
  const handleConfirmBulkApprove = async () => {
    if (bulkApproving || draftSuggestions.length === 0) return;
    setBulkApproving(true);
    try {
      const res = await bulkApproveStorySuggestions(teamId, null, token);
      setShowBulkModal(false);
      toast(
        res.message || `Successfully approved ${res.approvedCount || draftSuggestions.length} stories to Product Backlog!`,
        "success"
      );
      if (res.failedCount > 0) {
        toast(`${res.failedCount} story suggestion(s) failed server validation.`, "info");
      }
      await loadPlanData();
    } catch (err: any) {
      toast(err.message || "Bulk story approval failed", "error");
    } finally {
      setBulkApproving(false);
    }
  };

  // ── Handler: Reject Suggestion ─────────────────────────────────────────────
  const handleReject = async (suggestion: any) => {
    const ok = await confirm({
      title: "Reject Story Suggestion",
      message: `Reject "${suggestion.title}"? It will not enter the Product Backlog.`,
      confirmText: "Reject",
      destructive: true,
    });
    if (!ok) return;

    setActionInProgress(suggestion.suggestionId);
    try {
      await rejectStorySuggestion(teamId, suggestion.suggestionId, "Rejected by PO in review", token);
      toast("Suggestion rejected", "info");
      await loadPlanData();
    } catch (err: any) {
      toast(err.message || "Rejection failed", "error");
    } finally {
      setActionInProgress(null);
    }
  };

  // ── Handler: Edit & Approve Suggestion ──────────────────────────────────────
  const handleOpenEditSuggestion = (s: any) => {
    setEditingSuggestion(s);
    setEditTitle(s.title || "");
    setEditRole(s.role || "user");
    setEditWant(s.want || "");
    setEditBenefit(s.benefit || "");
    setEditDescription(s.description || "");
    setEditPoints(String(s.suggestedStoryPoints || 3));
    setEditHours(String(s.estimatedHours || 8));
    setEditPriority(s.suggestedPriority || "medium");
    setEditCriteria(Array.isArray(s.acceptanceCriteria) ? s.acceptanceCriteria.join("\n") : "");
  };

  const handleSaveEditedSuggestion = async (approveImmediately: boolean = false) => {
    if (!editingSuggestion) return;
    if (!editTitle.trim()) {
      toast("Title cannot be empty", "error");
      return;
    }

    const payload = {
      title: editTitle.trim(),
      role: editRole.trim(),
      want: editWant.trim(),
      benefit: editBenefit.trim(),
      userStory: `As a ${editRole.trim()}, I want ${editWant.trim() || editTitle.trim()}, so that ${editBenefit.trim() || "the project delivers value"}`,
      description: editDescription.trim(),
      suggestedStoryPoints: parseInt(editPoints) || 3,
      estimatedHours: parseFloat(editHours) || 8,
      suggestedPriority: editPriority,
      acceptanceCriteria: editCriteria
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean),
    };

    setActionInProgress(editingSuggestion.suggestionId);
    try {
      if (approveImmediately) {
        await approveStorySuggestion(teamId, editingSuggestion.suggestionId, payload, token);
        toast(`Story approved & committed to backlog!`, "success");
      } else {
        await updateDraftSuggestion(teamId, editingSuggestion.suggestionId, payload, token);
        toast("Draft suggestion updated", "success");
      }
      setEditingSuggestion(null);
      await loadPlanData();
    } catch (err: any) {
      toast(err.message || "Failed to update suggestion", "error");
    } finally {
      setActionInProgress(null);
    }
  };

  // ── Handler: Manual Story Creation ──────────────────────────────────────────
  const handleCreateManualStory = async () => {
    if (!newStoryTitle.trim()) {
      toast("Story title is required", "error");
      return;
    }
    setCreateBusy(true);
    try {
      const criteriaList = newStoryCriteria
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean);

      await createBacklogItem(
        teamId,
        {
          title: newStoryTitle.trim(),
          role: newStoryRole.trim() || "user",
          want: newStoryWant.trim() || newStoryTitle.trim(),
          benefit: newStoryBenefit.trim() || "it benefits the product",
          userStory: `As a ${newStoryRole.trim() || "user"}, I want ${newStoryWant.trim() || newStoryTitle.trim()}, so that ${newStoryBenefit.trim() || "it benefits the product"}`,
          storyPoints: parseInt(newStoryPoints) || 3,
          estimatedHours: parseFloat(newStoryHours) || 8,
          priorityLabel: newStoryPriority,
          acceptanceCriteria: criteriaList,
          source: "manual",
        },
        token
      );
      toast("Official User Story created in Product Backlog", "success");
      setShowAddStoryModal(false);
      setNewStoryTitle("");
      setNewStoryWant("");
      setNewStoryBenefit("");
      setNewStoryCriteria("");
      loadPlanData();
    } catch (err: any) {
      toast(err.message || "Failed to create story", "error");
    } finally {
      setCreateBusy(false);
    }
  };

  // ── Handler: Sprint Planning Commitment ─────────────────────────────────────
  const handleCommitSprint = async () => {
    if (!selectedStoryIds.length) {
      toast("Please select at least one Product Backlog story for the sprint", "error");
      return;
    }
    if (planningBusy) return;
    setPlanningBusy(true);
    try {
      const isExisting = selectedSprintTargetId !== "new" && !!selectedSprintTargetId;
      const targetSprint = isExisting ? sprints.find((s: any) => s._id === selectedSprintTargetId) : null;
      await commitSprintPlan(
        teamId,
        {
          sprintId: isExisting ? selectedSprintTargetId : undefined,
          name: isExisting && targetSprint?.name ? targetSprint.name : `Sprint ${String(sprintNumber).padStart(2, "0")}`,
          sprintGoal: sprintGoal.trim() || targetSprint?.goal || "Sprint Increment Delivery",
          durationDays: sprintDays,
          committedTaskIds: selectedStoryIds,
          capacityHours: teamCapacityHours,
        },
        token
      );
      toast(
        isExisting
          ? `Successfully committed ${selectedStoryIds.length} stories to ${targetSprint?.name || "Sprint"}!`
          : `Sprint ${sprintNumber} committed successfully with ${selectedStoryIds.length} stories!`,
        "success"
      );
      setShowSprintModal(false);
      setSelectedStoryIds([]);
      await loadPlanData();
      if (onNavigateToTasks) {
        onNavigateToTasks();
      }
    } catch (err: any) {
      toast(err.message || "Failed to commit sprint", "error");
    } finally {
      setPlanningBusy(false);
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

  // Calculate proposed workload for sprint planning
  const selectedStories = backlog.filter((b: any) => selectedStoryIds.includes(b._id));
  const proposedPoints = selectedStories.reduce((acc: number, s: any) => acc + (s.storyPoints || 3), 0);
  const proposedHours = selectedStories.reduce((acc: number, s: any) => acc + (s.estimatedHours || 8), 0);
  const isOverCapacity = proposedHours > teamCapacityHours;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── Sub-Section Segmented Navigation ───────────────────────────────── */}
      <View style={s.subNavBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.subNavList}>
          <Pressable
            onPress={() => setActiveSubSection("artifacts")}
            style={[s.subNavItem, activeSubSection === "artifacts" && s.subNavItemActive]}
          >
            <Ionicons
              name="folder-open-outline"
              size={14}
              color={activeSubSection === "artifacts" ? "#4F46E5" : colors.textMuted}
            />
            <Text style={[s.subNavTxt, activeSubSection === "artifacts" && s.subNavTxtActive]}>
              A. Artifacts ({artifacts.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveSubSection("analysis")}
            style={[s.subNavItem, activeSubSection === "analysis" && s.subNavItemActive]}
          >
            <Ionicons
              name="sparkles-outline"
              size={14}
              color={activeSubSection === "analysis" ? "#4F46E5" : colors.textMuted}
            />
            <Text style={[s.subNavTxt, activeSubSection === "analysis" && s.subNavTxtActive]}>
              B. AI Analysis {analysis.purpose ? "✓" : ""}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveSubSection("suggestions")}
            style={[s.subNavItem, activeSubSection === "suggestions" && s.subNavItemActive]}
          >
            <Ionicons
              name="git-pull-request-outline"
              size={14}
              color={activeSubSection === "suggestions" ? "#4F46E5" : colors.textMuted}
            />
            <Text style={[s.subNavTxt, activeSubSection === "suggestions" && s.subNavTxtActive]}>
              C. Story Review ({draftSuggestions.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveSubSection("backlog")}
            style={[s.subNavItem, activeSubSection === "backlog" && s.subNavItemActive]}
          >
            <Ionicons
              name="list-circle-outline"
              size={14}
              color={activeSubSection === "backlog" ? "#4F46E5" : colors.textMuted}
            />
            <Text style={[s.subNavTxt, activeSubSection === "backlog" && s.subNavTxtActive]}>
              D. Product Backlog ({backlog.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveSubSection("readiness")}
            style={[s.subNavItem, activeSubSection === "readiness" && s.subNavItemActive]}
          >
            <Ionicons
              name={isPlanFinalized ? "shield-checkmark" : "shield-outline"}
              size={14}
              color={activeSubSection === "readiness" ? (isPlanFinalized ? "#059669" : "#4F46E5") : (isPlanFinalized ? "#059669" : colors.textMuted)}
            />
            <Text style={[s.subNavTxt, activeSubSection === "readiness" && s.subNavTxtActive]}>
              E. Readiness & Finalize {isPlanFinalized ? "✓" : (readiness?.isReady ? "•" : "")}
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION A: PROJECT ARTIFACTS & KNOWLEDGE BASE                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeSubSection === "artifacts" && (
        <View style={s.sectionCard}>
          <View style={s.sectionHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={s.sectionTitle}>Project Artifacts & Knowledge Base</Text>
                <Badge label={`${artifacts.length} Documents`} variant="primary" />
              </View>
              <Text style={s.sectionDesc}>
                Upload SRS proposals, architecture diagrams, user personas, or README files. Reviewed and approved documents become authorized source material for Scrum backlog planning.
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {artifacts.some((a: any) => a.approvalStatus !== "approved") && (
                <Button
                  title={approvingAllArtifacts ? "Approving All..." : "Approve All Artifacts"}
                  icon="checkmark-done"
                  size="sm"
                  variant="outline"
                  disabled={approvingAllArtifacts}
                  onPress={handleApproveAllArtifacts}
                />
              )}
              <Button
                title="Upload Document"
                icon="cloud-upload"
                size="sm"
                onPress={() => setShowArtifactModal(true)}
              />
            </View>
          </View>

          {/* Search bar */}
          {artifacts.length > 0 && (
            <View style={s.searchRow}>
              <Ionicons name="search" size={15} color={colors.textMuted} />
              <TextInput
                value={artifactSearch}
                onChangeText={setArtifactSearch}
                placeholder="Search documents by name or format..."
                placeholderTextColor={colors.textFaint}
                style={s.searchInput}
              />
            </View>
          )}

          {/* Artifact List */}
          {artifacts.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="document-text-outline" size={32} color={colors.textMuted} />
              <Text style={s.emptyTitle}>No project artifacts uploaded yet</Text>
              <Text style={s.emptyDesc}>
                Uploading documents is recommended for automated AI story extraction, but not required. You can also create user stories manually.
              </Text>
              <Button
                title="Upload First Document"
                icon="cloud-upload"
                onPress={() => setShowArtifactModal(true)}
                style={{ marginTop: spacing.sm }}
              />
            </View>
          ) : (
            <View style={s.artifactGrid}>
              {filteredArtifacts.map((art: any) => {
                const isApproved = art.approvalStatus === "approved";
                const isApproving = approvingArtifactId === art._id;

                return (
                  <View key={art._id} style={s.artifactCard}>
                    <View style={s.artifactCardTop}>
                      <View style={s.artIconCircle}>
                        <Ionicons
                          name={
                            art.artifactType === "srs"
                              ? "book"
                              : art.artifactType === "diagram"
                              ? "image"
                              : "document-text"
                          }
                          size={18}
                          color="#4F46E5"
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.artName} numberOfLines={1}>{art.name}</Text>
                        <Text style={s.artMeta}>
                          {art.artifactType?.toUpperCase()} · {Math.round((art.fileSize || 0) / 1024)} KB · {new Date(art.uploadedAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <Badge
                        label={isApproved ? "Approved" : "Pending Review"}
                        variant={isApproved ? "success" : "warning"}
                      />
                    </View>

                    {!!art.summary && (
                      <Text style={s.artSummary} numberOfLines={2}>{art.summary}</Text>
                    )}

                    {isApproved && !!art.approvedByName && (
                      <Text style={{ fontSize: 10, color: "#059669", marginTop: 2 }}>
                        ✓ Approved by {art.approvedByName}
                      </Text>
                    )}

                    <View style={s.artActions}>
                      {!isApproved && (
                        <Pressable
                          onPress={() => handleApproveArtifact(art._id, art.name)}
                          disabled={isApproving}
                          style={[s.artActionBtn, { borderColor: "#BBF7D0", backgroundColor: "#F0FDF4" }]}
                        >
                          <Ionicons name="checkmark-circle-outline" size={13} color="#16A34A" />
                          <Text style={[s.artActionTxt, { color: "#16A34A" }]}>
                            {isApproving ? "Approving..." : "Approve Source"}
                          </Text>
                        </Pressable>
                      )}
                      <Pressable onPress={() => setViewingArtifact(art)} style={s.artActionBtn}>
                        <Ionicons name="eye-outline" size={13} color="#4F46E5" />
                        <Text style={s.artActionTxt}>View Content</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeleteArtifact(art._id, art.name)}
                        style={[s.artActionBtn, { borderColor: "#FEE2E2" }]}
                      >
                        <Ionicons name="trash-outline" size={13} color="#DC2626" />
                        <Text style={[s.artActionTxt, { color: "#DC2626" }]}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Quick AI Trigger Banner */}
          <View style={s.aiTriggerCard}>
            <View style={{ flex: 1 }}>
              <Text style={s.aiTriggerTitle}>Ready to extract project requirements?</Text>
              <Text style={s.aiTriggerDesc}>
                Run deterministic OmniRoute analysis across {artifacts.length} document(s) to discover user roles, functional boundaries, and candidate stories.
              </Text>
            </View>
            <Button
              title={analyzing ? "Analyzing..." : "Analyze Project"}
              icon="sparkles"
              disabled={analyzing}
              onPress={handleRunAnalysis}
            />
          </View>
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION B: AI PROJECT ANALYSIS                                      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeSubSection === "analysis" && (
        <View style={s.sectionCard}>
          <View style={s.sectionHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={s.sectionTitle}>AI Project Scope & Requirement Analysis</Text>
                <Badge label={analysis.model || "OmniRoute-ZeroCost"} variant="success" />
              </View>
              <Text style={s.sectionDesc}>
                Source-grounded analysis of project purpose, stakeholders, functional constraints, and open questions.
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button
                title={analyzing ? "Analyzing..." : "Refresh Analysis"}
                icon="refresh"
                size="sm"
                variant="outline"
                disabled={analyzing}
                onPress={handleRunAnalysis}
              />
              <Button
                title={generating ? "Generating..." : "Generate Scrum Plan"}
                icon="sparkles"
                size="sm"
                disabled={generating}
                onPress={handleGenerateStories}
              />
            </View>
          </View>

          {!analysis.purpose ? (
            <View style={s.emptyBox}>
              <Ionicons name="sparkles-outline" size={32} color="#4F46E5" />
              <Text style={s.emptyTitle}>Project has not been analyzed yet</Text>
              <Text style={s.emptyDesc}>
                Execute AI analysis to automatically extract functional requirements, user personas, and technical boundaries from your documentation.
              </Text>
              <Button
                title={analyzing ? "Analyzing..." : "Analyze Project Now"}
                icon="sparkles"
                disabled={analyzing}
                onPress={handleRunAnalysis}
                style={{ marginTop: spacing.sm }}
              />
            </View>
          ) : (
            <View style={s.analysisContent}>
              {/* Purpose */}
              <View style={s.analysisBlock}>
                <Text style={s.blockHeading}>Core Purpose & Vision</Text>
                <Text style={s.blockBody}>{analysis.purpose}</Text>
              </View>

              {/* Target Users */}
              {analysis.targetUsers?.length > 0 && (
                <View style={s.analysisBlock}>
                  <Text style={s.blockHeading}>Stakeholders & User Personas</Text>
                  <View style={s.tagRow}>
                    {analysis.targetUsers.map((u: string, idx: number) => (
                      <View key={idx} style={s.personaPill}>
                        <Ionicons name="person-outline" size={12} color="#4F46E5" />
                        <Text style={s.personaPillTxt}>{u}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Functional Requirements */}
              {analysis.functionalRequirements?.length > 0 && (
                <View style={s.analysisBlock}>
                  <Text style={s.blockHeading}>Identified Functional Capabilities</Text>
                  {analysis.functionalRequirements.map((r: string, idx: number) => (
                    <View key={idx} style={s.reqListItem}>
                      <Ionicons name="checkmark-circle" size={15} color="#059669" />
                      <Text style={s.reqListTxt}>{r}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Technical Constraints & Non-Functional */}
              {analysis.technicalConstraints?.length > 0 && (
                <View style={s.analysisBlock}>
                  <Text style={s.blockHeading}>Technical Constraints & Policies</Text>
                  {analysis.technicalConstraints.map((c: string, idx: number) => (
                    <View key={idx} style={s.reqListItem}>
                      <Ionicons name="shield-checkmark-outline" size={15} color="#D97706" />
                      <Text style={s.reqListTxt}>{c}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Unresolved Questions */}
              {analysis.unresolvedQuestions?.length > 0 && (
                <View style={[s.analysisBlock, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
                  <Text style={[s.blockHeading, { color: "#991B1B" }]}>Unresolved Questions & Assumptions</Text>
                  {analysis.unresolvedQuestions.map((q: string, idx: number) => (
                    <View key={idx} style={s.reqListItem}>
                      <Ionicons name="help-circle-outline" size={15} color="#DC2626" />
                      <Text style={[s.reqListTxt, { color: "#7F1D1D" }]}>{q}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Fix 5: Material Scope Contradictions & Conflict Resolution */}
              <View style={[s.analysisBlock, conflicts.some((c: any) => c.status === "unresolved") ? { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" } : {}]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons
                      name={conflicts.some((c: any) => c.status === "unresolved") ? "alert-circle" : "shield-checkmark"}
                      size={18}
                      color={conflicts.some((c: any) => c.status === "unresolved") ? "#D97706" : "#059669"}
                    />
                    <Text style={s.blockHeading}>
                      Scope Contradictions & Conflict Resolution ({conflicts.length})
                    </Text>
                  </View>
                  <Badge
                    label={
                      conflicts.length === 0
                        ? "Zero Contradictions"
                        : conflicts.filter((c: any) => c.status === "unresolved").length === 0
                        ? "All Resolved"
                        : `${conflicts.filter((c: any) => c.status === "unresolved").length} Unresolved`
                    }
                    variant={
                      conflicts.filter((c: any) => c.status === "unresolved").length === 0 ? "success" : "warning"
                    }
                  />
                </View>

                {conflicts.length === 0 ? (
                  <View style={{ paddingVertical: 8 }}>
                    <Text style={{ fontSize: 13, color: "#059669", fontWeight: "600" }}>
                      ✓ All uploaded source materials and project definitions are mutually consistent. No scope contradictions detected.
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 12, marginTop: 6 }}>
                    {conflicts.map((conflict: any) => {
                      const isResolved = conflict.status === "resolved";
                      const isResolving = resolvingConflictId === conflict.id;
                      const selectedOpt = selectedResolutions[conflict.id];

                      return (
                        <View
                          key={conflict.id}
                          style={{
                            backgroundColor: colors.surface,
                            borderRadius: radius.md,
                            borderWidth: 1,
                            borderColor: isResolved ? "#BBF7D0" : "#FDE68A",
                            padding: 12,
                            gap: 8,
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                              <Badge label={conflict.id} variant="neutral" />
                              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text, flex: 1 }}>
                                {conflict.title}
                              </Text>
                            </View>
                            <Badge
                              label={isResolved ? "Resolved" : "Unresolved Contradiction"}
                              variant={isResolved ? "success" : "danger"}
                            />
                          </View>

                          {!!conflict.reason && (
                            <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 17 }}>
                              {conflict.reason}
                            </Text>
                          )}

                          {/* Source Comparison */}
                          <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                            <View
                              style={{
                                flex: 1,
                                backgroundColor: selectedOpt === conflict.statementA ? "#EEF2FF" : colors.surfaceAlt,
                                borderWidth: 1,
                                borderColor: selectedOpt === conflict.statementA ? "#4F46E5" : colors.border,
                                borderRadius: radius.sm,
                                padding: 8,
                              }}
                            >
                              <Text style={{ fontSize: 10, fontWeight: "700", color: "#4F46E5", textTransform: "uppercase" }}>
                                {conflict.sourceA || "Source A"}
                              </Text>
                              <Text style={{ fontSize: 12, color: colors.text, marginTop: 4, lineHeight: 16 }}>
                                "{conflict.statementA}"
                              </Text>
                              {!isResolved && (
                                <Pressable
                                  onPress={() =>
                                    setSelectedResolutions((prev) => ({ ...prev, [conflict.id]: conflict.statementA }))
                                  }
                                  style={{
                                    marginTop: 8,
                                    paddingVertical: 4,
                                    paddingHorizontal: 8,
                                    borderRadius: radius.xs,
                                    backgroundColor: selectedOpt === conflict.statementA ? "#4F46E5" : colors.surface,
                                    borderWidth: 1,
                                    borderColor: "#4F46E5",
                                    alignItems: "center",
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      fontWeight: "600",
                                      color: selectedOpt === conflict.statementA ? "#FFFFFF" : "#4F46E5",
                                    }}
                                  >
                                    Adopt Source A
                                  </Text>
                                </Pressable>
                              )}
                            </View>

                            <View
                              style={{
                                flex: 1,
                                backgroundColor: selectedOpt === conflict.statementB ? "#EEF2FF" : colors.surfaceAlt,
                                borderWidth: 1,
                                borderColor: selectedOpt === conflict.statementB ? "#4F46E5" : colors.border,
                                borderRadius: radius.sm,
                                padding: 8,
                              }}
                            >
                              <Text style={{ fontSize: 10, fontWeight: "700", color: "#D97706", textTransform: "uppercase" }}>
                                {conflict.sourceB || "Source B"}
                              </Text>
                              <Text style={{ fontSize: 12, color: colors.text, marginTop: 4, lineHeight: 16 }}>
                                "{conflict.statementB}"
                              </Text>
                              {!isResolved && (
                                <Pressable
                                  onPress={() =>
                                    setSelectedResolutions((prev) => ({ ...prev, [conflict.id]: conflict.statementB }))
                                  }
                                  style={{
                                    marginTop: 8,
                                    paddingVertical: 4,
                                    paddingHorizontal: 8,
                                    borderRadius: radius.xs,
                                    backgroundColor: selectedOpt === conflict.statementB ? "#4F46E5" : colors.surface,
                                    borderWidth: 1,
                                    borderColor: "#4F46E5",
                                    alignItems: "center",
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      fontWeight: "600",
                                      color: selectedOpt === conflict.statementB ? "#FFFFFF" : "#4F46E5",
                                    }}
                                  >
                                    Adopt Source B
                                  </Text>
                                </Pressable>
                              )}
                            </View>
                          </View>

                          {/* Resolution Status or Custom Note Input */}
                          {isResolved ? (
                            <View
                              style={{
                                backgroundColor: "#F0FDF4",
                                borderWidth: 1,
                                borderColor: "#DCFCE7",
                                borderRadius: radius.sm,
                                padding: 8,
                                marginTop: 4,
                              }}
                            >
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                                <Text style={{ fontSize: 12, fontWeight: "700", color: "#166534" }}>
                                  Decision: {conflict.selectedResolution}
                                </Text>
                              </View>
                              {!!conflict.resolutionNote && (
                                <Text style={{ fontSize: 11, color: "#15803D", marginTop: 2 }}>
                                  Rationale: {conflict.resolutionNote}
                                </Text>
                              )}
                              <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 4 }}>
                                Resolved by {conflict.resolvedByName || "Authorized Lead"} on{" "}
                                {conflict.resolvedAt ? new Date(conflict.resolvedAt).toLocaleDateString() : "recent revision"}
                              </Text>
                            </View>
                          ) : (
                            <View style={{ gap: 6, marginTop: 6 }}>
                              <TextInput
                                placeholder="Or document custom authoritative rationale / resolution..."
                                placeholderTextColor={colors.textFaint}
                                value={customResolutionNotes[conflict.id] || ""}
                                onChangeText={(val) =>
                                  setCustomResolutionNotes((prev) => ({ ...prev, [conflict.id]: val }))
                                }
                                style={{
                                  backgroundColor: colors.surfaceAlt,
                                  borderRadius: radius.sm,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                  padding: 8,
                                  fontSize: 12,
                                  color: colors.text,
                                }}
                              />
                              <Button
                                title={isResolving ? "Saving Resolution..." : "Confirm & Save Resolution"}
                                icon="checkmark-circle"
                                size="sm"
                                disabled={isResolving || (!selectedOpt && !customResolutionNotes[conflict.id]?.trim())}
                                onPress={() => handleResolveConflict(conflict)}
                              />
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION C: AI STORY SUGGESTIONS & REVIEW WORKFLOW                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeSubSection === "suggestions" && (
        <View style={s.sectionCard}>
          <View style={s.sectionHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={s.sectionTitle}>AI User Story Suggestions & Review</Text>
                <Badge label={`${draftSuggestions.length} Pending Review`} variant="warning" />
              </View>
              <Text style={s.sectionDesc}>
                Review, edit, and approve AI-generated user stories before they enter the official Product Backlog. Server-side validation guarantees zero duplicates.
              </Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {draftSuggestions.length > 0 && (
                <Button
                  title={`Approve All ${draftSuggestions.length} Eligible Stories`}
                  icon="checkmark-done-circle"
                  variant="primary"
                  size="sm"
                  disabled={bulkApproving || generating}
                  loading={bulkApproving}
                  onPress={() => setShowBulkModal(true)}
                />
              )}
              <Button
                title={generating ? "Generating..." : "Generate More Stories"}
                icon="sparkles"
                variant="outline"
                size="sm"
                disabled={generating || bulkApproving}
                onPress={handleGenerateStories}
              />
            </View>
          </View>

          {draftSuggestions.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="git-pull-request-outline" size={32} color={colors.textMuted} />
              <Text style={s.emptyTitle}>No pending story suggestions to review</Text>
              <Text style={s.emptyDesc}>
                {approvedSuggestions.length > 0
                  ? `All ${approvedSuggestions.length} generated suggestions have been approved to the official Product Backlog!`
                  : "Click 'Generate Scrum Plan' to produce candidate INVEST user stories from your project documentation."}
              </Text>
              <Button
                title={generating ? "Generating..." : "Generate Scrum Plan"}
                icon="sparkles"
                disabled={generating}
                onPress={handleGenerateStories}
                style={{ marginTop: spacing.sm }}
              />
            </View>
          ) : (
            <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
              {draftSuggestions.map((sug: any) => {
                const isBusy = actionInProgress === sug.suggestionId;
                return (
                  <View key={sug.suggestionId} style={s.suggestionCard}>
                    <View style={s.sugTop}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <Badge label={sug.epic || "Core Features"} variant="primary" />
                          <Badge
                            label={`${sug.suggestedPriority?.toUpperCase()} PRIORITY`}
                            variant={sug.suggestedPriority === "critical" ? "danger" : "warning"}
                          />
                          <Badge label={`${sug.suggestedStoryPoints || 3} PTS`} variant="info" />
                          <Badge label={`~${sug.estimatedHours || 8}h`} variant="default" />
                        </View>
                        <Text style={s.sugTitle}>{sug.title}</Text>
                      </View>
                    </View>

                    {/* Standard User Story format */}
                    <View style={s.userStoryBox}>
                      <Text style={s.userStoryTxt}>
                        {sug.userStory || `As a ${sug.role || "user"}, I want ${sug.want || sug.title}, so that ${sug.benefit || "it delivers value"}`}
                      </Text>
                    </View>

                    {/* Acceptance criteria */}
                    {sug.acceptanceCriteria?.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={s.criteriaHead}>Acceptance Criteria (Definition of Done):</Text>
                        {sug.acceptanceCriteria.map((c: string, idx: number) => (
                          <View key={idx} style={s.criteriaItem}>
                            <Ionicons name="radio-button-on" size={12} color="#4F46E5" />
                            <Text style={s.criteriaTxt}>{c}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Actions */}
                    <View style={s.sugActions}>
                      <Pressable
                        onPress={() => handleOpenEditSuggestion(sug)}
                        disabled={isBusy}
                        style={s.sugEditBtn}
                      >
                        <Ionicons name="create-outline" size={14} color={colors.text} />
                        <Text style={s.sugEditTxt}>Edit Story</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => handleReject(sug)}
                        disabled={isBusy}
                        style={s.sugRejectBtn}
                      >
                        <Ionicons name="close-circle-outline" size={14} color="#DC2626" />
                        <Text style={s.sugRejectTxt}>Reject</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => handleApprove(sug)}
                        disabled={isBusy}
                        style={s.sugApproveBtn}
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={14} color="#fff" />
                            <Text style={s.sugApproveTxt}>Approve to Backlog</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION D: OFFICIAL PRODUCT BACKLOG                                 */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeSubSection === "backlog" && (
        <View style={s.sectionCard}>
          <View style={s.sectionHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={s.sectionTitle}>Official Product Backlog</Text>
                <Badge label={`${backlog.length} Stories`} variant="primary" />
                <Badge
                  label={`${backlog.reduce((acc: number, b: any) => acc + (b.storyPoints || 3), 0)} Total Points`}
                  variant="info"
                />
              </View>
              <Text style={s.sectionDesc}>
                Human-approved user stories prioritized by the DAA Priority Engine. Ready to be selected for Sprint Planning.
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button
                title="Add Story"
                icon="add"
                size="sm"
                variant="outline"
                onPress={() => setShowAddStoryModal(true)}
              />
              <Button
                title="Plan Sprint"
                icon="calendar"
                size="sm"
                onPress={() => setShowSprintModal(true)}
              />
            </View>
          </View>

          {/* Search & Filters */}
          <View style={s.filterBar}>
            <View style={s.searchFlex}>
              <Ionicons name="search" size={15} color={colors.textMuted} />
              <TextInput
                value={backlogSearch}
                onChangeText={setBacklogSearch}
                placeholder="Search official backlog stories..."
                placeholderTextColor={colors.textFaint}
                style={s.searchInput}
              />
            </View>

            <View style={s.pillGroup}>
              {["all", "critical", "high", "medium", "low"].map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPriorityFilter(p)}
                  style={[s.filterPill, priorityFilter === p && s.filterPillActive]}
                >
                  <Text style={[s.filterPillTxt, priorityFilter === p && s.filterPillTxtActive]}>
                    {p.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Stories List */}
          {filteredBacklog.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="list" size={32} color={colors.textMuted} />
              <Text style={s.emptyTitle}>Product Backlog is empty</Text>
              <Text style={s.emptyDesc}>
                Generate AI suggestions from your project artifacts or add custom stories manually to populate your Product Backlog.
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.sm }}>
                <Button
                  title="Add Story Manually"
                  icon="add"
                  onPress={() => setShowAddStoryModal(true)}
                />
                <Button
                  title="Generate AI Stories"
                  icon="sparkles"
                  variant="outline"
                  onPress={handleGenerateStories}
                />
              </View>
            </View>
          ) : (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {filteredBacklog.map((story: any) => (
                <View key={story._id} style={s.backlogItemCard}>
                  <View style={s.backlogItemTop}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Badge
                          label={`${story.priorityLabel?.toUpperCase() || "MEDIUM"} PRIORITY`}
                          variant={story.priorityLabel === "critical" ? "danger" : story.priorityLabel === "high" ? "warning" : "default"}
                        />
                        <Badge label={`${story.storyPoints || 3} Story Points`} variant="info" />
                        <Badge label={`~${story.estimatedHours || 8}h`} variant="default" />
                        {story.source === "ai" && (
                          <View style={s.aiBadge}>
                            <Ionicons name="sparkles" size={10} color="#4F46E5" />
                            <Text style={s.aiBadgeTxt}>AI Grounded</Text>
                          </View>
                        )}
                        {story.priorityScore !== undefined && (
                          <View style={s.daaScorePill}>
                            <Text style={s.daaScoreTxt}>DAA: {story.priorityScore}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.backlogItemTitle}>{story.title}</Text>
                      {!!story.userStory && (
                        <Text style={s.backlogItemStory}>{story.userStory}</Text>
                      )}
                    </View>

                    <Pressable
                      onPress={() => setInspectedStory(story)}
                      hitSlop={8}
                      style={s.inspectBtn}
                    >
                      <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
                    </Pressable>
                  </View>

                  {story.acceptanceCriteria?.length > 0 && (
                    <Text style={s.criteriaCount}>
                      {story.acceptanceCriteria.length} acceptance criteria defined
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION E: SCRUM PLAN LIFECYCLE & READINESS                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeSubSection === "readiness" && (
        <View style={s.sectionCard}>
          <View style={s.sectionHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={s.sectionTitle}>Scrum Plan Lifecycle & Readiness</Text>
                <Badge
                  label={
                    isPlanFinalized
                      ? "PLAN FINALIZED"
                      : readiness?.isReady
                      ? "READY TO FINALIZE"
                      : "GATES PENDING"
                  }
                  variant={isPlanFinalized ? "success" : readiness?.isReady ? "primary" : "warning"}
                />
              </View>
              <Text style={s.sectionDesc}>
                Waterfall-style reviewable initialization gate adapted for Scrum. Enforces artifact review, conflict resolution, and backlog existence before enabling operational workspace features.
              </Text>
            </View>
          </View>

          {/* Success Banner if already finalized */}
          {isPlanFinalized && (
            <View
              style={{
                backgroundColor: "#F0FDF4",
                borderWidth: 1,
                borderColor: "#BBF7D0",
                borderRadius: radius.md,
                padding: 16,
                gap: 8,
                marginBottom: 16,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="checkmark-done-circle" size={24} color="#16A34A" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#166534" }}>
                    Initial Scrum Plan Finalized — Workspace Fully Operational
                  </Text>
                  <Text style={{ fontSize: 12, color: "#15803D", marginTop: 2 }}>
                    Plan Revision v{planLifecycle.planRevision || 1} · Finalized by {planLifecycle.finalizedByName || "Authorized Lead"} on{" "}
                    {planLifecycle.finalizedAt ? new Date(planLifecycle.finalizedAt).toLocaleString() : "Recently"} ·{" "}
                    {planLifecycle.finalizedStoryCount || backlog.length} official stories
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <Button
                  title="Plan & Start Sprint"
                  icon="rocket"
                  size="sm"
                  onPress={() => setShowSprintModal(true)}
                />
                {onNavigateToTasks && (
                  <Button
                    title="Open Tasks Board"
                    icon="arrow-forward"
                    size="sm"
                    variant="outline"
                    onPress={onNavigateToTasks}
                  />
                )}
              </View>
            </View>
          )}

          {/* 5-Metric Summary Cards */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {/* Artifacts */}
            <View style={{ flex: 1, minWidth: 120, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 10, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" }}>Artifacts</Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 4 }}>
                {artifacts.filter((a: any) => a.approvalStatus === "approved").length}/{artifacts.length}
              </Text>
              <Text style={{ fontSize: 10, color: artifacts.every((a: any) => a.approvalStatus === "approved") && artifacts.length > 0 ? "#059669" : "#D97706" }}>
                {artifacts.length === 0 ? "No artifacts" : artifacts.every((a: any) => a.approvalStatus === "approved") ? "All approved ✓" : "Approvals pending"}
              </Text>
            </View>

            {/* Analysis */}
            <View style={{ flex: 1, minWidth: 120, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 10, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" }}>AI Analysis</Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 4 }}>
                {analysis.purpose ? `Rev v${planLifecycle.analysisRevision || 1}` : "Pending"}
              </Text>
              <Text style={{ fontSize: 10, color: analysis.purpose ? "#059669" : "#DC2626" }}>
                {analysis.purpose ? "OmniRoute $0 cost ✓" : "Needs analysis"}
              </Text>
            </View>

            {/* Conflicts */}
            <View style={{ flex: 1, minWidth: 120, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 10, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" }}>Contradictions</Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 4 }}>
                {conflicts.filter((c: any) => c.status === "unresolved").length}
              </Text>
              <Text style={{ fontSize: 10, color: conflicts.filter((c: any) => c.status === "unresolved").length === 0 ? "#059669" : "#DC2626" }}>
                {conflicts.filter((c: any) => c.status === "unresolved").length === 0 ? "Resolved ✓" : "Unresolved conflicts"}
              </Text>
            </View>

            {/* Suggestions */}
            <View style={{ flex: 1, minWidth: 120, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 10, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" }}>AI Suggestions</Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 4 }}>
                {draftSuggestions.length} Pending
              </Text>
              <Text style={{ fontSize: 10, color: "#4F46E5" }}>
                {approvedSuggestions.length} Approved subset
              </Text>
            </View>

            {/* Product Backlog */}
            <View style={{ flex: 1, minWidth: 120, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 10, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" }}>Official Backlog</Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 4 }}>
                {backlog.length} Stories
              </Text>
              <Text style={{ fontSize: 10, color: backlog.length >= 1 ? "#059669" : "#DC2626" }}>
                {backlog.length >= 1 ? "Minimum met (>=1) ✓" : "Need >=1 story"}
              </Text>
            </View>
          </View>

          {/* Readiness Checklist */}
          <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10, marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>
              Finalization Prerequisites Checklist
            </Text>

            {/* Gate 1: Methodology */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
              <Text style={{ fontSize: 12, color: colors.text, flex: 1 }}>
                Scrum methodology active & isolated
              </Text>
            </View>

            {/* Gate 2: Artifacts */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons
                name={artifacts.length > 0 && artifacts.every((a: any) => a.approvalStatus === "approved") ? "checkmark-circle" : "close-circle"}
                size={16}
                color={artifacts.length > 0 && artifacts.every((a: any) => a.approvalStatus === "approved") ? "#16A34A" : "#DC2626"}
              />
              <Text style={{ fontSize: 12, color: colors.text, flex: 1 }}>
                Planning artifacts uploaded and approved ({artifacts.filter((a: any) => a.approvalStatus === "approved").length}/{artifacts.length})
              </Text>
              {artifacts.some((a: any) => a.approvalStatus !== "approved") && (
                <Pressable onPress={() => setActiveSubSection("artifacts")}>
                  <Text style={{ fontSize: 11, color: "#4F46E5", fontWeight: "600" }}>Review Artifacts →</Text>
                </Pressable>
              )}
            </View>

            {/* Gate 3: Analysis */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons
                name={analysis.purpose ? "checkmark-circle" : "close-circle"}
                size={16}
                color={analysis.purpose ? "#16A34A" : "#DC2626"}
              />
              <Text style={{ fontSize: 12, color: colors.text, flex: 1 }}>
                AI analysis performed for current revision ({analysis.purpose ? "Complete" : "Pending"})
              </Text>
              {!analysis.purpose && (
                <Pressable onPress={() => setActiveSubSection("analysis")}>
                  <Text style={{ fontSize: 11, color: "#4F46E5", fontWeight: "600" }}>Run Analysis →</Text>
                </Pressable>
              )}
            </View>

            {/* Gate 4: Conflicts */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons
                name={conflicts.filter((c: any) => c.status === "unresolved").length === 0 ? "checkmark-circle" : "close-circle"}
                size={16}
                color={conflicts.filter((c: any) => c.status === "unresolved").length === 0 ? "#16A34A" : "#DC2626"}
              />
              <Text style={{ fontSize: 12, color: colors.text, flex: 1 }}>
                Material requirement contradictions resolved (0 unresolved)
              </Text>
              {conflicts.some((c: any) => c.status === "unresolved") && (
                <Pressable onPress={() => setActiveSubSection("analysis")}>
                  <Text style={{ fontSize: 11, color: "#4F46E5", fontWeight: "600" }}>Resolve Conflicts →</Text>
                </Pressable>
              )}
            </View>

            {/* Gate 5: Official Backlog */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons
                name={backlog.length >= 1 ? "checkmark-circle" : "close-circle"}
                size={16}
                color={backlog.length >= 1 ? "#16A34A" : "#DC2626"}
              />
              <Text style={{ fontSize: 12, color: colors.text, flex: 1 }}>
                Official Product Backlog contains at least one approved story ({backlog.length} present)
              </Text>
              {backlog.length === 0 && (
                <Pressable onPress={() => setActiveSubSection("suggestions")}>
                  <Text style={{ fontSize: 11, color: "#4F46E5", fontWeight: "600" }}>Approve Stories →</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Blockers Explanation Banner if not ready */}
          {!isPlanFinalized && readiness && !readiness.isReady && (
            <View style={{ backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: radius.sm, padding: 12, marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Ionicons name="warning" size={16} color="#DC2626" />
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#991B1B" }}>
                  Finalization Blockers ({readiness.blockers?.length || 0})
                </Text>
              </View>
              {readiness.blockers?.map((b: string, i: number) => (
                <Text key={i} style={{ fontSize: 11, color: "#B91C1C", marginTop: 2, lineHeight: 15 }}>
                  • {b}
                </Text>
              ))}
            </View>
          )}

          {/* Finalize Button */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Button
              title={
                finalizingPlan
                  ? "Finalizing Scrum Plan..."
                  : isPlanFinalized
                  ? "Scrum Plan Finalized ✓"
                  : "Finalize Scrum Plan & Enable Workspace"
              }
              icon={isPlanFinalized ? "checkmark-done" : "shield-checkmark"}
              disabled={finalizingPlan || isPlanFinalized || (readiness && !readiness.isReady)}
              onPress={handleFinalizePlan}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: UPLOAD ARTIFACT                                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <ModalSheet
        visible={showArtifactModal}
        onClose={() => setShowArtifactModal(false)}
        title="Upload Project Artifact"
      >
        <ScrollView style={{ maxHeight: 500 }}>
          <Text style={s.modalLabel}>Document Name / SRS Title *</Text>
          <TextInput
            value={artifactName}
            onChangeText={setArtifactName}
            placeholder="e.g. PhishShield System Requirements Specification (SRS)"
            placeholderTextColor={colors.textFaint}
            style={s.modalInput}
          />

          <Text style={[s.modalLabel, { marginTop: 12 }]}>Document Type</Text>
          <View style={s.typeSelector}>
            {[
              { id: "srs", label: "SRS / Requirements" },
              { id: "spec", label: "Technical Spec" },
              { id: "diagram", label: "Architecture / Diagram" },
              { id: "notes", label: "Proposal / README" },
            ].map((t) => (
              <Pressable
                key={t.id}
                onPress={() => setArtifactType(t.id)}
                style={[s.typeBtn, artifactType === t.id && s.typeBtnActive]}
              >
                <Text style={[s.typeBtnTxt, artifactType === t.id && s.typeBtnTxtActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[s.modalLabel, { marginTop: 12 }]}>Document Text / Markdown Content *</Text>
          <TextInput
            value={artifactContent}
            onChangeText={setArtifactContent}
            placeholder="Paste or write the document text, requirements, or architecture notes..."
            placeholderTextColor={colors.textFaint}
            multiline
            numberOfLines={8}
            style={[s.modalInput, { height: 160, textAlignVertical: "top" }]}
          />

          <View style={{ marginTop: spacing.lg }}>
            <Button
              title={artifactSaving ? "Saving..." : "Save to Knowledge Base"}
              icon="cloud-upload"
              disabled={artifactSaving}
              onPress={handleSaveArtifact}
            />
          </View>
        </ScrollView>
      </ModalSheet>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: EDIT SUGGESTION                                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <ModalSheet
        visible={!!editingSuggestion}
        onClose={() => setEditingSuggestion(null)}
        title="Edit User Story Suggestion"
      >
        <ScrollView style={{ maxHeight: 520 }}>
          <Text style={s.modalLabel}>Story Title *</Text>
          <TextInput
            value={editTitle}
            onChangeText={setEditTitle}
            style={s.modalInput}
          />

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalLabel}>As a (role)</Text>
              <TextInput value={editRole} onChangeText={setEditRole} style={s.modalInput} />
            </View>
            <View style={{ width: 100 }}>
              <Text style={s.modalLabel}>Story Points</Text>
              <TextInput
                value={editPoints}
                onChangeText={setEditPoints}
                keyboardType="numeric"
                style={s.modalInput}
              />
            </View>
            <View style={{ width: 100 }}>
              <Text style={s.modalLabel}>Hours</Text>
              <TextInput
                value={editHours}
                onChangeText={setEditHours}
                keyboardType="numeric"
                style={s.modalInput}
              />
            </View>
          </View>

          <Text style={[s.modalLabel, { marginTop: 10 }]}>I want (capability)</Text>
          <TextInput value={editWant} onChangeText={setEditWant} style={s.modalInput} />

          <Text style={[s.modalLabel, { marginTop: 10 }]}>So that (benefit)</Text>
          <TextInput value={editBenefit} onChangeText={setEditBenefit} style={s.modalInput} />

          <Text style={[s.modalLabel, { marginTop: 10 }]}>Acceptance Criteria (one per line)</Text>
          <TextInput
            value={editCriteria}
            onChangeText={setEditCriteria}
            multiline
            numberOfLines={4}
            style={[s.modalInput, { height: 90, textAlignVertical: "top" }]}
          />

          <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.lg }}>
            <Button
              title="Save Draft"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => handleSaveEditedSuggestion(false)}
            />
            <Button
              title="Approve to Backlog"
              icon="checkmark-circle"
              style={{ flex: 1 }}
              onPress={() => handleSaveEditedSuggestion(true)}
            />
          </View>
        </ScrollView>
      </ModalSheet>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: ADD MANUAL STORY                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <ModalSheet
        visible={showAddStoryModal}
        onClose={() => setShowAddStoryModal(false)}
        title="Add User Story to Product Backlog"
      >
        <ScrollView style={{ maxHeight: 520 }}>
          <Text style={s.modalLabel}>Story Title *</Text>
          <TextInput
            value={newStoryTitle}
            onChangeText={setNewStoryTitle}
            placeholder="e.g. Implement URL Domain Reputation Check"
            placeholderTextColor={colors.textFaint}
            style={s.modalInput}
          />

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalLabel}>Persona / Role</Text>
              <TextInput
                value={newStoryRole}
                onChangeText={setNewStoryRole}
                placeholder="e.g. security analyst"
                placeholderTextColor={colors.textFaint}
                style={s.modalInput}
              />
            </View>
            <View style={{ width: 100 }}>
              <Text style={s.modalLabel}>Points</Text>
              <TextInput
                value={newStoryPoints}
                onChangeText={setNewStoryPoints}
                keyboardType="numeric"
                style={s.modalInput}
              />
            </View>
            <View style={{ width: 100 }}>
              <Text style={s.modalLabel}>Est. Hours</Text>
              <TextInput
                value={newStoryHours}
                onChangeText={setNewStoryHours}
                keyboardType="numeric"
                style={s.modalInput}
              />
            </View>
          </View>

          <Text style={[s.modalLabel, { marginTop: 10 }]}>I want to...</Text>
          <TextInput
            value={newStoryWant}
            onChangeText={setNewStoryWant}
            placeholder="e.g. query WHOIS and reputation APIs"
            placeholderTextColor={colors.textFaint}
            style={s.modalInput}
          />

          <Text style={[s.modalLabel, { marginTop: 10 }]}>So that...</Text>
          <TextInput
            value={newStoryBenefit}
            onChangeText={setNewStoryBenefit}
            placeholder="e.g. newly registered domains are flagged as high risk"
            placeholderTextColor={colors.textFaint}
            style={s.modalInput}
          />

          <Text style={[s.modalLabel, { marginTop: 10 }]}>Acceptance Criteria (one per line)</Text>
          <TextInput
            value={newStoryCriteria}
            onChangeText={setNewStoryCriteria}
            placeholder="Given a URL with registration < 14 days, flag as risky..."
            placeholderTextColor={colors.textFaint}
            multiline
            numberOfLines={4}
            style={[s.modalInput, { height: 90, textAlignVertical: "top" }]}
          />

          <View style={{ marginTop: spacing.lg }}>
            <Button
              title={createBusy ? "Creating..." : "Save to Product Backlog"}
              icon="add"
              disabled={createBusy}
              onPress={handleCreateManualStory}
            />
          </View>
        </ScrollView>
      </ModalSheet>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: SPRINT PLANNING WIZARD                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <ModalSheet
        visible={showSprintModal}
        onClose={() => setShowSprintModal(false)}
        title="Sprint Planning Wizard"
      >
        <ScrollView style={{ maxHeight: 550 }}>
          {/* Target Sprint Selector */}
          {planningSprints.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={s.modalLabel}>Sprint Target *</Text>
              <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 6 }}>
                Select an existing empty planning sprint to populate or create a new sprint.
              </Text>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {planningSprints.map((sp: any) => {
                  const isSel = selectedSprintTargetId === sp._id;
                  return (
                    <Pressable
                      key={sp._id}
                      onPress={() => {
                        setSelectedSprintTargetId(sp._id);
                        setSprintNumber(sp.number || 1);
                        setSprintGoal(sp.goal || "");
                        if (sp.durationDays) setSprintDays(sp.durationDays);
                      }}
                      style={[s.durationBtn, isSel && s.durationBtnActive]}
                    >
                      <Ionicons
                        name="flag-outline"
                        size={12}
                        color={isSel ? "#ffffff" : "#4f46e5"}
                      />
                      <Text style={[s.durationBtnTxt, isSel && s.durationBtnTxtActive]}>
                        Sprint {String(sp.number).padStart(2, "0")} ({sp.name || "Planning"})
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => {
                    setSelectedSprintTargetId("new");
                    setSprintNumber((sprints.length || 0) + 1);
                    setSprintGoal("");
                    setSprintDays(14);
                  }}
                  style={[s.durationBtn, selectedSprintTargetId === "new" && s.durationBtnActive]}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={12}
                    color={selectedSprintTargetId === "new" ? "#ffffff" : colors.textMuted}
                  />
                  <Text style={[s.durationBtnTxt, selectedSprintTargetId === "new" && s.durationBtnTxtActive]}>
                    + New Sprint ({String((sprints.length || 0) + 1).padStart(2, "0")})
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ width: 120 }}>
              <Text style={s.modalLabel}>Sprint #</Text>
              <TextInput
                value={String(sprintNumber)}
                onChangeText={(t) => setSprintNumber(parseInt(t) || 1)}
                keyboardType="numeric"
                editable={selectedSprintTargetId === "new"}
                style={[s.modalInput, selectedSprintTargetId !== "new" && { backgroundColor: "#f1f5f9", color: "#64748b" }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.modalLabel}>Duration (Days)</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                {[7, 14, 21].map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => setSprintDays(d)}
                    style={[s.durationBtn, sprintDays === d && s.durationBtnActive]}
                  >
                    <Text style={[s.durationBtnTxt, sprintDays === d && s.durationBtnTxtActive]}>
                      {d} Days ({d / 7}w)
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <Text style={[s.modalLabel, { marginTop: 12 }]}>Sprint Goal *</Text>
          <TextInput
            value={sprintGoal}
            onChangeText={setSprintGoal}
            placeholder="e.g. Implement URL ingestion, reputation scan, and MVP verification dashboard"
            placeholderTextColor={colors.textFaint}
            style={s.modalInput}
          />

          {/* Workload vs Capacity Summary */}
          <View style={[s.capacityBox, isOverCapacity && s.capacityBoxOver]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={s.capTitle}>Proposed Sprint Commitment</Text>
              <Text style={[s.capPoints, isOverCapacity && { color: "#DC2626" }]}>
                {proposedPoints} Points ({proposedHours}h / {teamCapacityHours}h)
              </Text>
            </View>
            <ProgressBar
              value={teamCapacityHours > 0 ? proposedHours / teamCapacityHours : 0}
              color={isOverCapacity ? "#DC2626" : "#4F46E5"}
              height={6}
            />
            {isOverCapacity && (
              <Text style={s.overCapacityWarn}>
                ⚠️ Workload exceeds available team capacity! Consider deselecting lower-priority stories or adjusting sprint duration.
              </Text>
            )}
          </View>

          {/* Story Selection Checklist */}
          <Text style={[s.modalLabel, { marginTop: 12 }]}>
            Select Eligible Product Backlog Stories ({selectedStoryIds.length} selected):
          </Text>
          {eligibleBacklogStories.length === 0 ? (
            <Text style={{ fontSize: 12, color: colors.textMuted, marginVertical: 8 }}>
              No eligible unassigned stories in Product Backlog to select. Approve stories from suggestions first.
            </Text>
          ) : (
            <View style={{ gap: 6, marginTop: 6 }}>
              {eligibleBacklogStories.map((story: any) => {
                const isSelected = selectedStoryIds.includes(story._id);
                return (
                  <Pressable
                    key={story._id}
                    onPress={() => {
                      if (isSelected) {
                        setSelectedStoryIds((prev) => prev.filter((id) => id !== story._id));
                      } else {
                        setSelectedStoryIds((prev) => [...prev, story._id]);
                      }
                    }}
                    style={[s.storySelectRow, isSelected && s.storySelectRowActive]}
                  >
                    <Ionicons
                      name={isSelected ? "checkbox" : "square-outline"}
                      size={18}
                      color={isSelected ? "#4F46E5" : colors.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.storySelectTitle, isSelected && { fontWeight: "700" }]}>
                        {story.title}
                      </Text>
                      <Text style={s.storySelectMeta}>
                        {story.storyPoints || 3} Pts · ~{story.estimatedHours || 8}h · {story.priorityLabel?.toUpperCase() || "MEDIUM"}
                        {story.dependencies?.length > 0 ? ` · ${story.dependencies.length} prerequisite(s)` : ""}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={{ marginTop: spacing.lg }}>
            <Button
              title={
                planningBusy
                  ? "Committing Sprint..."
                  : selectedSprintTargetId !== "new"
                  ? `Commit ${selectedStoryIds.length} Stories to Sprint ${String(sprintNumber).padStart(2, "0")}`
                  : `Create & Commit Sprint ${String(sprintNumber).padStart(2, "0")} (${selectedStoryIds.length} Stories)`
              }
              icon="rocket"
              disabled={planningBusy || selectedStoryIds.length === 0}
              onPress={handleCommitSprint}
            />
          </View>
        </ScrollView>
      </ModalSheet>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: VIEW ARTIFACT CONTENT                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <ModalSheet
        visible={!!viewingArtifact}
        onClose={() => setViewingArtifact(null)}
        title={viewingArtifact?.name || "Document Viewer"}
      >
        <ScrollView style={{ maxHeight: 500 }}>
          <Text style={{ fontSize: 13, lineHeight: 20, color: colors.text }}>
            {viewingArtifact?.content || viewingArtifact?.summary || "No content recorded for this artifact."}
          </Text>
        </ScrollView>
      </ModalSheet>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: INSPECT STORY DETAILS                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <ModalSheet
        visible={!!inspectedStory}
        onClose={() => setInspectedStory(null)}
        title={inspectedStory?.title || "Story Inspection"}
      >
        <ScrollView style={{ maxHeight: 500 }}>
          <View style={s.userStoryBox}>
            <Text style={s.userStoryTxt}>{inspectedStory?.userStory || inspectedStory?.title}</Text>
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginVertical: 12 }}>
            <Badge label={`${inspectedStory?.storyPoints || 3} Story Points`} variant="info" />
            <Badge label={`~${inspectedStory?.estimatedHours || 8} Hours`} variant="default" />
            <Badge label={inspectedStory?.priorityLabel || "medium"} variant="warning" />
          </View>

          {inspectedStory?.acceptanceCriteria?.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text style={s.criteriaHead}>Acceptance Criteria:</Text>
              {inspectedStory.acceptanceCriteria.map((c: string, idx: number) => (
                <View key={idx} style={s.criteriaItem}>
                  <Ionicons name="checkmark-circle" size={14} color="#059669" />
                  <Text style={s.criteriaTxt}>{c}</Text>
                </View>
              ))}
            </View>
          )}

          {inspectedStory?.sourceArtifact && (
            <Text style={[s.artMeta, { marginTop: 12 }]}>
              Source Document: {inspectedStory.sourceArtifact}
            </Text>
          )}
        </ScrollView>
      </ModalSheet>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: BULK APPROVE ALL ELIGIBLE SUGGESTIONS                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <ModalSheet
        visible={showBulkModal}
        onClose={() => !bulkApproving && setShowBulkModal(false)}
        title={`Approve All ${draftSuggestions.length} Eligible Stories`}
      >
        <ScrollView style={{ maxHeight: 460 }}>
          <View style={{ gap: 12 }}>
            <View style={{ backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE", borderRadius: radius.md, padding: 12, gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#1E40AF" }}>
                Confirm Promotion to Product Backlog
              </Text>
              <Text style={{ fontSize: 12, color: "#1E3A8A", lineHeight: 17 }}>
                This safe bulk-approval action will promote all {draftSuggestions.length} pending AI suggestions into official Product Backlog items with verified acceptance criteria and story point estimates. Server-side validation guarantees zero duplicates.
              </Text>
            </View>

            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textMuted, marginTop: 4 }}>
              Pending Suggestions ({draftSuggestions.length}):
            </Text>

            <View style={{ gap: 6 }}>
              {draftSuggestions.map((sug: any, idx: number) => (
                <View
                  key={sug.suggestionId || idx}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: radius.sm,
                    padding: 8,
                  }}
                >
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text }} numberOfLines={1}>
                      {sug.title}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>
                      {sug.epic || "Core Features"} · {sug.suggestedPriority?.toUpperCase() || "MEDIUM"}
                    </Text>
                  </View>
                  <Badge label={`${sug.suggestedStoryPoints || 3} Pts`} variant="info" size="sm" />
                </View>
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Button
                title="Cancel"
                variant="ghost"
                disabled={bulkApproving}
                onPress={() => setShowBulkModal(false)}
                style={{ flex: 1 }}
              />
              <Button
                title={bulkApproving ? "Approving Batch..." : `Confirm & Approve All (${draftSuggestions.length})`}
                icon="checkmark-done"
                variant="primary"
                loading={bulkApproving}
                disabled={bulkApproving}
                onPress={handleConfirmBulkApprove}
                style={{ flex: 2 }}
              />
            </View>
          </View>
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
  },
  loadingWrap: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  subNavBar: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 4,
  },
  subNavList: {
    flexDirection: "row",
    gap: 6,
  },
  subNavItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  subNavItemActive: {
    backgroundColor: "#EEF2FF",
  },
  subNavTxt: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  subNavTxtActive: {
    color: "#4F46E5",
    fontWeight: "700",
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
    flexWrap: "wrap",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  sectionDesc: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    padding: 0,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    marginVertical: spacing.sm,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    marginTop: 8,
  },
  emptyDesc: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 420,
    marginTop: 4,
    lineHeight: 18,
  },
  artifactGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  artifactCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  artifactCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  artIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  artName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  artMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  artSummary: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 16,
    marginTop: 8,
  },
  artActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  artActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  artActionTxt: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4F46E5",
  },
  aiTriggerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: "#F8FAFC",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: spacing.md,
    marginTop: spacing.lg,
    flexWrap: "wrap",
  },
  aiTriggerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  aiTriggerDesc: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  analysisContent: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  analysisBlock: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  blockHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 6,
  },
  blockBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  personaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  personaPillTxt: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4F46E5",
  },
  reqListItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 4,
  },
  reqListTxt: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  suggestionCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  sugTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  sugTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginTop: 6,
  },
  userStoryBox: {
    backgroundColor: "#EEF2FF",
    borderLeftWidth: 3,
    borderLeftColor: "#4F46E5",
    padding: 10,
    borderRadius: radius.xs,
    marginVertical: 8,
  },
  userStoryTxt: {
    fontSize: 13,
    fontStyle: "italic",
    color: "#312E81",
    lineHeight: 19,
  },
  criteriaHead: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 4,
  },
  criteriaItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 2,
  },
  criteriaTxt: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    lineHeight: 17,
  },
  sugActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sugEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sugEditTxt: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  sugRejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  sugRejectTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: "#DC2626",
  },
  sugApproveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: "#059669",
  },
  sugApproveTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: spacing.sm,
  },
  searchFlex: {
    flex: 1,
    minWidth: 200,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  pillGroup: {
    flexDirection: "row",
    gap: 4,
  },
  filterPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: "#4F46E5",
    borderColor: "#4F46E5",
  },
  filterPillTxt: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
  },
  filterPillTxtActive: {
    color: "#fff",
  },
  backlogItemCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  backlogItemTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  backlogItemTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    marginTop: 4,
  },
  backlogItemStory: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 17,
  },
  inspectBtn: {
    padding: 4,
  },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  aiBadgeTxt: {
    fontSize: 9,
    fontWeight: "700",
    color: "#4F46E5",
  },
  daaScorePill: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  daaScoreTxt: {
    fontSize: 9,
    fontWeight: "700",
    color: "#16A34A",
  },
  criteriaCount: {
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 6,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
  },
  typeSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  typeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeBtnActive: {
    backgroundColor: "#EEF2FF",
    borderColor: "#4F46E5",
  },
  typeBtnTxt: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  typeBtnTxtActive: {
    color: "#4F46E5",
    fontWeight: "700",
  },
  durationBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  durationBtnActive: {
    backgroundColor: "#EEF2FF",
    borderColor: "#4F46E5",
  },
  durationBtnTxt: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  durationBtnTxtActive: {
    color: "#4F46E5",
    fontWeight: "700",
  },
  capacityBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: 12,
    gap: 6,
  },
  capacityBoxOver: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  capTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  capPoints: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4F46E5",
  },
  overCapacityWarn: {
    fontSize: 11,
    color: "#DC2626",
    lineHeight: 16,
    marginTop: 2,
  },
  storySelectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 10,
  },
  storySelectRowActive: {
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
  },
  storySelectTitle: {
    fontSize: 13,
    color: colors.text,
  },
  storySelectMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
});
