/**
 * client/components/workspace/ProjectAdvisorPanel.tsx
 * ============================================================================
 * Project Intelligence & AI Project Advisor Panel for NEXUSFLOW 2.0.
 *
 * Surfaces:
 * 1. Project Context & Objectives (Problem statement, hardware, software, AI/ML)
 * 2. Analyze Project Action Trigger (Runs OpenAI/Heuristic analysis)
 * 3. AI Technology Recommendations (Filterable, with Accept/Reject actions)
 * 4. Decision Candidates Board (Proposed architectural choices with status)
 * 5. System Architecture Components (Tiers & Dependencies)
 * 6. Research Topics & Directions
 * 7. Project-Aware Copilot Chat (Multi-turn advisory chat with context)
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
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

interface GeneratedTaskPreview {
  title: string;
  category: string;
  estimatedHours: number;
  urgency: number;
  impact: number;
  reason?: string;
}

interface ChatTurn {
  _id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export default function ProjectAdvisorPanel({ teamId }: { teamId: string }) {
  const { token, user } = useAuth();

  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [architecture, setArchitecture] = useState<ArchitectureItem[]>([]);
  const [researchTopics, setResearchTopics] = useState<ResearchItemType[]>([]);

  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<{ added: number; duplicatesSkipped: number } | null>(null);
  const [activeSection, setActiveSection] = useState<"advisor" | "recommendations" | "decisions" | "architecture" | "research" | "decide" | "guidance">("advisor");

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Load project for team
  const loadProject = useCallback(async () => {
    if (!teamId || !token) return;
    try {
      setLoading(true);
      // Fetch projects for this team
      const pRes = await fetch(`${API}/api/projects?teamId=${teamId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      let activePid = null;
      if (pRes.ok) {
        const projects = await pRes.json();
        if (projects && projects.length > 0) {
          activePid = projects[0]._id;
          setProjectId(activePid);
          setProjectData(projects[0]);
        }
      }

      // If no project exists yet, fetch team details to create initial project
      if (!activePid) {
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
            activePid = newProj._id;
            setProjectId(activePid);
            setProjectData(newProj);
          }
        }
      }

      // Load sub-artifacts if project ID is available
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
      }
    } catch (err) {
      console.error("[ProjectAdvisorPanel] loadProject error:", err);
    } finally {
      setLoading(false);
    }
  }, [teamId, token]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Run AI Project Analysis
  const runAnalysis = async () => {
    if (!projectId || !token) return;
    try {
      setAnalyzing(true);
      const res = await fetch(`${API}/api/projects/${projectId}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        await loadProject();
      }
    } catch (err) {
      console.error("[ProjectAdvisorPanel] runAnalysis error:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  // Generate Backlog Tasks from Project Context
  const generateProjectTasks = async (mode = "project") => {
    if (!projectId || !token || generatingTasks) return;
    try {
      setGeneratingTasks(true);
      setGeneratedResult(null);
      const res = await fetch(`${API}/api/projects/${projectId}/tasks/generate`, {
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
      }
    } catch (err) {
      console.error("[ProjectAdvisorPanel] generateProjectTasks error:", err);
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
      }
    } catch (err) {
      console.error("[ProjectAdvisorPanel] updateDecisionStatus error:", err);
    }
  };

  // Send Chat Message to Project Advisor
  const sendChatMessage = async (presetText?: string) => {
    const textToSend = presetText || chatInput;
    if (!textToSend.trim() || !projectId || !token || chatLoading) return;

    const userTurn: ChatTurn = {
      _id: `u_${Date.now()}`,
      role: "user",
      content: textToSend.trim(),
    };

    setChatMessages((prev) => [...prev, userTurn]);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch(`${API}/api/projects/${projectId}/ai/chat`, {
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

      if (res.ok) {
        const data = await res.json();
        if (data.conversationId) setConversationId(data.conversationId);
        if (data.assistantMessage) {
          setChatMessages((prev) => [
            ...prev,
            {
              _id: data.assistantMessage._id || `a_${Date.now()}`,
              role: "assistant",
              content: data.assistantMessage.content,
            },
          ]);
        }
      }
    } catch (err) {
      console.error("[ProjectAdvisorPanel] chat error:", err);
    } finally {
      setChatLoading(false);
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

  return (
    <View style={s.container}>
      {/* ── Sub Navigation Tabs ────────────────────────────────────────── */}
      <View style={s.subNavBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.subNavContent}>
          {[
            { key: "advisor", label: "Advisor & Chat", icon: "sparkles", count: 0 },
            { key: "guidance", label: "Project Guidance", icon: "compass", count: 0 },
            { key: "recommendations", label: "Recommendations", icon: "bulb", count: pendingRecs.length },
            { key: "decisions", label: "Decisions", icon: "git-commit", count: proposedDecisions.length },
            { key: "architecture", label: "Architecture", icon: "layers", count: architecture.length },
            { key: "research", label: "Research", icon: "book", count: researchTopics.length },
            { key: "decide", label: "Decision Engine", icon: "analytics", count: 0 },
          ].map((tab) => {
            const on = activeSection === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveSection(tab.key as any)}
                style={[s.subTab, on && s.subTabActive]}
              >
                <Ionicons name={tab.icon as any} size={15} color={on ? colors.primary : colors.textMuted} />
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}>
        {/* ── Top Project Header Card ──────────────────────────────────── */}
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
                  <ActivityIndicator size="small" color="#fff" />
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

          {/* Quick Requirements Matrix */}
          {(context.hardwareRequirements?.length > 0 || context.softwareRequirements?.length > 0 || context.aiMlRequirements?.length > 0) && (
            <View style={s.reqGrid}>
              {context.hardwareRequirements?.length > 0 && (
                <View style={s.reqCol}>
                  <Text style={s.reqHeader}><Ionicons name="hardware-chip" size={12} /> Hardware</Text>
                  {context.hardwareRequirements.slice(0, 3).map((h: string, idx: number) => (
                    <Text key={idx} style={s.reqItem} numberOfLines={1}>• {h}</Text>
                  ))}
                </View>
              )}
              {context.softwareRequirements?.length > 0 && (
                <View style={s.reqCol}>
                  <Text style={s.reqHeader}><Ionicons name="code-slash" size={12} /> Software</Text>
                  {context.softwareRequirements.slice(0, 3).map((sw: string, idx: number) => (
                    <Text key={idx} style={s.reqItem} numberOfLines={1}>• {sw}</Text>
                  ))}
                </View>
              )}
              {context.aiMlRequirements?.length > 0 && (
                <View style={s.reqCol}>
                  <Text style={s.reqHeader}><Ionicons name="analytics" size={12} /> AI / ML</Text>
                  {context.aiMlRequirements.slice(0, 3).map((ai: string, idx: number) => (
                    <Text key={idx} style={s.reqItem} numberOfLines={1}>• {ai}</Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── SECTION: ADVISOR & COPILOT CHAT ─────────────────────────── */}
        {activeSection === "advisor" && (
          <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            <View style={s.sectionHeader}>
              <Text style={font.h3}>Project Copilot</Text>
              <Text style={s.sectionSub}>Project-aware AI guidance grounded in your team's specific requirements.</Text>
            </View>

            {/* Suggested Prompts */}
            <View style={s.promptRow}>
              {[
                "What hardware do I need?",
                "Suggest next decision",
                "Why MongoDB?",
                "What should I research first?",
              ].map((prompt, idx) => (
                <Pressable key={idx} style={s.promptChip} onPress={() => sendChatMessage(prompt)}>
                  <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.primary} />
                  <Text style={s.promptChipText}>{prompt}</Text>
                </Pressable>
              ))}
            </View>

            {/* Chat History Container */}
            <View style={s.chatContainer}>
              {chatMessages.length === 0 ? (
                <View style={s.emptyChat}>
                  <Ionicons name="bulb-outline" size={32} color={colors.topo} />
                  <Text style={[font.body, { textAlign: "center", color: colors.textMuted }]}>
                    Ask any question about architecture, technology selection, or hardware requirements for this project.
                  </Text>
                </View>
              ) : (
                chatMessages.map((msg, i) => {
                  const isUser = msg.role === "user";
                  return (
                    <View key={i} style={[s.chatBubbleRow, isUser && { justifyContent: "flex-end" }]}>
                      <View style={[s.chatBubble, isUser ? s.userBubble : s.aiBubble]}>
                        <Text style={[s.chatRole, isUser ? { color: "#fff" } : { color: colors.topo }]}>
                          {isUser ? "You" : "Project Advisor"}
                        </Text>
                        <Text style={[s.chatText, isUser && { color: "#fff" }]}>{msg.content}</Text>
                      </View>
                    </View>
                  );
                })
              )}
              {chatLoading && (
                <View style={[s.chatBubbleRow, { alignItems: "center", gap: 8 }]}>
                  <ActivityIndicator size="small" color={colors.topo} />
                  <Text style={font.caption}>Advisor is thinking...</Text>
                </View>
              )}
            </View>

            {/* Chat Input */}
            <View style={s.chatInputBar}>
              <TextInput
                style={s.chatTextInput}
                placeholder="Ask project advisor..."
                placeholderTextColor={colors.textFaint}
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={() => sendChatMessage()}
              />
              <Pressable style={s.chatSendBtn} onPress={() => sendChatMessage()} disabled={chatLoading}>
                <Ionicons name="send" size={16} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}

        {/* ── SECTION: RECOMMENDATIONS ────────────────────────────────── */}
        {activeSection === "recommendations" && (
          <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            <View style={s.sectionHeader}>
              <Text style={font.h3}>AI Technology Recommendations ({recommendations.length})</Text>
              <Text style={s.sectionSub}>Specialist recommendations tailored to your project domain and constraints.</Text>
            </View>

            {recommendations.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={font.body}>No recommendations generated yet. Click "Analyze AI" above.</Text>
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
        )}

        {/* ── SECTION: DECISIONS ──────────────────────────────────────── */}
        {activeSection === "decisions" && (
          <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            <View style={s.sectionHeader}>
              <Text style={font.h3}>Architectural Decisions ({decisions.length})</Text>
              <Text style={s.sectionSub}>Confirmed team choices vs AI-proposed decision candidates.</Text>
            </View>

            {decisions.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={font.body}>No decisions recorded yet. Click "Analyze AI" above to generate candidates.</Text>
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
          </View>
        )}

        {/* ── SECTION: ARCHITECTURE ──────────────────────────────────── */}
        {activeSection === "architecture" && (
          <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            <View style={s.sectionHeader}>
              <Text style={font.h3}>System Architecture ({architecture.length} Components)</Text>
              <Text style={s.sectionSub}>High-level technical tiers and component dependencies.</Text>
            </View>

            {architecture.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={font.body}>No architecture components generated yet. Click "Analyze AI" above.</Text>
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
        )}

        {/* ── SECTION: RESEARCH ──────────────────────────────────────── */}
        {activeSection === "research" && (
          <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            <View style={s.sectionHeader}>
              <Text style={font.h3}>Research Directions ({researchTopics.length})</Text>
              <Text style={s.sectionSub}>Suggested investigation areas for project feasibility.</Text>
            </View>

            {researchTopics.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={font.body}>No research topics generated yet. Click "Analyze AI" above.</Text>
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
        )}
      </ScrollView>

      {/* ── SECTION: DECISION ENGINE (Phase 5) ─────────────────────── */}
      {/* Rendered outside the outer ScrollView to allow DecisionPanel its own scroll */}
      {activeSection === "decide" && <DecisionPanel teamId={teamId} />}

      {/* ── SECTION: PROJECT GUIDANCE (Phase 6) ─────────────────────── */}
      {activeSection === "guidance" && <GuidancePanel teamId={teamId} />}
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
    minHeight: 200,
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
  chatText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
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
