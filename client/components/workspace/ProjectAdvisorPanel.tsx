/**
 * client/components/workspace/ProjectAdvisorPanel.tsx
 * ============================================================================
 * Project Intelligence & AI Project Advisor Panel for NEXUSFLOW 2.0.
 *
 * Surfaces:
 * 1. Project Brief & Context (Problem statement, hardware, software, AI/ML)
 * 2. Analyze Project Action Trigger (Runs OpenAI/Heuristic analysis with error/retry states)
 * 3. Project-Aware Copilot Chat (Multi-turn advisory grounded in project requirements)
 * 4. Project Guidance (Directly embedded Phase 6 guidance with Readiness & Roadmap)
 * 5. Architectural Decisions & AI Technology Recommendations (Filterable, with Accept/Reject)
 * 6. System Architecture Components (Tiers & Dependencies)
 * 7. Research Topics & Directions (Feasibility investigation)
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/feedback";
import { colors, spacing, radius, font } from "@/theme";
import DecisionPanel from "./DecisionPanel";
import GuidancePanel from "./GuidancePanel";

const API = process.env.EXPO_PUBLIC_API_URL ?? "https://nexusflow-nxeg.onrender.com";

interface RecommendationItem {
  _id: string;
  recommendationType: string;
  recommendedItem: string;
  category?: string;
  reason?: string;
  confidence?: number;
  status: "pending" | "accepted" | "rejected" | "applied";
  alternatives?: string[];
}

interface DecisionItem {
  _id: string;
  title: string;
  decision: string;
  reasoning?: string;
  status: "proposed" | "accepted" | "rejected" | "superseded";
  category?: string;
  alternativesConsidered?: string[];
}

interface ArchitectureItem {
  _id: string;
  componentType: string;
  name: string;
  description?: string;
  technology?: string;
  supportingTools?: string[];
  status: string;
}

interface ResearchItemType {
  _id: string;
  title: string;
  abstract?: string;
  topics?: string[];
  relevance?: number;
  notes?: string;
  status: string;
}

interface ChatTurn {
  _id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  provider?: "openai" | "gemini" | "deterministic" | string;
  feedback?: {
    rating?: "helpful" | "unhelpful" | null;
    comment?: string;
  };
}

type SubTabKey = "brief" | "guidance" | "copilot" | "decisions" | "architecture" | "research" | "decide";

export default function ProjectAdvisorPanel({ teamId }: { teamId: string }) {
  const { token, user } = useAuth();
  const toast = useToast();

  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [architecture, setArchitecture] = useState<ArchitectureItem[]>([]);
  const [researchTopics, setResearchTopics] = useState<ResearchItemType[]>([]);

  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisSuccess, setAnalysisSuccess] = useState<string | null>(null);

  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<{ added: number; duplicatesSkipped: number } | null>(null);
  const [activeSection, setActiveSection] = useState<SubTabKey>("brief");

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const chatScrollRef = React.useRef<ScrollView>(null);

  // Load private Copilot conversation
  const loadConversation = useCallback(async (pid: string) => {
    if (!pid || !token) return;
    try {
      const res = await fetch(`${API}/api/projects/${pid}/ai/conversation`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.conversation?._id) {
          setConversationId(data.conversation._id);
        }
        if (Array.isArray(data.messages)) {
          setChatMessages(data.messages);
          setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 120);
        }
      }
    } catch (err) {
      console.error("[ProjectAdvisorPanel] loadConversation error:", err);
    }
  }, [token]);

  // Helper to ensure project document exists
  const ensureProject = useCallback(async (): Promise<string | null> => {
    if (!teamId || !token) return null;
    try {
      const pRes = await fetch(`${API}/api/projects?teamId=${teamId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pRes.ok) {
        const projects = await pRes.json();
        if (Array.isArray(projects) && projects.length > 0) {
          setProjectId(projects[0]._id);
          setProjectData(projects[0]);
          return projects[0]._id;
        }
      }

      // Fetch team to initialize project
      const tRes = await fetch(`${API}/api/teams/${teamId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (tRes.ok) {
        const team = await tRes.json();
        const createRes = await fetch(`${API}/api/projects`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            teamId,
            title: team.projectTitle || team.name || "Workspace Project",
            description: team.projectDescription || "",
            originalPrompt: team.projectDescription || "",
          }),
        });
        if (createRes.ok) {
          const newProj = await createRes.json();
          setProjectId(newProj._id);
          setProjectData(newProj);
          return newProj._id;
        }
      }
    } catch (e) {
      console.error("[ProjectAdvisorPanel] ensureProject error:", e);
    }
    return null;
  }, [teamId, token]);

  // Load project & sub-artifacts for team
  const loadProject = useCallback(async () => {
    if (!teamId || !token) return;
    try {
      setLoading(true);
      const activePid = await ensureProject();

      if (activePid) {
        const [rRes, dRes, aRes, resRes] = await Promise.all([
          fetch(`${API}/api/projects/${activePid}/recommendations`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/api/projects/${activePid}/decisions`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/api/projects/${activePid}/architecture`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/api/projects/${activePid}/research`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (rRes.ok) setRecommendations(await rRes.json());
        if (dRes.ok) setDecisions(await dRes.json());
        if (aRes.ok) setArchitecture(await aRes.json());
        if (resRes.ok) setResearchTopics(await resRes.json());

        // Load private conversation
        await loadConversation(activePid);
      }
    } catch (err) {
      console.error("[ProjectAdvisorPanel] loadProject error:", err);
    } finally {
      setLoading(false);
    }
  }, [teamId, token, ensureProject, loadConversation]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Run AI Project Analysis (ISSUE 2 FIX)
  const runAnalysis = async () => {
    let targetPid = projectId;
    if (!targetPid) {
      targetPid = await ensureProject();
    }
    if (!targetPid || !token) {
      setAnalysisError("Project could not be initialized. Please verify team connection.");
      return;
    }

    try {
      setAnalyzing(true);
      setAnalysisError(null);
      setAnalysisSuccess(null);
      console.log(`[ProjectAdvisorPanel] Running AI analysis for project: ${targetPid}`);

      const res = await fetch(`${API}/api/projects/${targetPid}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "AI analysis failed. Please try again.");
      }

      // Reload project and sub-entities
      await loadProject();

      const counts = data.counts || {};
      const msg = `AI analysis complete! Extracted ${counts.newRecommendations || 0} recommendations, ${counts.newDecisions || 0} decisions, and ${counts.newArchitectureComponents || 0} architecture components.`;
      setAnalysisSuccess(msg);
      toast("Project AI Analysis complete!", "success");
    } catch (err: any) {
      console.error("[ProjectAdvisorPanel] runAnalysis error:", err);
      setAnalysisError(err.message || "AI analysis failed. Try again.");
      toast(err.message || "AI analysis failed", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  // Generate Backlog Tasks from Project Context
  const generateProjectTasks = async (mode = "project") => {
    let targetPid = projectId;
    if (!targetPid) {
      targetPid = await ensureProject();
    }
    if (!targetPid || !token || generatingTasks) return;

    try {
      setGeneratingTasks(true);
      setGeneratedResult(null);
      const res = await fetch(`${API}/api/projects/${targetPid}/tasks/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mode }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedResult({
          added: data.added || 0,
          duplicatesSkipped: data.duplicatesSkipped || 0,
        });
        toast(`Generated ${data.added || 0} new tasks in backlog!`, "success");
      }
    } catch (err) {
      console.error("[ProjectAdvisorPanel] generateProjectTasks error:", err);
      toast("Task generation failed", "error");
    } finally {
      setGeneratingTasks(false);
    }
  };

  // Update Recommendation Status
  const updateRecStatus = async (recId: string, status: "accepted" | "rejected") => {
    if (!projectId || !token) return;
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/recommendations/${recId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = await res.json();
        setRecommendations((prev) => prev.map((r) => (r._id === recId ? updated : r)));
        toast(`Recommendation marked as ${status}`, "success");
      }
    } catch (err) {
      console.error("[ProjectAdvisorPanel] updateRecStatus error:", err);
    }
  };

  // Update Decision Status
  const updateDecisionStatus = async (decisionId: string, status: "accepted" | "rejected") => {
    if (!projectId || !token) return;
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/decisions/${decisionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDecisions((prev) => prev.map((d) => (d._id === decisionId ? updated : d)));
        toast(`Decision marked as ${status}`, "success");
      }
    } catch (err) {
      console.error("[ProjectAdvisorPanel] updateDecisionStatus error:", err);
    }
  };

  // Send Chat Message to Project Copilot (ISSUE 1 FIX)
  const sendChatMessage = async (presetText?: string) => {
    const textToSend = presetText || chatInput;
    if (!textToSend.trim() || !token || chatLoading) return;

    let targetPid = projectId;
    if (!targetPid) {
      targetPid = await ensureProject();
    }
    if (!targetPid) {
      setChatError("Project context not ready. Please try again.");
      return;
    }

    const userTurn: ChatTurn = {
      _id: `u_${Date.now()}`,
      role: "user",
      content: textToSend.trim(),
    };

    setChatMessages((prev) => [...prev, userTurn]);
    setChatInput("");
    setChatLoading(true);
    setChatError(null);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 60);

    try {
      const res = await fetch(`${API}/api/projects/${targetPid}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: textToSend.trim(),
          conversationId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not generate answer. Please try again.");
      }

      if (data.conversationId) setConversationId(data.conversationId);
      if (data.assistantMessage) {
        setChatMessages((prev) => [
          ...prev,
          {
            _id: data.assistantMessage._id || `a_${Date.now()}`,
            role: "assistant",
            content: data.assistantMessage.content,
            provider: data.provider || data.assistantMessage.provider,
            feedback: data.assistantMessage.feedback || null,
          },
        ]);
        setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (err: any) {
      console.error("[ProjectAdvisorPanel] chat error:", err);
      setChatError(err.message || "Failed to get Copilot response. Please retry.");
    } finally {
      setChatLoading(false);
    }
  };

  // Record Feedback (Helpful / Unhelpful)
  const sendFeedback = async (messageId: string, rating: "helpful" | "unhelpful") => {
    if (!projectId || !token) return;
    try {
      setChatMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, feedback: { rating } } : m))
      );
      const res = await fetch(`${API}/api/projects/${projectId}/ai/messages/${messageId}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rating }),
      });
      if (res.ok) {
        toast(rating === "helpful" ? "Marked as helpful 👍" : "Feedback noted. Copilot will adjust its advice 👎", "info");
      }
    } catch (err) {
      console.error("[ProjectAdvisorPanel] sendFeedback error:", err);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[font.caption, { color: colors.textMuted, marginTop: 8 }]}>Loading Project Intelligence...</Text>
      </View>
    );
  }

  const context = projectData?.context || {};
  const acceptedRecs = recommendations.filter((r) => r.status === "accepted");
  const pendingRecs = recommendations.filter((r) => r.status === "pending");
  const acceptedDecisions = decisions.filter((d) => d.status === "accepted");
  const proposedDecisions = decisions.filter((d) => d.status === "proposed");

  // Clear sub navigation tabs
  const SUB_TABS: { key: SubTabKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[] = [
    { key: "brief", label: "Project Brief", icon: "document-text", count: 0 },
    { key: "guidance", label: "Project Guidance", icon: "compass", count: 0 },
    { key: "copilot", label: "Project Copilot", icon: "chatbubbles", count: chatMessages.length },
    { key: "decisions", label: "Decisions & AI Recs", icon: "git-commit", count: proposedDecisions.length + pendingRecs.length },
    { key: "architecture", label: "Architecture", icon: "layers", count: architecture.length },
    { key: "research", label: "Research", icon: "book", count: researchTopics.length },
    { key: "decide", label: "Decision Engine", icon: "analytics", count: 0 },
  ];

  return (
    <View style={s.container}>
      {/* ── Sub Navigation Tabs (ISSUE 3 FIX: Obvious Hierarchy) ────── */}
      <View style={s.subNavBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.subNavContent}>
          {SUB_TABS.map((tab) => {
            const on = activeSection === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveSection(tab.key)}
                style={[s.subTab, on && s.subTabActive]}
              >
                <Ionicons name={tab.icon} size={15} color={on ? colors.primary : colors.textMuted} />
                <Text style={[s.subTabLabel, on && s.subTabLabelActive]}>{tab.label}</Text>
                {tab.count > 0 && (
                  <View style={[s.badge, on && { backgroundColor: colors.primary }]}>
                    <Text style={[s.badgeText, on && { color: "#fff" }]}>{tab.count}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── TAB 1: PROJECT BRIEF & CONTEXT ───────────────────────────── */}
      {activeSection === "brief" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}>
          {/* Project Context Card (Positioned directly in Project Brief tab) */}
          <View style={s.projectCard}>
            <View style={s.projectHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{projectData?.title || "Project Intelligence"}</Text>
                <View style={s.metaRow}>
                  <View style={s.domainTag}>
                    <Text style={s.domainTagText}>{projectData?.domain || "Software"}</Text>
                  </View>
                  <Text style={font.caption}>Phase: <Text style={{ fontWeight: "700", color: colors.topo }}>{projectData?.currentPhase || "idea"}</Text></Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Pressable
                  style={[s.analyzeBtn, analyzing && { opacity: 0.7 }]}
                  onPress={runAnalysis}
                  disabled={analyzing}
                >
                  {analyzing ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={s.analyzeBtnText}>Analyzing...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={14} color="#fff" />
                      <Text style={s.analyzeBtnText}>Analyze AI</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={[s.genTaskBtn, generatingTasks && { opacity: 0.7 }]}
                  onPress={() => generateProjectTasks("project")}
                  disabled={generatingTasks}
                >
                  {generatingTasks ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="list" size={14} color="#fff" />
                      <Text style={s.analyzeBtnText}>Decompose Tasks</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>

            {/* Error handling banner for Analyze AI */}
            {analysisError && (
              <View style={s.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={s.errorBannerText}>{analysisError}</Text>
                <Pressable style={s.retryMiniBtn} onPress={runAnalysis}>
                  <Text style={s.retryMiniBtnText}>Retry</Text>
                </Pressable>
              </View>
            )}

            {/* Success banner for Analyze AI */}
            {analysisSuccess && (
              <View style={s.successBanner}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={s.successBannerText}>{analysisSuccess}</Text>
              </View>
            )}

            {/* Generated Task result badge */}
            {generatedResult && (
              <View style={s.resultPill}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={s.resultPillText}>
                  Added {generatedResult.added} new tasks ({generatedResult.duplicatesSkipped} duplicate{generatedResult.duplicatesSkipped === 1 ? "" : "s"} skipped)
                </Text>
              </View>
            )}

            {context.problemStatement ? (
              <View style={s.contextBox}>
                <Text style={[font.caption, { fontWeight: "700", color: colors.textMuted }]}>PROBLEM STATEMENT</Text>
                <Text style={s.problemText}>{context.problemStatement}</Text>
              </View>
            ) : (
              <Text style={[font.body, { color: colors.textMuted, marginTop: 8 }]}>
                Click <Text style={{ fontWeight: "700" }}>Analyze AI</Text> to extract structured project intelligence, hardware/software requirements, and architecture recommendations.
              </Text>
            )}

            {/* Requirements Matrix */}
            {(context.hardwareRequirements?.length > 0 || context.softwareRequirements?.length > 0 || context.aiMlRequirements?.length > 0) && (
              <View style={s.reqGrid}>
                {context.hardwareRequirements?.length > 0 && (
                  <View style={s.reqCol}>
                    <Text style={s.reqHeader}><Ionicons name="hardware-chip" size={12} /> Hardware</Text>
                    {context.hardwareRequirements.slice(0, 4).map((h: string, idx: number) => (
                      <Text key={idx} style={s.reqItem} numberOfLines={1}>• {h}</Text>
                    ))}
                  </View>
                )}
                {context.softwareRequirements?.length > 0 && (
                  <View style={s.reqCol}>
                    <Text style={s.reqHeader}><Ionicons name="code-slash" size={12} /> Software</Text>
                    {context.softwareRequirements.slice(0, 4).map((sw: string, idx: number) => (
                      <Text key={idx} style={s.reqItem} numberOfLines={1}>• {sw}</Text>
                    ))}
                  </View>
                )}
                {context.aiMlRequirements?.length > 0 && (
                  <View style={s.reqCol}>
                    <Text style={s.reqHeader}><Ionicons name="analytics" size={12} /> AI / ML</Text>
                    {context.aiMlRequirements.slice(0, 4).map((ai: string, idx: number) => (
                      <Text key={idx} style={s.reqItem} numberOfLines={1}>• {ai}</Text>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Quick Jump Callouts */}
          <View style={s.quickJumpGrid}>
            <Pressable style={s.quickJumpCard} onPress={() => setActiveSection("guidance")}>
              <Ionicons name="compass" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={s.quickJumpTitle}>Project Guidance</Text>
                <Text style={s.quickJumpSub}>Readiness score, DAA roadmap, and hackathon time-slicing.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
            <Pressable style={s.quickJumpCard} onPress={() => setActiveSection("copilot")}>
              <Ionicons name="chatbubbles" size={20} color={colors.accentDark} />
              <View style={{ flex: 1 }}>
                <Text style={s.quickJumpTitle}>Project Copilot</Text>
                <Text style={s.quickJumpSub}>Ask question about hardware, dataset, ML, or next decision.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        </ScrollView>
      )}

      {/* ── TAB 2: PROJECT GUIDANCE (Phase 6 Engine) ─────────────────── */}
      {activeSection === "guidance" && <GuidancePanel teamId={teamId} />}

      {/* ── TAB 3: PROJECT COPILOT (ISSUE 1 FIX) ───────────────────────── */}
      {activeSection === "copilot" && (
        <ScrollView
          ref={chatScrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}
        >
          <View style={{ gap: spacing.md }}>
            <View style={s.sectionHeader}>
              <Text style={font.h3}>Project Copilot</Text>
              <Text style={s.sectionSub}>Project-aware AI assistant grounded in your team's specific requirements.</Text>
            </View>

            {/* Intent-Aware Prompt Chips */}
            <View style={s.promptRow}>
              {[
                "What hardware do I need?",
                "Do I need AI or ML?",
                "What dataset should I collect?",
                "What should I build first?",
                "Suggest next decision",
                "What can I finish in 24 hours?",
                "What research should I do?",
                "How should I deploy this?",
              ].map((prompt, idx) => (
                <Pressable key={idx} style={s.promptChip} onPress={() => sendChatMessage(prompt)}>
                  <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.primary} />
                  <Text style={s.promptChipText}>{prompt}</Text>
                </Pressable>
              ))}
            </View>

            {/* Chat Container */}
            <View style={s.chatContainer}>
              {chatMessages.length === 0 ? (
                <View style={s.emptyChat}>
                  <Ionicons name="bulb-outline" size={32} color={colors.topo} />
                  <Text style={[font.body, { textAlign: "center", color: colors.textMuted }]}>
                    Ask any question about architecture, hardware requirements, dataset collection, or project decisions.
                  </Text>
                </View>
              ) : (
                chatMessages.map((msg, i) => {
                  const isUser = msg.role === "user";
                  return (
                    <View key={msg._id || i} style={[s.chatBubbleRow, isUser && { justifyContent: "flex-end" }]}>
                      <View style={[s.chatBubble, isUser ? s.userBubble : s.aiBubble]}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                          <Text style={[s.chatRole, isUser ? { color: "#fff" } : { color: colors.topo }]}>
                            {isUser ? "You" : "Project Advisor"}
                          </Text>
                          {!isUser && msg.provider && (
                            <View style={s.providerBadge}>
                              <Text style={s.providerBadgeText}>
                                {msg.provider === "openai" ? "GPT-4o" : msg.provider === "gemini" ? "Gemini" : "Safety Engine"}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[s.chatText, isUser && { color: "#fff" }]}>{msg.content}</Text>

                        {/* Feedback controls on AI answers */}
                        {!isUser && (
                          <View style={s.feedbackRow}>
                            <Pressable
                              style={[
                                s.feedbackBtn,
                                msg.feedback?.rating === "helpful" && s.feedbackBtnActive,
                              ]}
                              onPress={() => sendFeedback(msg._id, "helpful")}
                            >
                              <Ionicons
                                name={msg.feedback?.rating === "helpful" ? "thumbs-up" : "thumbs-up-outline"}
                                size={12}
                                color={msg.feedback?.rating === "helpful" ? colors.success : colors.textMuted}
                              />
                              <Text
                                style={[
                                  s.feedbackBtnText,
                                  msg.feedback?.rating === "helpful" && { color: colors.success, fontWeight: "700" },
                                ]}
                              >
                                Helpful
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[
                                s.feedbackBtn,
                                msg.feedback?.rating === "unhelpful" && s.feedbackBtnActive,
                              ]}
                              onPress={() => sendFeedback(msg._id, "unhelpful")}
                            >
                              <Ionicons
                                name={msg.feedback?.rating === "unhelpful" ? "thumbs-down" : "thumbs-down-outline"}
                                size={12}
                                color={msg.feedback?.rating === "unhelpful" ? colors.danger : colors.textMuted}
                              />
                              <Text
                                style={[
                                  s.feedbackBtnText,
                                  msg.feedback?.rating === "unhelpful" && { color: colors.danger, fontWeight: "700" },
                                ]}
                              >
                                Not helpful
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
              {chatLoading && (
                <View style={[s.chatBubbleRow, { alignItems: "center", gap: 8, paddingVertical: 4 }]}>
                  <ActivityIndicator size="small" color={colors.topo} />
                  <Text style={[font.caption, { color: colors.textMuted }]}>Advisor is thinking...</Text>
                </View>
              )}
              {chatError && (
                <View style={s.chatErrorBox}>
                  <Ionicons name="alert-circle" size={14} color={colors.danger} />
                  <Text style={s.chatErrorText}>{chatError}</Text>
                  <Pressable style={s.retryMiniBtn} onPress={() => sendChatMessage()}>
                    <Text style={s.retryMiniBtnText}>Retry</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* Chat Input */}
            <View style={s.chatInputBar}>
              <TextInput
                style={s.chatTextInput}
                placeholder="Ask about hardware, dataset, architecture, or roadmap..."
                placeholderTextColor={colors.textFaint}
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={() => sendChatMessage()}
              />
              <Pressable
                style={[s.chatSendBtn, chatLoading && { opacity: 0.6 }]}
                onPress={() => sendChatMessage()}
                disabled={chatLoading}
              >
                <Ionicons name="send" size={16} color="#fff" />
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── TAB 4: DECISIONS & RECOMMENDATIONS ───────────────────────── */}
      {activeSection === "decisions" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}>
          <View style={{ gap: spacing.md }}>
            <View style={s.sectionHeader}>
              <Text style={font.h3}>Architectural Decisions ({decisions.length})</Text>
              <Text style={s.sectionSub}>Confirmed choices vs AI-proposed decision candidates.</Text>
            </View>

            {decisions.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={font.body}>No decisions recorded yet. Click "Analyze AI" in Project Brief to generate candidates.</Text>
              </View>
            ) : (
              decisions.map((dec) => (
                <View key={dec._id} style={s.itemCard}>
                  <View style={s.itemCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemTitle}>{dec.title}</Text>
                      <Text style={s.itemCategory}>{dec.category?.toUpperCase() || "ARCHITECTURE"}</Text>
                    </View>
                    <View style={[s.statusBadge, dec.status === "accepted" ? s.statusAccepted : s.statusPending]}>
                      <Text style={s.statusBadgeText}>{dec.status.toUpperCase()}</Text>
                    </View>
                  </View>

                  <Text style={[s.itemReason, { fontWeight: "600", color: colors.text }]}>Decision: {dec.decision}</Text>
                  {dec.reasoning ? <Text style={s.itemReason}>{dec.reasoning}</Text> : null}

                  {dec.alternativesConsidered && dec.alternativesConsidered.length > 0 && (
                    <Text style={s.altText}>Options Evaluated: {dec.alternativesConsidered.join(", ")}</Text>
                  )}

                  {dec.status === "proposed" && (
                    <View style={s.cardActions}>
                      <Pressable style={s.acceptBtn} onPress={() => updateDecisionStatus(dec._id, "accepted")}>
                        <Ionicons name="checkmark-circle" size={14} color="#fff" />
                        <Text style={s.acceptBtnText}>Confirm Decision</Text>
                      </Pressable>
                      <Pressable style={s.rejectBtn} onPress={() => updateDecisionStatus(dec._id, "rejected")}>
                        <Ionicons name="close-circle" size={14} color={colors.danger} />
                        <Text style={s.rejectBtnText}>Decline</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            )}

            {/* AI Recommendations Section */}
            <View style={[s.sectionHeader, { marginTop: spacing.md }]}>
              <Text style={font.h3}>AI Technology Recommendations ({recommendations.length})</Text>
              <Text style={s.sectionSub}>Recommendations tailored to your domain and constraints.</Text>
            </View>

            {recommendations.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={font.body}>No recommendations generated yet. Click "Analyze AI" in Project Brief.</Text>
              </View>
            ) : (
              recommendations.map((rec) => (
                <View key={rec._id} style={s.itemCard}>
                  <View style={s.itemCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemTitle}>{rec.recommendedItem}</Text>
                      <Text style={s.itemCategory}>{rec.category || rec.recommendationType.toUpperCase()}</Text>
                    </View>
                    <View style={[s.statusBadge, rec.status === "accepted" ? s.statusAccepted : s.statusPending]}>
                      <Text style={s.statusBadgeText}>{rec.status.toUpperCase()}</Text>
                    </View>
                  </View>

                  <Text style={s.itemReason}>{rec.reason}</Text>

                  {rec.alternatives && rec.alternatives.length > 0 && (
                    <Text style={s.altText}>Alternatives: {rec.alternatives.join(", ")}</Text>
                  )}

                  {rec.status === "pending" && (
                    <View style={s.cardActions}>
                      <Pressable style={s.acceptBtn} onPress={() => updateRecStatus(rec._id, "accepted")}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                        <Text style={s.acceptBtnText}>Accept</Text>
                      </Pressable>
                      <Pressable style={s.rejectBtn} onPress={() => updateRecStatus(rec._id, "rejected")}>
                        <Ionicons name="close" size={14} color={colors.danger} />
                        <Text style={s.rejectBtnText}>Reject</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {/* ── TAB 5: ARCHITECTURE ─────────────────────────────────────── */}
      {activeSection === "architecture" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}>
          <View style={{ gap: spacing.md }}>
            <View style={s.sectionHeader}>
              <Text style={font.h3}>System Architecture ({architecture.length} Components)</Text>
              <Text style={s.sectionSub}>High-level technical tiers, component boundaries, and tools.</Text>
            </View>

            {architecture.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={font.body}>No architecture components generated yet. Click "Analyze AI" in Project Brief.</Text>
              </View>
            ) : (
              architecture.map((comp) => (
                <View key={comp._id} style={s.itemCard}>
                  <View style={s.itemCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemTitle}>{comp.name}</Text>
                      <Text style={s.itemCategory}>{comp.componentType.toUpperCase()}</Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: colors.infoSoft }]}>
                      <Text style={[s.statusBadgeText, { color: colors.info }]}>{comp.technology || "Layer"}</Text>
                    </View>
                  </View>
                  {comp.description ? <Text style={s.itemReason}>{comp.description}</Text> : null}
                  {comp.supportingTools && comp.supportingTools.length > 0 && (
                    <Text style={s.altText}>Tools: {comp.supportingTools.join(", ")}</Text>
                  )}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {/* ── TAB 6: RESEARCH ─────────────────────────────────────────── */}
      {activeSection === "research" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}>
          <View style={{ gap: spacing.md }}>
            <View style={s.sectionHeader}>
              <Text style={font.h3}>Research Directions ({researchTopics.length})</Text>
              <Text style={s.sectionSub}>Suggested technical investigation areas for project feasibility.</Text>
            </View>

            {researchTopics.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={font.body}>No research topics generated yet. Click "Analyze AI" in Project Brief.</Text>
              </View>
            ) : (
              researchTopics.map((res) => (
                <View key={res._id} style={s.itemCard}>
                  <Text style={s.itemTitle}>{res.title}</Text>
                  {res.abstract ? <Text style={s.itemReason}>{res.abstract}</Text> : null}
                  {res.notes ? <Text style={[s.altText, { fontStyle: "italic" }]}>Note: {res.notes}</Text> : null}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {/* ── TAB 7: DECISION ENGINE (Phase 5) ─────────────────────────── */}
      {activeSection === "decide" && <DecisionPanel teamId={teamId} />}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  subNavBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subNavContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 6,
  },
  subTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  subTabActive: {
    backgroundColor: colors.primarySoft,
  },
  subTabLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  subTabLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  badge: {
    backgroundColor: colors.borderStrong,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.text,
  },
  projectCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  projectHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  domainTag: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  domainTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accentDark,
  },
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
  },
  analyzeBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  genTaskBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.greedy,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.dangerSoft,
    padding: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: colors.danger,
    fontWeight: "600",
  },
  retryMiniBtn: {
    backgroundColor: colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  retryMiniBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.successSoft,
    padding: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  successBannerText: {
    flex: 1,
    fontSize: 12,
    color: colors.success,
    fontWeight: "600",
  },
  resultPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.successSoft,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  resultPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.success,
  },
  contextBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  problemText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    marginTop: 2,
  },
  reqGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: spacing.sm,
  },
  reqCol: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: 8,
  },
  reqHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 4,
  },
  reqItem: {
    fontSize: 11,
    color: colors.text,
    lineHeight: 16,
  },
  quickJumpGrid: {
    gap: 8,
  },
  quickJumpCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickJumpTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  quickJumpSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  sectionHeader: {
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  promptRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  promptChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  promptChipText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: "500",
  },
  chatContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 220,
    gap: spacing.sm,
  },
  emptyChat: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    gap: 8,
  },
  chatBubbleRow: {
    flexDirection: "row",
  },
  chatBubble: {
    maxWidth: "85%",
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 2,
  },
  aiBubble: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 2,
  },
  chatRole: {
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 2,
  },
  providerBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  providerBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.primary,
  },
  feedbackRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  feedbackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  feedbackBtnActive: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  feedbackBtnText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  chatText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  chatErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.dangerSoft,
    padding: 8,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  chatErrorText: {
    fontSize: 12,
    color: colors.danger,
  },
  chatInputBar: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  chatTextInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.text,
  },
  chatSendBtn: {
    backgroundColor: colors.primary,
    width: 40,
    height: 40,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
  },
  itemCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  itemCategory: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: 1,
  },
  itemReason: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  altText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusAccepted: {
    backgroundColor: colors.successSoft,
  },
  statusPending: {
    backgroundColor: colors.warningSoft,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.text,
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  acceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.success,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  acceptBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  rejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.dangerSoft,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  rejectBtnText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  emptyCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
});
