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

interface PlanPanelProps {
  teamId: string;
  projectId?: string;
  onNavigateToTasks?: () => void;
}

interface ArtifactItem {
  _id?: string;
  name: string;
  artifactType: string;
  content: string;
  scope: "persistent" | "temporary";
  fileSize?: number;
  summary?: string;
  uploadedAt?: string;
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
}

export default function PlanPanel({ teamId, projectId, onNavigateToTasks }: PlanPanelProps) {
  const { user, token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(projectId || null);

  // Plan Data State
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [requirements, setRequirements] = useState<RequirementItem[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [deliverables, setDeliverables] = useState<string[]>([]);

  // Filtering & Search
  const [selectedPhaseFilter, setSelectedPhaseFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // New Artifact Modal / Form State
  const [showArtifactModal, setShowArtifactModal] = useState(false);
  const [artifactName, setArtifactName] = useState("");
  const [artifactType, setArtifactType] = useState("srs");
  const [artifactScope, setArtifactScope] = useState<"persistent" | "temporary">("persistent");
  const [artifactContent, setArtifactContent] = useState("");

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

      if (!pId) {
        // Resolve active project for team
        const teamRes = await fetch(`${API_BASE_URL}/teams/${teamId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (teamRes.ok) {
          const teamData = await teamRes.json();
          pId = teamData.activeProjectId || teamData.project?._id || null;
          if (pId) setResolvedProjectId(pId);
        }
      }

      if (!pId) {
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/projects/${pId}/plan`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setArtifacts(data.artifacts || []);
        setRequirements(data.requirements || []);
        setGoals(data.goals || []);
        setConstraints(data.constraints || []);
        setDeliverables(data.deliverables || []);
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

  // Upload / Save Artifact
  const handleSaveArtifact = async () => {
    if (!artifactName.trim()) {
      toast("Artifact name is required.", "error");
      return;
    }
    if (!artifactContent.trim()) {
      toast("Please provide artifact text or instructions.", "error");
      return;
    }
    if (!resolvedProjectId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/projects/${resolvedProjectId}/artifacts`, {
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
        setShowArtifactModal(false);
        setArtifactName("");
        setArtifactContent("");
        toast("Artifact saved successfully to project context.", "success");
      } else {
        const err = await res.json();
        toast(err.error || "Failed to save artifact", "error");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  // Delete Artifact
  const handleDeleteArtifact = async (artifactId?: string) => {
    if (!artifactId || !resolvedProjectId) return;
    const ok = await confirm({
      title: "Remove Artifact",
      message: "Are you sure you want to remove this artifact from project context?",
      destructive: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE_URL}/projects/${resolvedProjectId}/artifacts/${artifactId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setArtifacts(data.artifacts || []);
        toast("Artifact removed.", "info");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  // AI Extraction of Requirements & Deliverables
  const handleExtractPlan = async () => {
    if (!resolvedProjectId) return;
    try {
      setExtracting(true);
      const res = await fetch(`${API_BASE_URL}/projects/${resolvedProjectId}/plan/extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.extracted) {
          if (data.extracted.goals) setGoals(data.extracted.goals);
          if (data.extracted.constraints) setConstraints(data.extracted.constraints);
          if (data.extracted.deliverables) setDeliverables(data.extracted.deliverables);
          if (Array.isArray(data.extracted.requirements)) {
            // Save newly extracted draft requirements to server
            for (const r of data.extracted.requirements) {
              await fetch(`${API_BASE_URL}/projects/${resolvedProjectId}/requirements`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(r),
              });
            }
            await fetchPlan();
          }
        }
        toast("Plan analysis complete. Draft requirements ready for review.", "success");
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

  // Approve Requirement
  const handleApproveReq = async (reqItem: RequirementItem) => {
    if (!resolvedProjectId || !reqItem.reqId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${resolvedProjectId}/requirements/${reqItem.reqId}`, {
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
        toast(`${reqItem.reqId} approved.`, "success");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  // Convert Requirement to Task
  const handleConvertToTask = async (reqItem: RequirementItem) => {
    if (!resolvedProjectId || !reqItem.reqId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${resolvedProjectId}/requirements/${reqItem.reqId}/convert-to-task`, {
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
      const res = await fetch(`${API_BASE_URL}/projects/${resolvedProjectId}/requirements/${reqItem.reqId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRequirements(data.requirements || []);
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
      setReqStatus(item.status === "approved" ? "approved" : "draft");
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
      status: reqStatus,
    };

    try {
      let res;
      if (editingReq && editingReq.reqId) {
        res = await fetch(`${API_BASE_URL}/projects/${resolvedProjectId}/requirements/${editingReq.reqId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE_URL}/projects/${resolvedProjectId}/requirements`, {
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
    <ScrollView style={s.container} contentContainerStyle={s.contentContainer}>
      {/* Header Banner */}
      <View style={s.headerBanner}>
        <View style={s.badgeRow}>
          <View style={s.waterfallBadge}>
            <Ionicons name="git-commit" size={14} color={colors.primary} />
            <Text style={s.waterfallBadgeText}>WATERFALL METHODOLOGY · TAB 2</Text>
          </View>
          <View style={s.scopeBadge}>
            <Ionicons name="lock-closed" size={12} color={colors.textFaint} />
            <Text style={s.scopeBadgeText}>STRICT SEQUENTIAL SCOPE</Text>
          </View>
        </View>
        <Text style={font.h1}>Plan & Project Understanding</Text>
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
          </View>
          <Pressable
            style={s.primaryActionBtn}
            onPress={() => setShowArtifactModal(true)}
          >
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={s.primaryActionBtnText}>Upload / Add Artifact</Text>
          </Pressable>
        </View>

        <Text style={s.cardDesc}>
          Accepted files: Requirements documents (SRS), teacher rubrics, Markdown architecture notes,
          and system specifications. Persistent items become part of the project's persistent brain.
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
            {artifacts.map((a, idx) => (
              <View key={a._id || idx} style={s.artifactCard}>
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
                    color={colors.primary}
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
                    </View>
                  </View>
                </View>
                <Pressable
                  onPress={() => handleDeleteArtifact(a._id)}
                  hitSlop={8}
                  style={s.iconBtn}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            ))}
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

      {/* Section 2: Goals & Deliverables Summary */}
      {(goals.length > 0 || deliverables.length > 0 || constraints.length > 0) && (
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={s.cardHeaderLeft}>
              <Ionicons name="flag" size={20} color={colors.accent} />
              <Text style={font.h2}>Extracted Project Scope & Constraints</Text>
            </View>
          </View>

          <View style={s.threeColGrid}>
            <View style={s.colBox}>
              <Text style={s.colTitle}>EXECUTIVE GOALS</Text>
              {goals.map((g, i) => (
                <View key={i} style={s.bulletItem}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={s.bulletText}>{g}</Text>
                </View>
              ))}
            </View>

            <View style={s.colBox}>
              <Text style={s.colTitle}>KEY DELIVERABLES</Text>
              {deliverables.map((d, i) => (
                <View key={i} style={s.bulletItem}>
                  <Ionicons name="cube-outline" size={14} color={colors.primary} />
                  <Text style={s.bulletText}>{d}</Text>
                </View>
              ))}
            </View>

            <View style={s.colBox}>
              <Text style={s.colTitle}>CONSTRAINTS & POLICIES</Text>
              {constraints.map((c, i) => (
                <View key={i} style={s.bulletItem}>
                  <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
                  <Text style={s.bulletText}>{c}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Section 3: Structured Requirements (SRS) Workspace */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.cardHeaderLeft}>
            <Ionicons name="list-circle" size={20} color={colors.primary} />
            <Text style={font.h2}>Waterfall Requirements (SRS & DAA Ranked)</Text>
            <View style={s.countBadge}>
              <Text style={s.countBadgeText}>{filteredRequirements.length}</Text>
            </View>
          </View>
          <Pressable
            style={s.secondaryActionBtn}
            onPress={() => openRequirementModal()}
          >
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={s.secondaryActionBtnText}>Add Requirement</Text>
          </Pressable>
        </View>

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
            {filteredRequirements.map((r) => {
              const pMeta = WATERFALL_PHASE_META[r.phase as keyof typeof WATERFALL_PHASE_META] as any || {
                label: r.phase,
                short: r.phase,
                color: colors.primary,
              };
              const isApproved = r.status === "approved" || r.status === "in_progress" || r.status === "verified";

              return (
                <View key={r.reqId} style={s.reqCard}>
                  {/* Top Line: ID, Phase, Status, Score */}
                  <View style={s.reqTopLine}>
                    <View style={s.reqTagsRow}>
                      <View style={s.reqIdBadge}>
                        <Text style={s.reqIdText}>{r.reqId}</Text>
                      </View>
                      <View style={[s.phaseBadge, { backgroundColor: pMeta.color + "18", borderColor: pMeta.color + "44" }]}>
                        <Text style={[s.phaseBadgeText, { color: pMeta.color }]}>{(pMeta.short || pMeta.label).toUpperCase()}</Text>
                      </View>
                      <View style={[s.statusBadge, isApproved ? s.approvedBadge : s.draftBadge]}>
                        <Text style={[s.statusBadgeText, isApproved ? s.approvedText : s.draftText]}>
                          {r.status.toUpperCase()}
                        </Text>
                      </View>
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
                      <Pressable
                        style={s.convertTaskBtn}
                        onPress={() => handleConvertToTask(r)}
                      >
                        <Ionicons name="arrow-forward" size={14} color="#FFF" />
                        <Text style={s.convertTaskBtnText}>Convert to Active Task</Text>
                      </Pressable>
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
              <Pressable style={s.modalCancelBtn} onPress={() => setShowArtifactModal(false)}>
                <Text style={s.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={s.modalSaveBtn} onPress={handleSaveArtifact}>
                <Text style={s.modalSaveBtnText}>Save to Knowledge Base</Text>
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
});
