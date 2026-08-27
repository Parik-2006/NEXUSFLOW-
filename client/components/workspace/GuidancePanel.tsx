/**
 * client/components/workspace/GuidancePanel.tsx
 * ============================================================================
 * NEXUSFLOW 2.0 — Phase 6: Student Project Guidance & Project Copilot UI
 *
 * Provides full guidance answering:
 * "I have this project idea. What exactly do I need to do?"
 *
 * ARCHITECTURAL COUPLING:
 *   - Project Understanding, Domain, Problem Statement
 *   - Hardware & Sensor Detection (ESP32, Sensors, Actuators)
 *   - AI/ML & Dataset Guidance (Techniques, Preprocessing, Collection)
 *   - Phased Roadmap (Topological Sort sequence)
 *   - Hackathon Mode (0/1 Knapsack DP + Greedy Priority)
 *   - Team Skill Gap Analysis (Skill profile vs project needs)
 *   - Deterministic Readiness Meter (0–100%)
 *   - Next Action Engine
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { colors, spacing, radius, font } from "@/theme";
import { useToast } from "@/components/feedback";

const API = process.env.EXPO_PUBLIC_API_URL ?? "https://nexusflow-nxeg.onrender.com";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface HardwareItem {
  name: string;
  category: string;
  required: boolean;
  purpose: string;
}

interface HardwareInfo {
  status: "REQUIRED" | "NOT_REQUIRED" | "NEEDS_CONFIRMATION";
  label: string;
  explanation: string;
  items: HardwareItem[];
}

interface AiMlInfo {
  status: "REQUIRED" | "OPTIONAL" | "NOT_NECESSARY";
  label: string;
  category: string;
  explanation: string;
  techniques: string[];
  dataset: {
    required: "YES" | "NO" | "MAYBE";
    type: string;
    collectionStrategy: string;
    preprocessing: string;
    sourceStatus: string;
  };
}

interface StackItem {
  name: string;
  category: string;
  role: string;
  status: "REQUIRED" | "OPTIONAL" | "FUTURE_ENHANCEMENT";
}

interface TaskItem {
  title: string;
  description: string;
  urgency: number;
  impact: number;
  estimatedHours: number;
  businessValue: number;
  priorityScore: number;
  isCoreMvp: boolean;
  phase?: string;
}

interface PhaseItem {
  phaseIndex: number;
  name: string;
  summary: string;
  estimatedHours: number;
  tasks: TaskItem[];
}

interface GuidancePayload {
  projectUnderstanding: {
    title: string;
    domain: string;
    summary: string;
    problemStatement: string;
    targetUsers: string[];
    coreModules: string[];
  };
  hardware: HardwareInfo;
  aiMl: AiMlInfo;
  apis: Array<{ name: string; purpose: string; category: string; verificationStatus: string; required: boolean }>;
  technologyStack: {
    stack: StackItem[];
    tools: StackItem[];
    decisionIntegrationNote: string;
  };
  phases: PhaseItem[];
  dependencyRoadmap: {
    links: Array<{ fromPhase: string; toPhase: string; reason: string }>;
    topologicalOrder: string[];
  };
  learning: {
    prerequisites: string[];
    stages: Array<{ stage: string; items: string[]; icon: keyof typeof Ionicons.glyphMap }>;
  };
  researchTopics: Array<{ topic: string; why: string }>;
  mvpPlanning: {
    mvp: string[];
    advanced: string[];
  };
  hackathonMode: {
    hoursBudget: number;
    effortUsed: number;
    capacityLeft: number;
    totalValue: number;
    selectedTasksCount: number;
    deferredTasksCount: number;
    mvpTasks: TaskItem[];
    deferredTasks: TaskItem[];
    hackathonStrategy: string;
  };
  complexity: {
    level: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
    score: number;
    explanation: string;
    risks: Array<{ risk: string; severity: "LOW" | "MEDIUM" | "HIGH"; reason: string; mitigation: string }>;
  };
  skillGaps: {
    status: string;
    summary: string;
    averageSkills?: Record<string, number>;
    gaps: Array<{ domain: string; currentLevel: number; requiredLevel: number; severity: string; recommendation: string }>;
    strengths: string[];
  };
  readiness: {
    score: number;
    tier: string;
    breakdown: Array<{ factor: string; score: number; max: number; status: string }>;
  };
  nextAction: {
    action: string;
    type: string;
    reason: string;
    buttonLabel: string;
    targetTab: string;
  };
  daaAlgorithmsUsed: string[];
  aiEnhanced?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function GuidancePanel({ teamId }: { teamId: string }) {
  const { token } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<GuidancePayload | null>(null);

  // Active view
  const [activeTab, setActiveTab] = useState<"overview" | "tech" | "roadmap" | "hackathon" | "learning" | "team">("overview");

  // Hackathon hours selector
  const [hackathonHours, setHackathonHours] = useState<number>(24);

  // Creating action task
  const [creatingTask, setCreatingTask] = useState(false);

  // ── Fetch Guidance ──────────────────────────────────────────────────────────
  const fetchGuidance = useCallback(async (hours = hackathonHours) => {
    if (!teamId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/teams/${teamId}/project-guidance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hackathonHours: hours }),
        signal: AbortSignal.timeout(14000),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load project guidance.");
      }

      setGuidance(data.guidance);
    } catch (err: any) {
      setError(err.message || "Unable to fetch project guidance.");
    } finally {
      setLoading(false);
    }
  }, [teamId, token, hackathonHours]);

  useEffect(() => {
    fetchGuidance();
  }, [teamId, token]);

  // ── Create Next Action Task ────────────────────────────────────────────────
  const handleExecuteNextAction = useCallback(async () => {
    if (!guidance?.nextAction || creatingTask) return;
    setCreatingTask(true);
    try {
      const taskBody = {
        title: guidance.nextAction.action,
        description: `Phase 6 Guidance Next Action: ${guidance.nextAction.reason}`,
        category: guidance.nextAction.type === "hardware_setup" ? "Hardware" :
                  guidance.nextAction.type === "dataset_collection" ? "AI / ML" : "Planning",
        urgency: 5,
        impact: 5,
        estimatedHours: 4,
        businessValue: 10,
        source: "ai",
      };

      const res = await fetch(`${API}/api/teams/${teamId}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(taskBody),
      });

      if (!res.ok) throw new Error("Could not create next action task.");
      toast("Action task created in backlog!", "success");
    } catch (err: any) {
      toast(err.message || "Failed to create task", "error");
    } finally {
      setCreatingTask(false);
    }
  }, [guidance, creatingTask, teamId, token]);

  // ── Render Loading ──────────────────────────────────────────────────────────
  if (loading && !guidance) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={s.loadingTxt}>Assembling Project Guidance & DAA Roadmap...</Text>
      </View>
    );
  }

  // ── Render Error ────────────────────────────────────────────────────────────
  if (error && !guidance) {
    return (
      <View style={s.errorCard}>
        <Ionicons name="alert-circle-outline" size={24} color={colors.danger} />
        <Text style={s.errorTxt}>{error}</Text>
        <Pressable style={s.retryBtn} onPress={() => fetchGuidance()}>
          <Text style={s.retryBtnTxt}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!guidance) return null;

  const readinessColor = guidance.readiness.score >= 80 ? colors.success :
                         guidance.readiness.score >= 60 ? colors.greedy :
                         guidance.readiness.score >= 40 ? colors.warning : colors.danger;

  const complexityColor = guidance.complexity.level === "VERY_HIGH" ? colors.danger :
                          guidance.complexity.level === "HIGH" ? colors.warning :
                          guidance.complexity.level === "MEDIUM" ? colors.info : colors.success;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      {/* ── Top Hero Card ──────────────────────────────────────────────────── */}
      <View style={s.heroCard}>
        <View style={s.heroTop}>
          <View style={{ flex: 1 }}>
            <View style={s.domainBadge}>
              <Ionicons name="compass-outline" size={12} color={colors.primary} />
              <Text style={s.domainTxt}>{guidance.projectUnderstanding.domain}</Text>
            </View>
            <Text style={s.heroTitle}>{guidance.projectUnderstanding.title}</Text>
          </View>
          <Pressable style={s.refreshBtn} onPress={() => fetchGuidance()} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={16} color={colors.primary} />}
          </Pressable>
        </View>

        {/* Meter Stats */}
        <View style={s.meterGrid}>
          {/* Readiness Meter */}
          <View style={s.meterCard}>
            <Text style={s.meterLbl}>PROJECT READINESS</Text>
            <View style={s.meterRow}>
              <Text style={[s.meterVal, { color: readinessColor }]}>{guidance.readiness.score}%</Text>
              <View style={[s.tierPill, { backgroundColor: readinessColor + "22" }]}>
                <Text style={[s.tierTxt, { color: readinessColor }]}>{guidance.readiness.tier}</Text>
              </View>
            </View>
            <View style={s.meterTrack}>
              <View style={[s.meterFill, { width: `${guidance.readiness.score}%` as any, backgroundColor: readinessColor }]} />
            </View>
          </View>

          {/* Complexity Card */}
          <View style={s.meterCard}>
            <Text style={s.meterLbl}>COMPLEXITY</Text>
            <View style={s.meterRow}>
              <Text style={[s.meterVal, { color: complexityColor }]}>{guidance.complexity.level}</Text>
            </View>
            <Text style={s.complexityDesc} numberOfLines={2}>{guidance.complexity.explanation}</Text>
          </View>
        </View>

        {/* DAA algorithm badges */}
        <View style={s.daaRow}>
          <Text style={s.daaHead}>DAA Engines:</Text>
          <View style={s.daaPills}>
            <View style={s.daag}><Text style={s.daagTxt}>TopoSort DAG</Text></View>
            <View style={s.daag}><Text style={s.daagTxt}>0/1 Knapsack</Text></View>
            <View style={s.daag}><Text style={s.daagTxt}>Greedy Priority</Text></View>
            <View style={s.daag}><Text style={s.daagTxt}>Merge Sort</Text></View>
          </View>
        </View>
      </View>

      {/* ── Next Action Callout Card ───────────────────────────────────────── */}
      <View style={s.nextActionCard}>
        <View style={s.nextActionTop}>
          <Ionicons name="sparkles" size={18} color={colors.accentDark} />
          <Text style={s.nextActionHead}>RECOMMENDED NEXT ACTION</Text>
        </View>
        <Text style={s.nextActionTitle}>{guidance.nextAction.action}</Text>
        <Text style={s.nextActionReason}>{guidance.nextAction.reason}</Text>
        <Pressable
          style={[s.nextActionBtn, creatingTask && s.disabledBtn]}
          onPress={handleExecuteNextAction}
          disabled={creatingTask}
        >
          {creatingTask ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={15} color="#fff" />
              <Text style={s.nextActionBtnTxt}>{guidance.nextAction.buttonLabel}</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* ── Guidance Navigation Tabs ───────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBar}>
        {[
          { key: "overview", label: "Overview", icon: "document-text-outline" },
          { key: "tech", label: "Tech & Hardware", icon: "hardware-chip-outline" },
          { key: "roadmap", label: "Phases & Roadmap", icon: "git-network-outline" },
          { key: "hackathon", label: "Hackathon Mode", icon: "flash-outline" },
          { key: "learning", label: "Learning & Research", icon: "school-outline" },
          { key: "team", label: "Skill Gaps & Risks", icon: "people-outline" },
        ].map((t) => {
          const on = activeTab === t.key;
          return (
            <Pressable key={t.key} style={[s.tabItem, on && s.tabItemOn]} onPress={() => setActiveTab(t.key as any)}>
              <Ionicons name={t.icon as any} size={14} color={on ? "#fff" : colors.textMuted} />
              <Text style={[s.tabTxt, on && s.tabTxtOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Tab 1: Overview ────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <View style={s.section}>
          <View style={s.card}>
            <Text style={s.cardTitle}>Project Understanding</Text>
            <Text style={s.cardBody}>{guidance.projectUnderstanding.summary}</Text>

            <Text style={[s.cardSubhead, { marginTop: 12 }]}>Problem Solved:</Text>
            <Text style={s.cardBody}>{guidance.projectUnderstanding.problemStatement}</Text>

            <Text style={[s.cardSubhead, { marginTop: 12 }]}>Target Users:</Text>
            <View style={s.chipRow}>
              {guidance.projectUnderstanding.targetUsers.map((u, i) => (
                <View key={i} style={s.chip}><Text style={s.chipTxt}>{u}</Text></View>
              ))}
            </View>

            <Text style={[s.cardSubhead, { marginTop: 12 }]}>Core Architecture Modules:</Text>
            {guidance.projectUnderstanding.coreModules.map((m, i) => (
              <View key={i} style={s.moduleRow}>
                <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                <Text style={s.moduleTxt}>{m}</Text>
              </View>
            ))}
          </View>

          {/* MVP vs Advanced */}
          <View style={s.card}>
            <Text style={s.cardTitle}>MVP vs Advanced Scope</Text>
            <View style={s.mvpGrid}>
              <View style={s.mvpCol}>
                <Text style={[s.mvpHead, { color: colors.success }]}>✓ Core MVP Scope</Text>
                {guidance.mvpPlanning.mvp.slice(0, 6).map((m, i) => (
                  <Text key={i} style={s.mvpItem}>• {m}</Text>
                ))}
              </View>
              <View style={s.mvpDivider} />
              <View style={s.mvpCol}>
                <Text style={[s.mvpHead, { color: colors.info }]}>★ Advanced (Post-MVP)</Text>
                {guidance.mvpPlanning.advanced.slice(0, 6).map((m, i) => (
                  <Text key={i} style={s.mvpItem}>• {m}</Text>
                ))}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ── Tab 2: Tech & Hardware ─────────────────────────────────────────── */}
      {activeTab === "tech" && (
        <View style={s.section}>
          {/* Hardware Detection Card */}
          <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: guidance.hardware.status === "REQUIRED" ? colors.greedy : colors.border }]}>
            <View style={s.cardHeaderRow}>
              <Ionicons name="hardware-chip-outline" size={18} color={guidance.hardware.status === "REQUIRED" ? colors.greedy : colors.textMuted} />
              <Text style={s.cardTitle}>{guidance.hardware.label}</Text>
            </View>
            <Text style={s.cardBody}>{guidance.hardware.explanation}</Text>

            {guidance.hardware.items.length > 0 && (
              <View style={{ marginTop: 8, gap: 6 }}>
                {guidance.hardware.items.map((item, i) => (
                  <View key={i} style={s.hwRow}>
                    <Ionicons name="cube-outline" size={14} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.hwName}>{item.name}</Text>
                      <Text style={s.hwPurpose}>{item.purpose}</Text>
                    </View>
                    <View style={[s.pill, { backgroundColor: item.required ? colors.dangerSoft : colors.infoSoft }]}>
                      <Text style={[s.pillTxt, { color: item.required ? colors.danger : colors.info }]}>
                        {item.required ? "REQUIRED" : "OPTIONAL"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* AI/ML & Dataset Card */}
          <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: guidance.aiMl.status === "REQUIRED" ? colors.accentDark : colors.border }]}>
            <View style={s.cardHeaderRow}>
              <Ionicons name="bulb-outline" size={18} color={guidance.aiMl.status === "REQUIRED" ? colors.accentDark : colors.textMuted} />
              <Text style={s.cardTitle}>{guidance.aiMl.label} ({guidance.aiMl.category})</Text>
            </View>
            <Text style={s.cardBody}>{guidance.aiMl.explanation}</Text>

            {guidance.aiMl.techniques.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={s.cardSubhead}>Suggested Techniques:</Text>
                <View style={s.chipRow}>
                  {guidance.aiMl.techniques.map((t, i) => (
                    <View key={i} style={s.chip}><Text style={s.chipTxt}>{t}</Text></View>
                  ))}
                </View>
              </View>
            )}

            {/* Dataset requirements */}
            <View style={s.datasetBox}>
              <Text style={s.datasetHead}>Dataset Guidance: {guidance.aiMl.dataset.required}</Text>
              <Text style={s.datasetTxt}><Text style={{ fontWeight: "700" }}>Type: </Text>{guidance.aiMl.dataset.type}</Text>
              <Text style={s.datasetTxt}><Text style={{ fontWeight: "700" }}>Strategy: </Text>{guidance.aiMl.dataset.collectionStrategy}</Text>
              <Text style={s.datasetTxt}><Text style={{ fontWeight: "700" }}>Preprocessing: </Text>{guidance.aiMl.dataset.preprocessing}</Text>
            </View>
          </View>

          {/* Recommended Stack */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Recommended Technology Stack</Text>
            <View style={{ gap: 8, marginTop: 6 }}>
              {guidance.technologyStack.stack.map((item, i) => (
                <View key={i} style={s.stackRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.stackName}>{item.name}</Text>
                    <Text style={s.stackRole}>{item.role}</Text>
                  </View>
                  <View style={s.catPill}>
                    <Text style={s.catPillTxt}>{item.category}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* ── Tab 3: Phases & Roadmap ────────────────────────────────────────── */}
      {activeTab === "roadmap" && (
        <View style={s.section}>
          <Text style={s.sectionHead}>Topological Development Sequence ({guidance.phases.length} Phases)</Text>
          {guidance.phases.map((phase) => (
            <View key={phase.phaseIndex} style={s.phaseCard}>
              <View style={s.phaseHeader}>
                <View style={s.phaseNumBadge}>
                  <Text style={s.phaseNumTxt}>#{phase.phaseIndex}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.phaseName}>{phase.name}</Text>
                  <Text style={s.phaseSub}>{phase.estimatedHours} hours · {phase.tasks.length} tasks</Text>
                </View>
              </View>

              <View style={{ gap: 6, marginTop: 8 }}>
                {phase.tasks.map((task, ti) => (
                  <View key={ti} style={s.taskRow}>
                    <Ionicons name="checkbox-outline" size={14} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.taskTitle}>{task.title}</Text>
                      <Text style={s.taskMeta}>Est: {task.estimatedHours}h · Priority: {task.priorityScore}/100</Text>
                    </View>
                    {task.isCoreMvp && (
                      <View style={s.mvpTag}><Text style={s.mvpTagTxt}>MVP</Text></View>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Tab 4: Hackathon Mode ───────────────────────────────────────────── */}
      {activeTab === "hackathon" && (
        <View style={s.section}>
          <View style={s.card}>
            <View style={s.cardHeaderRow}>
              <Ionicons name="flash" size={18} color={colors.greedy} />
              <Text style={s.cardTitle}>Hackathon & Demo Time Slicer (0/1 Knapsack DP)</Text>
            </View>
            <Text style={s.cardBody}>{guidance.hackathonMode.hackathonStrategy}</Text>

            {/* Time Budget Selector */}
            <Text style={[s.cardSubhead, { marginTop: 12 }]}>Select Available Time Budget:</Text>
            <View style={s.chipRow}>
              {[6, 12, 24, 36, 48].map((hrs) => (
                <Pressable
                  key={hrs}
                  style={[s.hrsBtn, hackathonHours === hrs && s.hrsBtnOn]}
                  onPress={() => {
                    setHackathonHours(hrs);
                    fetchGuidance(hrs);
                  }}
                >
                  <Text style={[s.hrsBtnTxt, hackathonHours === hrs && s.hrsBtnTxtOn]}>{hrs} Hours</Text>
                </Pressable>
              ))}
            </View>

            {/* Knapsack Stats */}
            <View style={s.knapStats}>
              <View style={s.knapStat}>
                <Text style={s.knapStatVal}>{guidance.hackathonMode.selectedTasksCount}</Text>
                <Text style={s.knapStatLbl}>MVP Tasks</Text>
              </View>
              <View style={s.knapStat}>
                <Text style={s.knapStatVal}>{guidance.hackathonMode.effortUsed}h / {guidance.hackathonMode.hoursBudget}h</Text>
                <Text style={s.knapStatLbl}>Effort Used</Text>
              </View>
              <View style={s.knapStat}>
                <Text style={s.knapStatVal}>{guidance.hackathonMode.totalValue}</Text>
                <Text style={s.knapStatLbl}>Business Value</Text>
              </View>
            </View>
          </View>

          {/* Selected MVP Tasks */}
          <View style={s.card}>
            <Text style={[s.cardTitle, { color: colors.success }]}>
              Selected for {guidance.hackathonMode.hoursBudget}h Demo ({guidance.hackathonMode.mvpTasks.length})
            </Text>
            {guidance.hackathonMode.mvpTasks.map((t, i) => (
              <View key={i} style={s.taskRow}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={s.taskTitle}>{t.title}</Text>
                  <Text style={s.taskMeta}>{t.phase} · {t.estimatedHours}h · Priority: {t.priorityScore}/100</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Tab 5: Learning & Research ─────────────────────────────────────── */}
      {activeTab === "learning" && (
        <View style={s.section}>
          {/* Prerequisites */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Learning Prerequisites & Roadmap</Text>
            {guidance.learning.stages.map((st, i) => (
              <View key={i} style={s.learningStage}>
                <View style={s.stageHeader}>
                  <Ionicons name={st.icon} size={15} color={colors.primary} />
                  <Text style={s.stageTitle}>{st.stage}</Text>
                </View>
                {st.items.map((item, ii) => (
                  <View key={ii} style={s.learnItem}>
                    <Text style={s.bullet}>•</Text>
                    <Text style={s.learnTxt}>{item}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>

          {/* Research Topics */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Suggested Research Topics (No Fake Citations)</Text>
            <View style={{ gap: 8, marginTop: 6 }}>
              {guidance.researchTopics.map((r, i) => (
                <View key={i} style={s.resTopicCard}>
                  <Text style={s.resTopicTitle}>{r.topic}</Text>
                  <Text style={s.resTopicWhy}>{r.why}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* ── Tab 6: Skill Gaps & Risks ──────────────────────────────────────── */}
      {activeTab === "team" && (
        <View style={s.section}>
          {/* Skill Gap Card */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Team Skill Gap Analysis</Text>
            <Text style={s.cardBody}>{guidance.skillGaps.summary}</Text>

            {guidance.skillGaps.gaps.length > 0 ? (
              guidance.skillGaps.gaps.map((g, i) => (
                <View key={i} style={s.gapCard}>
                  <View style={s.gapHeader}>
                    <Ionicons name="warning" size={14} color={colors.danger} />
                    <Text style={s.gapDomain}>{g.domain}</Text>
                    <View style={s.gapSev}><Text style={s.gapSevTxt}>{g.severity}</Text></View>
                  </View>
                  <Text style={s.gapTxt}>Current Level: {g.currentLevel} / 10 · Required: {g.requiredLevel} / 10</Text>
                  <Text style={s.gapRec}>{g.recommendation}</Text>
                </View>
              ))
            ) : (
              <View style={s.noGapBox}>
                <Ionicons name="shield-checkmark" size={16} color={colors.success} />
                <Text style={s.noGapTxt}>No critical skill gaps detected. Team skills align well with project requirements.</Text>
              </View>
            )}
          </View>

          {/* Risks Table */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Risk Assessment & Mitigations</Text>
            <View style={{ gap: 8, marginTop: 6 }}>
              {guidance.complexity.risks.map((r, i) => (
                <View key={i} style={s.riskBox}>
                  <View style={s.riskHead}>
                    <Text style={s.riskTitle}>{r.risk}</Text>
                    <View style={[s.pill, { backgroundColor: r.severity === "HIGH" ? colors.dangerSoft : colors.warningSoft }]}>
                      <Text style={[s.pillTxt, { color: r.severity === "HIGH" ? colors.danger : colors.warning }]}>{r.severity}</Text>
                    </View>
                  </View>
                  <Text style={s.riskReason}><Text style={{ fontWeight: "700" }}>Root Cause: </Text>{r.reason}</Text>
                  <Text style={s.riskMitigation}><Text style={{ fontWeight: "700" }}>Mitigation: </Text>{r.mitigation}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: 12, paddingBottom: 80 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  loadingTxt: { marginTop: 12, fontSize: 13, color: colors.textMuted, fontWeight: "600" },

  errorCard: { margin: spacing.md, backgroundColor: colors.dangerSoft, padding: spacing.md, borderRadius: radius.md, alignItems: "center", gap: 8 },
  errorTxt: { fontSize: 13, color: colors.danger, textAlign: "center" },
  retryBtn: { backgroundColor: colors.danger, paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.sm },
  retryBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },

  // Hero
  heroCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 10 },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  domainBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primarySoft, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginBottom: 4 },
  domainTxt: { fontSize: 10, fontWeight: "700", color: colors.primary },
  heroTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  refreshBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },

  meterGrid: { flexDirection: "row", gap: 8 },
  meterCard: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 10, gap: 4 },
  meterLbl: { fontSize: 9, fontWeight: "800", color: colors.textFaint, letterSpacing: 0.5 },
  meterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  meterVal: { fontSize: 16, fontWeight: "800" },
  tierPill: { borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  tierTxt: { fontSize: 10, fontWeight: "700" },
  meterTrack: { height: 5, backgroundColor: colors.border, borderRadius: 2.5, overflow: "hidden", marginTop: 4 },
  meterFill: { height: 5, borderRadius: 2.5 },
  complexityDesc: { fontSize: 10, color: colors.textMuted, marginTop: 2 },

  daaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  daaHead: { fontSize: 10, fontWeight: "700", color: colors.textFaint },
  daaPills: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  daag: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  daagTxt: { fontSize: 9, fontWeight: "700", color: colors.primary },

  // Next Action
  nextActionCard: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, gap: 6 },
  nextActionTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  nextActionHead: { fontSize: 10, fontWeight: "800", color: colors.accentSoft, letterSpacing: 1 },
  nextActionTitle: { fontSize: 15, fontWeight: "800", color: "#fff" },
  nextActionReason: { fontSize: 12, color: "rgba(255,255,255,0.85)", lineHeight: 16 },
  nextActionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.accentDark, borderRadius: radius.sm, paddingVertical: 10, marginTop: 4 },
  nextActionBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
  disabledBtn: { opacity: 0.5 },

  // Tabs
  tabBar: { gap: 6, paddingVertical: 2 },
  tabItem: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabItemOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabTxt: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  tabTxtOn: { color: "#fff" },

  // Sections & Cards
  section: { gap: 10 },
  sectionHead: { fontSize: 14, fontWeight: "800", color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 6 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  cardSubhead: { fontSize: 12, fontWeight: "700", color: colors.text },
  cardBody: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  chipTxt: { fontSize: 11, color: colors.text, fontWeight: "600" },

  moduleRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  moduleTxt: { fontSize: 12, color: colors.text, fontWeight: "600" },

  mvpGrid: { flexDirection: "row", gap: 10, marginTop: 6 },
  mvpCol: { flex: 1, gap: 4 },
  mvpDivider: { width: 1, backgroundColor: colors.border },
  mvpHead: { fontSize: 12, fontWeight: "800", marginBottom: 2 },
  mvpItem: { fontSize: 11, color: colors.textMuted, lineHeight: 15 },

  // Hardware & Tech
  hwRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 8 },
  hwName: { fontSize: 12, fontWeight: "700", color: colors.text },
  hwPurpose: { fontSize: 10, color: colors.textMuted },
  pill: { borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  pillTxt: { fontSize: 9, fontWeight: "800" },

  datasetBox: { backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: 8, gap: 3, marginTop: 8 },
  datasetHead: { fontSize: 11, fontWeight: "800", color: colors.primary },
  datasetTxt: { fontSize: 11, color: colors.primary, lineHeight: 15 },

  stackRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  stackName: { fontSize: 12, fontWeight: "700", color: colors.text },
  stackRole: { fontSize: 10, color: colors.textMuted },
  catPill: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  catPillTxt: { fontSize: 9, fontWeight: "700", color: colors.textFaint },

  // Phases
  phaseCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  phaseHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  phaseNumBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  phaseNumTxt: { fontSize: 11, fontWeight: "800", color: "#fff" },
  phaseName: { fontSize: 14, fontWeight: "800", color: colors.text },
  phaseSub: { fontSize: 10, color: colors.textMuted },

  taskRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 8 },
  taskTitle: { fontSize: 12, fontWeight: "600", color: colors.text },
  taskMeta: { fontSize: 10, color: colors.textFaint, marginTop: 1 },
  mvpTag: { backgroundColor: colors.successSoft, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  mvpTagTxt: { fontSize: 8, fontWeight: "800", color: colors.success },

  // Hackathon
  hrsBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  hrsBtnOn: { backgroundColor: colors.greedy },
  hrsBtnTxt: { fontSize: 11, fontWeight: "700", color: colors.text },
  hrsBtnTxtOn: { color: "#fff" },
  knapStats: { flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 10, marginTop: 8 },
  knapStat: { alignItems: "center", flex: 1 },
  knapStatVal: { fontSize: 16, fontWeight: "800", color: colors.primary },
  knapStatLbl: { fontSize: 9, color: colors.textMuted, marginTop: 2 },

  // Learning
  learningStage: { gap: 4, marginTop: 6 },
  stageHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  stageTitle: { fontSize: 12, fontWeight: "800", color: colors.primary },
  learnItem: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingLeft: 16 },
  bullet: { fontSize: 14, color: colors.textMuted },
  learnTxt: { fontSize: 12, color: colors.text, flex: 1 },
  resTopicCard: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 8, gap: 2 },
  resTopicTitle: { fontSize: 12, fontWeight: "700", color: colors.text },
  resTopicWhy: { fontSize: 11, color: colors.textMuted },

  // Skill Gaps & Risks
  gapCard: { backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: 8, gap: 3, marginTop: 4 },
  gapHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  gapDomain: { flex: 1, fontSize: 12, fontWeight: "700", color: colors.danger },
  gapSev: { backgroundColor: colors.danger, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  gapSevTxt: { fontSize: 8, fontWeight: "800", color: "#fff" },
  gapTxt: { fontSize: 11, color: colors.text },
  gapRec: { fontSize: 10, color: colors.textMuted, fontStyle: "italic" },
  noGapBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.successSoft, borderRadius: radius.sm, padding: 8, marginTop: 4 },
  noGapTxt: { fontSize: 11, color: colors.success, fontWeight: "600", flex: 1 },

  riskBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 8, gap: 3 },
  riskHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  riskTitle: { fontSize: 12, fontWeight: "700", color: colors.text, flex: 1 },
  riskReason: { fontSize: 11, color: colors.textMuted },
  riskMitigation: { fontSize: 11, color: colors.info },
});
