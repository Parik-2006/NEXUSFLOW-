/**
 * client/components/workspace/DecisionPanel.tsx
 * ============================================================================
 * NEXUSFLOW 2.0 — Phase 5: Decision & Recommendation Engine UI
 *
 * This panel is added as a new "Decision Engine" sub-tab in ProjectAdvisorPanel.
 * It does NOT replace any existing tabs or functionality.
 *
 * ARCHITECTURE:
 *   User input → POST /api/teams/:teamId/decide
 *     → buildCompactProjectContext() [server]
 *     → evaluateDecision() [decisionEngine.js — deterministic]
 *     → AI qualitative layer [OpenAI, optional, text only]
 *     → Recommendation Card + Decision Matrix + Trade-offs + Risks
 *
 * USER FLOW:
 *   1. Select decision type (technology / task-priority / sprint / assignment / architecture / ai-ml)
 *   2. Enter question + options (for technology/architecture/ai-ml types)
 *   3. Adjust preference weights (optional)
 *   4. Click "Analyze Decision"
 *   5. View Recommendation Card → Decision Matrix → Trade-offs → Risks → Next Action
 *   6. Optionally: [Create Recommended Task] or [Save Decision]
 * ============================================================================
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { colors, spacing, radius, font } from "@/theme";
import { useToast } from "@/components/feedback";
import { API_BASE_URL } from "@/utils/api";

const API = API_BASE_URL;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type DecisionType = "technology" | "task-priority" | "sprint" | "assignment" | "architecture" | "ai-ml";

interface FactorScore {
  factor: string;
  label: string;
  score: number;
  weight: number;
}

interface Recommendation {
  option: string;
  score: number;
  strength: { label: string; emoji: string };
}

interface Alternative {
  option: string;
  score: number;
  strength: { label: string; emoji: string };
  reason?: string;
}

interface Tradeoff {
  option: string;
  pros: string[];
  cons: string[];
  note?: string;
}

interface Risk {
  option: string;
  risk: string;
  severity: "low" | "medium" | "high";
  mitigation: string;
}

interface DecisionMatrix {
  factors: string[];
  options: string[];
  scores: number[][];
  finalScores: number[];
  weights: number[];
  winner?: string;
  note?: string;
}

interface DecisionResult {
  decisionType: string;
  question: string;
  recommendation: Recommendation | null;
  alternatives: Alternative[];
  factors: FactorScore[];
  matrix: DecisionMatrix;
  tradeoffs: Tradeoff[];
  risks: Risk[];
  reason: string;
  nextAction: string;
  confidence: { label: string; description: string };
  keyFactors: string[];
  daaAlgorithmsUsed: string[];
  weightExplanation: string;
  aiEnhanced: boolean;
  // task-priority specific
  rankedTasks?: any[];
  // sprint specific
  sprintSelection?: {
    selected: any[];
    rejected: any[];
    capacity: number;
    effortUsed: number;
    capacityLeft: number;
    totalValue: number;
    utilizationPct: number;
  };
  // assignment specific
  assignments?: any[];
  projectContext?: { projectTitle: string; domain: string; taskCount: number; memberCount: number };
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision type config
// ─────────────────────────────────────────────────────────────────────────────

const DECISION_TYPE_CONFIG: {
  key: DecisionType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
  needsOptions: boolean;
  needsQuestion: boolean;
  daaLabel: string;
}[] = [
  {
    key: "technology",
    label: "Technology",
    icon: "hardware-chip-outline",
    description: "Compare tech/framework options using weighted factor scoring.",
    needsOptions: true,
    needsQuestion: true,
    daaLabel: "Merge Sort · Weighted Scoring",
  },
  {
    key: "task-priority",
    label: "Task Priority",
    icon: "list-outline",
    description: "Rank your tasks using the Greedy Priority Scheduler.",
    needsOptions: false,
    needsQuestion: false,
    daaLabel: "Greedy O(1) · Merge Sort O(n log n)",
  },
  {
    key: "sprint",
    label: "Sprint Plan",
    icon: "rocket-outline",
    description: "Optimize sprint selection using 0/1 Knapsack DP.",
    needsOptions: false,
    needsQuestion: false,
    daaLabel: "0/1 Knapsack O(n×W)",
  },
  {
    key: "assignment",
    label: "Assignment",
    icon: "people-outline",
    description: "Assign tasks to best-fit members via Branch & Bound.",
    needsOptions: false,
    needsQuestion: false,
    daaLabel: "Branch & Bound O(n!/ pruning)",
  },
  {
    key: "architecture",
    label: "Architecture",
    icon: "layers-outline",
    description: "Compare architectural approaches (REST vs WebSockets, etc).",
    needsOptions: true,
    needsQuestion: true,
    daaLabel: "Merge Sort · Weighted Scoring",
  },
  {
    key: "ai-ml",
    label: "AI/ML Approach",
    icon: "bulb-outline",
    description: "Choose between ML approaches (pretrained, custom, rule-based).",
    needsOptions: true,
    needsQuestion: true,
    daaLabel: "Merge Sort · Weighted Scoring",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Preference weight presets
// ─────────────────────────────────────────────────────────────────────────────

const PRESET_PREFERENCES: { label: string; values: Record<string, number> }[] = [
  { label: "Balanced",      values: { speed: 0.25, skillFit: 0.25, scalability: 0.25, deadline: 0.25 } },
  { label: "Fast Delivery", values: { speed: 0.50, skillFit: 0.30, scalability: 0.10, deadline: 0.10 } },
  { label: "Team Skill",    values: { speed: 0.15, skillFit: 0.55, scalability: 0.15, deadline: 0.15 } },
  { label: "Scalable",      values: { speed: 0.10, skillFit: 0.20, scalability: 0.50, deadline: 0.20 } },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function DecisionPanel({ teamId }: { teamId: string }) {
  const { token } = useAuth();
  const toast = useToast();

  // Form state
  const [selectedType, setSelectedType] = useState<DecisionType>("technology");
  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [preferences, setPreferences] = useState<Record<string, number>>(PRESET_PREFERENCES[0].values);
  const [selectedPreset, setSelectedPreset] = useState(0);

  // Spinner capacity (for sprint type)
  const [sprintCapacity, setSprintCapacity] = useState(20);

  // Result state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Active view in result area
  const [activeResultTab, setActiveResultTab] = useState<"overview" | "matrix" | "tradeoffs" | "risks">("overview");

  // Save/task state
  const [saving, setSaving] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  const typeConfig = DECISION_TYPE_CONFIG.find((t) => t.key === selectedType)!;

  // ── Analyze Decision ──────────────────────────────────────────────────────

  const analyze = useCallback(async () => {
    if (!teamId || !token) return;

    setLoading(true);
    setResult(null);
    setError(null);
    setActiveResultTab("overview");

    try {
      const options = typeConfig.needsOptions
        ? optionsText.split(",").map((o) => o.trim()).filter(Boolean)
        : [];

      const body: Record<string, any> = {
        decisionType: selectedType,
        question: question.trim(),
        options,
        preferences: {
          ...preferences,
          ...(selectedType === "sprint" ? { capacity: sprintCapacity } : {}),
        },
      };

      const res = await fetch(`${API}/api/teams/${teamId}/decide`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Decision analysis failed. Please try again.");
        return;
      }

      setResult(data.decision);
    } catch (err: any) {
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        setError("Request timed out. The server may be busy — please try again.");
      } else {
        setError(err.message || "An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }, [teamId, token, selectedType, question, optionsText, preferences, sprintCapacity]);

  // ── Save Decision to project ───────────────────────────────────────────────
  // Uses the existing POST /api/projects/:projectId/decisions endpoint.

  const saveDecision = useCallback(async () => {
    if (!result?.recommendation || saving) return;
    setSaving(true);
    try {
      // Get project ID for this team
      const pRes = await fetch(`${API}/api/projects?teamId=${teamId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!pRes.ok) throw new Error("Could not find project.");
      const projects = await pRes.json();
      const projectId = projects?.[0]?._id;
      if (!projectId) throw new Error("No project found. Create a project first via Project AI tab.");

      const decisionBody = {
        title: question || `${selectedType} Decision`,
        decision: result.recommendation.option,
        reasoning: result.reason,
        selectedOption: result.recommendation.option,
        alternativesConsidered: result.alternatives?.map((a) => a.option) || [],
        category: selectedType === "technology" ? "technology" :
                  selectedType === "architecture" ? "architecture" :
                  selectedType === "ai-ml" ? "ai_model" : "other",
        source: "ai",
        confidence: (result.recommendation.score || 0) / 100,
        status: "proposed",
      };

      const saveRes = await fetch(`${API}/api/projects/${projectId}/decisions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(decisionBody),
      });

      if (!saveRes.ok) throw new Error("Failed to save decision.");
      toast("Decision saved to Project Decisions", "success");
    } catch (err: any) {
      toast(err.message || "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }, [result, saving, teamId, token, question, selectedType]);

  // ── Create Recommended Task ────────────────────────────────────────────────
  // Uses the EXISTING task creation pipeline (socket task:create or REST).
  // No new pipeline created.

  const createRecommendedTask = useCallback(async () => {
    if (!result?.recommendation || creatingTask) return;
    setCreatingTask(true);
    try {
      const title = result.nextAction
        ? result.nextAction.slice(0, 80)
        : `Implement ${result.recommendation.option}`;

      const taskBody = {
        title,
        description: `Decision Engine recommendation: ${result.recommendation.option}. ${result.reason}`.slice(0, 300),
        category: selectedType === "technology" ? "Planning" :
                  selectedType === "architecture" ? "Planning" :
                  selectedType === "sprint" ? "Planning" : "General",
        urgency: 3,
        impact: 4,
        estimatedHours: 4,
        businessValue: 8,
        source: "ai",
      };

      const createRes = await fetch(`${API}/api/teams/${teamId}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(taskBody),
      });

      if (!createRes.ok) throw new Error("Failed to create task.");
      toast("Recommended task created! Find it in the Tasks tab.", "success");
    } catch (err: any) {
      toast(err.message || "Task creation failed", "error");
    } finally {
      setCreatingTask(false);
    }
  }, [result, creatingTask, teamId, token, selectedType]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.headerCard}>
        <View style={s.headerRow}>
          <Ionicons name="analytics" size={20} color={colors.primary} />
          <Text style={s.heading}>Decision & Recommendation Engine</Text>
        </View>
        <Text style={s.subheading}>
          Deterministic scoring · DAA algorithms · AI-explained trade-offs
        </Text>
        <View style={s.daaStrip}>
          <DaaTag label="Greedy" color={colors.greedy} />
          <DaaTag label="Knapsack" color={colors.knapsack} />
          <DaaTag label="B&B" color={colors.branch} />
          <DaaTag label="Merge Sort" color={colors.merge} />
          <DaaTag label="Topo Sort" color={colors.topo} />
        </View>
      </View>

      {/* Step 1: Decision Type */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>1. What type of decision?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.typeRow}>
          {DECISION_TYPE_CONFIG.map((dt) => {
            const on = selectedType === dt.key;
            return (
              <Pressable
                key={dt.key}
                style={[s.typeBtn, on && s.typeBtnOn]}
                onPress={() => { setSelectedType(dt.key); setResult(null); setError(null); }}
              >
                <Ionicons name={dt.icon} size={16} color={on ? "#fff" : colors.primary} />
                <Text style={[s.typeBtnLabel, on && { color: "#fff" }]}>{dt.label}</Text>
                <Text style={[s.typeDaaLabel, on && { color: "rgba(255,255,255,0.75)" }]}>{dt.daaLabel}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={s.typeDesc}>{typeConfig.description}</Text>
      </View>

      {/* Step 2: Question + Options (only for scored types) */}
      {(typeConfig.needsQuestion || typeConfig.needsOptions) && (
        <View style={s.section}>
          {typeConfig.needsQuestion && (
            <>
              <Text style={s.sectionLabel}>2. Your question</Text>
              <TextInput
                style={s.textInput}
                placeholder={`e.g. "Which ${selectedType} should we use for this project?"`}
                placeholderTextColor={colors.textFaint}
                value={question}
                onChangeText={setQuestion}
                multiline
              />
            </>
          )}
          {typeConfig.needsOptions && (
            <>
              <Text style={[s.sectionLabel, { marginTop: 10 }]}>
                {typeConfig.needsQuestion ? "3." : "2."} Options to compare{" "}
                <Text style={s.hint}>(comma-separated)</Text>
              </Text>
              <TextInput
                style={s.textInput}
                placeholder="e.g. FastAPI, Node.js + Express, Django"
                placeholderTextColor={colors.textFaint}
                value={optionsText}
                onChangeText={setOptionsText}
              />
            </>
          )}
        </View>
      )}

      {/* Sprint capacity stepper */}
      {selectedType === "sprint" && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>2. Sprint Capacity (story points)</Text>
          <View style={s.stepperRow}>
            <Pressable style={s.stepBtn} onPress={() => setSprintCapacity((c) => Math.max(1, c - 5))}>
              <Text style={s.stepBtnTxt}>−</Text>
            </Pressable>
            <Text style={s.stepValue}>{sprintCapacity} pts</Text>
            <Pressable style={s.stepBtn} onPress={() => setSprintCapacity((c) => Math.min(200, c + 5))}>
              <Text style={s.stepBtnTxt}>+</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Step 3: Preference weights (for scored decision types) */}
      {["technology", "architecture", "ai-ml"].includes(selectedType) && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>
            {typeConfig.needsOptions ? "4." : "3."} What matters most?{" "}
            <Text style={s.hint}>(preference weights)</Text>
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.presetRow}>
            {PRESET_PREFERENCES.map((p, idx) => (
              <Pressable
                key={p.label}
                style={[s.presetBtn, selectedPreset === idx && s.presetBtnOn]}
                onPress={() => { setPreferences(p.values); setSelectedPreset(idx); }}
              >
                <Text style={[s.presetBtnTxt, selectedPreset === idx && { color: "#fff" }]}>{p.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={s.weightsGrid}>
            {Object.entries(preferences).map(([key, val]) => (
              <View key={key} style={s.weightItem}>
                <Text style={s.weightKey}>{key}</Text>
                <View style={s.weightBarTrack}>
                  <View style={[s.weightBarFill, { width: `${Math.round(val * 100)}%` as any }]} />
                </View>
                <Text style={s.weightVal}>{Math.round(val * 100)}%</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Analyze button */}
      <Pressable style={[s.analyzeBtn, loading && s.btnDisabled]} onPress={analyze} disabled={loading}>
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="analytics-outline" size={16} color="#fff" />
            <Text style={s.analyzeBtnTxt}>Analyze Decision</Text>
          </>
        )}
      </Pressable>

      {error && (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={s.errorTxt}>{error}</Text>
        </View>
      )}

      {/* ── Result Area ──────────────────────────────────────────────────── */}
      {result && !result.error && (
        <View style={s.resultArea}>
          {/* Context strip */}
          {result.projectContext && (
            <View style={s.contextStrip}>
              <Ionicons name="information-circle-outline" size={13} color={colors.primary} />
              <Text style={s.contextStripTxt}>
                {result.projectContext.projectTitle} · {result.projectContext.domain} · {result.projectContext.taskCount} tasks · {result.projectContext.memberCount} members
              </Text>
              {result.aiEnhanced && (
                <View style={s.aiPill}>
                  <Ionicons name="sparkles" size={10} color={colors.accentDark} />
                  <Text style={s.aiPillTxt}>AI-enhanced</Text>
                </View>
              )}
            </View>
          )}

          {/* ── Recommendation Card ─────────────────────────────────────── */}
          {result.recommendation && (
            <RecommendationCard
              recommendation={result.recommendation}
              reason={result.reason}
              keyFactors={result.keyFactors}
              nextAction={result.nextAction}
              confidence={result.confidence}
              daaAlgorithms={result.daaAlgorithmsUsed}
              weightExplanation={result.weightExplanation}
            />
          )}

          {/* ── Result Sub-tabs ─────────────────────────────────────────── */}
          <View style={s.resultTabRow}>
            {(["overview", "matrix", "tradeoffs", "risks"] as const).map((tab) => {
              const labels = { overview: "Overview", matrix: "Decision Matrix", tradeoffs: "Trade-offs", risks: "Risks" };
              const on = activeResultTab === tab;
              return (
                <Pressable key={tab} style={[s.resultTab, on && s.resultTabOn]} onPress={() => setActiveResultTab(tab)}>
                  <Text style={[s.resultTabTxt, on && s.resultTabTxtOn]}>{labels[tab]}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Overview tab */}
          {activeResultTab === "overview" && (
            <View>
              {/* Alternatives */}
              {(result.alternatives?.length > 0) && (
                <View style={s.altSection}>
                  <Text style={s.altHead}>Alternatives</Text>
                  {result.alternatives.map((alt) => (
                    <AlternativeCard key={alt.option} alt={alt} />
                  ))}
                </View>
              )}

              {/* Task Priority List */}
              {result.rankedTasks && result.rankedTasks.length > 0 && (
                <View style={s.rankedSection}>
                  <Text style={s.rankedHead}>Task Priority Order (Greedy Scheduler)</Text>
                  {result.rankedTasks.slice(0, 8).map((t) => (
                    <RankedTaskRow key={t.taskId} task={t} />
                  ))}
                </View>
              )}

              {/* Sprint selection */}
              {result.sprintSelection && (
                <SprintSelectionView sprint={result.sprintSelection} />
              )}

              {/* Assignment list */}
              {result.assignments && result.assignments.length > 0 && (
                <View style={s.assignSection}>
                  <Text style={s.assignHead}>Optimal Assignments (Branch & Bound)</Text>
                  {result.assignments.map((a: any) => (
                    <AssignmentRow key={a.taskId} assignment={a} />
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Decision Matrix tab */}
          {activeResultTab === "matrix" && result.matrix && (
            <DecisionMatrixView matrix={result.matrix} />
          )}

          {/* Trade-offs tab */}
          {activeResultTab === "tradeoffs" && (
            <View>
              {result.tradeoffs?.length > 0 ? (
                result.tradeoffs.map((t) => <TradeoffCard key={t.option} tradeoff={t} />)
              ) : (
                <Text style={s.empty}>No detailed trade-off data available for this decision type.</Text>
              )}
            </View>
          )}

          {/* Risks tab */}
          {activeResultTab === "risks" && (
            <View>
              {result.risks?.length > 0 ? (
                result.risks.map((r, idx) => <RiskCard key={idx} risk={r} />)
              ) : (
                <View style={sSub.noRiskBox}>
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
                  <Text style={sSub.noRiskTxt}>No significant risks detected based on project context.</Text>
                </View>
              )}
            </View>
          )}

          {/* ── Action Buttons ──────────────────────────────────────────── */}
          <View style={s.actionRow}>
            <Pressable
              style={[s.actionBtn, s.actionBtnPrimary, creatingTask && s.btnDisabled]}
              onPress={createRecommendedTask}
              disabled={creatingTask}
            >
              {creatingTask ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={15} color="#fff" />
                  <Text style={s.actionBtnTxt}>Create Recommended Task</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[s.actionBtn, s.actionBtnSecondary, saving && s.btnDisabled]}
              onPress={saveDecision}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="bookmark-outline" size={15} color={colors.primary} />
                  <Text style={[s.actionBtnTxt, { color: colors.primary }]}>Save Decision</Text>
                </>
              )}
            </Pressable>
          </View>

          <Text style={s.disclaimer}>
            ⚡ Scores are deterministic. AI (if available) only explains trade-offs — it does not calculate scores.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function DaaTag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[sSub.daaTag, { backgroundColor: color + "18", borderColor: color + "44" }]}>
      <Text style={[sSub.daaTagTxt, { color }]}>{label}</Text>
    </View>
  );
}

function RecommendationCard({
  recommendation, reason, keyFactors, nextAction, confidence, daaAlgorithms, weightExplanation,
}: {
  recommendation: Recommendation;
  reason: string;
  keyFactors: string[];
  nextAction: string;
  confidence: { label: string; description: string };
  daaAlgorithms: string[];
  weightExplanation: string;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const strengthColors: Record<string, string> = {
    "Strong Fit": colors.success,
    "Good Fit": colors.greedy,
    "Moderate Fit": colors.warning,
    "Weak Fit": colors.danger,
  };
  const sc = strengthColors[recommendation.strength?.label] || colors.primary;

  return (
    <View style={sSub.recCard}>
      <View style={sSub.recHeader}>
        <Text style={sSub.recLabel}>RECOMMENDED</Text>
        <View style={[sSub.strengthPill, { backgroundColor: sc + "22" }]}>
          <Text style={[sSub.strengthTxt, { color: sc }]}>
            {recommendation.strength?.emoji} {recommendation.strength?.label}
          </Text>
        </View>
      </View>

      <Text style={sSub.recOption}>{recommendation.option}</Text>

      {/* Score bar */}
      <View style={sSub.scoreRow}>
        <View style={sSub.scoreBarTrack}>
          <View style={[sSub.scoreBarFill, { width: `${recommendation.score}%` as any, backgroundColor: sc }]} />
        </View>
        <Text style={[sSub.scoreTxt, { color: sc }]}>{recommendation.score}/100</Text>
      </View>

      {/* Reason */}
      <Text style={sSub.recReason}>{reason}</Text>

      {/* Key factors */}
      {keyFactors?.length > 0 && (
        <View style={sSub.keyFactorRow}>
          {keyFactors.map((kf) => (
            <View key={kf} style={sSub.keyFactor}>
              <Ionicons name="checkmark-circle" size={11} color={colors.success} />
              <Text style={sSub.keyFactorTxt}>{kf}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Next action */}
      <View style={sSub.nextActionBox}>
        <Ionicons name="arrow-forward-circle-outline" size={14} color={colors.primary} />
        <Text style={sSub.nextActionTxt}>{nextAction}</Text>
      </View>

      {/* Confidence + DAA details */}
      <Pressable style={sSub.detailToggle} onPress={() => setShowDetails((v) => !v)}>
        <View style={[sSub.confPill, { backgroundColor: confidence.label === "High" ? colors.successSoft : confidence.label === "Medium" ? colors.warningSoft : colors.dangerSoft }]}>
          <Text style={[sSub.confTxt, { color: confidence.label === "High" ? colors.success : confidence.label === "Medium" ? colors.warning : colors.danger }]}>
            Confidence: {confidence.label}
          </Text>
        </View>
        <Ionicons name={showDetails ? "chevron-up" : "chevron-down"} size={14} color={colors.textMuted} />
      </Pressable>

      {showDetails && (
        <View style={sSub.detailBox}>
          <Text style={sSub.detailLine}>{confidence.description}</Text>
          <Text style={[sSub.detailLine, { marginTop: 6, fontWeight: "700", color: colors.text }]}>DAA Algorithms Used:</Text>
          {daaAlgorithms?.map((d) => (
            <Text key={d} style={sSub.detailLine}>↳ {d}</Text>
          ))}
          <Text style={[sSub.detailLine, { marginTop: 6, color: colors.textFaint, fontSize: 10 }]}>
            {weightExplanation}
          </Text>
        </View>
      )}
    </View>
  );
}

function AlternativeCard({ alt }: { alt: Alternative }) {
  const strengthColors: Record<string, string> = {
    "Strong Fit": colors.success,
    "Good Fit": colors.greedy,
    "Moderate Fit": colors.warning,
    "Weak Fit": colors.danger,
  };
  const sc = strengthColors[alt.strength?.label] || colors.textMuted;
  return (
    <View style={sSub.altCard}>
      <View style={sSub.altLeft}>
        <Text style={sSub.altOption}>{alt.option}</Text>
        {alt.reason && <Text style={sSub.altReason} numberOfLines={2}>{alt.reason}</Text>}
      </View>
      <View style={sSub.altRight}>
        <Text style={[sSub.altScore, { color: sc }]}>{alt.score}</Text>
        <Text style={[sSub.altStrength, { color: sc }]}>{alt.strength?.label}</Text>
      </View>
    </View>
  );
}

function RankedTaskRow({ task }: { task: any }) {
  const rankColors = ["#DC2626", "#EA580C", "#CA8A04", "#16A34A", "#5B7C8C"];
  const rc = rankColors[Math.min(task.rank - 1, rankColors.length - 1)];
  return (
    <View style={sSub.rankedRow}>
      <View style={[sSub.rankBadge, { backgroundColor: rc }]}>
        <Text style={sSub.rankNum}>#{task.rank}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={sSub.rankedTitle} numberOfLines={1}>{task.title}</Text>
        <Text style={sSub.rankedSub}>Greedy Score: {task.priorityScore}/100 · U{task.urgency} I{task.impact} D{task.dependencyCount}</Text>
      </View>
      <View style={[sSub.strengthPill2, { backgroundColor: colors.success + "18" }]}>
        <Text style={[sSub.strengthTxt2, { color: colors.success }]}>{task.priorityScore}</Text>
      </View>
    </View>
  );
}

function SprintSelectionView({ sprint }: { sprint: any }) {
  return (
    <View style={sSub.sprintBox}>
      <Text style={sSub.sprintHead}>Knapsack Sprint Selection</Text>
      <View style={sSub.sprintStats}>
        <SprintStat label="Tasks Selected" value={String(sprint.selected.length)} color={colors.success} />
        <SprintStat label="Effort Used" value={`${sprint.effortUsed}/${sprint.capacity}`} color={colors.greedy} />
        <SprintStat label="Total Value" value={String(sprint.totalValue)} color={colors.primary} />
        <SprintStat label="Utilization" value={`${sprint.utilizationPct}%`} color={sprint.utilizationPct > 90 ? colors.danger : colors.info} />
      </View>
      <View style={sSub.gaugeTrack}>
        <View style={[sSub.gaugeFill, { width: `${Math.min(sprint.utilizationPct, 100)}%` as any, backgroundColor: sprint.utilizationPct > 90 ? colors.danger : colors.success }]} />
      </View>
      <Text style={sSub.sprintSub}>Selected Tasks ({sprint.selected.length})</Text>
      {sprint.selected.map((t: any) => (
        <View key={t.taskId} style={sSub.sprintTaskRow}>
          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          <Text style={sSub.sprintTaskTxt} numberOfLines={1}>{t.title}</Text>
          <Text style={sSub.sprintTaskMeta}>{t.effort}pts · V{t.value}</Text>
        </View>
      ))}
      {sprint.rejected.length > 0 && (
        <>
          <Text style={sSub.sprintSub}>Deferred Tasks ({sprint.rejected.length})</Text>
          {sprint.rejected.slice(0, 5).map((t: any) => (
            <View key={t.taskId} style={sSub.sprintTaskRow}>
              <Ionicons name="remove-circle-outline" size={14} color={colors.textFaint} />
              <Text style={[sSub.sprintTaskTxt, { color: colors.textMuted }]} numberOfLines={1}>{t.title}</Text>
              <Text style={sSub.sprintTaskMeta}>{t.effort}pts</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function SprintStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={sSub.sprintStat}>
      <Text style={[sSub.sprintStatVal, { color }]}>{value}</Text>
      <Text style={sSub.sprintStatLbl}>{label}</Text>
    </View>
  );
}

function AssignmentRow({ assignment }: { assignment: any }) {
  return (
    <View style={sSub.assignRow}>
      <View style={{ flex: 1 }}>
        <Text style={sSub.assignTask} numberOfLines={1}>{assignment.taskTitle}</Text>
        <Text style={sSub.assignMember}>→ {assignment.memberName}</Text>
      </View>
      <View style={[sSub.fitPill, { backgroundColor: assignment.fitScore >= 70 ? colors.successSoft : colors.warningSoft }]}>
        <Text style={[sSub.fitScore, { color: assignment.fitScore >= 70 ? colors.success : colors.warning }]}>
          Fit: {assignment.fitScore}%
        </Text>
      </View>
    </View>
  );
}

function DecisionMatrixView({ matrix }: { matrix: DecisionMatrix }) {
  if (!matrix?.options?.length || !matrix?.factors?.length) {
    return <Text style={sSub.empty}>No matrix data available.</Text>;
  }

  return (
    <View style={sSub.matrixWrap}>
      <Text style={sSub.matrixTitle}>Decision Matrix</Text>
      <Text style={sSub.matrixNote}>
        {matrix.note || "Higher score = better fit. Highlighted = recommended winner."}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {/* Header row */}
          <View style={sSub.matrixRow}>
            <View style={[sSub.matrixCell, sSub.matrixHeaderCell]}>
              <Text style={sSub.matrixHeaderTxt}>Factor / Option</Text>
            </View>
            {matrix.options.map((opt, i) => (
              <View key={i} style={[sSub.matrixCell, sSub.matrixHeaderCell, matrix.winner === opt && sSub.matrixWinnerHeader]}>
                <Text style={[sSub.matrixHeaderTxt, matrix.winner === opt && { color: colors.primary }]} numberOfLines={2}>{opt}</Text>
                {matrix.winner === opt && <Text style={sSub.winnerStar}>★</Text>}
              </View>
            ))}
          </View>
          {/* Factor rows */}
          {matrix.factors.map((factor, fi) => (
            <View key={fi} style={sSub.matrixRow}>
              <View style={[sSub.matrixCell, sSub.matrixLabelCell]}>
                <Text style={sSub.matrixLabelTxt}>{typeof factor === "string" ? factor : (factor as any).label || factor}</Text>
                {matrix.weights?.[fi] !== undefined && (
                  <Text style={sSub.matrixWeight}>w={Math.round((matrix.weights[fi] || 0) * 100)}%</Text>
                )}
              </View>
              {matrix.options.map((opt, oi) => {
                const score = matrix.scores?.[oi]?.[fi] ?? 0;
                const isWinner = matrix.winner === opt;
                return (
                  <View key={oi} style={[sSub.matrixCell, sSub.matrixScoreCell, isWinner && sSub.matrixWinnerCell]}>
                    <Text style={[sSub.matrixScoreTxt, { color: score >= 75 ? colors.success : score < 50 ? colors.danger : colors.greedy }]}>
                      {score}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
          {/* Final score row */}
          <View style={[sSub.matrixRow, sSub.matrixFinalRow]}>
            <View style={[sSub.matrixCell, sSub.matrixLabelCell]}>
              <Text style={[sSub.matrixLabelTxt, { fontWeight: "800" }]}>Final Score</Text>
            </View>
            {matrix.finalScores?.map((score, i) => (
              <View key={i} style={[sSub.matrixCell, sSub.matrixScoreCell, matrix.winner === matrix.options[i] && sSub.matrixWinnerCell]}>
                <Text style={[sSub.matrixScoreTxt, { fontWeight: "800", fontSize: 14, color: colors.primary }]}>{score}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function TradeoffCard({ tradeoff }: { tradeoff: Tradeoff }) {
  return (
    <View style={sSub.tradeoffCard}>
      <Text style={sSub.tradeoffOption}>{tradeoff.option}</Text>
      <View style={sSub.tradeoffBody}>
        <View style={sSub.tradeoffCol}>
          <Text style={[sSub.tradeoffHead, { color: colors.success }]}>✓ Advantages</Text>
          {tradeoff.pros?.map((p, i) => (
            <Text key={i} style={sSub.tradeoffItem}>• {p}</Text>
          ))}
        </View>
        <View style={sSub.tradeoffDivider} />
        <View style={sSub.tradeoffCol}>
          <Text style={[sSub.tradeoffHead, { color: colors.danger }]}>✗ Trade-offs</Text>
          {tradeoff.cons?.map((c, i) => (
            <Text key={i} style={sSub.tradeoffItem}>• {c}</Text>
          ))}
        </View>
      </View>
      {tradeoff.note && <Text style={sSub.tradeoffNote}>{tradeoff.note}</Text>}
    </View>
  );
}

function RiskCard({ risk }: { risk: Risk }) {
  const sevColors: Record<string, string> = { high: colors.danger, medium: colors.warning, low: colors.success };
  const sevBg: Record<string, string> = { high: colors.dangerSoft, medium: colors.warningSoft, low: colors.successSoft };
  const sc = sevColors[risk.severity] || colors.textMuted;
  const bc = sevBg[risk.severity] || colors.surfaceAlt;
  return (
    <View style={[sSub.riskCard, { borderLeftColor: sc }]}>
      <View style={sSub.riskHeader}>
        <Ionicons name="warning-outline" size={14} color={sc} />
        <Text style={[sSub.riskOption, { color: sc }]}>{risk.option}</Text>
        <View style={[sSub.sevPill, { backgroundColor: bc }]}>
          <Text style={[sSub.sevTxt, { color: sc }]}>{risk.severity?.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={sSub.riskTxt}>{risk.risk}</Text>
      {risk.mitigation && (
        <View style={sSub.mitigationBox}>
          <Ionicons name="shield-checkmark-outline" size={12} color={colors.info} />
          <Text style={sSub.mitigationTxt}>{risk.mitigation}</Text>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: 12, paddingBottom: 60 },

  headerCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 6 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  heading: { fontSize: 17, fontWeight: "800", color: colors.text },
  subheading: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  daaStrip: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 },

  section: { gap: 8 },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  hint: { fontSize: 11, fontWeight: "400", color: colors.textFaint },

  typeRow: { gap: 8, paddingVertical: 4 },
  typeBtn: { alignItems: "center", gap: 3, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, minWidth: 90 },
  typeBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeBtnLabel: { fontSize: 12, fontWeight: "700", color: colors.primary },
  typeDaaLabel: { fontSize: 9, color: colors.textFaint, textAlign: "center" },
  typeDesc: { fontSize: 11, color: colors.textMuted, lineHeight: 15, paddingHorizontal: 2 },

  textInput: { backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text, minHeight: 44 },

  stepperRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBtn: { backgroundColor: colors.border, borderRadius: 8, width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  stepBtnTxt: { fontSize: 20, fontWeight: "700", color: colors.text },
  stepValue: { fontSize: 16, fontWeight: "700", color: colors.text, minWidth: 70, textAlign: "center" },

  presetRow: { gap: 6, paddingVertical: 2 },
  presetBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  presetBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetBtnTxt: { fontSize: 12, fontWeight: "700", color: colors.primary },

  weightsGrid: { gap: 6 },
  weightItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  weightKey: { fontSize: 11, color: colors.textMuted, width: 80, fontWeight: "600" },
  weightBarTrack: { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" },
  weightBarFill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
  weightVal: { fontSize: 11, fontWeight: "700", color: colors.primary, width: 32, textAlign: "right" },

  analyzeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14 },
  btnDisabled: { opacity: 0.5 },
  analyzeBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },

  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: 10 },
  errorTxt: { flex: 1, fontSize: 12, color: colors.danger, lineHeight: 17 },

  resultArea: { gap: 12 },

  contextStrip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, flexWrap: "wrap" },
  contextStripTxt: { flex: 1, fontSize: 11, color: colors.primary, fontWeight: "600" },
  aiPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  aiPillTxt: { fontSize: 9, fontWeight: "700", color: colors.accentDark },

  resultTabRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  resultTab: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  resultTabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  resultTabTxt: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  resultTabTxtOn: { color: "#fff" },

  altSection: { gap: 6 },
  altHead: { fontSize: 13, fontWeight: "700", color: colors.text },

  rankedSection: { gap: 6 },
  rankedHead: { fontSize: 13, fontWeight: "700", color: colors.text },

  assignSection: { gap: 6 },
  assignHead: { fontSize: 13, fontWeight: "700", color: colors.text },

  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: radius.sm },
  actionBtnPrimary: { backgroundColor: colors.primary },
  actionBtnSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  actionBtnTxt: { fontSize: 12, fontWeight: "700", color: "#fff" },

  disclaimer: { fontSize: 10, color: colors.textFaint, textAlign: "center", lineHeight: 15 },

  empty: { fontSize: 13, color: colors.textFaint, textAlign: "center", padding: 16 },
});

const sSub = StyleSheet.create({
  daaTag: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  daaTagTxt: { fontSize: 10, fontWeight: "700" },

  // Recommendation Card
  recCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.primaryBorder, gap: 8 },
  recHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recLabel: { fontSize: 10, fontWeight: "800", color: colors.textFaint, letterSpacing: 1 },
  strengthPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  strengthTxt: { fontSize: 11, fontWeight: "700" },
  recOption: { fontSize: 22, fontWeight: "800", color: colors.primary },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  scoreBarTrack: { flex: 1, height: 10, backgroundColor: colors.border, borderRadius: 5, overflow: "hidden" },
  scoreBarFill: { height: 10, borderRadius: 5 },
  scoreTxt: { fontSize: 16, fontWeight: "800", minWidth: 50 },
  recReason: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  keyFactorRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  keyFactor: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.successSoft, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 3 },
  keyFactorTxt: { fontSize: 10, fontWeight: "700", color: colors.success },
  nextActionBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: 8 },
  nextActionTxt: { flex: 1, fontSize: 12, color: colors.primary, lineHeight: 17, fontWeight: "600" },
  detailToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  confPill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  confTxt: { fontSize: 10, fontWeight: "700" },
  detailBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 8, gap: 3 },
  detailLine: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },

  // Alternative
  altCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.sm, padding: 10, borderWidth: 1, borderColor: colors.border, gap: 10 },
  altLeft: { flex: 1, gap: 2 },
  altOption: { fontSize: 13, fontWeight: "700", color: colors.text },
  altReason: { fontSize: 11, color: colors.textMuted, lineHeight: 15 },
  altRight: { alignItems: "flex-end" },
  altScore: { fontSize: 18, fontWeight: "800" },
  altStrength: { fontSize: 10, fontWeight: "600" },

  // Ranked tasks
  rankedRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: radius.sm, padding: 8 },
  rankBadge: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rankNum: { fontSize: 11, fontWeight: "800", color: "#fff" },
  rankedTitle: { fontSize: 13, fontWeight: "600", color: colors.text },
  rankedSub: { fontSize: 10, color: colors.textFaint, marginTop: 1 },
  strengthPill2: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  strengthTxt2: { fontSize: 11, fontWeight: "700" },

  // Sprint
  sprintBox: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 8 },
  sprintHead: { fontSize: 13, fontWeight: "800", color: colors.text },
  sprintStats: { flexDirection: "row", justifyContent: "space-between" },
  sprintStat: { alignItems: "center", flex: 1 },
  sprintStatVal: { fontSize: 18, fontWeight: "800" },
  sprintStatLbl: { fontSize: 9, color: colors.textMuted, marginTop: 2 },
  gaugeTrack: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" },
  gaugeFill: { height: 8, borderRadius: 4 },
  sprintSub: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginTop: 4 },
  sprintTaskRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  sprintTaskTxt: { flex: 1, fontSize: 12, color: colors.text },
  sprintTaskMeta: { fontSize: 10, color: colors.textFaint },

  // Assignment
  assignRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: radius.sm, padding: 10, borderWidth: 1, borderColor: colors.border },
  assignTask: { fontSize: 12, fontWeight: "700", color: colors.text },
  assignMember: { fontSize: 11, color: colors.textMuted },
  fitPill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  fitScore: { fontSize: 10, fontWeight: "700" },

  // Matrix
  matrixWrap: { gap: 8 },
  matrixTitle: { fontSize: 13, fontWeight: "800", color: colors.text },
  matrixNote: { fontSize: 10, color: colors.textFaint },
  matrixRow: { flexDirection: "row" },
  matrixCell: { width: 110, padding: 8, justifyContent: "center", alignItems: "center", borderWidth: 0.5, borderColor: colors.border },
  matrixHeaderCell: { backgroundColor: colors.surfaceAlt },
  matrixHeaderTxt: { fontSize: 10, fontWeight: "700", color: colors.text, textAlign: "center" },
  matrixWinnerHeader: { backgroundColor: colors.primarySoft },
  winnerStar: { fontSize: 10, color: colors.primary },
  matrixLabelCell: { alignItems: "flex-start", backgroundColor: colors.surfaceAlt },
  matrixLabelTxt: { fontSize: 10, color: colors.text, fontWeight: "600" },
  matrixWeight: { fontSize: 9, color: colors.textFaint },
  matrixScoreCell: {},
  matrixWinnerCell: { backgroundColor: colors.primarySoft + "55" },
  matrixScoreTxt: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  matrixFinalRow: { backgroundColor: colors.surfaceAlt },

  // Tradeoff
  tradeoffCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 8 },
  tradeoffOption: { fontSize: 14, fontWeight: "700", color: colors.text },
  tradeoffBody: { flexDirection: "row", gap: 8 },
  tradeoffCol: { flex: 1, gap: 4 },
  tradeoffDivider: { width: 1, backgroundColor: colors.border },
  tradeoffHead: { fontSize: 11, fontWeight: "700", marginBottom: 2 },
  tradeoffItem: { fontSize: 11, color: colors.textMuted, lineHeight: 15 },
  tradeoffNote: { fontSize: 10, color: colors.textFaint, fontStyle: "italic" },

  // Risk
  riskCard: { backgroundColor: colors.surface, borderRadius: radius.sm, padding: 12, borderLeftWidth: 3, borderWidth: 1, borderColor: colors.border, gap: 6 },
  riskHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  riskOption: { flex: 1, fontSize: 12, fontWeight: "700" },
  sevPill: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  sevTxt: { fontSize: 9, fontWeight: "700" },
  riskTxt: { fontSize: 12, color: colors.text, lineHeight: 17 },
  mitigationBox: { flexDirection: "row", alignItems: "flex-start", gap: 5, backgroundColor: colors.infoSoft, borderRadius: radius.sm, padding: 6 },
  mitigationTxt: { flex: 1, fontSize: 11, color: colors.info, lineHeight: 15 },

  noRiskBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.successSoft, borderRadius: radius.sm, padding: 12 },
  noRiskTxt: { flex: 1, fontSize: 12, color: colors.success, fontWeight: "600" },

  empty: { fontSize: 12, color: colors.textFaint, textAlign: "center", padding: 16 },
});
