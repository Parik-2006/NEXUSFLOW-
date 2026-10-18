/**
 * client/components/workspace/PlanPanel.tsx
 * ============================================================================
 * V4 WATERFALL PLAN TAB — PROJECT UNDERSTANDING + REQUIREMENTS WORKSPACE
 *
 * Implements Prompt 06 & Phase 5 of NexusFlow V4.0:
 * - Professional artifact upload & intake (SRS, rubric, diagrams, notes)
 * - Strict separation of Persistent Project Context vs. Temporary Context
 * - Zero-cost AI extraction of draft goals, constraints, and SRS requirements
 * - Human-in-the-loop review (Approve, Edit, Convert to Task, Delete, Add)
 * - Deterministic DAA priority scoring with explanation badges
 * - Warm editorial aesthetic (cream, ivory, sand, slate, muted olive)
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, WATERFALL_PHASE_META } from "@/theme";
import { API_BASE_URL } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";
import { useToast, useConfirm } from "@/components/feedback";
import { getSocket } from "@/services/socket";
import WaterfallGuideBanner from "@/components/WaterfallGuideBanner";

interface PlanPanelProps {
  teamId: string;
  projectId?: string;
  onNavigateToTasks?: () => void;
  isEmbedded?: boolean;
}

export interface ArtifactItem {
  _id?: string;
  name: string;
  artifactType: string;
  content: string;
  scope: "persistent" | "temporary";
  fileSize?: number;
  summary?: string;
  approvalStatus?: "pending" | "approved" | "rejected";
  approvedAt?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  uploadedAt?: string;
}

export interface WaterfallReadinessData {
  isReady: boolean;
  blockers: string[];
  details?: {
    isWaterfall?: boolean;
    hasArtifacts?: boolean;
    artifactCount?: number;
    approvedArtifactCount?: number;
    allArtifactsApproved?: boolean;
    analysisPerformed?: boolean;
    unresolvedConflictCount?: number;
    conflictsResolved?: boolean;
    documentReadinessConfirmed?: boolean;
    hasPermission?: boolean;
  };
}

interface RequirementItem {
  _id?: string;
  reqId: string;
  title: string;
  description: string;
  phase: string;
  businessValue: number;
  academicValue: number;
  criticality: number;
  teacherImportance: number;
  estimatedHours: number;
  requiredSkills: string[];
  dependencies: string[];
  acceptanceCriteria: string[];
  status: "draft" | "approved" | "in_progress" | "verified" | "rejected";
  priorityScore: number;
  scoreExplanation: string;
  hasActiveTask?: boolean;
  linkedTaskId?: string;
  linkedTaskStatus?: string;
}

export interface ScopeItem {
  id?: string;
  label: string;
  description: string;
  sourceArtifact?: string;
  sourceReference?: string;
  isInferred?: boolean;
  isConfirmed?: boolean;
  status?: "draft" | "confirmed" | "removed";
}

export interface ConflictItem {
  id: string;
  title: string;
  reason?: string;
  sourceA: string;
  statementA: string;
  sourceB: string;
  statementB: string;
  sourceDocumentA?: string;
  sourceDocumentB?: string;
  relatedArtifactIds?: string[];
  relatedRequirementIds?: string[];
  affectedCategory: "goals" | "deliverables" | "constraints" | "requirements";
  status: "unresolved" | "resolved";
  selectedResolution?: string;
  resolutionNote?: string;
  resolutionType?: string | null;
  resolvedAt?: string | null;
  resolvedByName?: string;
}

export interface WaterfallPlanLifecycle {
  status:
    | "ARTIFACTS_PENDING"
    | "ANALYSIS_PENDING"
    | "PLAN_REVIEW_REQUIRED"
    | "AWAITING_FINALIZATION"
    | "PLAN_FINALIZED"
    | "TASKS_GENERATED"
    | "IN_EXECUTION"
    | "COMPLETED";
  planRevision: number;
  artifactAnalysisRevision: number;
  finalizedPlanRevision: number;
  taskGenerationRevision: number;
  documentReadinessConfirmed: boolean;
  readinessConfirmedAt?: string | null;
  finalizedAt?: string | null;
  conflicts: ConflictItem[];
  scope: {
    goals: ScopeItem[];
    deliverables: ScopeItem[];
    constraints: ScopeItem[];
  };
}

export default function PlanPanel({ teamId, projectId, onNavigateToTasks, isEmbedded }: PlanPanelProps) {
  const { user, token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(
    projectId && String(projectId) !== String(teamId) ? String(projectId) : null
  );

  useEffect(() => {
    if (projectId && String(projectId) !== String(teamId)) {
      setResolvedProjectId(String(projectId));
    }
  }, [projectId, teamId]);
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [requirements, setRequirements] = useState<RequirementItem[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [deliverables, setDeliverables] = useState<string[]>([]);

  // V4 Waterfall Scope Cards & Lifecycle State
  const [scope, setScope] = useState<{
    goals: ScopeItem[];
    deliverables: ScopeItem[];
    constraints: ScopeItem[];
  }>({ goals: [], deliverables: [], constraints: [] });
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [lifecycle, setLifecycle] = useState<WaterfallPlanLifecycle | null>(null);
  const [readinessConfirmed, setReadinessConfirmed] = useState(false);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<WaterfallReadinessData | null>(null);

  // Artifact Review & Approval State
  const [approvingArtifactId, setApprovingArtifactId] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [approvingAllReqs, setApprovingAllReqs] = useState(false);
  const [bulkConvertingReqs, setBulkConvertingReqs] = useState(false);
  const [viewingArtifact, setViewingArtifact] = useState<ArtifactItem | null>(null);
  const [editingArtifact, setEditingArtifact] = useState<ArtifactItem | null>(null);
  const [editArtifactName, setEditArtifactName] = useState("");
  const [editArtifactType, setEditArtifactType] = useState("srs");
  const [editArtifactScope, setEditArtifactScope] = useState<"persistent" | "temporary">("persistent");
  const [editArtifactContent, setEditArtifactContent] = useState("");
  const [savingArtifactEdit, setSavingArtifactEdit] = useState(false);

  // Custom Conflict Rationale Modal State
  const [showCustomConflictModal, setShowCustomConflictModal] = useState(false);
  const [customConflictTarget, setCustomConflictTarget] = useState<ConflictItem | null>(null);
  const [customConflictRationale, setCustomConflictRationale] = useState("");
  const [resolvingCustomConflict, setResolvingCustomConflict] = useState(false);

  // Scope Item Modal State (Add / Edit scope cards)
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [scopeCategory, setScopeCategory] = useState<"goals" | "deliverables" | "constraints">("goals");
  const [editingScopeIdx, setEditingScopeIdx] = useState<number | null>(null);
  const [scopeDraftLabel, setScopeDraftLabel] = useState("");
  const [scopeDraftDescription, setScopeDraftDescription] = useState("");
  const [scopeDraftSource, setScopeDraftSource] = useState("");
  const [scopeDraftIsInferred, setScopeDraftIsInferred] = useState(false);

  // Filtering & Search
  const [selectedPhaseFilter, setSelectedPhaseFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // New Artifact Modal / Form State
  const [showArtifactModal, setShowArtifactModal] = useState(false);
  const [artifactName, setArtifactName] = useState("");
  const [artifactType, setArtifactType] = useState("srs");
  const [artifactScope, setArtifactScope] = useState<"persistent" | "temporary">("persistent");
  const [artifactContent, setArtifactContent] = useState("");
  const [savingArtifact, setSavingArtifact] = useState(false);
  const [deletingArtifactId, setDeletingArtifactId] = useState<string | null>(null);

  // Requirement Modal (Add / Edit)
  const [showReqModal, setShowReqModal] = useState(false);
  const [editingReq, setEditingReq] = useState<RequirementItem | null>(null);
  const [reqTitle, setReqTitle] = useState("");
  const [reqDescription, setReqDescription] = useState("");
  const [reqPhase, setReqPhase] = useState("requirements");
  const [reqAcademicValue, setReqAcademicValue] = useState(8);
  const [reqTeacherImportance, setReqTeacherImportance] = useState(8);
  const [reqCriticality, setReqCriticality] = useState(7);
  const [reqBusinessValue, setReqBusinessValue] = useState(7);
  const [reqEstimatedHours, setReqEstimatedHours] = useState(14);
  const [reqSkills, setReqSkills] = useState("");
  const [reqDeps, setReqDeps] = useState("");
  const [reqStatus, setReqStatus] = useState<"draft" | "approved">("draft");

  // Load or Resolve Project ID
  const fetchPlan = useCallback(async () => {
    try {
      setLoading(true);
      let pId = resolvedProjectId;

      if (!pId || String(pId) === String(teamId)) {
        // Resolve active project for team
        const teamRes = await fetch(`${API_BASE_URL}/api/teams/${teamId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (teamRes.ok) {
          const teamData = await teamRes.json();
          const rawId = teamData.activeProjectId || teamData.project?._id || (teamData.projects && teamData.projects[0]?._id) || null;
          if (rawId) {
            pId = typeof rawId === "object" ? (rawId._id || String(rawId)) : String(rawId);
            setResolvedProjectId(pId);
          }
        }
      }

      if (!pId || String(pId) === String(teamId)) {
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/projects/${pId}/plan`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setArtifacts(data.artifacts || []);
        setRequirements(data.requirements || []);
        setGoals(data.goals || []);
        setConstraints(data.constraints || []);
        setDeliverables(data.deliverables || []);
        if (data.scope) setScope(data.scope);
        if (data.conflicts) setConflicts(data.conflicts);
        if (data.waterfallPlanLifecycle) {
          setLifecycle(data.waterfallPlanLifecycle);
          setReadinessConfirmed(Boolean(data.waterfallPlanLifecycle.documentReadinessConfirmed));
        }
        if (data.readiness) {
          setReadiness(data.readiness);
        }
      }
    } catch (err: any) {
      toast("Error loading project plan: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [teamId, resolvedProjectId, token]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // Real-time synchronization for Waterfall lifecycle and tasks
  useEffect(() => {
    const socket = getSocket(token);
    if (!socket) return;
    const handleUpdate = () => {
      fetchPlan();
    };
    socket.on("waterfall:lifecycle:updated", handleUpdate);
    socket.on("waterfall:plan:finalized", handleUpdate);
    socket.on("waterfall:phase:updated", handleUpdate);
    socket.on("project:updated", handleUpdate);
    return () => {
      socket.off("waterfall:lifecycle:updated", handleUpdate);
      socket.off("waterfall:plan:finalized", handleUpdate);
      socket.off("waterfall:phase:updated", handleUpdate);
      socket.off("project:updated", handleUpdate);
    };
  }, [fetchPlan]);

  // Upload / Save Artifact
  const handleSaveArtifact = async () => {
    if (savingArtifact) return;
    if (!artifactName.trim()) {
      toast("Artifact name is required.", "error");
      return;
    }
    if (!artifactContent.trim()) {
      toast("Please provide artifact text or instructions.", "error");
      return;
    }
    if (!resolvedProjectId) {
      toast("Project ID could not be resolved. Please reload.", "error");
      return;
    }

    try {
      setSavingArtifact(true);
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
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setArtifacts(data.artifacts || []);
        if (data.lifecycle) setLifecycle(data.lifecycle);
        if (data.conflicts) setConflicts(data.conflicts);
        if (data.readiness) setReadiness(data.readiness);
        setShowArtifactModal(false);
        setArtifactName("");
        setArtifactContent("");
        toast("Artifact saved successfully to project context.", "success");
        await fetchPlan();
      } else {
        const err = await res.json().catch(() => ({}));
        toast(err.error || "Failed to save artifact", "error");
      }
    } catch (err: any) {
      toast(err.message || "Network error saving artifact", "error");
    } finally {
      setSavingArtifact(false);
    }
  };

  // Delete Artifact
  const handleDeleteArtifact = async (artifactId?: string) => {
    if (!artifactId || !resolvedProjectId) return;
    if (deletingArtifactId) return;

    const ok = await confirm({
      title: "Remove Artifact",
      message: "Are you sure you want to remove this artifact? Any related contradictions and finalization readiness will be automatically recalculated.",
      destructive: true,
    });
    if (!ok) return;

    try {
      setDeletingArtifactId(artifactId);
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/artifacts/${artifactId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setArtifacts(data.artifacts || []);
        if (data.lifecycle) setLifecycle(data.lifecycle);
        if (data.conflicts) setConflicts(data.conflicts);
        if (data.readiness) setReadiness(data.readiness);
        toast("Artifact removed. Contradictions & readiness recalculated.", "info");
        await fetchPlan();
      } else {
        const err = await res.json().catch(() => ({}));
        toast(err.error || "Failed to remove artifact", "error");
      }
    } catch (err: any) {
      toast(err.message || "Network error removing artifact", "error");
    } finally {
      setDeletingArtifactId(null);
    }
  };

  // Individual Artifact Approval
  const handleApproveArtifact = async (artifactId?: string) => {
    if (!artifactId || !resolvedProjectId || approvingArtifactId) return;
    try {
      setApprovingArtifactId(artifactId);
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/artifacts/${artifactId}/approve`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setArtifacts(data.artifacts || []);
        if (data.lifecycle) setLifecycle(data.lifecycle);
        if (data.readiness) setReadiness(data.readiness);
        toast("Artifact approved successfully.", "success");
      } else {
        const err = await res.json().catch(() => ({}));
        toast(err.error || "Failed to approve artifact", "error");
      }
    } catch (err: any) {
      toast(err.message || "Network error approving artifact", "error");
    } finally {
      setApprovingArtifactId(null);
    }
  };

  // Bulk Approve All Eligible Artifacts
  const handleApproveAll = async () => {
    if (!resolvedProjectId || approvingAll) return;
    const pendingCount = artifacts.filter(a => a.approvalStatus !== "approved").length;
    if (pendingCount === 0) {
      toast("All artifacts are already approved.", "info");
      return;
    }
    const ok = await confirm({
      title: "Approve All Artifacts",
      message: `Approve all ${pendingCount} remaining eligible artifact(s)? Approvals will be persisted with your user credentials. Genuine scope contradictions must still be resolved separately.`,
      confirmLabel: "Approve All",
    });
    if (!ok) return;

    try {
      setApprovingAll(true);
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/artifacts/approve-all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setArtifacts(data.artifacts || []);
        if (data.lifecycle) setLifecycle(data.lifecycle);
        if (data.readiness) setReadiness(data.readiness);
        toast(data.message || `All ${data.approvedCount || pendingCount} artifacts approved.`, "success");
      } else {
        const err = await res.json().catch(() => ({}));
        toast(err.error || "Failed to approve all artifacts", "error");
      }
    } catch (err: any) {
      toast(err.message || "Network error during bulk approval", "error");
    } finally {
      setApprovingAll(false);
    }
  };

  // Open Edit Artifact Modal
  const handleOpenEditArtifact = (artifact: ArtifactItem) => {
    setEditingArtifact(artifact);
    setEditArtifactName(artifact.name);
    setEditArtifactType(artifact.artifactType || "srs");
    setEditArtifactScope(artifact.scope || "persistent");
    setEditArtifactContent(artifact.content || "");
  };

  // Save Artifact Edit
  const handleSaveArtifactEdit = async () => {
    if (!editingArtifact?._id || !resolvedProjectId || savingArtifactEdit) return;
    if (!editArtifactName.trim()) {
      toast("Artifact name cannot be empty.", "error");
      return;
    }
    try {
      setSavingArtifactEdit(true);
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/artifacts/${editingArtifact._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editArtifactName.trim(),
          artifactType: editArtifactType,
          scope: editArtifactScope,
          content: editArtifactContent,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setArtifacts(data.artifacts || []);
        if (data.lifecycle) setLifecycle(data.lifecycle);
        if (data.conflicts) setConflicts(data.conflicts);
        if (data.readiness) setReadiness(data.readiness);
        setEditingArtifact(null);
        toast("Artifact updated. Contradictions & readiness recalculated.", "success");
      } else {
        const err = await res.json().catch(() => ({}));
        toast(err.error || "Failed to update artifact", "error");
      }
    } catch (err: any) {
      toast(err.message || "Network error updating artifact", "error");
    } finally {
      setSavingArtifactEdit(false);
    }
  };

  // AI Extraction of Requirements & Deliverables (All three scope cards populated)
  const handleExtractPlan = async () => {
    if (!resolvedProjectId) return;
    if (!artifacts || artifacts.length === 0) {
      toast("Upload an SRS, specification, or project artifact before analyzing.", "error");
      return;
    }
    try {
      setExtracting(true);
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/plan/extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.scope) setScope(data.scope);
        if (data.conflicts) setConflicts(data.conflicts);
        if (data.lifecycle) {
          setLifecycle(data.lifecycle);
          setReadinessConfirmed(Boolean(data.lifecycle.documentReadinessConfirmed));
        }
        await fetchPlan();
        toast("Waterfall plan, scope cards, and requirements extracted successfully.", "success");
      } else {
        const err = await res.json();
        toast(err.error || "Extraction failed", "error");
      }
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setExtracting(false);
    }
  };

  // Toggle Document Readiness
  const handleToggleReadiness = async (newValue: boolean) => {
    if (!resolvedProjectId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/plan/readiness`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirmed: newValue }),
      });
      if (res.ok) {
        const data = await res.json();
        setReadinessConfirmed(newValue);
        if (data.lifecycle) setLifecycle(data.lifecycle);
        if (data.readiness) setReadiness(data.readiness);
        toast(data.message || (newValue ? "Document readiness confirmed." : "Confirmation removed."), "info");
      } else {
        const err = await res.json();
        toast(err.error || "Failed to update readiness", "error");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  // Resolve Scope Conflict with selection
  const handleResolveConflict = async (conflictId: string, resolution: string, resolutionType: string = "decision_selection", note?: string) => {
    if (!resolvedProjectId) return;
    try {
      setResolvingConflictId(conflictId);
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/plan/conflicts/${conflictId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ resolution, resolutionType, note: note || `Authoritative selection: ${resolution}` }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.conflicts) setConflicts(data.conflicts);
        if (data.lifecycle) setLifecycle(data.lifecycle);
        if (data.readiness) setReadiness(data.readiness);
        toast("Scope contradiction resolved successfully.", "success");
      } else {
        const err = await res.json();
        toast(err.error || "Failed to resolve contradiction", "error");
      }
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setResolvingConflictId(null);
    }
  };

  // Open Custom Conflict Rationale Modal
  const handleOpenCustomConflict = (conflict: ConflictItem) => {
    setCustomConflictTarget(conflict);
    setCustomConflictRationale(conflict.resolutionNote || "");
    setShowCustomConflictModal(true);
  };

  // Save Custom Conflict Rationale
  const handleSaveCustomConflictRationale = async () => {
    if (!customConflictTarget || !resolvedProjectId || resolvingCustomConflict) return;
    if (!customConflictRationale.trim()) {
      toast("Please enter a documented rationale for resolving this conflict.", "error");
      return;
    }
    try {
      setResolvingCustomConflict(true);
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/plan/conflicts/${customConflictTarget.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resolution: `Documented Custom Rationale: ${customConflictRationale.trim()}`,
          resolutionType: "custom_rationale",
          note: customConflictRationale.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.conflicts) setConflicts(data.conflicts);
        if (data.lifecycle) setLifecycle(data.lifecycle);
        if (data.readiness) setReadiness(data.readiness);
        setShowCustomConflictModal(false);
        setCustomConflictTarget(null);
        setCustomConflictRationale("");
        toast("Scope contradiction resolved with documented rationale.", "success");
      } else {
        const err = await res.json().catch(() => ({}));
        toast(err.error || "Failed to resolve contradiction", "error");
      }
    } catch (err: any) {
      toast(err.message || "Network error resolving conflict", "error");
    } finally {
      setResolvingCustomConflict(false);
    }
  };

  // Finalize Waterfall Plan & Generate Tasks
  const handleFinalizePlan = async () => {
    if (!resolvedProjectId) return;
    try {
      setFinalizing(true);
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/plan/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.lifecycle) setLifecycle(data.lifecycle);
        if (data.readiness) setReadiness(data.readiness);
        toast("Waterfall Plan Finalized! Tasks and Timeline are now unlocked.", "success");
        await fetchPlan();
        if (onNavigateToTasks) {
          onNavigateToTasks();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toast(err.error || "Failed to finalize plan", "error");
      }
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setFinalizing(false);
    }
  };

  // Scope Item Modal Handlers
  const openScopeModal = (category: "goals" | "deliverables" | "constraints", index?: number) => {
    setScopeCategory(category);
    if (typeof index === "number" && scope[category][index]) {
      const item = scope[category][index];
      setEditingScopeIdx(index);
      setScopeDraftLabel(item.label || "");
      setScopeDraftDescription(item.description || "");
      setScopeDraftSource(item.sourceArtifact || (artifacts[0]?.name || "Project Brief"));
      setScopeDraftIsInferred(Boolean(item.isInferred));
    } else {
      setEditingScopeIdx(null);
      setScopeDraftLabel("");
      setScopeDraftDescription("");
      setScopeDraftSource(artifacts[0]?.name || "Project Brief");
      setScopeDraftIsInferred(false);
    }
    setShowScopeModal(true);
  };

  const handleSaveScopeItem = async () => {
    if (!scopeDraftLabel.trim()) {
      toast("Label (2-3 words) is required.", "error");
      return;
    }
    if (!resolvedProjectId) return;

    const newScope = {
      goals: [...(scope.goals || [])],
      deliverables: [...(scope.deliverables || [])],
      constraints: [...(scope.constraints || [])],
    };

    const newItem: ScopeItem = {
      id: editingScopeIdx !== null ? scope[scopeCategory][editingScopeIdx]?.id : `${scopeCategory[0].toUpperCase()}-${Date.now()}`,
      label: scopeDraftLabel.trim(),
      description: scopeDraftDescription.trim() || scopeDraftLabel.trim(),
      sourceArtifact: scopeDraftSource.trim() || "Project Artifact",
      sourceReference: editingScopeIdx !== null ? scope[scopeCategory][editingScopeIdx]?.sourceReference : "Human Edited",
      isInferred: scopeDraftIsInferred,
      isConfirmed: true,
      status: "confirmed",
    };

    if (editingScopeIdx !== null) {
      newScope[scopeCategory][editingScopeIdx] = newItem;
    } else {
      newScope[scopeCategory].push(newItem);
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/plan/scope`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newScope),
      });
      if (res.ok) {
        const data = await res.json();
        setScope(data.scope);
        setShowScopeModal(false);
        toast(`Scope ${scopeCategory} saved.`, "success");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  const handleDeleteScopeItem = async (category: "goals" | "deliverables" | "constraints", index: number) => {
    if (!resolvedProjectId) return;
    const ok = await confirm({
      title: "Remove Scope Item",
      message: `Are you sure you want to remove "${scope[category][index]?.label}"?`,
      destructive: true,
    });
    if (!ok) return;

    const newScope = {
      goals: [...(scope.goals || [])],
      deliverables: [...(scope.deliverables || [])],
      constraints: [...(scope.constraints || [])],
    };
    newScope[category].splice(index, 1);

    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/plan/scope`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newScope),
      });
      if (res.ok) {
        const data = await res.json();
        setScope(data.scope);
        toast("Scope item removed.", "info");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  // Approve Requirement
  const handleApproveReq = async (reqItem: RequirementItem) => {
    if (!resolvedProjectId || !reqItem.reqId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/requirements/${reqItem.reqId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "approved" }),
      });
      if (res.ok) {
        const data = await res.json();
        setRequirements(data.requirements || []);
        if (data.readiness) setReadiness(data.readiness);
        toast(`${reqItem.reqId} approved.`, "success");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  // Bulk Approve All Eligible Requirements
  const handleApproveAllRequirements = async () => {
    if (!resolvedProjectId) return;
    const pendingCount = requirements.filter(
      (r) => r.status !== "approved" && r.status !== "in_progress" && r.status !== "verified"
    ).length;

    if (pendingCount === 0) {
      toast("All requirements are already approved.", "info");
      return;
    }

    const ok = await confirm({
      title: "Approve All Requirements",
      message: `Approve all ${pendingCount} remaining eligible requirement(s)? This will mark them as approved for Waterfall execution and plan finalization.`,
      confirmLabel: `Approve All (${pendingCount})`,
    });
    if (!ok) return;

    setApprovingAllReqs(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/requirements/approve-all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setRequirements(data.requirements || []);
        if (data.readiness) setReadiness(data.readiness);
        toast(`Approved ${data.newlyApproved ?? pendingCount} requirement(s). All requirements are now approved!`, "success");
      } else {
        const err = await res.json();
        toast(err.error || "Failed to bulk approve requirements.", "error");
      }
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setApprovingAllReqs(false);
    }
  };

  // Bulk Convert All Approved Requirements to Active Tasks
  const handleBulkConvertToTasks = async () => {
    if (!resolvedProjectId) return;
    const eligibleApproved = requirements.filter(
      (r) => (r.status === "approved" || r.status === "in_progress" || r.status === "verified") && !r.hasActiveTask
    );
    const alreadyConverted = requirements.filter((r) => r.hasActiveTask);
    const excludedDrafts = requirements.filter(
      (r) => r.status === "draft" || r.status === "rejected"
    );

    if (eligibleApproved.length === 0) {
      if (alreadyConverted.length > 0) {
        toast("All approved requirements have already been converted to active tasks.", "info");
      } else {
        toast("No approved requirements available for conversion. Please approve requirements first.", "info");
      }
      return;
    }

    const ok = await confirm({
      title: "Convert All Approved Requirements to Active Tasks",
      message:
        `Convert ${eligibleApproved.length} approved requirement(s) into active Waterfall tasks?\n\n` +
        `• Eligible for conversion: ${eligibleApproved.length}\n` +
        `• Already converted: ${alreadyConverted.length}\n` +
        `• Excluded (draft/rejected): ${excludedDrafts.length}\n\n` +
        `Tasks will be created with deterministic DAA priorities, assigned to their Waterfall phases, and mapped with validated dependencies.`,
      confirmLabel: `Convert All (${eligibleApproved.length})`,
    });
    if (!ok) return;

    setBulkConvertingReqs(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/requirements/bulk-convert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        toast(
          `Bulk conversion complete: ${data.createdCount} new task(s) created, ${data.alreadyConvertedCount} already active.`,
          "success"
        );
        await fetchPlan();
      } else {
        const err = await res.json().catch(() => ({}));
        toast(err.error || "Failed to bulk convert requirements to tasks.", "error");
      }
    } catch (err: any) {
      toast(err.message || "Network error converting requirements.", "error");
    } finally {
      setBulkConvertingReqs(false);
    }
  };

  // Convert Requirement to Task
  const handleConvertToTask = async (reqItem: RequirementItem) => {
    if (!resolvedProjectId || !reqItem.reqId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/requirements/${reqItem.reqId}/convert-to-task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        toast(data.message || `Requirement converted to Task!`, "success");
        await fetchPlan();
        if (onNavigateToTasks) onNavigateToTasks();
      } else {
        const err = await res.json();
        toast(err.error || "Failed to convert requirement", "error");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  // Delete Requirement
  const handleDeleteReq = async (reqItem: RequirementItem) => {
    if (!resolvedProjectId || !reqItem.reqId) return;
    const ok = await confirm({
      title: "Delete Requirement",
      message: `Are you sure you want to delete ${reqItem.reqId}: "${reqItem.title}"?`,
      destructive: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/requirements/${reqItem.reqId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRequirements(data.requirements || []);
        if (data.readiness) setReadiness(data.readiness);
        toast("Requirement removed.", "info");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  // Open Add/Edit Requirement Modal
  const openRequirementModal = (item?: RequirementItem) => {
    if (item) {
      setEditingReq(item);
      setReqTitle(item.title);
      setReqDescription(item.description);
      setReqPhase(item.phase || "requirements");
      setReqAcademicValue(item.academicValue ?? 8);
      setReqTeacherImportance(item.teacherImportance ?? 8);
      setReqCriticality(item.criticality ?? 7);
      setReqBusinessValue(item.businessValue ?? 7);
      setReqEstimatedHours(item.estimatedHours ?? 14);
      setReqSkills((item.requiredSkills || []).join(", "));
      setReqDeps((item.dependencies || []).join(", "));
      setReqStatus("draft"); // Editing resets status to draft for review
    } else {
      setEditingReq(null);
      setReqTitle("");
      setReqDescription("");
      setReqPhase("requirements");
      setReqAcademicValue(8);
      setReqTeacherImportance(8);
      setReqCriticality(7);
      setReqBusinessValue(7);
      setReqEstimatedHours(14);
      setReqSkills("");
      setReqDeps("");
      setReqStatus("draft");
    }
    setShowReqModal(true);
  };

  // Save / Update Requirement
  const handleSaveRequirement = async () => {
    if (!reqTitle.trim()) {
      toast("Requirement title is required.", "error");
      return;
    }
    if (!resolvedProjectId) return;

    const payload = {
      title: reqTitle.trim(),
      description: reqDescription.trim(),
      phase: reqPhase,
      academicValue: reqAcademicValue,
      teacherImportance: reqTeacherImportance,
      criticality: reqCriticality,
      businessValue: reqBusinessValue,
      estimatedHours: reqEstimatedHours,
      requiredSkills: reqSkills.split(",").map((s) => s.trim()).filter(Boolean),
      dependencies: reqDeps.split(",").map((d) => d.trim()).filter(Boolean),
      status: editingReq ? "draft" : reqStatus, // Editing resets approval to draft
    };

    try {
      let res;
      if (editingReq && editingReq.reqId) {
        res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/requirements/${editingReq.reqId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE_URL}/api/projects/${resolvedProjectId}/requirements`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        const data = await res.json();
        setRequirements(data.requirements || []);
        if (data.readiness) setReadiness(data.readiness);
        setShowReqModal(false);
        toast(editingReq ? "Requirement updated & re-scored!" : "New requirement created!", "success");
      } else {
        const err = await res.json();
        toast(err.error || "Save failed", "error");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  // Filtered Requirements
  const filteredRequirements = requirements.filter((r) => {
    const matchesPhase = selectedPhaseFilter === "all" || r.phase === selectedPhaseFilter;
    const matchesQuery =
      !searchQuery.trim() ||
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reqId.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPhase && matchesQuery;
  });

  if (loading) {
    return (
      <View style={s.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[font.caption, { color: colors.textFaint, marginTop: spacing.md }]}>
          Loading Waterfall Plan & Context...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={[s.contentContainer, isEmbedded && { paddingTop: spacing.xs }]}>
      {/* Waterfall Guide Entry Point (only if not embedded) */}
      {!isEmbedded && <WaterfallGuideBanner style={{ marginBottom: spacing.sm }} />}

      {/* Header Banner */}
      <View style={s.headerBanner}>
        <View style={s.badgeRow}>
          <View style={s.waterfallBadge}>
            <Ionicons name="git-commit" size={14} color={colors.primary} />
            <Text style={s.waterfallBadgeText}>
              {isEmbedded ? "WATERFALL · PROJECT SETUP & PLAN" : "WATERFALL METHODOLOGY · PROJECT SETUP & PLAN"}
            </Text>
          </View>
          <View style={s.scopeBadge}>
            <Ionicons name="lock-closed" size={12} color={colors.textFaint} />
            <Text style={s.scopeBadgeText}>STRICT SEQUENTIAL SCOPE</Text>
          </View>
        </View>
        <Text style={font.h1}>Project Setup & Plan</Text>
        <Text style={s.headerSubtitle}>
          Upload specifications, teacher instructions, and architecture documents. Review AI-synthesized
          functional requirements scored dynamically via DAA prior to task commitment.
        </Text>
      </View>

      {/* Section 1: Project Artifacts & Context Intake */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.cardHeaderLeft}>
            <Ionicons name="document-attach" size={20} color={colors.primary} />
            <Text style={font.h2}>Project Artifacts & Knowledge Base</Text>
            {artifacts.length > 0 && (
              <View style={[
                s.approvalSummaryPill,
                { backgroundColor: artifacts.filter(a => a.approvalStatus === "approved").length === artifacts.length ? colors.success + "18" : colors.warning + "18" }
              ]}>
                <Ionicons
                  name={artifacts.filter(a => a.approvalStatus === "approved").length === artifacts.length ? "shield-checkmark" : "time-outline"}
                  size={13}
                  color={artifacts.filter(a => a.approvalStatus === "approved").length === artifacts.length ? colors.success : colors.warning}
                />
                <Text style={[
                  s.approvalSummaryText,
                  { color: artifacts.filter(a => a.approvalStatus === "approved").length === artifacts.length ? colors.success : colors.warning }
                ]}>
                  {artifacts.filter(a => a.approvalStatus === "approved").length} of {artifacts.length} artifacts approved
                </Text>
              </View>
            )}
          </View>
          <View style={s.artifactHeaderActions}>
            <Pressable
              style={s.primaryActionBtn}
              onPress={() => setShowArtifactModal(true)}
            >
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={s.primaryActionBtnText}>Upload / Add Artifact</Text>
            </Pressable>

            {artifacts.length > 0 && (
              <Pressable
                style={[
                  s.approveAllBtn,
                  (artifacts.filter(a => a.approvalStatus !== "approved").length === 0 || approvingAll) && s.approveAllBtnDisabled
                ]}
                onPress={handleApproveAll}
                disabled={artifacts.filter(a => a.approvalStatus !== "approved").length === 0 || approvingAll}
              >
                {approvingAll ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="checkmark-done" size={16} color="#FFF" />
                )}
                <Text style={s.approveAllBtnText}>
                  {artifacts.filter(a => a.approvalStatus !== "approved").length === 0
                    ? "All Approved"
                    : `Approve All (${artifacts.filter(a => a.approvalStatus !== "approved").length})`}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        <Text style={s.cardDesc}>
          Accepted files: Requirements documents (SRS), teacher rubrics, Markdown architecture notes,
          and system specifications. Review and approve all artifacts prior to Waterfall plan finalization.
        </Text>

        {artifacts.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="cloud-upload-outline" size={36} color={colors.textFaint} />
            <Text style={s.emptyTitle}>No project artifacts uploaded yet</Text>
            <Text style={s.emptySub}>
              Add an SRS document or syllabus to enable automated DAA requirement extraction.
            </Text>
          </View>
        ) : (
          <View style={s.artifactList}>
            {artifacts.map((a, idx) => {
              const isApproved = a.approvalStatus === "approved";
              const stableArtKey = a._id ? String(a._id) : (a as any).id || `artifact-${idx}`;
              return (
                <View key={stableArtKey} style={[s.artifactCard, isApproved && s.artifactCardApproved]}>
                  <View style={s.artifactLeft}>
                    <Ionicons
                      name={
                        a.artifactType === "srs"
                          ? "document-text"
                          : a.artifactType === "teacher_instructions"
                          ? "school"
                          : a.artifactType === "diagram"
                          ? "images"
                          : "document"
                      }
                      size={22}
                      color={isApproved ? colors.success : colors.primary}
                    />
                    <View style={{ marginLeft: spacing.sm, flexShrink: 1 }}>
                      <Text style={font.h3} numberOfLines={1}>{a.name}</Text>
                      <View style={s.artifactMetaRow}>
                        <View style={s.tagBadge}>
                          <Text style={s.tagBadgeText}>{(a.artifactType || "doc").toUpperCase()}</Text>
                        </View>
                        <View style={[s.tagBadge, a.scope === "persistent" ? s.persistentBadge : s.tempBadge]}>
                          <Text style={[s.tagBadgeText, a.scope === "persistent" ? s.persistentText : s.tempText]}>
                            {a.scope === "persistent" ? "PERSISTENT BRAIN" : "TEMP SESSION"}
                          </Text>
                        </View>
                        {!!a.fileSize && (
                          <Text style={s.fileSizeText}>{Math.round(a.fileSize / 1024)} KB</Text>
                        )}
                        {/* Approval Status Badge */}
                        <View style={[s.artifactApprovalBadge, isApproved ? s.artifactApprovalApproved : s.artifactApprovalPending]}>
                          <Ionicons
                            name={isApproved ? "checkmark-circle" : "time-outline"}
                            size={12}
                            color={isApproved ? colors.success : colors.warning}
                          />
                          <Text style={[s.artifactApprovalText, { color: isApproved ? colors.success : colors.warning }]}>
                            {isApproved ? "APPROVED" : "PENDING APPROVAL"}
                          </Text>
                        </View>
                        {isApproved && !!a.approvedByName && (
                          <Text style={s.approvedByLabel}>by {a.approvedByName}</Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Actions: View, Edit, Approve, Delete */}
                  <View style={s.artifactActionRow}>
                    <Pressable
                      onPress={() => setViewingArtifact(a)}
                      hitSlop={6}
                      style={s.artifactActionIconBtn}
                      accessibilityLabel="View artifact source"
                    >
                      <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
                    </Pressable>

                    <Pressable
                      onPress={() => handleOpenEditArtifact(a)}
                      hitSlop={6}
                      style={s.artifactActionIconBtn}
                      accessibilityLabel="Edit artifact"
                    >
                      <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                    </Pressable>

                    {!isApproved ? (
                      <Pressable
                        onPress={() => handleApproveArtifact(a._id)}
                        disabled={approvingArtifactId === a._id}
                        hitSlop={6}
                        style={[s.approveSingleBtn, approvingArtifactId === a._id && { opacity: 0.5 }]}
                      >
                        {approvingArtifactId === a._id ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <>
                            <Ionicons name="checkmark" size={13} color="#FFF" />
                            <Text style={s.approveSingleBtnText}>Approve</Text>
                          </>
                        )}
                      </Pressable>
                    ) : (
                      <View style={s.approvedStaticPill}>
                        <Ionicons name="checkmark-done" size={13} color={colors.success} />
                        <Text style={s.approvedStaticPillText}>Approved</Text>
                      </View>
                    )}

                    <Pressable
                      onPress={() => handleDeleteArtifact(a._id)}
                      hitSlop={6}
                      style={[s.artifactActionIconBtn, deletingArtifactId === a._id && { opacity: 0.5 }]}
                      disabled={deletingArtifactId === a._id}
                      accessibilityLabel="Delete artifact"
                    >
                      {deletingArtifactId === a._id ? (
                        <ActivityIndicator size="small" color={colors.danger} />
                      ) : (
                        <Ionicons name="trash-outline" size={16} color={colors.danger} />
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* AI Extraction Trigger */}
        <View style={s.extractSection}>
          <Pressable
            style={[s.aiExtractBtn, extracting && s.aiExtractBtnDisabled]}
            onPress={handleExtractPlan}
            disabled={extracting}
          >
            {extracting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="sparkles" size={18} color="#FFF" />
            )}
            <Text style={s.aiExtractBtnText}>
              {extracting ? "Extracting Plan with Project AI..." : "Analyze Artifacts & Extract Waterfall Plan"}
            </Text>
          </Pressable>
          <Text style={s.extractHint}>
            Guaranteed $0 LLM cost policy. Extracts draft goals, constraints, and IEEE-style SRS items for human review.
          </Text>
        </View>
      </View>

      {/* Section 2: Waterfall Plan Lifecycle, Scope Contradictions & 3-Card Scope */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.cardHeaderLeft}>
            <Ionicons name="git-network-outline" size={20} color={colors.primary} />
            <Text style={font.h2}>Waterfall Plan Lifecycle & Scope Intelligence</Text>
            {lifecycle?.status && (
              <View style={[s.lifecycleBadge, {
                backgroundColor:
                  lifecycle.status === "PLAN_FINALIZED" || lifecycle.status === "TASKS_GENERATED" || lifecycle.status === "IN_EXECUTION"
                    ? colors.success + "20"
                    : lifecycle.status === "AWAITING_FINALIZATION"
                    ? colors.warning + "20"
                    : colors.primary + "15"
              }]}>
                <Text style={[s.lifecycleBadgeText, {
                  color:
                    lifecycle.status === "PLAN_FINALIZED" || lifecycle.status === "TASKS_GENERATED" || lifecycle.status === "IN_EXECUTION"
                      ? colors.success
                      : lifecycle.status === "AWAITING_FINALIZATION"
                      ? colors.warning
                      : colors.primary
                }]}>
                  {lifecycle.status.replace(/_/g, " ")}
                </Text>
              </View>
            )}
          </View>
          <View style={s.revisionRow}>
            <Text style={s.revisionText}>
              Plan Rev: v{lifecycle?.planRevision || 1} • Artifact Rev: v{lifecycle?.artifactAnalysisRevision || 0}
            </Text>
          </View>
        </View>

        {/* Scope Contradictions / Conflicts Section */}
        {conflicts && conflicts.length > 0 && (
          <View style={s.conflictsBox}>
            <View style={s.conflictsHeader}>
              <Ionicons name="warning" size={18} color={colors.warning} />
              <Text style={s.conflictsTitle}>
                Scope Contradictions Detected ({conflicts.filter(c => c.status === "unresolved").length} Unresolved)
              </Text>
            </View>
            <Text style={s.conflictsSub}>
              Contradictions between uploaded briefs and project context must be resolved before plan finalization.
              Select an authoritative interpretation, provide a custom rationale, or edit/delete conflicting artifacts.
            </Text>
            {conflicts.map((c, cIdx) => (
              <View key={c.id || (c as any)._id || `conflict-${cIdx}`} style={[s.conflictCard, c.status === "resolved" && s.conflictCardResolved]}>
                <View style={s.conflictCardTop}>
                  <Text style={s.conflictCardTitle}>{c.title}</Text>
                  <View style={[s.conflictBadge, { backgroundColor: c.status === "resolved" ? colors.success + "20" : colors.warning + "20" }]}>
                    <Text style={[s.conflictBadgeText, { color: c.status === "resolved" ? colors.success : colors.warning }]}>
                      {c.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Reason / Explanation */}
                {!!c.reason && (
                  <View style={s.conflictReasonRow}>
                    <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                    <Text style={s.conflictReasonText}>{c.reason}</Text>
                  </View>
                )}

                {/* Sources Row */}
                {(c.sourceDocumentA || c.sourceDocumentB) && (
                  <View style={s.conflictSourcesRow}>
                    <Text style={s.conflictSourcesText}>
                      Document Sources: <Text style={{ fontWeight: "700" }}>{c.sourceDocumentA || c.sourceA}</Text> vs <Text style={{ fontWeight: "700" }}>{c.sourceDocumentB || c.sourceB}</Text>
                    </Text>
                  </View>
                )}

                <View style={s.conflictComparison}>
                  <View style={s.conflictSide}>
                    <Text style={s.conflictSourceLabel}>{c.sourceA}:</Text>
                    <Text style={s.conflictStatement}>"{c.statementA}"</Text>
                    {c.status === "unresolved" && (
                      <Pressable
                        style={s.conflictChooseBtn}
                        disabled={resolvingConflictId === c.id}
                        onPress={() => handleResolveConflict(c.id, c.statementA, "interpretation_a")}
                      >
                        <Ionicons name="checkmark-done" size={13} color={colors.primary} />
                        <Text style={s.conflictChooseBtnText}>Choose Interpretation A</Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={s.conflictSide}>
                    <Text style={s.conflictSourceLabel}>{c.sourceB}:</Text>
                    <Text style={s.conflictStatement}>"{c.statementB}"</Text>
                    {c.status === "unresolved" && (
                      <Pressable
                        style={s.conflictChooseBtn}
                        disabled={resolvingConflictId === c.id}
                        onPress={() => handleResolveConflict(c.id, c.statementB, "interpretation_b")}
                      >
                        <Ionicons name="checkmark-done" size={13} color={colors.primary} />
                        <Text style={s.conflictChooseBtnText}>Choose Interpretation B</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* Actionable Custom Resolution & Artifact Shortcuts */}
                {c.status === "unresolved" && (
                  <View style={s.conflictExtraActionsRow}>
                    <Pressable
                      style={s.conflictCustomRationaleBtn}
                      onPress={() => handleOpenCustomConflict(c)}
                    >
                      <Ionicons name="create-outline" size={13} color={colors.primary} />
                      <Text style={s.conflictCustomRationaleBtnText}>Resolve with Custom Rationale...</Text>
                    </Pressable>

                    {c.relatedArtifactIds && c.relatedArtifactIds.length > 0 && (
                      <View style={s.conflictArtifactShortcuts}>
                        <Text style={s.conflictArtifactShortcutLabel}>Or modify source artifact:</Text>
                        {c.relatedArtifactIds.map((artId, artIdx) => {
                          const art = artifacts.find(a => a._id === artId);
                          if (!art) return null;
                          const artBtnKey = artId ? String(artId) : `conflict-art-${artIdx}`;
                          return (
                            <View key={artBtnKey} style={s.conflictArtifactBtnGroup}>
                              <Pressable
                                style={s.conflictEditArtBtn}
                                onPress={() => handleOpenEditArtifact(art)}
                              >
                                <Ionicons name="pencil" size={11} color={colors.primary} />
                                <Text style={s.conflictEditArtText}>Edit {art.name}</Text>
                              </Pressable>
                              <Pressable
                                style={s.conflictDelArtBtn}
                                onPress={() => handleDeleteArtifact(artId)}
                              >
                                <Ionicons name="trash" size={11} color={colors.danger} />
                                <Text style={s.conflictDelArtText}>Delete</Text>
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}

                {c.status === "resolved" && (
                  <View style={s.resolvedNoteBox}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <View style={{ flex: 1, marginLeft: 6 }}>
                      <Text style={s.resolvedNoteText}>Authoritative Decision: {c.selectedResolution}</Text>
                      {!!c.resolutionNote && (
                        <Text style={s.resolvedRationaleText}>Rationale: {c.resolutionNote}</Text>
                      )}
                      <Text style={s.resolvedAuditText}>
                        Resolved by {c.resolvedByName || "Project Lead"}
                        {c.resolvedAt ? ` on ${new Date(c.resolvedAt).toLocaleDateString()}` : ""}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* The 3 Scope Cards: Goals, Deliverables, Constraints */}
        <View style={s.threeColGrid}>
          {/* Executive Goals */}
          <View style={s.colBox}>
            <View style={s.colBoxHeader}>
              <View style={s.colHeaderLeft}>
                <Ionicons name="flag" size={16} color={colors.accent} />
                <Text style={s.colTitle}>EXECUTIVE GOALS</Text>
              </View>
              <Pressable onPress={() => openScopeModal("goals")} style={s.addScopeIconBtn}>
                <Ionicons name="add" size={16} color={colors.primary} />
              </Pressable>
            </View>
            {(scope.goals && scope.goals.length > 0) ? (
              scope.goals.map((g, i) => (
                <View key={g.id || `scope-goal-${i}`} style={s.richScopeItem}>
                  <View style={s.scopeItemTop}>
                    <Text style={s.scopeItemLabel}>{g.label}</Text>
                    {g.isInferred && (
                      <View style={s.inferredBadge}>
                        <Text style={s.inferredBadgeText}>Inferred — unconfirmed</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.scopeItemDesc}>{g.description}</Text>
                  <View style={s.scopeItemFooter}>
                    <Text style={s.scopeItemSource}>
                      {g.sourceArtifact || "Project Brief"}{g.sourceReference ? ` • ${g.sourceReference}` : ""}
                    </Text>
                    <View style={s.scopeItemActions}>
                      <Pressable onPress={() => openScopeModal("goals", i)}>
                        <Ionicons name="create-outline" size={14} color={colors.textMuted} />
                      </Pressable>
                      <Pressable onPress={() => handleDeleteScopeItem("goals", i)}>
                        <Ionicons name="trash-outline" size={14} color={colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            ) : goals.length > 0 ? (
              goals.map((g, i) => (
                <View key={`goal-${i}`} style={s.bulletItem}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={s.bulletText}>{g}</Text>
                </View>
              ))
            ) : (
              <View style={s.unspecifiedNotice}>
                <Text style={s.unspecifiedNoticeText}>Not specified in artifacts — review required</Text>
                <Pressable onPress={() => openScopeModal("goals")} style={s.draftPromptBtn}>
                  <Text style={s.draftPromptBtnText}>+ Draft Goal</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Key Deliverables */}
          <View style={s.colBox}>
            <View style={s.colBoxHeader}>
              <View style={s.colHeaderLeft}>
                <Ionicons name="cube-outline" size={16} color={colors.primary} />
                <Text style={s.colTitle}>KEY DELIVERABLES</Text>
              </View>
              <Pressable onPress={() => openScopeModal("deliverables")} style={s.addScopeIconBtn}>
                <Ionicons name="add" size={16} color={colors.primary} />
              </Pressable>
            </View>
            {(scope.deliverables && scope.deliverables.length > 0) ? (
              scope.deliverables.map((d, i) => (
                <View key={d.id || `scope-deliv-${i}`} style={s.richScopeItem}>
                  <View style={s.scopeItemTop}>
                    <Text style={s.scopeItemLabel}>{d.label}</Text>
                    {d.isInferred && (
                      <View style={s.inferredBadge}>
                        <Text style={s.inferredBadgeText}>Inferred — unconfirmed</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.scopeItemDesc}>{d.description}</Text>
                  <View style={s.scopeItemFooter}>
                    <Text style={s.scopeItemSource}>
                      {d.sourceArtifact || "Project Brief"}{d.sourceReference ? ` • ${d.sourceReference}` : ""}
                    </Text>
                    <View style={s.scopeItemActions}>
                      <Pressable onPress={() => openScopeModal("deliverables", i)}>
                        <Ionicons name="create-outline" size={14} color={colors.textMuted} />
                      </Pressable>
                      <Pressable onPress={() => handleDeleteScopeItem("deliverables", i)}>
                        <Ionicons name="trash-outline" size={14} color={colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            ) : deliverables.length > 0 ? (
              deliverables.map((d, i) => (
                <View key={`deliv-${i}`} style={s.bulletItem}>
                  <Ionicons name="cube-outline" size={14} color={colors.primary} />
                  <Text style={s.bulletText}>{d}</Text>
                </View>
              ))
            ) : (
              <View style={s.unspecifiedNotice}>
                <Text style={s.unspecifiedNoticeText}>Not specified in artifacts — review required</Text>
                <Pressable onPress={() => openScopeModal("deliverables")} style={s.draftPromptBtn}>
                  <Text style={s.draftPromptBtnText}>+ Draft Deliverable</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Constraints & Policies */}
          <View style={s.colBox}>
            <View style={s.colBoxHeader}>
              <View style={s.colHeaderLeft}>
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.warning} />
                <Text style={s.colTitle}>CONSTRAINTS & POLICIES</Text>
              </View>
              <Pressable onPress={() => openScopeModal("constraints")} style={s.addScopeIconBtn}>
                <Ionicons name="add" size={16} color={colors.primary} />
              </Pressable>
            </View>
            {(scope.constraints && scope.constraints.length > 0) ? (
              scope.constraints.map((c, i) => (
                <View key={c.id || `scope-const-${i}`} style={s.richScopeItem}>
                  <View style={s.scopeItemTop}>
                    <Text style={s.scopeItemLabel}>{c.label}</Text>
                    {c.isInferred && (
                      <View style={s.inferredBadge}>
                        <Text style={s.inferredBadgeText}>Inferred — unconfirmed</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.scopeItemDesc}>{c.description}</Text>
                  <View style={s.scopeItemFooter}>
                    <Text style={s.scopeItemSource}>
                      {c.sourceArtifact || "Project Brief"}{c.sourceReference ? ` • ${c.sourceReference}` : ""}
                    </Text>
                    <View style={s.scopeItemActions}>
                      <Pressable onPress={() => openScopeModal("constraints", i)}>
                        <Ionicons name="create-outline" size={14} color={colors.textMuted} />
                      </Pressable>
                      <Pressable onPress={() => handleDeleteScopeItem("constraints", i)}>
                        <Ionicons name="trash-outline" size={14} color={colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            ) : constraints.length > 0 ? (
              constraints.map((c, i) => (
                <View key={`const-${i}`} style={s.bulletItem}>
                  <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
                  <Text style={s.bulletText}>{c}</Text>
                </View>
              ))
            ) : (
              <View style={s.unspecifiedNotice}>
                <Text style={s.unspecifiedNoticeText}>Not specified in artifacts — review required</Text>
                <Pressable onPress={() => openScopeModal("constraints")} style={s.draftPromptBtn}>
                  <Text style={s.draftPromptBtnText}>+ Draft Constraint</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Section 2.5: Document Readiness Confirmation & Finalization Bar */}
        <View style={s.finalizationBar}>
          <View style={s.readinessRow}>
            <Pressable
              style={s.checkboxRow}
              onPress={() => handleToggleReadiness(!readinessConfirmed)}
            >
              <Ionicons
                name={readinessConfirmed ? "checkbox" : "square-outline"}
                size={22}
                color={readinessConfirmed ? colors.primary : colors.textMuted}
              />
              <Text style={s.readinessLabel}>
                I have finished uploading and reviewing the project documents
              </Text>
            </Pressable>
            {lifecycle?.readinessConfirmedAt && (
              <Text style={s.readinessTimestamp}>
                Confirmed on {new Date(lifecycle.readinessConfirmedAt).toLocaleDateString()}
              </Text>
            )}
          </View>

          {/* Explicit Authoritative Blockers or Readiness Notice */}
          {lifecycle?.status !== "PLAN_FINALIZED" && lifecycle?.status !== "TASKS_GENERATED" && lifecycle?.status !== "IN_EXECUTION" && (
            <View style={s.readinessFeedbackContainer}>
              {readiness && !readiness.isReady ? (
                <View style={s.blockersBox}>
                  <View style={s.blockersHeader}>
                    <Ionicons name="alert-circle" size={17} color={colors.warning} />
                    <Text style={s.blockersTitle}>
                      Finalization Blocked ({readiness.blockers?.length || 1} unresolved requirement{readiness.blockers?.length !== 1 ? "s" : ""}):
                    </Text>
                  </View>
                  {(readiness.blockers && readiness.blockers.length > 0
                    ? readiness.blockers
                    : [
                        conflicts.some(c => c.status === "unresolved") ? "Resolve outstanding scope contradictions above" : null,
                        artifacts.some(a => a.approvalStatus !== "approved") ? "Approve all project artifacts" : null,
                        requirements.some(r => r.status !== "approved" && r.status !== "in_progress" && r.status !== "verified")
                          ? `Approve all remaining ${requirements.filter(r => r.status !== "approved" && r.status !== "in_progress" && r.status !== "verified").length} requirement(s)`
                          : null,
                        !readinessConfirmed ? "Confirm document review checkbox above" : null,
                      ].filter(Boolean) as string[]
                  ).map((blocker, bIdx) => (
                    <View key={`blocker-${bIdx}`} style={s.blockerItem}>
                      <Ionicons name="close-circle-outline" size={14} color={colors.danger} />
                      <Text style={s.blockerItemText}>{blocker}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={s.readySuccessBox}>
                  <Ionicons name="checkmark-circle" size={17} color={colors.success} />
                  <Text style={s.readySuccessText}>
                    All finalization prerequisites satisfied. Ready to finalize plan and generate tasks.
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={s.finalizeActionRow}>
            {lifecycle?.status === "PLAN_FINALIZED" || lifecycle?.status === "TASKS_GENERATED" || lifecycle?.status === "IN_EXECUTION" ? (
              <View style={s.finalizedStatusBox}>
                <View style={s.finalizedBadge}>
                  <Ionicons name="checkmark-done-circle" size={18} color={colors.success} />
                  <Text style={s.finalizedBadgeText}>Waterfall Plan Finalized (Rev v{lifecycle.finalizedPlanRevision || 1})</Text>
                </View>
                <Pressable
                  style={s.viewTasksBtn}
                  onPress={() => onNavigateToTasks && onNavigateToTasks()}
                >
                  <Text style={s.viewTasksBtnText}>View Generated Tasks</Text>
                  <Ionicons name="arrow-forward" size={15} color="#FFF" />
                </Pressable>
              </View>
            ) : (
              <View style={s.finalizeBtnContainer}>
                <Pressable
                  style={[
                    s.finalizePlanBtn,
                    (!readiness?.isReady || finalizing) && s.finalizePlanBtnDisabled
                  ]}
                  disabled={!readiness?.isReady || finalizing}
                  onPress={handleFinalizePlan}
                >
                  {finalizing ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="lock-open" size={18} color="#FFF" />
                      <Text style={s.finalizePlanBtnText}>Finalize Waterfall Plan & Generate Tasks</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Section 3: Structured Requirements (SRS) Workspace */}
      <View style={s.card}>
        <View style={[s.cardHeader, s.reqsCardHeader]}>
          <View style={[s.cardHeaderLeft, s.reqsCardHeaderLeft]}>
            <Ionicons name="list-circle" size={20} color={colors.primary} />
            <Text style={font.h2}>Waterfall Requirements (SRS & DAA Ranked)</Text>
            <View style={s.countBadge}>
              <Text style={s.countBadgeText}>{requirements.length}</Text>
            </View>
          </View>
          <View style={s.cardHeaderRightRow}>
            <Text style={s.approvalSummaryText}>
              Approved: {requirements.filter(r => r.status === "approved" || r.status === "in_progress" || r.status === "verified").length} / {requirements.length}
            </Text>
            <Pressable
              style={[
                s.approveAllReqsBtn,
                requirements.length > 0 && requirements.filter(r => r.status !== "approved" && r.status !== "in_progress" && r.status !== "verified").length === 0 && s.approveAllReqsBtnDone,
              ]}
              onPress={handleApproveAllRequirements}
              disabled={requirements.length === 0 || requirements.filter(r => r.status !== "approved" && r.status !== "in_progress" && r.status !== "verified").length === 0 || approvingAllReqs}
            >
              {approvingAllReqs ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={16} color="#fff" />
                  <Text style={s.approveAllReqsBtnText}>
                    {requirements.length > 0 && requirements.filter(r => r.status !== "approved" && r.status !== "in_progress" && r.status !== "verified").length === 0
                      ? "All Requirements Approved"
                      : "Approve All Requirements"}
                  </Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[
                s.bulkConvertBtn,
                requirements.filter(r => (r.status === "approved" || r.status === "in_progress" || r.status === "verified") && !r.hasActiveTask).length === 0 && s.bulkConvertBtnDone,
              ]}
              onPress={handleBulkConvertToTasks}
              disabled={requirements.filter(r => (r.status === "approved" || r.status === "in_progress" || r.status === "verified") && !r.hasActiveTask).length === 0 || bulkConvertingReqs}
            >
              {bulkConvertingReqs ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="flash" size={15} color="#fff" />
                  <Text style={s.bulkConvertBtnText}>Convert All to Tasks</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={s.addReqOutlineBtn}
              onPress={() => openRequirementModal()}
            >
              <Ionicons name="add" size={16} color={colors.text} />
              <Text style={s.addReqOutlineBtnText}>Add Requirement</Text>
            </Pressable>
          </View>
        </View>
        <Text style={s.cardSubtext}>
          Users can edit or delete individual requirements first. After bulk approval, the count updates to reflect the actual remaining approved records.
        </Text>

        {/* Phase Filters & Search */}
        <View style={s.filterRow}>
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={colors.textFaint} />
            <TextInput
              style={s.searchInput}
              placeholder="Search requirements or REQ ID..."
              placeholderTextColor={colors.textFaint}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.phasePills}>
            <Pressable
              style={[s.phasePill, selectedPhaseFilter === "all" && s.phasePillActive]}
              onPress={() => setSelectedPhaseFilter("all")}
            >
              <Text style={[s.phasePillText, selectedPhaseFilter === "all" && s.phasePillTextActive]}>
                All Phases
              </Text>
            </Pressable>
            {Object.keys(WATERFALL_PHASE_META).map((pKey) => {
              const pMeta = WATERFALL_PHASE_META[pKey as keyof typeof WATERFALL_PHASE_META];
              const isActive = selectedPhaseFilter === pKey;
              return (
                <Pressable
                  key={pKey}
                  style={[s.phasePill, isActive && { backgroundColor: pMeta.color + "18", borderColor: pMeta.color }]}
                  onPress={() => setSelectedPhaseFilter(pKey)}
                >
                  <Text style={[s.phasePillText, isActive && { color: pMeta.color, fontWeight: "700" }]}>
                    {pMeta.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Requirement Cards */}
        {filteredRequirements.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="document-text-outline" size={36} color={colors.textFaint} />
            <Text style={s.emptyTitle}>No matching requirements</Text>
            <Text style={s.emptySub}>
              Run AI extraction above or click "Add Requirement" to specify scope.
            </Text>
          </View>
        ) : (
          <View style={s.reqList}>
            {filteredRequirements.map((r, rIdx) => {
              const pMeta = WATERFALL_PHASE_META[r.phase as keyof typeof WATERFALL_PHASE_META] as any || {
                label: r.phase,
                short: r.phase,
                color: colors.primary,
              };
              const isApproved = r.status === "approved" || r.status === "in_progress" || r.status === "verified";
              const stableReqKey = (r as any)._id || r.reqId || (r as any).id || `req-card-${rIdx}`;

              return (
                <View key={stableReqKey} style={s.reqCard}>
                  {/* Top Line: ID, Phase, Status, Score */}
                  <View style={s.reqTopLine}>
                    <View style={s.reqTagsRow}>
                      <View style={s.reqIdBadge}>
                        <Text style={s.reqIdText}>{r.reqId || `REQ-${String(rIdx + 1).padStart(2, "0")}`}</Text>
                      </View>
                      <View style={[s.phaseBadge, { backgroundColor: pMeta.color + "18", borderColor: pMeta.color + "44" }]}>
                        <Text style={[s.phaseBadgeText, { color: pMeta.color }]}>{(pMeta.short || pMeta.label).toUpperCase()}</Text>
                      </View>
                      <View style={[s.statusBadge, isApproved ? s.approvedBadge : s.draftBadge]}>
                        <Text style={[s.statusBadgeText, isApproved ? s.approvedText : s.draftText]}>
                          {r.status.toUpperCase()}
                        </Text>
                      </View>
                      {r.hasActiveTask && (
                        <View style={s.activeTaskBadge}>
                          <Ionicons name="checkmark-circle" size={11} color="#16a34a" />
                          <Text style={s.activeTaskBadgeText}>ACTIVE TASK CREATED</Text>
                        </View>
                      )}
                    </View>

                    {/* DAA Score Indicator */}
                    <View style={s.scoreBox}>
                      <Text style={s.scoreNumber}>{r.priorityScore}</Text>
                      <Text style={s.scoreLabel}>DAA PRIORITY</Text>
                    </View>
                  </View>

                  {/* Title & Description */}
                  <Text style={s.reqTitle}>{r.title}</Text>
                  {!!r.description && <Text style={s.reqDesc}>{r.description}</Text>}

                  {/* Score Explanation Badge */}
                  {!!r.scoreExplanation && (
                    <View style={s.scoreExplanationBanner}>
                      <Ionicons name="calculator-outline" size={14} color={colors.primary} />
                      <Text style={s.scoreExplanationText}>{r.scoreExplanation}</Text>
                    </View>
                  )}

                  {/* Metadata Row: Hours, Skills, Dependencies */}
                  <View style={s.reqMetaRow}>
                    <View style={s.metaChip}>
                      <Ionicons name="time-outline" size={13} color={colors.textFaint} />
                      <Text style={s.metaChipText}>{r.estimatedHours}h est.</Text>
                    </View>
                    {r.requiredSkills && r.requiredSkills.length > 0 && (
                      <View style={s.metaChip}>
                        <Ionicons name="construct-outline" size={13} color={colors.textFaint} />
                        <Text style={s.metaChipText}>{r.requiredSkills.join(", ")}</Text>
                      </View>
                    )}
                    {r.dependencies && r.dependencies.length > 0 && (
                      <View style={s.metaChip}>
                        <Ionicons name="git-network-outline" size={13} color={colors.textFaint} />
                        <Text style={s.metaChipText}>Prereq: {r.dependencies.join(", ")}</Text>
                      </View>
                    )}
                  </View>

                  {/* Action Buttons */}
                  <View style={s.reqActionsRow}>
                    {r.status === "draft" && (
                      <Pressable
                        style={s.approveBtn}
                        onPress={() => handleApproveReq(r)}
                      >
                        <Ionicons name="checkmark" size={14} color="#FFF" />
                        <Text style={s.approveBtnText}>Approve Requirement</Text>
                      </Pressable>
                    )}

                    {isApproved && (
                      r.hasActiveTask ? (
                        <View style={s.taskAlreadyCreatedBtn}>
                          <Ionicons name="checkmark-done" size={14} color="#16a34a" />
                          <Text style={s.taskAlreadyCreatedBtnText}>
                            Task Active{r.linkedTaskId ? ` (#${String(r.linkedTaskId).slice(-4)})` : ""}
                          </Text>
                        </View>
                      ) : (
                        <Pressable
                          style={s.convertTaskBtn}
                          onPress={() => handleConvertToTask(r)}
                        >
                          <Ionicons name="arrow-forward" size={14} color="#FFF" />
                          <Text style={s.convertTaskBtnText}>Convert to Active Task</Text>
                        </Pressable>
                      )
                    )}

                    <Pressable
                      style={s.editBtn}
                      onPress={() => openRequirementModal(r)}
                    >
                      <Ionicons name="pencil" size={14} color={colors.text} />
                      <Text style={s.editBtnText}>Edit</Text>
                    </Pressable>

                    <Pressable
                      style={s.iconBtn}
                      onPress={() => handleDeleteReq(r)}
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Artifact Modal */}
      <Modal visible={showArtifactModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={font.h2}>Upload / Add Project Artifact</Text>
              <Pressable onPress={() => setShowArtifactModal(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={s.fieldLabel}>Artifact Name</Text>
              <TextInput
                style={s.modalInput}
                placeholder="e.g. IEEE SRS Document, Teacher Rubric, Architecture Overview"
                placeholderTextColor={colors.textFaint}
                value={artifactName}
                onChangeText={setArtifactName}
              />

              <Text style={s.fieldLabel}>Artifact Category</Text>
              <View style={s.typeSelectorRow}>
                {[
                  { key: "srs", label: "SRS Spec" },
                  { key: "teacher_instructions", label: "Rubric / Instructions" },
                  { key: "diagram", label: "Architecture / Diagram" },
                  { key: "notes", label: "Notes" },
                ].map((t) => (
                  <Pressable
                    key={t.key}
                    style={[s.typeChoice, artifactType === t.key && s.typeChoiceActive]}
                    onPress={() => setArtifactType(t.key)}
                  >
                    <Text style={[s.typeChoiceText, artifactType === t.key && s.typeChoiceTextActive]}>
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={s.fieldLabel}>Persistence Scope</Text>
              <View style={s.scopeToggleRow}>
                <Pressable
                  style={[s.scopeToggleBtn, artifactScope === "persistent" && s.scopeToggleBtnActive]}
                  onPress={() => setArtifactScope("persistent")}
                >
                  <Ionicons
                    name="server-outline"
                    size={16}
                    color={artifactScope === "persistent" ? colors.primary : colors.textFaint}
                  />
                  <Text style={[s.scopeToggleText, artifactScope === "persistent" && s.scopeToggleTextActive]}>
                    Persistent Project Context (Saved to Brain)
                  </Text>
                </Pressable>

                <Pressable
                  style={[s.scopeToggleBtn, artifactScope === "temporary" && s.scopeToggleBtnActive]}
                  onPress={() => setArtifactScope("temporary")}
                >
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={artifactScope === "temporary" ? colors.primary : colors.textFaint}
                  />
                  <Text style={[s.scopeToggleText, artifactScope === "temporary" && s.scopeToggleTextActive]}>
                    Temporary Session Only
                  </Text>
                </Pressable>
              </View>

              <Text style={s.fieldLabel}>Content / Text / Markdown Instructions</Text>
              <TextInput
                style={[s.modalInput, { minHeight: 120, textAlignVertical: "top" }]}
                placeholder="Paste the full document text, teacher instructions, requirements bullet points, or architecture specifications here..."
                placeholderTextColor={colors.textFaint}
                multiline
                value={artifactContent}
                onChangeText={setArtifactContent}
              />
            </ScrollView>

            <View style={s.modalFooter}>
              <Pressable
                style={s.modalCancelBtn}
                onPress={() => setShowArtifactModal(false)}
                disabled={savingArtifact}
              >
                <Text style={s.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.modalSaveBtn, savingArtifact && { opacity: 0.7 }]}
                onPress={handleSaveArtifact}
                disabled={savingArtifact}
              >
                {savingArtifact ? (
                  <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 6 }} />
                ) : null}
                <Text style={s.modalSaveBtnText}>
                  {savingArtifact ? "Saving..." : "Save to Knowledge Base"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Requirement Add / Edit Modal */}
      <Modal visible={showReqModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={font.h2}>{editingReq ? "Edit Requirement" : "Add Formal Requirement"}</Text>
              <Pressable onPress={() => setShowReqModal(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 440 }}>
              <Text style={s.fieldLabel}>Requirement Title</Text>
              <TextInput
                style={s.modalInput}
                placeholder="e.g. Real-Time Student At-Risk Prediction API"
                placeholderTextColor={colors.textFaint}
                value={reqTitle}
                onChangeText={setReqTitle}
              />

              <Text style={s.fieldLabel}>Waterfall Phase</Text>
              <View style={s.typeSelectorRow}>
                {["requirements", "design", "implementation", "testing", "deployment"].map((p) => (
                  <Pressable
                    key={p}
                    style={[s.typeChoice, reqPhase === p && s.typeChoiceActive]}
                    onPress={() => setReqPhase(p)}
                  >
                    <Text style={[s.typeChoiceText, reqPhase === p && s.typeChoiceTextActive]}>
                      {p.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={s.fieldLabel}>Description / Acceptance Criteria</Text>
              <TextInput
                style={[s.modalInput, { minHeight: 70, textAlignVertical: "top" }]}
                placeholder="Describe functional specifics and verification criteria..."
                placeholderTextColor={colors.textFaint}
                multiline
                value={reqDescription}
                onChangeText={setReqDescription}
              />

              {/* DAA Scoring Sliders / Inputs */}
              <View style={s.scoringGrid}>
                <View style={s.scoreField}>
                  <Text style={s.scoreFieldLabel}>Academic Value (1-10)</Text>
                  <TextInput
                    style={s.scoreInput}
                    keyboardType="numeric"
                    value={String(reqAcademicValue)}
                    onChangeText={(v) => setReqAcademicValue(Math.max(1, Math.min(10, Number(v) || 1)))}
                  />
                </View>
                <View style={s.scoreField}>
                  <Text style={s.scoreFieldLabel}>Teacher Importance (1-10)</Text>
                  <TextInput
                    style={s.scoreInput}
                    keyboardType="numeric"
                    value={String(reqTeacherImportance)}
                    onChangeText={(v) => setReqTeacherImportance(Math.max(1, Math.min(10, Number(v) || 1)))}
                  />
                </View>
                <View style={s.scoreField}>
                  <Text style={s.scoreFieldLabel}>System Criticality (1-10)</Text>
                  <TextInput
                    style={s.scoreInput}
                    keyboardType="numeric"
                    value={String(reqCriticality)}
                    onChangeText={(v) => setReqCriticality(Math.max(1, Math.min(10, Number(v) || 1)))}
                  />
                </View>
                <View style={s.scoreField}>
                  <Text style={s.scoreFieldLabel}>Business Value (1-10)</Text>
                  <TextInput
                    style={s.scoreInput}
                    keyboardType="numeric"
                    value={String(reqBusinessValue)}
                    onChangeText={(v) => setReqBusinessValue(Math.max(1, Math.min(10, Number(v) || 1)))}
                  />
                </View>
              </View>

              <View style={s.scoringGrid}>
                <View style={s.scoreField}>
                  <Text style={s.scoreFieldLabel}>Estimated Hours</Text>
                  <TextInput
                    style={s.scoreInput}
                    keyboardType="numeric"
                    value={String(reqEstimatedHours)}
                    onChangeText={(v) => setReqEstimatedHours(Math.max(1, Number(v) || 1))}
                  />
                </View>
                <View style={s.scoreField}>
                  <Text style={s.scoreFieldLabel}>Required Skills (comma-separated)</Text>
                  <TextInput
                    style={s.scoreInput}
                    placeholder="e.g. Python, Scikit-Learn, FastAPI"
                    placeholderTextColor={colors.textFaint}
                    value={reqSkills}
                    onChangeText={setReqSkills}
                  />
                </View>
              </View>

              <Text style={s.fieldLabel}>Prerequisite Dependencies (comma-separated REQ IDs)</Text>
              <TextInput
                style={s.modalInput}
                placeholder="e.g. REQ-001, REQ-002"
                placeholderTextColor={colors.textFaint}
                value={reqDeps}
                onChangeText={setReqDeps}
              />
            </ScrollView>

            <View style={s.modalFooter}>
              <Pressable style={s.modalCancelBtn} onPress={() => setShowReqModal(false)}>
                <Text style={s.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={s.modalSaveBtn} onPress={handleSaveRequirement}>
                <Text style={s.modalSaveBtnText}>{editingReq ? "Update & Re-Score" : "Save Requirement"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Add / Edit Scope Item */}
      <Modal visible={showScopeModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <View>
                <Text style={font.h3}>
                  {editingScopeIdx !== null ? "Edit" : "Add"} {scopeCategory === "goals" ? "Executive Goal" : scopeCategory === "deliverables" ? "Key Deliverable" : "Constraint & Policy"}
                </Text>
                <Text style={font.caption}>
                  Enter a concise 2–3-word label and verifiable project specification.
                </Text>
              </View>
              <Pressable onPress={() => setShowScopeModal(false)}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 440 }}>
              <Text style={s.fieldLabel}>Concise 2–3-Word Label *</Text>
              <TextInput
                style={s.modalInput}
                placeholder="e.g. Explainable Risk Scoring"
                placeholderTextColor={colors.textFaint}
                value={scopeDraftLabel}
                onChangeText={setScopeDraftLabel}
              />

              <Text style={s.fieldLabel}>Detailed Description & Purpose *</Text>
              <TextInput
                style={[s.modalInput, { height: 70 }]}
                multiline
                placeholder="Detailed capability, boundary, or restriction..."
                placeholderTextColor={colors.textFaint}
                value={scopeDraftDescription}
                onChangeText={setScopeDraftDescription}
              />

              <Text style={s.fieldLabel}>Source Artifact / Heading</Text>
              <TextInput
                style={s.modalInput}
                placeholder="e.g. Project Brief Section 2.1"
                placeholderTextColor={colors.textFaint}
                value={scopeDraftSource}
                onChangeText={setScopeDraftSource}
              />

              <View style={s.inferredToggleRow}>
                <Pressable
                  style={[s.inferredToggleBtn, scopeDraftIsInferred && s.inferredToggleBtnActive]}
                  onPress={() => setScopeDraftIsInferred(!scopeDraftIsInferred)}
                >
                  <Ionicons
                    name={scopeDraftIsInferred ? "checkbox" : "square-outline"}
                    size={18}
                    color={scopeDraftIsInferred ? colors.warning : colors.textMuted}
                  />
                  <Text style={[s.inferredToggleText, scopeDraftIsInferred && { color: colors.warning }]}>
                    Mark as Inferred — unconfirmed (requires team validation)
                  </Text>
                </Pressable>
              </View>
            </ScrollView>

            <View style={s.modalFooter}>
              <Pressable style={s.modalCancelBtn} onPress={() => setShowScopeModal(false)}>
                <Text style={s.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={s.modalSaveBtn} onPress={handleSaveScopeItem}>
                <Text style={s.modalSaveBtnText}>{editingScopeIdx !== null ? "Update Scope Item" : "Save Scope Item"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: View Artifact Content */}
      <Modal visible={!!viewingArtifact} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { maxWidth: 680 }]}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={font.h2} numberOfLines={1}>{viewingArtifact?.name}</Text>
                <Text style={font.caption}>
                  {(viewingArtifact?.artifactType || "document").toUpperCase()} • {viewingArtifact?.scope === "persistent" ? "Persistent Project Context" : "Temporary Session"}
                </Text>
              </View>
              <Pressable onPress={() => setViewingArtifact(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 460, marginVertical: spacing.sm }}>
              <View style={s.viewArtifactMetaBanner}>
                <View style={[s.tagBadge, viewingArtifact?.approvalStatus === "approved" ? s.artifactApprovalApproved : s.artifactApprovalPending]}>
                  <Ionicons
                    name={viewingArtifact?.approvalStatus === "approved" ? "checkmark-circle" : "time-outline"}
                    size={12}
                    color={viewingArtifact?.approvalStatus === "approved" ? colors.success : colors.warning}
                  />
                  <Text style={[s.tagBadgeText, { color: viewingArtifact?.approvalStatus === "approved" ? colors.success : colors.warning }]}>
                    {viewingArtifact?.approvalStatus === "approved" ? "APPROVED ARTIFACT" : "PENDING APPROVAL"}
                  </Text>
                </View>
                {viewingArtifact?.approvedByName && (
                  <Text style={s.viewArtifactApprovedBy}>
                    Approved by {viewingArtifact.approvedByName}{viewingArtifact.approvedAt ? ` on ${new Date(viewingArtifact.approvedAt).toLocaleDateString()}` : ""}
                  </Text>
                )}
              </View>

              <Text style={s.fieldLabel}>Artifact Content / Specifications:</Text>
              <View style={s.viewArtifactContentBox}>
                <Text style={s.viewArtifactContentText}>{viewingArtifact?.content || "No content provided."}</Text>
              </View>
            </ScrollView>

            <View style={s.modalFooter}>
              <Pressable style={s.modalCancelBtn} onPress={() => setViewingArtifact(null)}>
                <Text style={s.modalCancelBtnText}>Close</Text>
              </Pressable>
              {viewingArtifact && viewingArtifact.approvalStatus !== "approved" && (
                <Pressable
                  style={s.modalSaveBtn}
                  onPress={async () => {
                    const id = viewingArtifact._id;
                    setViewingArtifact(null);
                    if (id) await handleApproveArtifact(id);
                  }}
                >
                  <Ionicons name="checkmark-done" size={16} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={s.modalSaveBtnText}>Approve Artifact</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Edit Artifact */}
      <Modal visible={!!editingArtifact} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={font.h2}>Edit Project Artifact</Text>
                <Text style={font.caption}>Modifying an artifact automatically recalculates scope contradictions and readiness.</Text>
              </View>
              <Pressable onPress={() => setEditingArtifact(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={s.fieldLabel}>Artifact Name *</Text>
              <TextInput
                style={s.modalInput}
                value={editArtifactName}
                onChangeText={setEditArtifactName}
                placeholder="e.g. IEEE SRS Document"
                placeholderTextColor={colors.textFaint}
              />

              <Text style={s.fieldLabel}>Artifact Category</Text>
              <View style={s.typeSelectorRow}>
                {[
                  { key: "srs", label: "SRS Spec" },
                  { key: "teacher_instructions", label: "Rubric / Instructions" },
                  { key: "diagram", label: "Architecture / Diagram" },
                  { key: "notes", label: "Notes" },
                ].map((t) => (
                  <Pressable
                    key={t.key}
                    style={[s.typeChoice, editArtifactType === t.key && s.typeChoiceActive]}
                    onPress={() => setEditArtifactType(t.key)}
                  >
                    <Text style={[s.typeChoiceText, editArtifactType === t.key && s.typeChoiceTextActive]}>
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={s.fieldLabel}>Persistence Scope</Text>
              <View style={s.scopeToggleRow}>
                <Pressable
                  style={[s.scopeToggleBtn, editArtifactScope === "persistent" && s.scopeToggleBtnActive]}
                  onPress={() => setEditArtifactScope("persistent")}
                >
                  <Ionicons
                    name="server-outline"
                    size={16}
                    color={editArtifactScope === "persistent" ? colors.primary : colors.textFaint}
                  />
                  <Text style={[s.scopeToggleText, editArtifactScope === "persistent" && s.scopeToggleTextActive]}>
                    Persistent Project Context
                  </Text>
                </Pressable>

                <Pressable
                  style={[s.scopeToggleBtn, editArtifactScope === "temporary" && s.scopeToggleBtnActive]}
                  onPress={() => setEditArtifactScope("temporary")}
                >
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={editArtifactScope === "temporary" ? colors.primary : colors.textFaint}
                  />
                  <Text style={[s.scopeToggleText, editArtifactScope === "temporary" && s.scopeToggleTextActive]}>
                    Temporary Session
                  </Text>
                </Pressable>
              </View>

              <Text style={s.fieldLabel}>Content / Text / Specifications</Text>
              <TextInput
                style={[s.modalInput, { minHeight: 140, textAlignVertical: "top" }]}
                multiline
                value={editArtifactContent}
                onChangeText={setEditArtifactContent}
                placeholder="Edit artifact markdown text or requirements..."
                placeholderTextColor={colors.textFaint}
              />
            </ScrollView>

            <View style={s.modalFooter}>
              <Pressable
                style={s.modalCancelBtn}
                onPress={() => setEditingArtifact(null)}
                disabled={savingArtifactEdit}
              >
                <Text style={s.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.modalSaveBtn, savingArtifactEdit && { opacity: 0.7 }]}
                onPress={handleSaveArtifactEdit}
                disabled={savingArtifactEdit}
              >
                {savingArtifactEdit ? (
                  <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 6 }} />
                ) : null}
                <Text style={s.modalSaveBtnText}>
                  {savingArtifactEdit ? "Saving Changes..." : "Save & Recalculate"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Custom Conflict Resolution Rationale */}
      <Modal visible={showCustomConflictModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={font.h2}>Documented Conflict Resolution</Text>
                <Text style={font.caption}>Provide an explicit domain rationale for resolving this scope contradiction.</Text>
              </View>
              <Pressable onPress={() => setShowCustomConflictModal(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              {customConflictTarget && (
                <View style={s.conflictModalPreviewBox}>
                  <Text style={s.conflictModalTitle}>{customConflictTarget.title}</Text>
                  <Text style={s.conflictModalSub}>
                    Conflict: "{customConflictTarget.statementA}" vs "{customConflictTarget.statementB}"
                  </Text>
                  {!!customConflictTarget.reason && (
                    <Text style={s.conflictModalReason}>Reason: {customConflictTarget.reason}</Text>
                  )}
                </View>
              )}

              <Text style={s.fieldLabel}>Authoritative Resolution & Rationale *</Text>
              <TextInput
                style={[s.modalInput, { minHeight: 110, textAlignVertical: "top" }]}
                multiline
                placeholder="Explain the team's architectural decision, stakeholder approval, or technical constraint that resolves this contradiction..."
                placeholderTextColor={colors.textFaint}
                value={customConflictRationale}
                onChangeText={setCustomConflictRationale}
              />
            </ScrollView>

            <View style={s.modalFooter}>
              <Pressable
                style={s.modalCancelBtn}
                onPress={() => setShowCustomConflictModal(false)}
                disabled={resolvingCustomConflict}
              >
                <Text style={s.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.modalSaveBtn, resolvingCustomConflict && { opacity: 0.7 }]}
                onPress={handleSaveCustomConflictRationale}
                disabled={resolvingCustomConflict}
              >
                {resolvingCustomConflict ? (
                  <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 6 }} />
                ) : (
                  <Ionicons name="checkmark-circle" size={16} color="#FFF" style={{ marginRight: 6 }} />
                )}
                <Text style={s.modalSaveBtnText}>
                  {resolvingCustomConflict ? "Saving Resolution..." : "Confirm & Resolve Blocker"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  contentContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },

  // Header Banner
  headerBanner: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  waterfallBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary + "18",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    gap: 4,
  },
  waterfallBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  scopeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    gap: 4,
  },
  scopeBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textFaint,
  },
  headerSubtitle: {
    ...font.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 20,
  },

  // Card Structure
  card: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardDesc: {
    ...font.caption,
    color: colors.textFaint,
    marginBottom: spacing.md,
  },

  // Buttons
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    gap: 6,
  },
  primaryActionBtnText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 13,
  },
  secondaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary + "14",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    gap: 6,
  },
  secondaryActionBtnText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 13,
  },
  reqsCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  reqsCardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
    flexShrink: 1,
  },
  cardHeaderRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
    maxWidth: "100%",
  },
  approvalSummaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    marginRight: 4,
  },
  approveAllReqsBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16a34a",
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.md,
    gap: 6,
  },
  approveAllReqsBtnDone: {
    backgroundColor: colors.success + "26",
    borderWidth: 1,
    borderColor: colors.success + "66",
  },
  approveAllReqsBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  bulkConvertBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0d9488",
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.md,
    gap: 6,
  },
  bulkConvertBtnDone: {
    backgroundColor: "#0d948826",
    borderWidth: 1,
    borderColor: "#0d948866",
  },
  bulkConvertBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  addReqOutlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.md,
    gap: 6,
  },
  addReqOutlineBtnText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 13,
  },
  cardSubtext: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: spacing.md,
  },

  // Empty Box
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    marginVertical: spacing.sm,
  },
  emptyTitle: {
    ...font.h3,
    marginTop: spacing.sm,
    color: colors.text,
  },
  emptySub: {
    ...font.caption,
    color: colors.textFaint,
    marginTop: 4,
    textAlign: "center",
  },

  // Artifact List
  artifactList: {
    gap: spacing.sm,
  },
  artifactCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  artifactLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: spacing.sm,
  },
  artifactMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 3,
  },
  tagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
  },
  persistentBadge: {
    backgroundColor: colors.success + "18",
  },
  persistentText: {
    color: colors.success,
  },
  tempBadge: {
    backgroundColor: colors.warning + "18",
  },
  tempText: {
    color: colors.warning,
  },
  fileSizeText: {
    fontSize: 11,
    color: colors.textFaint,
  },
  iconBtn: {
    padding: 6,
  },

  // AI Extraction Section
  extractSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: "center",
  },
  aiExtractBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    gap: 8,
  },
  aiExtractBtnDisabled: {
    opacity: 0.6,
  },
  aiExtractBtnText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 14,
  },
  extractHint: {
    ...font.caption,
    color: colors.textFaint,
    marginTop: spacing.xs,
  },

  // Three Column Scope Grid
  threeColGrid: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  colBox: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  colTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textFaint,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  bulletItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: spacing.xs,
  },
  bulletText: {
    ...font.caption,
    color: colors.text,
    flex: 1,
    lineHeight: 16,
  },

  // Requirements Section
  countBadge: {
    backgroundColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  filterRow: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    height: 38,
    gap: spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  phasePills: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  phasePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  phasePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  phasePillText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  phasePillTextActive: {
    color: "#FFF",
    fontWeight: "700",
  },

  // Requirement Card
  reqList: {
    gap: spacing.md,
  },
  reqCard: {
    backgroundColor: colors.bg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reqTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  reqTagsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reqIdBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reqIdText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.text,
  },
  phaseBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  phaseBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  approvedBadge: {
    backgroundColor: colors.success + "18",
  },
  approvedText: {
    color: colors.success,
  },
  draftBadge: {
    backgroundColor: colors.warning + "18",
  },
  draftText: {
    color: colors.warning,
  },

  scoreBox: {
    alignItems: "flex-end",
  },
  scoreNumber: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary,
  },
  scoreLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.textFaint,
    letterSpacing: 0.5,
  },

  reqTitle: {
    ...font.h3,
    color: colors.text,
    marginTop: 2,
  },
  reqDesc: {
    ...font.caption,
    color: colors.textMuted,
    marginTop: 3,
    lineHeight: 18,
  },

  scoreExplanationBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoreExplanationText: {
    fontSize: 11,
    color: colors.textMuted,
    flex: 1,
  },

  reqMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  metaChipText: {
    fontSize: 11,
    color: colors.textFaint,
  },

  reqActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  approveBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.success,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 4,
    gap: 4,
  },
  approveBtnText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 12,
  },
  convertTaskBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 4,
    gap: 4,
  },
  convertTaskBtnText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 12,
  },
  activeTaskBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: "#16a34a18",
    borderWidth: 1,
    borderColor: "#16a34a44",
  },
  activeTaskBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#16a34a",
    letterSpacing: 0.5,
  },
  taskAlreadyCreatedBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16a34a15",
    borderWidth: 1,
    borderColor: "#16a34a44",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 4,
    gap: 4,
  },
  taskAlreadyCreatedBtnText: {
    color: "#16a34a",
    fontWeight: "700",
    fontSize: 12,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 4,
    gap: 4,
  },
  editBtnText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 12,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  modalBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: "100%",
    maxWidth: 620,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 13,
    color: colors.text,
  },
  typeSelectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  typeChoice: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChoiceActive: {
    backgroundColor: colors.primary + "18",
    borderColor: colors.primary,
  },
  typeChoiceText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  typeChoiceTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  scopeToggleRow: {
    gap: spacing.xs,
  },
  scopeToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopeToggleBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + "10",
  },
  scopeToggleText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  scopeToggleTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },

  scoringGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  scoreField: {
    flex: 1,
  },
  scoreFieldLabel: {
    fontSize: 11,
    color: colors.textFaint,
    marginBottom: 2,
  },
  scoreInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 6,
    fontSize: 13,
    color: colors.text,
  },

  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalCancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
  },
  modalCancelBtnText: {
    color: colors.textMuted,
    fontWeight: "600",
  },
  modalSaveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
  },
  modalSaveBtnText: {
    color: "#FFF",
    fontWeight: "700",
  },

  // Lifecycle & Revision
  lifecycleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  lifecycleBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  revisionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  revisionText: {
    fontSize: 11,
    color: colors.textFaint,
    fontWeight: "600",
  },

  // Scope Contradictions / Conflicts
  conflictsBox: {
    backgroundColor: colors.warning + "10",
    borderWidth: 1,
    borderColor: colors.warning + "40",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  conflictsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: 4,
  },
  conflictsTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.warning,
  },
  conflictsSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  conflictCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  conflictCardResolved: {
    borderColor: colors.success + "40",
    backgroundColor: colors.success + "05",
  },
  conflictCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  conflictCardTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  conflictBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  conflictBadgeText: {
    fontSize: 9,
    fontWeight: "800",
  },
  conflictComparison: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  conflictSide: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.xs + 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  conflictSourceLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textFaint,
    marginBottom: 2,
  },
  conflictStatement: {
    fontSize: 11,
    color: colors.text,
    fontStyle: "italic",
    marginBottom: 6,
  },
  conflictChooseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: colors.primary + "15",
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  conflictChooseBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
  },
  resolvedNoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  resolvedNoteText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.success,
  },

  // 3-Card Scope Header & Items
  colBoxHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  colHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addScopeIconBtn: {
    padding: 2,
  },
  richScopeItem: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.xs + 2,
    marginBottom: spacing.xs,
  },
  scopeItemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 4,
    marginBottom: 2,
  },
  scopeItemLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
    flex: 1,
  },
  inferredBadge: {
    backgroundColor: colors.warning + "20",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  inferredBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    color: colors.warning,
  },
  scopeItemDesc: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
    marginBottom: 4,
  },
  scopeItemFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scopeItemSource: {
    fontSize: 9,
    color: colors.textFaint,
    fontWeight: "600",
  },
  scopeItemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  unspecifiedNotice: {
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radius.sm,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  unspecifiedNoticeText: {
    fontSize: 11,
    color: colors.textFaint,
    textAlign: "center",
    marginBottom: 6,
    fontStyle: "italic",
  },
  draftPromptBtn: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    backgroundColor: colors.primary + "12",
    borderRadius: radius.pill,
  },
  draftPromptBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
  },

  // Finalization Bar & Readiness
  finalizationBar: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  readinessRow: {
    marginBottom: spacing.sm,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  readinessLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  readinessTimestamp: {
    fontSize: 10,
    color: colors.textFaint,
    marginLeft: 26,
    marginTop: 2,
  },
  finalizeActionRow: {
    marginTop: spacing.xs,
  },
  finalizedStatusBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.success + "12",
    borderWidth: 1,
    borderColor: colors.success + "40",
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  finalizedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  finalizedBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.success,
  },
  viewTasksBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  viewTasksBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFF",
  },
  finalizeBtnContainer: {
    alignItems: "flex-end",
  },
  finalizeHintText: {
    fontSize: 11,
    color: colors.warning,
    marginBottom: 6,
    fontWeight: "600",
  },
  finalizeHintReady: {
    fontSize: 11,
    color: colors.success,
    marginBottom: 6,
    fontWeight: "600",
  },
  finalizePlanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  finalizePlanBtnDisabled: {
    opacity: 0.5,
  },
  finalizePlanBtnText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 13,
  },

  // Approval summary pill & header actions
  approvalSummaryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  artifactHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  approveAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.success,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  approveAllBtnDisabled: {
    opacity: 0.5,
  },
  approveAllBtnText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 12,
  },
  artifactCardApproved: {
    borderColor: colors.success + "40",
  },
  artifactApprovalBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  artifactApprovalApproved: {
    backgroundColor: colors.success + "15",
  },
  artifactApprovalPending: {
    backgroundColor: colors.warning + "15",
  },
  artifactApprovalText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  approvedByLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  artifactActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  artifactActionIconBtn: {
    padding: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  approveSingleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  approveSingleBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFF",
  },
  approvedStaticPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.success + "15",
  },
  approvedStaticPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.success,
  },

  // Contradiction Reason & Sources
  conflictReasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 4,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  conflictReasonText: {
    fontSize: 12,
    color: colors.textMuted,
    flex: 1,
  },
  conflictSourcesRow: {
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  conflictSourcesText: {
    fontSize: 11,
    color: colors.textFaint,
  },
  conflictExtraActionsRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  conflictCustomRationaleBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary + "50",
    backgroundColor: colors.primary + "10",
  },
  conflictCustomRationaleBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
  conflictArtifactShortcuts: {
    marginTop: 4,
    gap: 4,
  },
  conflictArtifactShortcutLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textFaint,
    textTransform: "uppercase",
  },
  conflictArtifactBtnGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  conflictEditArtBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: colors.primary + "10",
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  conflictEditArtText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
  },
  conflictDelArtBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: colors.danger + "10",
    borderWidth: 1,
    borderColor: colors.danger + "30",
  },
  conflictDelArtText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.danger,
  },
  resolvedNoteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.success + "12",
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.success + "30",
  },
  resolvedNoteDecision: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.success,
  },
  resolvedRationaleText: {
    fontSize: 11,
    color: colors.text,
    marginTop: 2,
  },
  resolvedAuditText: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 3,
    fontStyle: "italic",
  },

  // Authoritative Readiness Feedback Box
  readinessFeedbackContainer: {
    marginVertical: spacing.sm,
  },
  blockersBox: {
    backgroundColor: colors.warning + "12",
    borderWidth: 1,
    borderColor: colors.warning + "40",
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
  },
  blockersHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  blockersTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.warning,
  },
  blockerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 4,
  },
  blockerItemText: {
    fontSize: 11,
    color: colors.text,
    flex: 1,
  },
  readySuccessBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.success + "12",
    borderWidth: 1,
    borderColor: colors.success + "40",
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  readySuccessText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.success,
  },

  // View Artifact Modal Elements
  viewArtifactMetaBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  viewArtifactApprovedBy: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  viewArtifactContentBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: 4,
  },
  viewArtifactContentText: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 18,
    fontFamily: "monospace",
  },

  // Conflict Modal Preview
  conflictModalPreviewBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  conflictModalTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
  },
  conflictModalSub: {
    fontSize: 11,
    color: colors.warning,
    marginBottom: 2,
  },
  conflictModalReason: {
    fontSize: 11,
    color: colors.textMuted,
  },

  // Inferred Toggle in Modal
  inferredToggleRow: {
    marginTop: spacing.sm,
  },
  inferredToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: spacing.xs + 2,
    backgroundColor: colors.bg,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inferredToggleBtnActive: {
    borderColor: colors.warning,
    backgroundColor: colors.warning + "10",
  },
  inferredToggleText: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
