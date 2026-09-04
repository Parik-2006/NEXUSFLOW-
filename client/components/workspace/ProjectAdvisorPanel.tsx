/**
 * client/components/workspace/ProjectAdvisorPanel.tsx
 * ============================================================================
 * Project Intelligence & AI Project Advisor Panel for NEXUSFLOW 2.0.
 *
 * Surfaces:
 * 1. Project Brief & Context (Problem statement, hardware, software, AI/ML)
 * 2. Project Guidance (Directly embedded Phase 6 guidance with Readiness & Roadmap)
 * 3. Project-Aware Copilot Chat (Multi-turn conversational advisor with $0 safety & memory)
 * 4. Architectural Decisions & AI Technology Recommendations (Filterable, with Accept/Reject)
 * 5. System Architecture Components (Tiers & Dependencies)
 * 6. Real Academic Research Papers (OpenAlex + Crossref discovery: Open Access vs Paywalled)
 * 7. Project APIs & Developer Tools (Dedicated recommendation support, ZERO task side effects)
 * 8. Decision Engine (Phase 5 trade-off analysis)
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
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast, useConfirm } from "@/components/feedback";
import { colors, spacing, radius, font } from "@/theme";
import { API_BASE_URL } from "@/utils/api";
import DecisionPanel from "./DecisionPanel";
import GuidancePanel from "./GuidancePanel";
import SafeMarkdownMessage from "@/components/chat/SafeMarkdownMessage";

const API = API_BASE_URL;

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

interface AcademicPaperType {
  _id: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
  paperUrl?: string;
  pdfUrl?: string;
  accessStatus: "open_access" | "paywalled" | "unknown";
  abstract?: string;
  simpleExplanation?: string;
  whyRelevant?: string;
  keyIdea?: string;
  whatToLearn?: string;
  relevance?: number;
  status: string;
}

interface ToolItemType {
  name: string;
  category: string;
  status: "FREE" | "FREE TIER" | "LIMITED" | "PAID";
  badgeLabel: string;
  whatItDoes: string;
  whyRelevant: string;
  howToUse: string;
  advantages: string[];
  limitations: string;
  alternatives: string;
  docUrl: string;
}

interface ChatTurn {
  _id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  provider?: "gemini" | "openrouter" | "deterministic" | string;
  feedback?: {
    rating?: "helpful" | "unhelpful" | null;
    comment?: string;
  };
}

type SubTabKey = "brief" | "guidance" | "copilot" | "decisions" | "architecture" | "research" | "tools" | "decide" | "resources";

export default function ProjectAdvisorPanel({ teamId }: { teamId: string }) {
  const { token, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [architecture, setArchitecture] = useState<ArchitectureItem[]>([]);
  const [academicPapers, setAcademicPapers] = useState<AcademicPaperType[]>([]);
  const [projectTools, setProjectTools] = useState<ToolItemType[]>([]);

  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisSuccess, setAnalysisSuccess] = useState<string | null>(null);

  const [discoveringResearch, setDiscoveringResearch] = useState(false);
  const [toolsLoading, setToolsLoading] = useState(false);

  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<{ added: number; duplicatesSkipped: number } | null>(null);
  const [activeSection, setActiveSection] = useState<SubTabKey>("brief");

  // AI & Dataset Resources (Fix 1)
  const [discoveredResources, setDiscoveredResources] = useState<{
    datasets: any[];
    models: any[];
    provider?: string;
    aiEnhanced?: boolean;
  } | null>(null);
  const [discoveringResources, setDiscoveringResources] = useState(false);
  const [resourcesCount, setResourcesCount] = useState(0);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
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

  // Load real academic research papers
  const loadResearchPapers = useCallback(async (pid: string) => {
    if (!pid || !token) return;
    try {
      const res = await fetch(`${API}/api/projects/${pid}/research`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setAcademicPapers(data);
        }
      }
    } catch (err) {
      console.error("[ProjectAdvisorPanel] loadResearchPapers error:", err);
    }
  }, [token]);

  // Load project developer tools & APIs
  const loadProjectTools = useCallback(async (pid: string) => {
    if (!pid || !token) return;
    try {
      setToolsLoading(true);
      const res = await fetch(`${API}/api/projects/${pid}/tools`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tools)) {
          setProjectTools(data.tools);
        }
      }
    } catch (err) {
      console.error("[ProjectAdvisorPanel] loadProjectTools error:", err);
    } finally {
      setToolsLoading(false);
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
        const [rRes, dRes, aRes] = await Promise.all([
          fetch(`${API}/api/projects/${activePid}/recommendations`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/api/projects/${activePid}/decisions`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/api/projects/${activePid}/architecture`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (rRes.ok) setRecommendations(await rRes.json());
        if (dRes.ok) setDecisions(await dRes.json());
        if (aRes.ok) setArchitecture(await aRes.json());

        // Load private conversation, real research, and tools
        await Promise.all([
          loadConversation(activePid),
          loadResearchPapers(activePid),
          loadProjectTools(activePid),
        ]);
      }
    } catch (err) {
      console.error("[ProjectAdvisorPanel] loadProject error:", err);
    } finally {
      setLoading(false);
    }
  }, [teamId, token, ensureProject, loadConversation, loadResearchPapers, loadProjectTools]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Run AI Project Analysis
  const runAnalysis = async () => {
    let targetPid = projectId;
    if (!targetPid) targetPid = await ensureProject();
    if (!targetPid || !token) {
      setAnalysisError("Project could not be initialized. Please verify team connection.");
      return;
    }

    try {
      setAnalyzing(true);
      setAnalysisError(null);
      setAnalysisSuccess(null);

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

      await loadProject();
      const counts = data.counts || {};
      setAnalysisSuccess(
        `AI analysis complete! Extracted ${counts.newRecommendations || 0} recommendations, ${counts.newDecisions || 0} decisions, and ${counts.newArchitectureComponents || 0} architecture components.`
      );
      toast("Project AI Analysis complete!", "success");
    } catch (err: any) {
      console.error("[ProjectAdvisorPanel] runAnalysis error:", err);
      setAnalysisError(err.message || "AI analysis failed. Try again.");
      toast(err.message || "AI analysis failed", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  // Discover Real Academic Papers (Fix 3)
  const discoverResearch = async () => {
    let targetPid = projectId;
    if (!targetPid) targetPid = await ensureProject();
    if (!targetPid || !token || discoveringResearch) return;

    try {
      setDiscoveringResearch(true);
      const res = await fetch(`${API}/api/projects/${targetPid}/research/discover`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Academic research discovery failed");

      if (Array.isArray(data.papers)) {
        setAcademicPapers(data.papers);
        toast(`Discovered ${data.papers.length} real academic papers!`, "success");
      }
    } catch (err: any) {
      toast("Research discovery failed: " + err.message, "error");
    } finally {
      setDiscoveringResearch(false);
    }
  };

  // Discover AI & Dataset Resources (Fix 1)
  const discoverResources = async () => {
    let targetPid = projectId;
    if (!targetPid) targetPid = await ensureProject();
    if (!targetPid || !token || discoveringResources) return;
    try {
      setDiscoveringResources(true);
      const res = await fetch(`${API}/api/projects/${targetPid}/resources/discover`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Resource discovery failed");
      setDiscoveredResources({
        datasets: data.datasets || [],
        models: data.models || [],
        provider: data.provider,
        aiEnhanced: data.aiEnhanced,
      });
      setResourcesCount((data.datasets?.length || 0) + (data.models?.length || 0));
    } catch (err: any) {
      toast("Resource discovery failed: " + err.message, "error");
    } finally {
      setDiscoveringResources(false);
    }
  };

  // Generate Backlog Tasks from Project Context
  const generateProjectTasks = async (mode = "project") => {
    let targetPid = projectId;
    if (!targetPid) targetPid = await ensureProject();
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

  // Send Chat Message to Project Copilot (Fix 1: Real conversational flow)
  const sendChatMessage = async (presetText?: string) => {
    const textToSend = presetText || chatInput;
    if (!textToSend.trim() || !token || chatLoading) return;

    let targetPid = projectId;
    if (!targetPid) targetPid = await ensureProject();
    if (!targetPid) {
      setChatError("Project context not ready. Please try again.");
      return;
    }

    const userTurn: ChatTurn = {
      _id: `u_${Date.now()}`,
      role: "user",
      content: textToSend.trim(),
    };

    setLastFailedMessage(textToSend.trim());
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
        setLastFailedMessage(null);
        setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (err: any) {
      console.error("[ProjectAdvisorPanel] chat error:", err);
      let humanMsg = "Project Copilot encountered a server error. Please retry.";
      if (err.message && err.message.includes("Failed to fetch")) {
        humanMsg = "Unable to reach the NEXUSFLOW server. Please check that the backend is running.";
      } else if (err.message && (err.message.includes("401") || err.message.includes("expired") || err.message.includes("unauthorized"))) {
        humanMsg = "Your session has expired. Please log in again.";
      } else if (err.message && err.message.includes("403")) {
        humanMsg = "You do not have authorization to access this project's Copilot.";
      } else if (err.message && err.message.includes("rate limit")) {
        humanMsg = "Free AI providers are temporarily rate-limited. NEXUSFLOW is using its local fallback.";
      } else if (err.message) {
        humanMsg = err.message;
      }
      setChatError(humanMsg);
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
        toast(rating === "helpful" ? "Marked as helpful 👍" : "Feedback saved. Copilot will refine future suggestions 👎", "info");
      }
    } catch (err) {
      console.error("[ProjectAdvisorPanel] sendFeedback error:", err);
    }
  };

  // Clear Copilot Conversation (Fix 3: Starts fresh without deleting project knowledge)
  const handleClearChat = async () => {
    let targetPid = projectId;
    if (!targetPid) targetPid = await ensureProject();
    if (!targetPid || !token || clearingChat) return;

    const ok = await confirm({
      title: "Clear this conversation?",
      message: "This will remove your current Copilot conversation. Your project information and decisions will remain.",
      confirmLabel: "Clear Chat",
      destructive: true,
    });
    if (!ok) return;

    try {
      setClearingChat(true);
      const res = await fetch(`${API}/api/projects/${targetPid}/ai/conversation`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to clear conversation");
      }

      setChatMessages([]);
      setConversationId(null);
      setLastFailedMessage(null);
      setChatError(null);
      toast("Copilot conversation cleared. Starting fresh!", "info");
    } catch (err: any) {
      console.error("[ProjectAdvisorPanel] handleClearChat error:", err);
      toast(err.message || "Failed to clear chat", "error");
    } finally {
      setClearingChat(false);
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

  const openAccessPapers = academicPapers.filter((p) => p.accessStatus === "open_access");
  const paywalledPapers = academicPapers.filter((p) => p.accessStatus !== "open_access");

  // Project AI Navigation Tabs
  const SUB_TABS: { key: SubTabKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[] = [
    { key: "brief", label: "Project Brief", icon: "document-text", count: 0 },
    { key: "guidance", label: "Project Guidance", icon: "compass", count: 0 },
    { key: "copilot", label: "Project Copilot", icon: "chatbubbles", count: chatMessages.length },
    { key: "decisions", label: "Decisions & AI Recs", icon: "git-commit", count: proposedDecisions.length + pendingRecs.length },
    { key: "architecture", label: "Architecture", icon: "layers", count: architecture.length },
    { key: "research", label: "Research", icon: "book", count: academicPapers.length },
    { key: "tools", label: "API & Tools", icon: "construct", count: projectTools.length },
    { key: "resources", label: "AI & Dataset Resources", icon: "server-outline", count: resourcesCount },
    { key: "decide", label: "Decision Engine", icon: "analytics", count: 0 },
  ];

  return (
    <View style={s.container}>
      {/* ── Sub Navigation Tabs ─────────────────────────────────────────── */}
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

            {analysisError && (
              <View style={s.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={s.errorBannerText}>{analysisError}</Text>
                <Pressable style={s.retryMiniBtn} onPress={runAnalysis}>
                  <Text style={s.retryMiniBtnText}>Retry</Text>
                </Pressable>
              </View>
            )}

            {analysisSuccess && (
              <View style={s.successBanner}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={s.successBannerText}>{analysisSuccess}</Text>
              </View>
            )}

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
                Click <Text style={{ fontWeight: "700" }}>Analyze AI</Text> to extract structured project intelligence, requirements, and architecture recommendations.
              </Text>
            )}

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
                <Text style={s.quickJumpSub}>Ask questions about hardware, datasets, ML, or next decisions.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        </ScrollView>
      )}

      {/* ── TAB 2: PROJECT GUIDANCE ──────────────────────────────────── */}
      {activeSection === "guidance" && <GuidancePanel teamId={teamId} />}

      {/* ── TAB 3: PROJECT COPILOT (Real Multi-Turn Chat) ───────────── */}
      {activeSection === "copilot" && (
        <ScrollView
          ref={chatScrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}
        >
          <View style={{ gap: spacing.md }}>
            <View style={s.copilotHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>Project Copilot</Text>
                <Text style={s.sectionSub}>Project-aware conversational assistant grounded in your team's specific requirements.</Text>
              </View>
              {chatMessages.length > 0 && (
                <Pressable
                  style={[s.clearChatBtn, clearingChat && { opacity: 0.6 }]}
                  onPress={handleClearChat}
                  disabled={clearingChat}
                >
                  {clearingChat ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={13} color={colors.danger} />
                      <Text style={s.clearChatBtnText}>Clear Chat</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>

            {/* Prompt Suggestion Chips */}
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

            {/* Messages */}
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
                                {msg.provider === "gemini" ? "Gemini Free" : msg.provider === "openrouter" ? "OpenRouter Free" : "Local Fallback"}
                              </Text>
                            </View>
                          )}
                        </View>
                        <SafeMarkdownMessage content={msg.content} isMe={isUser} />

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
                                Not Helpful
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
                <View style={s.chatLoadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[font.caption, { color: colors.textMuted }]}>Reasoning with project requirements...</Text>
                </View>
              )}

              {chatError && (
                <View style={s.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text style={s.errorBannerText}>{chatError}</Text>
                  <Pressable style={s.retryMiniBtn} onPress={() => sendChatMessage(lastFailedMessage || "hi")}>
                    <Text style={s.retryMiniBtnText}>Retry</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* Input Bar */}
            <View style={s.chatInputBar}>
              <TextInput
                style={s.chatInput}
                placeholder="Ask Project Copilot (e.g. 'What hardware do I need?')..."
                placeholderTextColor={colors.textFaint}
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={() => sendChatMessage()}
                returnKeyType="send"
              />
              <Pressable
                style={[s.sendBtn, (!chatInput.trim() || chatLoading) && { opacity: 0.5 }]}
                onPress={() => sendChatMessage()}
                disabled={!chatInput.trim() || chatLoading}
              >
                <Ionicons name="send" size={16} color="#fff" />
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── TAB 4: DECISIONS & AI RECOMMENDATIONS ────────────────────── */}
      {activeSection === "decisions" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}>
          <View style={{ gap: spacing.md }}>
            <View style={s.sectionHeader}>
              <Text style={font.h3}>Architectural Decisions & Recommendations</Text>
              <Text style={s.sectionSub}>Review trade-offs, evaluate technical alternatives, and accept or reject.</Text>
            </View>

            <Text style={s.groupHeader}>AI RECOMMENDATIONS ({recommendations.length})</Text>
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
                      <Text style={s.itemCategory}>{rec.category?.toUpperCase() || "TECH CHOICE"}</Text>
                    </View>
                    <View style={[s.statusBadge, rec.status === "accepted" ? { backgroundColor: colors.successSoft } : rec.status === "rejected" ? { backgroundColor: colors.dangerSoft } : { backgroundColor: colors.warningSoft }]}>
                      <Text style={[s.statusBadgeText, rec.status === "accepted" ? { color: colors.success } : rec.status === "rejected" ? { color: colors.danger } : { color: colors.warning }]}>
                        {rec.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.itemReason}>{rec.reason}</Text>
                  {rec.alternatives && rec.alternatives.length > 0 && (
                    <Text style={s.altText}>Alternatives: {rec.alternatives.join(", ")}</Text>
                  )}
                  {rec.status === "pending" && (
                    <View style={s.actionRow}>
                      <Pressable style={[s.actionBtn, s.acceptBtn]} onPress={() => updateRecStatus(rec._id, "accepted")}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                        <Text style={s.actionBtnText}>Accept</Text>
                      </Pressable>
                      <Pressable style={[s.actionBtn, s.rejectBtn]} onPress={() => updateRecStatus(rec._id, "rejected")}>
                        <Ionicons name="close" size={14} color="#fff" />
                        <Text style={s.actionBtnText}>Reject</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            )}

            <Text style={[s.groupHeader, { marginTop: spacing.md }]}>DECISION CANDIDATES ({decisions.length})</Text>
            {decisions.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={font.body}>No decisions proposed yet. Click "Analyze AI" in Project Brief.</Text>
              </View>
            ) : (
              decisions.map((dec) => (
                <View key={dec._id} style={s.itemCard}>
                  <View style={s.itemCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemTitle}>{dec.title}</Text>
                      <Text style={s.itemCategory}>Decision: <Text style={{ fontWeight: "700", color: colors.text }}>{dec.decision}</Text></Text>
                    </View>
                    <View style={[s.statusBadge, dec.status === "accepted" ? { backgroundColor: colors.successSoft } : dec.status === "rejected" ? { backgroundColor: colors.dangerSoft } : { backgroundColor: colors.warningSoft }]}>
                      <Text style={[s.statusBadgeText, dec.status === "accepted" ? { color: colors.success } : dec.status === "rejected" ? { color: colors.danger } : { color: colors.warning }]}>
                        {dec.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  {dec.reasoning ? <Text style={s.itemReason}>{dec.reasoning}</Text> : null}
                  {dec.status === "proposed" && (
                    <View style={s.actionRow}>
                      <Pressable style={[s.actionBtn, s.acceptBtn]} onPress={() => updateDecisionStatus(dec._id, "accepted")}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                        <Text style={s.actionBtnText}>Accept Decision</Text>
                      </Pressable>
                      <Pressable style={[s.actionBtn, s.rejectBtn]} onPress={() => updateDecisionStatus(dec._id, "rejected")}>
                        <Ionicons name="close" size={14} color="#fff" />
                        <Text style={s.actionBtnText}>Reject</Text>
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

      {/* ── TAB 6: REAL ACADEMIC RESEARCH (Fix 3: Real Papers Discovery) ── */}
      {activeSection === "research" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}>
          <View style={{ gap: spacing.md }}>
            <View style={s.researchHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>Academic Research Papers ({academicPapers.length})</Text>
                <Text style={s.sectionSub}>Verified peer-reviewed papers discovered from OpenAlex & Crossref.</Text>
              </View>
              <Pressable
                style={[s.discoverBtn, discoveringResearch && { opacity: 0.7 }]}
                onPress={discoverResearch}
                disabled={discoveringResearch}
              >
                {discoveringResearch ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={s.discoverBtnText}>Searching...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="search" size={14} color="#fff" />
                    <Text style={s.discoverBtnText}>Find More Papers</Text>
                  </>
                )}
              </Pressable>
            </View>

            {academicPapers.length === 0 ? (
              <View style={s.emptyCard}>
                <Ionicons name="book-outline" size={32} color={colors.textMuted} />
                <Text style={[font.body, { textAlign: "center", color: colors.textMuted, marginTop: 8 }]}>
                  No academic research papers discovered yet for this project.
                </Text>
                <Pressable style={s.primaryActionBtn} onPress={discoverResearch}>
                  <Ionicons name="sparkles" size={14} color="#fff" />
                  <Text style={s.primaryActionBtnText}>Discover Academic Papers</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {/* 🟢 OPEN ACCESS PAPERS */}
                {openAccessPapers.length > 0 && (
                  <View style={{ gap: spacing.sm }}>
                    <Text style={s.groupHeader}>🟢 FREE / OPEN ACCESS PAPERS ({openAccessPapers.length})</Text>
                    {openAccessPapers.map((paper) => (
                      <View key={paper._id} style={[s.paperCard, s.openAccessCard]}>
                        <View style={s.paperHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.paperTitle}>{paper.title}</Text>
                            <Text style={s.paperMeta}>
                              {paper.authors.join(", ")} · {paper.year || "2023"} · {paper.venue || "Academic Venue"}
                            </Text>
                          </View>
                          <View style={[s.badgePill, { backgroundColor: colors.successSoft }]}>
                            <Text style={[s.badgePillText, { color: colors.success }]}>OPEN ACCESS</Text>
                          </View>
                        </View>

                        {paper.simpleExplanation ? (
                          <View style={s.explanationBox}>
                            <Text style={s.explanationTitle}>STUDENT EXPLANATION</Text>
                            <Text style={s.explanationText}>{paper.simpleExplanation}</Text>
                          </View>
                        ) : null}

                        {paper.whyRelevant ? (
                          <Text style={s.whyRelevantText}>
                            <Text style={{ fontWeight: "700", color: colors.text }}>Why Relevant: </Text>
                            {paper.whyRelevant}
                          </Text>
                        ) : null}

                        {paper.whatToLearn ? (
                          <Text style={s.learnText}>
                            <Text style={{ fontWeight: "700", color: colors.accentDark }}>Key Takeaway: </Text>
                            {paper.whatToLearn}
                          </Text>
                        ) : null}

                        <View style={s.paperActionRow}>
                          {paper.paperUrl ? (
                            <Pressable style={s.paperBtn} onPress={() => Linking.openURL(paper.paperUrl!)}>
                              <Ionicons name="open-outline" size={13} color={colors.primary} />
                              <Text style={s.paperBtnText}>Read Paper</Text>
                            </Pressable>
                          ) : null}
                          {paper.pdfUrl ? (
                            <Pressable style={[s.paperBtn, s.pdfBtn]} onPress={() => Linking.openURL(paper.pdfUrl!)}>
                              <Ionicons name="download-outline" size={13} color={colors.success} />
                              <Text style={[s.paperBtnText, { color: colors.success }]}>Download PDF</Text>
                            </Pressable>
                          ) : null}
                          {paper.doi ? (
                            <Pressable style={s.paperBtn} onPress={() => Linking.openURL(`https://doi.org/${paper.doi}`)}>
                              <Ionicons name="link-outline" size={13} color={colors.textMuted} />
                              <Text style={[s.paperBtnText, { color: colors.textMuted }]}>DOI: {paper.doi}</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* 🔴 PAYWALLED / INSTITUTIONAL ACCESS PAPERS */}
                {paywalledPapers.length > 0 && (
                  <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                    <Text style={s.groupHeader}>🔴 PAYWALLED / SUBSCRIPTION ACCESS ({paywalledPapers.length})</Text>
                    {paywalledPapers.map((paper) => (
                      <View key={paper._id} style={[s.paperCard, s.paywalledCard]}>
                        <View style={s.paperHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.paperTitle}>{paper.title}</Text>
                            <Text style={s.paperMeta}>
                              {paper.authors.join(", ")} · {paper.year || "2023"} · {paper.venue || "Publisher Repository"}
                            </Text>
                          </View>
                          <View style={[s.badgePill, { backgroundColor: colors.dangerSoft }]}>
                            <Text style={[s.badgePillText, { color: colors.danger }]}>PAYWALLED</Text>
                          </View>
                        </View>

                        {paper.simpleExplanation ? (
                          <View style={s.explanationBox}>
                            <Text style={s.explanationTitle}>STUDENT EXPLANATION</Text>
                            <Text style={s.explanationText}>{paper.simpleExplanation}</Text>
                          </View>
                        ) : null}

                        {paper.whyRelevant ? (
                          <Text style={s.whyRelevantText}>
                            <Text style={{ fontWeight: "700", color: colors.text }}>Why Relevant: </Text>
                            {paper.whyRelevant}
                          </Text>
                        ) : null}

                        <View style={s.paperActionRow}>
                          {paper.paperUrl ? (
                            <Pressable style={s.paperBtn} onPress={() => Linking.openURL(paper.paperUrl!)}>
                              <Ionicons name="globe-outline" size={13} color={colors.primary} />
                              <Text style={s.paperBtnText}>View Publisher</Text>
                            </Pressable>
                          ) : null}
                          {paper.doi ? (
                            <Pressable style={s.paperBtn} onPress={() => Linking.openURL(`https://doi.org/${paper.doi}`)}>
                              <Ionicons name="link-outline" size={13} color={colors.textMuted} />
                              <Text style={[s.paperBtnText, { color: colors.textMuted }]}>View DOI</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>
      )}

      {/* ── TAB 7: API & DEVELOPER TOOLS (Fix 2: Dedicated Tab, ZERO Task Side Effects) ── */}
      {activeSection === "tools" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}>
          <View style={{ gap: spacing.md }}>
            <View style={s.researchHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>APIs, SDKs & Developer Tools ({projectTools.length})</Text>
                <Text style={s.sectionSub}>Recommended technologies, protocols, and APIs tailored for this project.</Text>
              </View>
              <Pressable
                style={[s.discoverBtn, toolsLoading && { opacity: 0.7 }]}
                onPress={() => projectId && loadProjectTools(projectId)}
                disabled={toolsLoading}
              >
                {toolsLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="refresh" size={14} color="#fff" />
                    <Text style={s.discoverBtnText}>Refresh Tools</Text>
                  </>
                )}
              </Pressable>
            </View>

            <View style={s.infoNoticeBox}>
              <Ionicons name="information-circle" size={16} color={colors.info} />
              <Text style={s.infoNoticeText}>
                This tab provides technology evaluations and integration guidance only. Exploring tools does NOT create backlog tasks or modify your Kanban.
              </Text>
            </View>

            {projectTools.map((tool, idx) => (
              <View key={idx} style={s.toolCard}>
                <View style={s.toolHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.toolName}>{tool.name}</Text>
                    <Text style={s.toolCategory}>{tool.category}</Text>
                  </View>
                  <View
                    style={[
                      s.statusBadge,
                      tool.status === "FREE"
                        ? { backgroundColor: colors.successSoft }
                        : tool.status === "FREE TIER"
                        ? { backgroundColor: colors.successSoft }
                        : tool.status === "PAID"
                        ? { backgroundColor: colors.dangerSoft }
                        : { backgroundColor: colors.warningSoft },
                    ]}
                  >
                    <Text
                      style={[
                        s.statusBadgeText,
                        tool.status === "FREE" || tool.status === "FREE TIER"
                          ? { color: colors.success }
                          : tool.status === "PAID"
                          ? { color: colors.danger }
                          : { color: colors.warning },
                      ]}
                    >
                      {tool.badgeLabel}
                    </Text>
                  </View>
                </View>

                <Text style={s.toolDescription}>{tool.whatItDoes}</Text>

                <View style={s.toolDetailBlock}>
                  <Text style={s.toolDetailLabel}>WHY RELEVANT TO THIS PROJECT</Text>
                  <Text style={s.toolDetailText}>{tool.whyRelevant}</Text>
                </View>

                <View style={s.toolDetailBlock}>
                  <Text style={s.toolDetailLabel}>HOW TO INTEGRATE</Text>
                  <Text style={s.toolDetailText}>{tool.howToUse}</Text>
                </View>

                {tool.limitations ? (
                  <View style={s.limitationsBox}>
                    <Text style={s.limitationsTitle}>FREE-TIER CAPS / LIMITS</Text>
                    <Text style={s.limitationsText}>{tool.limitations}</Text>
                  </View>
                ) : null}

                <View style={s.toolFooter}>
                  <Text style={s.toolAlternativeText}>
                    <Text style={{ fontWeight: "700" }}>Alternative: </Text>
                    {tool.alternatives}
                  </Text>
                  {tool.docUrl ? (
                    <Pressable style={s.docLinkBtn} onPress={() => Linking.openURL(tool.docUrl)}>
                      <Ionicons name="book-outline" size={13} color={colors.primary} />
                      <Text style={s.docLinkBtnText}>Official Docs</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── TAB 8: AI & DATASET RESOURCES (Fix 1) ─────────────────────── */}
      {activeSection === "resources" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}>
          <View style={{ gap: spacing.md }}>
            <View style={s.researchHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>AI & Dataset Resources</Text>
                <Text style={s.sectionSub}>
                  Discover free/open datasets and pretrained AI/ML models relevant to your project.
                </Text>
              </View>
              <Pressable
                style={[s.discoverBtn, discoveringResources && { opacity: 0.7 }]}
                onPress={discoverResources}
                disabled={discoveringResources}
              >
                {discoveringResources ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={s.discoverBtnText}>Searching...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="search" size={14} color="#fff" />
                    <Text style={s.discoverBtnText}>Find Datasets & Models</Text>
                  </>
                )}
              </Pressable>
            </View>

            <View style={s.infoNoticeBox}>
              <Ionicons name="information-circle" size={16} color={colors.info} />
              <Text style={s.infoNoticeText}>
                Resource discovery is read-only. It does not download models, train models, create tasks, or modify your project. You stay in control.
              </Text>
            </View>

            {!discoveredResources ? (
              <View style={s.emptyCard}>
                <Ionicons name="server-outline" size={32} color={colors.textMuted} />
                <Text style={[font.body, { textAlign: "center", color: colors.textMuted, marginTop: 8 }]}>
                  No resources discovered yet. Click "Find Datasets & Models" to discover free datasets and pretrained models for your project.
                </Text>
              </View>
            ) : null}

            {discoveredResources && discoveredResources.datasets.length === 0 && discoveredResources.models.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={[font.body, { textAlign: "center" }]}>No matching resources found for this project yet.</Text>
              </View>
            ) : null}

            {discoveredResources && discoveredResources.datasets.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={s.groupHeader}>📊 DATASETS ({discoveredResources.datasets.length})</Text>
                {discoveredResources.datasets.map((d, idx) => (
                  <View key={idx} style={s.resourceCard}>
                    <View style={s.resourceHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.resourceTitle}>{d.name}</Text>
                        <Text style={s.resourceSource}>{d.source || "Dataset"}</Text>
                      </View>
                      <View style={[s.badgePill, accessBadgeStyle(d.access)]}>
                        <Text style={[s.badgePillText, accessBadgeTextStyle(d.access)]}>
                          {(d.access || "unknown").replace("_", " ").toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    {d.description ? <Text style={s.resourceDesc}>{d.description}</Text> : null}
                    {d.whyMatches ? (
                      <Text style={s.resourceWhy}>
                        <Text style={{ fontWeight: "700", color: colors.text }}>Why it matches: </Text>
                        {d.whyMatches}
                      </Text>
                    ) : null}
                    {d.dataContains ? (
                      <Text style={s.resourceWhy}>
                        <Text style={{ fontWeight: "700", color: colors.text }}>Contains: </Text>
                        {d.dataContains}
                      </Text>
                    ) : null}
                    <View style={s.resourceFooter}>
                      <View style={s.resourceUseful}>
                        <Ionicons name="pulse" size={11} color={colors.primary} />
                        <Text style={s.resourceUsefulTxt}>Usefulness {d.usefulness}/100</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {d.url ? (
                          <Pressable style={s.resourceBtn} onPress={() => Linking.openURL(d.url)}>
                            <Ionicons name="open-outline" size={12} color={colors.primary} />
                            <Text style={s.resourceBtnTxt}>Open</Text>
                          </Pressable>
                        ) : null}
                        {d.downloadUrl ? (
                          <Pressable style={[s.resourceBtn, s.resourceBtnDl]} onPress={() => Linking.openURL(d.downloadUrl)}>
                            <Ionicons name="download-outline" size={12} color={colors.success} />
                            <Text style={[s.resourceBtnTxt, { color: colors.success }]}>Download</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                    {!d.verified ? <Text style={s.resourceVerify}>URL needs verification before use.</Text> : null}
                  </View>
                ))}
              </View>
            ) : null}

            {discoveredResources && discoveredResources.models.length > 0 ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                <Text style={s.groupHeader}>🤖 PRETRAINED MODELS ({discoveredResources.models.length})</Text>
                {discoveredResources.models.map((m, idx) => (
                  <View key={idx} style={s.resourceCard}>
                    <View style={s.resourceHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.resourceTitle}>{m.name}</Text>
                        <Text style={s.resourceSource}>{[m.framework, m.modelType].filter(Boolean).join(" · ") || "Model"}</Text>
                      </View>
                      <View style={[s.badgePill, accessBadgeStyle(m.access)]}>
                        <Text style={[s.badgePillText, accessBadgeTextStyle(m.access)]}>
                          {(m.access || "unknown").replace("_", " ").toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    {m.description ? <Text style={s.resourceDesc}>{m.description}</Text> : null}
                    {m.whatItDoes ? (
                      <Text style={s.resourceWhy}>
                        <Text style={{ fontWeight: "700", color: colors.text }}>What it does: </Text>
                        {m.whatItDoes}
                      </Text>
                    ) : null}
                    {m.whyFits ? (
                      <Text style={s.resourceWhy}>
                        <Text style={{ fontWeight: "700", color: colors.text }}>Why it fits: </Text>
                        {m.whyFits}
                      </Text>
                    ) : null}
                    {(m.inputType || m.outputType || m.license) ? (
                      <Text style={s.resourceWhy}>
                        <Text style={{ fontWeight: "700", color: colors.text }}>I/O: </Text>
                        {m.inputType || "n/a"} → {m.outputType || "n/a"}
                        {m.license ? ` · License: ${m.license}` : ""}
                      </Text>
                    ) : null}
                    <View style={s.resourceFooter}>
                      <View style={s.resourceUseful}>
                        <Ionicons name="pulse" size={11} color={colors.primary} />
                        <Text style={s.resourceUsefulTxt}>Usefulness {m.usefulness}/100</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {m.url ? (
                          <Pressable style={s.resourceBtn} onPress={() => Linking.openURL(m.url)}>
                            <Ionicons name="open-outline" size={12} color={colors.primary} />
                            <Text style={s.resourceBtnTxt}>Open</Text>
                          </Pressable>
                        ) : null}
                        {m.downloadUrl ? (
                          <Pressable style={[s.resourceBtn, s.resourceBtnDl]} onPress={() => Linking.openURL(m.downloadUrl)}>
                            <Ionicons name="download-outline" size={12} color={colors.success} />
                            <Text style={[s.resourceBtnTxt, { color: colors.success }]}>Download</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                    {!m.verified ? <Text style={s.resourceVerify}>URL needs verification before use.</Text> : null}
                  </View>
                ))}
              </View>
            ) : null}

            {discoveredResources ? (
              <Text style={s.resourceProviderTxt}>
                {discoveredResources.aiEnhanced
                  ? `AI-enhanced via ${discoveredResources.provider || "OmniRoute"}`
                  : "Local deterministic fallback (no AI needed)"}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      )}

      {/* ── TAB 9: DECISION ENGINE ───────────────────────────────────────── */}
      {activeSection === "decide" && <DecisionPanel teamId={teamId} />}
    </View>
  );
}

function accessBadgeStyle(access?: string) {
  const a = (access || "unknown").toLowerCase();
  if (a === "free") return { backgroundColor: colors.successSoft };
  if (a === "requires_account") return { backgroundColor: colors.infoSoft };
  if (a === "paid") return { backgroundColor: colors.dangerSoft };
  return { backgroundColor: colors.warningSoft };
}

function accessBadgeTextStyle(access?: string) {
  const a = (access || "unknown").toLowerCase();
  if (a === "free") return { color: colors.success };
  if (a === "requires_account") return { color: colors.info };
  if (a === "paid") return { color: colors.danger };
  return { color: colors.warning };
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
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  subTabActive: {
    backgroundColor: colors.primarySoft,
  },
  subTabLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  subTabLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  badge: {
    backgroundColor: colors.border,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
  },

  // Project Brief
  projectCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  projectHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  domainTag: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  domainTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.sm,
  },
  genTaskBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.topo,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.sm,
  },
  analyzeBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.dangerSoft,
    padding: 10,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: colors.danger,
  },
  retryMiniBtn: {
    backgroundColor: colors.danger,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  retryMiniBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.successSoft,
    padding: 10,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  successBannerText: {
    flex: 1,
    fontSize: 12,
    color: colors.success,
  },
  resultPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.successSoft,
    padding: 8,
    borderRadius: radius.sm,
  },
  resultPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.success,
  },
  contextBox: {
    backgroundColor: colors.surfaceAlt,
    padding: 10,
    borderRadius: radius.sm,
    marginTop: 6,
  },
  problemText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    marginTop: 4,
  },
  reqGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 8,
  },
  reqCol: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    padding: 8,
    borderRadius: radius.sm,
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
    gap: spacing.sm,
    marginTop: spacing.md,
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

  // Copilot Chat
  sectionHeader: {
    gap: 2,
  },
  copilotHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  clearChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger + "33",
  },
  clearChatBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.danger,
  },
  sectionSub: {
    fontSize: 12,
    color: colors.textMuted,
  },
  promptRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  promptChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  promptChipText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: "500",
  },
  chatContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    minHeight: 200,
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
    padding: 12,
    borderRadius: radius.md,
    gap: 4,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 2,
  },
  aiBubble: {
    backgroundColor: colors.surfaceAlt,
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chatRole: {
    fontSize: 11,
    fontWeight: "700",
  },
  providerBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  providerBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.textMuted,
  },
  chatText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
  },
  feedbackRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  feedbackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  feedbackBtnActive: {
    backgroundColor: colors.surface,
  },
  feedbackBtnText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  chatLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  chatInputBar: {
    flexDirection: "row",
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },

  // Decisions & Architecture Cards
  groupHeader: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  itemCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  itemCategory: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  itemReason: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 17,
  },
  altText: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  acceptBtn: {
    backgroundColor: colors.success,
  },
  rejectBtn: {
    backgroundColor: colors.danger,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },

  // Academic Research Styles
  researchHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  discoverBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.sm,
  },
  discoverBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.sm,
    marginTop: 12,
  },
  primaryActionBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  paperCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  openAccessCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
  },
  paywalledCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
  },
  paperHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  paperTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 19,
  },
  paperMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgePillText: {
    fontSize: 9,
    fontWeight: "800",
  },
  explanationBox: {
    backgroundColor: colors.surfaceAlt,
    padding: 10,
    borderRadius: radius.sm,
    gap: 3,
  },
  explanationTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.topo,
    letterSpacing: 0.5,
  },
  explanationText: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 17,
  },
  whyRelevantText: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
  learnText: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
  paperActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  paperBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  pdfBtn: {
    backgroundColor: colors.successSoft,
  },
  paperBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
  },

  // API & Developer Tools Styles
  infoNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.infoSoft,
    padding: 10,
    borderRadius: radius.sm,
  },
  infoNoticeText: {
    flex: 1,
    fontSize: 12,
    color: colors.info,
    lineHeight: 16,
  },
  toolCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  toolHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  toolName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  toolCategory: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  toolDescription: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  toolDetailBlock: {
    gap: 2,
  },
  toolDetailLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  toolDetailText: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 16,
  },
  limitationsBox: {
    backgroundColor: colors.warningSoft,
    padding: 8,
    borderRadius: radius.sm,
    gap: 2,
  },
  limitationsTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.warning,
  },
  limitationsText: {
    fontSize: 11,
    color: colors.text,
    lineHeight: 15,
  },
  toolFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  toolAlternativeText: {
    flex: 1,
    fontSize: 11,
    color: colors.textMuted,
  },
  docLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  docLinkBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },

  // AI & Dataset Resources (Fix 1)
  resourceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  resourceHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  resourceTitle: { fontSize: 14, fontWeight: "700", color: colors.text, lineHeight: 18 },
  resourceSource: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  resourceDesc: { fontSize: 12, color: colors.text, lineHeight: 17 },
  resourceWhy: { fontSize: 11, color: colors.textMuted, lineHeight: 15 },
  resourceFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resourceUseful: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  resourceUsefulTxt: { fontSize: 10, fontWeight: "700", color: colors.primary },
  resourceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  resourceBtnDl: { backgroundColor: colors.successSoft },
  resourceBtnTxt: { fontSize: 11, fontWeight: "700", color: colors.primary },
  resourceVerify: { fontSize: 10, color: colors.warning, fontStyle: "italic" },
  resourceProviderTxt: { fontSize: 10, color: colors.textMuted, textAlign: "center", marginTop: 8 },
});
