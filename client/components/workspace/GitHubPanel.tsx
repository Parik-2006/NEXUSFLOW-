import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Linking,
  Platform,
  Pressable,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Badge, SkeletonCard, EmptyState, Field } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { colors, spacing, radius, font } from "@/theme";
import { API_BASE_URL } from "@/utils/api";

const API = API_BASE_URL;

interface GitHubRepoItem {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
  visibility: "public" | "private" | "unknown";
  htmlUrl: string;
  description?: string;
  updatedAt?: string;
}

interface GitHubSummary {
  repoFullName: string;
  repoUrl: string;
  defaultBranch?: string;
  visibility?: string;
  recentCommitsList: Array<{ sha: string; message: string; author?: string; date?: string; url?: string }>;
  recentWeekCommitCount: number;
  pullRequestsList: Array<{ number: number; title: string; state: string; author?: string; url?: string; draft?: boolean; updatedAt?: string }>;
  openPRCount: number;
  stalePRs: Array<{ number: number; title: string; updatedAt: string }>;
  openIssuesList: Array<{ number: number; title: string; url: string; labels: string[] }>;
  contributors: Array<{ login: string; avatarUrl?: string; contributions: number; profileUrl?: string }>;
  branches: string[];
  lastCommitAt?: string;
  fetchedAt?: string;
}

interface RepoTreeResponse {
  totalFiles: number;
  techStack: string[];
  architectureSummary: string;
  keyModuleLocations: {
    auth?: string[];
    api?: string[];
    models?: string[];
    services?: string[];
    components?: string[];
    tests?: string[];
    config?: string[];
  };
  files: Array<{
    path: string;
    name: string;
    type: string;
    size: number;
    sha: string;
    language: string;
    contentSnippet?: string;
  }>;
}

interface ConnectionStatus {
  connected: boolean;
  authorized?: boolean;
  repo?: {
    owner: string;
    name: string;
    fullName: string;
    url: string;
    defaultBranch: string;
    selectedBranch: string;
    visibility: string;
  } | null;
  status?: "connected" | "disconnected" | "syncing" | "error" | "stale";
  lastSyncAt?: string | null;
  lastSyncCommitSha?: string;
  lastAttemptedSyncAt?: string | null;
  lastSyncError?: string;
  isStale?: boolean;
  indexingVersion?: string;
}

export default function GitHubPanel({
  teamId,
  projectId,
}: {
  teamId: string;
  projectId?: string;
}) {
  const { token } = useAuth();
  const toast = useToast();

  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [summary, setSummary] = useState<GitHubSummary | null>(null);
  const [treeData, setTreeData] = useState<RepoTreeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Available user repositories for picking
  const [userRepos, setUserRepos] = useState<GitHubRepoItem[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [showRepoPicker, setShowRepoPicker] = useState(false);

  // Manual connection form state
  const [ownerInput, setOwnerInput] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [branchInput, setBranchInput] = useState("main");
  const [connecting, setConnecting] = useState(false);

  // Disconnect confirmation modal
  const [confirmDisconnectModal, setConfirmDisconnectModal] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Active view tab (6 canonical sub-tabs)
  const [activeTab, setActiveTab] = useState<"overview" | "code" | "commits" | "prs" | "ai" | "sync">("overview");

  // File search & inspection in Code tab
  const [codeSearch, setCodeSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    name: string;
    language: string;
    size: number;
    contentSnippet?: string;
    relatedTaskIds?: string[];
  } | null>(null);

  // Workspace AI & Memory tab state
  const [aiQuery, setAiQuery] = useState("");
  const [aiResponse, setAiResponse] = useState<{
    answer: string;
    provider?: string;
    tier?: string;
    hasSufficientEvidence?: boolean;
    repoFullName?: string;
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [contextSnapshot, setContextSnapshot] = useState<any | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);

  // Fetch status and summary
  const fetchStatusAndData = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    try {
      const statusRes = await fetch(`${API}/api/projects/${projectId}/github/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (statusRes.ok) {
        const sData: ConnectionStatus = await statusRes.json();
        setStatus(sData);

        if (sData.connected) {
          // Fetch summary and tree in parallel
          const [sumRes, treeRes] = await Promise.all([
            fetch(`${API}/api/projects/${projectId}/github/summary`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch(`${API}/api/projects/${projectId}/github/tree`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ]);

          if (sumRes.ok) {
            const sumData = await sumRes.json();
            setSummary(sumData.summary || null);
          }
          if (treeRes.ok) {
            const tData = await treeRes.json();
            setTreeData(tData);
          }
        }
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
      setSyncing(false);
    }
  }, [projectId, token]);

  // Load user accessible repositories for dropdown
  const loadUserRepos = useCallback(async () => {
    setLoadingRepos(true);
    try {
      const res = await fetch(`${API}/api/github/user/repos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUserRepos(data.repositories || []);
      }
    } catch {
      // non-fatal
    } finally {
      setLoadingRepos(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStatusAndData();
    loadUserRepos();

    // Check for OAuth callback query parameters in web environment
    if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("github_auth") === "success") {
        toast("GitHub account authorized successfully! Select a repository to connect.", "success");
        params.delete("github_auth");
        const newSearch = params.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
        window.history.replaceState({}, "", newUrl);
        fetchStatusAndData();
        loadUserRepos();
      } else if (params.get("github_error")) {
        const errorMsg = params.get("github_error") || "GitHub authorization failed";
        toast(decodeURIComponent(errorMsg), "error");
        params.delete("github_error");
        const newSearch = params.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
        window.history.replaceState({}, "", newUrl);
      }
    }
  }, [fetchStatusAndData, loadUserRepos]);

  // OAuth Initiation
  const handleOAuthInit = async () => {
    try {
      const res = await fetch(`${API}/api/github/auth/init?projectId=${projectId}&teamId=${teamId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const url = data.authUrl || data.redirectUrl;
        if (url) {
          if (Platform.OS === "web") {
            window.location.href = url;
          } else {
            Linking.openURL(url);
          }
        } else {
          toast(data.message || "GitHub OAuth not configured. Use manual connection below.", "info");
        }
      } else {
        const err = await res.json();
        toast(err.error || "GitHub OAuth initialization failed", "error");
      }
    } catch (e: any) {
      toast(e.message || "Failed to start GitHub authentication", "error");
    }
  };

  // Connect repository (either manual or chosen from list)
  const handleConnectRepo = async (owner: string, name: string, branch = "main", visibility = "unknown") => {
    if (!owner.trim() || !name.trim()) {
      toast("Please enter both repository owner and name", "info");
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/github/connect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          repoOwner: owner.trim(),
          repoName: name.trim(),
          defaultBranch: branch.trim() || "main",
          selectedBranch: branch.trim() || "main",
          visibility,
        }),
      });

      if (res.ok) {
        toast(`Connected repository ${owner}/${name}`, "success");
        setShowRepoPicker(false);
        setOwnerInput("");
        setRepoInput("");
        fetchStatusAndData();
      } else {
        const err = await res.json();
        toast(err.error || "Failed to connect repository", "error");
      }
    } catch (e: any) {
      toast(e.message || "Connection failed", "error");
    } finally {
      setConnecting(false);
    }
  };

  // Manual connect
  const handleManualConnect = () => {
    handleConnectRepo(ownerInput, repoInput, branchInput);
  };

  // Re-index / Sync repository
  const handleSync = async () => {
    if (!projectId) return;
    setSyncing(true);
    toast("Syncing repository and indexing code intelligence...", "info");
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/github/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        toast(data.message || "Repository synchronization complete", "success");
        fetchStatusAndData();
      } else {
        const err = await res.json();
        toast(err.error || "Repository synchronization failed", "error");
        fetchStatusAndData();
      }
    } catch (e: any) {
      toast(e.message || "Sync operation failed", "error");
    } finally {
      setSyncing(false);
    }
  };

  // Disconnect repository
  const handleDisconnect = async () => {
    if (!projectId) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/github`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast("Repository disconnected. Historical project memory preserved.", "success");
        setConfirmDisconnectModal(false);
        setStatus(null);
        setSummary(null);
        setTreeData(null);
        fetchStatusAndData();
      } else {
        const err = await res.json();
        toast(err.error || "Failed to disconnect repository", "error");
      }
    } catch (e: any) {
      toast(e.message || "Disconnection failed", "error");
    } finally {
      setDisconnecting(false);
    }
  };

  // Load workspace context snapshot
  const loadContextSnapshot = useCallback(async () => {
    if (!projectId) return;
    setLoadingSnapshot(true);
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/context/snapshot`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setContextSnapshot(data.context || null);
      }
    } catch {
      // non-fatal
    } finally {
      setLoadingSnapshot(false);
    }
  }, [projectId, token]);

  // Query Workspace AI with grounded codebase context
  const handleAskWorkspaceAI = async (queryText?: string) => {
    const textToAsk = (queryText || aiQuery).trim();
    if (!textToAsk || !projectId) {
      toast("Please enter a question for Workspace AI", "info");
      return;
    }
    setAiLoading(true);
    setAiResponse(null);
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/context/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: textToAsk }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiResponse(data);
      } else {
        const err = await res.json();
        toast(err.error || "Workspace query failed", "error");
      }
    } catch (e: any) {
      toast(e.message || "Failed to query workspace intelligence", "error");
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <SkeletonCard />
        <SkeletonCard />
      </ScrollView>
    );
  }

  // ── UNCONNECTED STATE ───────────────────────────────────────────────────────
  if (!status?.connected) {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <Card style={s.card}>
          <View style={{ alignItems: "center", paddingVertical: spacing.lg }}>
            <View style={s.iconCircle}>
              <Ionicons name="logo-github" size={44} color={colors.text} />
            </View>
            <Text style={[font.h2, { marginTop: spacing.md }]}>Connect GitHub Repository</Text>
            <Text
              style={[
                font.small,
                { color: colors.textMuted, textAlign: "center", maxWidth: 480, marginTop: spacing.xs, lineHeight: 20 },
              ]}
            >
              Connect your repository to empower Project AI with persistent workspace memory, code architecture analysis, commit change tracking, and task-to-code traceability.
            </Text>

            {/* Status indicator: Account Authorized */}
            {(status?.authorized || userRepos.length > 0) && (
              <View style={{ marginTop: spacing.md, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(16, 185, 129, 0.12)", paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill }}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={[font.caption, { color: colors.success, fontWeight: "600" }]}>
                  GitHub Account Authorized ({userRepos.length} accessible repos)
                </Text>
              </View>
            )}

            {/* Accessible Repositories Picker (if user already authorized account) */}
            {userRepos.length > 0 && (
              <View style={{ width: "100%", maxWidth: 380, marginTop: spacing.md }}>
                <Button
                  title={loadingRepos ? "Loading accessible repos..." : `Select from your GitHub Repos (${userRepos.length})`}
                  icon="list"
                  variant="primary"
                  onPress={() => setShowRepoPicker(true)}
                />
              </View>
            )}

            {/* OAuth Connect */}
            <View style={{ marginTop: userRepos.length > 0 ? spacing.xs : spacing.lg, width: "100%", maxWidth: 380, gap: spacing.sm }}>
              <Button
                title={userRepos.length > 0 ? "Re-authorize GitHub Account" : "Authorize with GitHub OAuth"}
                icon="logo-github"
                variant={userRepos.length > 0 ? "ghost" : "primary"}
                onPress={handleOAuthInit}
              />
            </View>

            {/* Divider */}
            <View style={s.dividerRow}>
              <View style={s.dividerLine} />
              <Text style={[font.caption, { color: colors.textMuted, marginHorizontal: spacing.sm }]}>OR LINK DIRECTLY</Text>
              <View style={s.dividerLine} />
            </View>

            {/* Manual Form */}
            <View style={{ width: "100%", maxWidth: 380, gap: spacing.sm }}>
              <Field
                label="Repository Owner / Organization"
                placeholder="e.g. Parik-2006"
                value={ownerInput}
                onChangeText={setOwnerInput}
              />
              <Field
                label="Repository Name"
                placeholder="e.g. NEXUSFLOW-"
                value={repoInput}
                onChangeText={setRepoInput}
              />
              <Field
                label="Branch"
                placeholder="main"
                value={branchInput}
                onChangeText={setBranchInput}
              />
              <Button
                title={connecting ? "Connecting..." : "Connect Repository"}
                variant="primary"
                onPress={handleManualConnect}
                disabled={connecting}
              />
            </View>
          </View>
        </Card>

        {/* Modal: Accessible Repositories Picker */}
        <Modal
          visible={showRepoPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRepoPicker(false)}
        >
          <View style={s.modalOverlay}>
            <Card style={s.modalContent}>
              <View style={s.modalHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="logo-github" size={22} color={colors.text} />
                  <Text style={font.h3}>Select a Repository</Text>
                </View>
                <Pressable onPress={() => setShowRepoPicker(false)} hitSlop={10}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </Pressable>
              </View>

              <Text style={[font.small, { color: colors.textMuted, marginBottom: spacing.md }]}>
                Choose exactly one active repository to connect to this workspace.
              </Text>

              <ScrollView style={{ maxHeight: 360 }}>
                {userRepos.map((r) => (
                  <Pressable
                    key={r.id}
                    style={s.repoPickerItem}
                    onPress={() => handleConnectRepo(r.owner, r.name, r.defaultBranch, r.visibility)}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[font.body, { fontWeight: "700" }]}>{r.fullName}</Text>
                        <Badge
                          label={r.visibility}
                          color={r.visibility === "private" ? colors.warning : colors.success}
                        />
                      </View>
                      {r.description ? (
                        <Text style={[font.caption, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                          {r.description}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                ))}
              </ScrollView>
            </Card>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  // ── CONNECTED STATE ────────────────────────────────────────────────────────
  const repo = status.repo;
  const isSyncing = syncing || status.status === "syncing";
  const hasError = Boolean(status.lastSyncError);
  const isStale = Boolean(status.isStale);

  return (
    <ScrollView
      contentContainerStyle={s.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchStatusAndData();
          }}
          tintColor={colors.primary}
        />
      }
    >
      {/* Synchronization Error Banner */}
      {hasError && (
        <Card style={s.errorBanner}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <Ionicons name="alert-circle" size={24} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={[font.body, { fontWeight: "700", color: colors.danger }]}>
                Synchronization Error
              </Text>
              <Text style={[font.small, { color: colors.danger }]}>
                {status.lastSyncError}
              </Text>
            </View>
          </View>
          <Button
            title="Retry Sync"
            variant="secondary"
            small
            icon="refresh"
            onPress={handleSync}
            disabled={isSyncing}
          />
        </Card>
      )}

      {/* Stale Index Banner */}
      {isStale && !hasError && (
        <Card style={s.staleBanner}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Ionicons name="time-outline" size={20} color={colors.warning} />
            <Text style={[font.small, { color: colors.warning, flex: 1 }]}>
              The repository index may be stale. Sync now to refresh code intelligence and recent commits.
            </Text>
          </View>
          <Button
            title="Update Index"
            variant="secondary"
            small
            icon="refresh"
            onPress={handleSync}
            disabled={isSyncing}
          />
        </Card>
      )}

      {/* Header Bar */}
      <Card style={s.headerCard}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" }}>
              <Ionicons name="logo-github" size={24} color={colors.text} />
              <Text style={font.h2}>{repo?.fullName || "Connected Repository"}</Text>
              <Badge
                label={isSyncing ? "Syncing..." : status.status || "Connected"}
                color={hasError ? colors.danger : isSyncing ? colors.accentDark : colors.success}
              />
              {repo?.visibility && (
                <Badge
                  label={repo.visibility.toUpperCase()}
                  color={repo.visibility === "private" ? colors.warning : colors.primary}
                />
              )}
              {repo?.defaultBranch && (
                <Badge label={`Branch: ${repo.selectedBranch || repo.defaultBranch}`} color={colors.textMuted} />
              )}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: 6, flexWrap: "wrap" }}>
              {repo?.url && (
                <Pressable onPress={() => Linking.openURL(repo.url)}>
                  <Text style={[font.caption, { color: colors.info, textDecorationLine: "underline" }]}>
                    {repo.url}
                  </Text>
                </Pressable>
              )}
              {status.lastSyncAt && (
                <Text style={[font.caption, { color: colors.textMuted }]}>
                  Last synced: {new Date(status.lastSyncAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                </Text>
              )}
              {status.lastSyncCommitSha ? (
                <Text style={[font.caption, { color: colors.textMuted }]}>
                  Commit: <Text style={{ fontFamily: "monospace", fontWeight: "700" }}>{status.lastSyncCommitSha.slice(0, 7)}</Text>
                </Text>
              ) : null}
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}>
            <Button
              title={isSyncing ? "Syncing..." : "Sync / Re-index"}
              icon="refresh"
              variant="primary"
              small
              onPress={handleSync}
              disabled={isSyncing}
            />
            <Button
              title="Disconnect"
              icon="trash-outline"
              variant="secondary"
              small
              onPress={() => setConfirmDisconnectModal(true)}
            />
          </View>
        </View>

        {/* Tab Navigation */}
        <View style={s.tabBar}>
          <Pressable
            style={[s.tabItem, activeTab === "overview" && s.tabItemActive]}
            onPress={() => setActiveTab("overview")}
          >
            <Ionicons name="speedometer-outline" size={16} color={activeTab === "overview" ? colors.primary : colors.textMuted} />
            <Text style={[s.tabLabel, activeTab === "overview" && s.tabLabelActive]}>Overview & Metrics</Text>
          </Pressable>

          <Pressable
            style={[s.tabItem, activeTab === "code" && s.tabItemActive]}
            onPress={() => setActiveTab("code")}
          >
            <Ionicons name="code-slash-outline" size={16} color={activeTab === "code" ? colors.primary : colors.textMuted} />
            <Text style={[s.tabLabel, activeTab === "code" && s.tabLabelActive]}>Code Intelligence</Text>
          </Pressable>

          <Pressable
            style={[s.tabItem, activeTab === "commits" && s.tabItemActive]}
            onPress={() => setActiveTab("commits")}
          >
            <Ionicons name="git-commit-outline" size={16} color={activeTab === "commits" ? colors.primary : colors.textMuted} />
            <Text style={[s.tabLabel, activeTab === "commits" && s.tabLabelActive]}>Recent Commits</Text>
          </Pressable>

          <Pressable
            style={[s.tabItem, activeTab === "prs" && s.tabItemActive]}
            onPress={() => setActiveTab("prs")}
          >
            <Ionicons name="git-pull-request-outline" size={16} color={activeTab === "prs" ? colors.primary : colors.textMuted} />
            <Text style={[s.tabLabel, activeTab === "prs" && s.tabLabelActive]}>PRs & Issues</Text>
          </Pressable>

          <Pressable
            style={[s.tabItem, activeTab === "ai" && s.tabItemActive]}
            onPress={() => {
              setActiveTab("ai");
              if (!contextSnapshot) loadContextSnapshot();
            }}
          >
            <Ionicons name="sparkles-outline" size={16} color={activeTab === "ai" ? colors.primary : colors.textMuted} />
            <Text style={[s.tabLabel, activeTab === "ai" && s.tabLabelActive]}>Workspace AI & Memory</Text>
          </Pressable>

          <Pressable
            style={[s.tabItem, activeTab === "sync" && s.tabItemActive]}
            onPress={() => setActiveTab("sync")}
          >
            <Ionicons name="refresh-circle-outline" size={16} color={activeTab === "sync" ? colors.primary : colors.textMuted} />
            <Text style={[s.tabLabel, activeTab === "sync" && s.tabLabelActive]}>Sync & Activity</Text>
          </Pressable>
        </View>
      </Card>

      {/* ── TAB 1: OVERVIEW & METRICS ────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <View style={{ gap: spacing.md }}>
          {/* Key Metrics */}
          <View style={s.statsGrid}>
            <Card style={s.statBox}>
              <Text style={[font.h2, { color: colors.primary }]}>{summary?.recentWeekCommitCount ?? 0}</Text>
              <Text style={[font.caption, { color: colors.textMuted }]}>Commits (7d)</Text>
            </Card>
            <Card style={s.statBox}>
              <Text style={[font.h2, { color: colors.accentDark }]}>{summary?.openPRCount ?? summary?.pullRequestsList?.length ?? 0}</Text>
              <Text style={[font.caption, { color: colors.textMuted }]}>Open PRs</Text>
            </Card>
            <Card style={s.statBox}>
              <Text style={[font.h2, { color: colors.warning }]}>{summary?.stalePRs?.length ?? 0}</Text>
              <Text style={[font.caption, { color: colors.textMuted }]}>Stale PRs</Text>
            </Card>
            <Card style={s.statBox}>
              <Text style={[font.h2, { color: colors.info }]}>{summary?.contributors?.length ?? 0}</Text>
              <Text style={[font.caption, { color: colors.textMuted }]}>Contributors</Text>
            </Card>
          </View>

          {/* Architecture Snapshot */}
          {treeData?.architectureSummary ? (
            <Card style={s.card}>
              <View style={s.sectionHeader}>
                <Ionicons name="layers-outline" size={18} color={colors.primary} />
                <Text style={font.h3}>Repository Architecture Snapshot</Text>
              </View>
              <Text style={[font.small, { fontFamily: "monospace", color: colors.text, lineHeight: 20 }]}>
                {treeData.architectureSummary}
              </Text>
            </Card>
          ) : null}

          {/* Contributors List */}
          <Card style={s.card}>
            <View style={s.sectionHeader}>
              <Ionicons name="people-outline" size={18} color={colors.info} />
              <Text style={font.h3}>Active Contributors</Text>
            </View>
            {(!summary?.contributors || summary.contributors.length === 0) ? (
              <Text style={[font.small, { color: colors.textMuted }]}>No contributors recorded.</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {summary.contributors.slice(0, 10).map((c) => (
                  <View key={c.login} style={s.contributorChip}>
                    <Text style={[font.small, { fontWeight: "700" }]}>{c.login}</Text>
                    <Badge label={`${c.contributions} commits`} color={colors.primary} />
                  </View>
                ))}
              </View>
            )}
          </Card>
        </View>
      )}

      {/* ── TAB 2: CODE INTELLIGENCE & FILE INDEX ────────────────────────────── */}
      {activeTab === "code" && (
        <View style={{ gap: spacing.md }}>
          {/* Tech Stack Detected */}
          <Card style={s.card}>
            <View style={s.sectionHeader}>
              <Ionicons name="hardware-chip-outline" size={18} color={colors.primary} />
              <Text style={font.h3}>Detected Tech Stack & Languages</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              {(treeData?.techStack || []).length > 0 ? (
                treeData!.techStack.map((tech, idx) => (
                  <Badge key={idx} label={tech} color={colors.primary} />
                ))
              ) : (
                <Text style={[font.small, { color: colors.textMuted }]}>
                  Sync the repository to analyze frameworks and dependencies.
                </Text>
              )}
            </View>
          </Card>

          {/* Key Structural Modules */}
          <Card style={s.card}>
            <View style={s.sectionHeader}>
              <Ionicons name="folder-open-outline" size={18} color={colors.accentDark} />
              <Text style={font.h3}>Structural Module Locations</Text>
            </View>
            <View style={{ gap: spacing.sm }}>
              {treeData?.keyModuleLocations &&
                Object.entries(treeData.keyModuleLocations).map(([cat, paths]) => {
                  if (!paths || paths.length === 0) return null;
                  return (
                    <View key={cat} style={s.moduleLocationRow}>
                      <Badge label={cat.toUpperCase()} color={colors.accentDark} />
                      <View style={{ flex: 1 }}>
                        {paths.slice(0, 3).map((p, i) => (
                          <Text key={i} style={[font.caption, { fontFamily: "monospace", color: colors.text }]}>
                            {p}
                          </Text>
                        ))}
                      </View>
                    </View>
                  );
                })}
            </View>
          </Card>

          {/* Indexed File Listings with Search Filter */}
          <Card style={s.card}>
            <View style={s.sectionHeader}>
              <Ionicons name="document-text-outline" size={18} color={colors.info} />
              <Text style={font.h3}>
                Indexed Files ({((treeData?.files || []).filter((f) => !codeSearch.trim() || f.path.toLowerCase().includes(codeSearch.toLowerCase()) || f.name.toLowerCase().includes(codeSearch.toLowerCase()))).length} of {treeData?.totalFiles ?? 0})
              </Text>
            </View>

            {/* Search Filter */}
            <View style={s.searchWrap}>
              <Ionicons name="search-outline" size={16} color={colors.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder="Search indexed files by path or name..."
                placeholderTextColor={colors.textFaint}
                value={codeSearch}
                onChangeText={setCodeSearch}
              />
              {codeSearch ? (
                <Pressable onPress={() => setCodeSearch("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {(!treeData?.files || treeData.files.length === 0) ? (
              <Text style={[font.small, { color: colors.textMuted }]}>No files indexed yet. Run sync to index files.</Text>
            ) : (
              (treeData.files || [])
                .filter((f) => !codeSearch.trim() || f.path.toLowerCase().includes(codeSearch.toLowerCase()) || f.name.toLowerCase().includes(codeSearch.toLowerCase()))
                .slice(0, 30)
                .map((f, i) => (
                  <Pressable
                    key={i}
                    style={s.fileRow}
                    onPress={() => setSelectedFile(f)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[font.small, { fontFamily: "monospace", fontWeight: "700" }]}>{f.path}</Text>
                      {f.contentSnippet ? (
                        <Text style={[font.caption, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={2}>
                          {f.contentSnippet.slice(0, 150)}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Badge label={f.language || "text"} color={colors.textMuted} />
                      <Ionicons name="eye-outline" size={16} color={colors.primary} />
                    </View>
                  </Pressable>
                ))
            )}
          </Card>
        </View>
      )}

      {/* ── TAB 3: RECENT COMMITS ────────────────────────────────────────────── */}
      {activeTab === "commits" && (
        <Card style={s.card}>
          <View style={s.sectionHeader}>
            <Ionicons name="git-commit" size={18} color={colors.primary} />
            <Text style={font.h3}>Commit History</Text>
          </View>
          {(!summary?.recentCommitsList || summary.recentCommitsList.length === 0) ? (
            <Text style={[font.small, { color: colors.textMuted }]}>No recent commits recorded.</Text>
          ) : (
            summary.recentCommitsList.map((c, i) => (
              <View key={i} style={s.commitRow}>
                <Badge label={c.sha || "sha"} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[font.body, { fontWeight: "700" }]} numberOfLines={1}>{c.message}</Text>
                  <Text style={[font.caption, { color: colors.textMuted }]}>
                    {c.author} · {c.date ? new Date(c.date).toLocaleDateString() : ""}
                  </Text>
                </View>
                {c.url ? (
                  <Pressable onPress={() => { if (c.url) Linking.openURL(c.url); }}>
                    <Ionicons name="open-outline" size={16} color={colors.info} />
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </Card>
      )}

      {/* ── TAB 4: PRS & ISSUES ──────────────────────────────────────────────── */}
      {activeTab === "prs" && (
        <View style={s.twoCol}>
          {/* Pull Requests */}
          <Card style={s.halfCard}>
            <View style={s.sectionHeader}>
              <Ionicons name="git-pull-request" size={18} color={colors.accentDark} />
              <Text style={font.h3}>Pull Requests ({summary?.openPRCount ?? summary?.pullRequestsList?.length ?? 0})</Text>
            </View>
            {(!summary?.pullRequestsList || summary.pullRequestsList.length === 0) ? (
              <Text style={[font.small, { color: colors.textMuted }]}>No open pull requests.</Text>
            ) : (
              summary.pullRequestsList.map((pr) => (
                <View key={pr.number} style={s.prRow}>
                  <Badge label={`#${pr.number}`} color={pr.state === "open" ? colors.success : colors.textMuted} />
                  <Text style={[font.small, { flex: 1 }]} numberOfLines={1}>{pr.title}</Text>
                  {pr.url ? (
                    <Pressable onPress={() => { if (pr.url) Linking.openURL(pr.url); }}>
                      <Ionicons name="open-outline" size={14} color={colors.info} />
                    </Pressable>
                  ) : null}
                </View>
              ))
            )}
          </Card>

          {/* Open Issues */}
          <Card style={s.halfCard}>
            <View style={s.sectionHeader}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
              <Text style={font.h3}>Open Issues ({summary?.openIssuesList?.length ?? 0})</Text>
            </View>
            {(!summary?.openIssuesList || summary.openIssuesList.length === 0) ? (
              <Text style={[font.small, { color: colors.textMuted }]}>No open issues found.</Text>
            ) : (
              summary.openIssuesList.map((issue) => (
                <View key={issue.number} style={s.prRow}>
                  <Badge label={`#${issue.number}`} color={colors.warning} />
                  <Text style={[font.small, { flex: 1 }]} numberOfLines={1}>{issue.title}</Text>
                  {issue.url ? (
                    <Pressable onPress={() => { if (issue.url) Linking.openURL(issue.url); }}>
                      <Ionicons name="open-outline" size={14} color={colors.info} />
                    </Pressable>
                  ) : null}
                </View>
              ))
            )}
          </Card>
        </View>
      )}

      {/* ── TAB 5: WORKSPACE AI & MEMORY ────────────────────────────────────── */}
      {activeTab === "ai" && (
        <View style={{ gap: spacing.md }}>
          {/* Ask Copilot Card */}
          <Card style={s.card}>
            <View style={s.sectionHeader}>
              <Ionicons name="sparkles" size={18} color={colors.accentDark} />
              <Text style={font.h3}>Workspace AI & Codebase Intelligence</Text>
              <Badge label="OmniRoute · $0 Cost" color={colors.accentDark} />
            </View>
            <Text style={[font.small, { color: colors.textMuted, marginBottom: spacing.md }]}>
              Ask grounded questions about this repository's architecture, dependencies, tasks, approved requirements, decisions, and risks.
            </Text>

            {/* Quick Prompt Chips */}
            <View style={s.promptChipsWrap}>
              {[
                "Explain this repository's architecture.",
                "Where is authentication implemented?",
                "What changed in the latest commit?",
                "Which files relate to active tasks?",
                "What are our approved requirements?",
                "What active risks exist in this workspace?",
              ].map((promptText, idx) => (
                <Pressable
                  key={idx}
                  style={s.promptChip}
                  onPress={() => {
                    setAiQuery(promptText);
                    handleAskWorkspaceAI(promptText);
                  }}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.primary} />
                  <Text style={s.promptChipTxt}>{promptText}</Text>
                </Pressable>
              ))}
            </View>

            {/* Query Input */}
            <View style={s.aiInputRow}>
              <TextInput
                style={s.aiTextInput}
                placeholder="Ask about architecture, commits, tasks, requirements..."
                placeholderTextColor={colors.textFaint}
                value={aiQuery}
                onChangeText={setAiQuery}
                onSubmitEditing={() => handleAskWorkspaceAI()}
              />
              <Button
                title={aiLoading ? "Thinking..." : "Ask Copilot"}
                icon="send"
                variant="primary"
                small
                onPress={() => handleAskWorkspaceAI()}
                disabled={aiLoading || !aiQuery.trim()}
              />
            </View>
          </Card>

          {/* AI Response Card */}
          {aiResponse && (
            <Card style={s.aiResponseCard}>
              <View style={s.sectionHeader}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={font.h3}>Grounded Copilot Guidance</Text>
                {aiResponse.provider && (
                  <Badge label={`${aiResponse.provider} (${aiResponse.tier || "$0 Cost"})`} color={colors.primary} />
                )}
                {aiResponse.hasSufficientEvidence && (
                  <Badge label="Grounded in Evidence" color={colors.success} />
                )}
              </View>

              <Text style={[font.body, { color: colors.text, lineHeight: 22 }]}>
                {aiResponse.answer}
              </Text>
            </Card>
          )}

          {/* Assembled Workspace Context & Memory Snapshot */}
          <Card style={s.card}>
            <View style={[s.sectionHeader, { justifyContent: "space-between" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="server-outline" size={18} color={colors.primary} />
                <Text style={font.h3}>MongoDB Workspace Memory Snapshot</Text>
              </View>
              <Button
                title={loadingSnapshot ? "Refreshing..." : "Refresh Context"}
                icon="refresh"
                variant="secondary"
                small
                onPress={loadContextSnapshot}
                disabled={loadingSnapshot}
              />
            </View>
            <Text style={[font.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
              Authoritative project records assembled from MongoDB across requirements, tasks, decisions, risks, chat, and repository indexes:
            </Text>

            {contextSnapshot?.assembledContext ? (
              <ScrollView style={s.snapshotScroll}>
                <Text style={[font.caption, { fontFamily: "monospace", color: colors.text, lineHeight: 18 }]}>
                  {contextSnapshot.assembledContext}
                </Text>
              </ScrollView>
            ) : (
              <Text style={[font.small, { color: colors.textMuted }]}>
                {loadingSnapshot ? "Loading workspace context snapshot..." : "Click 'Refresh Context' to inspect assembled workspace records."}
              </Text>
            )}
          </Card>
        </View>
      )}

      {/* ── TAB 6: SYNCHRONIZATION & ACTIVITY ───────────────────────────────── */}
      {activeTab === "sync" && (
        <View style={{ gap: spacing.md }}>
          {/* Status Overview Card */}
          <Card style={s.card}>
            <View style={s.sectionHeader}>
              <Ionicons name="refresh-circle" size={18} color={colors.primary} />
              <Text style={font.h3}>Synchronization Status & Checkpoint</Text>
              <Badge
                label={status.status || "connected"}
                color={hasError ? colors.danger : isSyncing ? colors.accentDark : colors.success}
              />
            </View>

            <View style={s.detailsGrid}>
              <View style={s.detailItem}>
                <Text style={s.detailLabel}>Repository</Text>
                <Text style={s.detailValue}>{repo?.fullName || "Not Connected"}</Text>
              </View>
              <View style={s.detailItem}>
                <Text style={s.detailLabel}>Active Branch</Text>
                <Text style={s.detailValue}>{repo?.selectedBranch || repo?.defaultBranch || "main"}</Text>
              </View>
              <View style={s.detailItem}>
                <Text style={s.detailLabel}>Last Analyzed Commit SHA</Text>
                <Text style={[s.detailValue, { fontFamily: "monospace" }]}>
                  {status.lastSyncCommitSha ? status.lastSyncCommitSha.slice(0, 10) : "None"}
                </Text>
              </View>
              <View style={s.detailItem}>
                <Text style={s.detailLabel}>Last Successful Sync</Text>
                <Text style={s.detailValue}>
                  {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : "Never"}
                </Text>
              </View>
              <View style={s.detailItem}>
                <Text style={s.detailLabel}>Last Attempted Sync</Text>
                <Text style={s.detailValue}>
                  {status.lastAttemptedSyncAt ? new Date(status.lastAttemptedSyncAt).toLocaleString() : "Never"}
                </Text>
              </View>
              <View style={s.detailItem}>
                <Text style={s.detailLabel}>Total Indexed Files</Text>
                <Text style={s.detailValue}>{treeData?.totalFiles ?? 0} files</Text>
              </View>
              <View style={s.detailItem}>
                <Text style={s.detailLabel}>Indexing Version</Text>
                <Text style={s.detailValue}>{status.indexingVersion || "4.0.0"}</Text>
              </View>
              <View style={s.detailItem}>
                <Text style={s.detailLabel}>Index Freshness</Text>
                <Text style={[s.detailValue, { color: isStale ? colors.warning : colors.success }]}>
                  {isStale ? "Stale (Sync Recommended)" : "Up to Date"}
                </Text>
              </View>
            </View>
          </Card>

          {/* Sync Actions Card */}
          <Card style={s.card}>
            <View style={s.sectionHeader}>
              <Ionicons name="settings-outline" size={18} color={colors.primary} />
              <Text style={font.h3}>Synchronization Actions</Text>
            </View>
            <Text style={[font.small, { color: colors.textMuted, marginBottom: spacing.md }]}>
              Trigger an incremental synchronization to pull remote commits, update file indexes, and ground workspace AI in latest changes.
            </Text>

            <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
              <Button
                title={isSyncing ? "Synchronizing Codebase..." : "Run Incremental Sync"}
                icon="refresh"
                variant="primary"
                onPress={handleSync}
                disabled={isSyncing}
              />
              <Button
                title="Disconnect Repository"
                icon="trash-outline"
                variant="secondary"
                onPress={() => setConfirmDisconnectModal(true)}
              />
            </View>
          </Card>

          {/* Data Retention & Isolation Policy Card */}
          <Card style={s.card}>
            <View style={s.sectionHeader}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.success} />
              <Text style={font.h3}>Workspace Isolation & Retention Policy</Text>
            </View>
            <View style={{ gap: spacing.xs }}>
              <Text style={[font.small, { color: colors.text }]}>
                • <Text style={{ fontWeight: "700" }}>One Active Repo Per Workspace:</Text> This workspace is strictly bound to <Text style={{ fontFamily: "monospace" }}>{repo?.fullName}</Text>. Other workspaces can connect different repositories from your account.
              </Text>
              <Text style={[font.small, { color: colors.text }]}>
                • <Text style={{ fontWeight: "700" }}>Safe Disconnection:</Text> Disconnecting halts future sync operations and marks repository records inactive. Unrelated artifacts, tasks, requirements, and team chat are permanently preserved.
              </Text>
              <Text style={[font.small, { color: colors.text }]}>
                • <Text style={{ fontWeight: "700" }}>Security & Privacy:</Text> GitHub tokens are encrypted with AES-256-CBC, never exposed to the frontend, and secret files (.env, keys) are strictly excluded from indexing.
              </Text>
            </View>
          </Card>
        </View>
      )}

      {/* File Inspection Modal */}
      <Modal
        visible={Boolean(selectedFile)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedFile(null)}
      >
        <View style={s.modalOverlay}>
          <Card style={s.fileModalContent}>
            <View style={s.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Ionicons name="document-text" size={20} color={colors.primary} />
                <Text style={[font.h3, { flex: 1, fontFamily: "monospace" }]} numberOfLines={1}>
                  {selectedFile?.path}
                </Text>
              </View>
              <Pressable onPress={() => setSelectedFile(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: spacing.xs, marginVertical: spacing.sm }}>
              <Badge label={selectedFile?.language || "file"} color={colors.primary} />
              <Badge label={`${Math.round((selectedFile?.size || 0) / 1024)} KB`} color={colors.textMuted} />
            </View>

            <ScrollView style={{ maxHeight: 320, backgroundColor: colors.surfaceAlt, padding: spacing.sm, borderRadius: radius.sm }}>
              <Text style={[font.caption, { fontFamily: "monospace", color: colors.text, lineHeight: 18 }]}>
                {selectedFile?.contentSnippet || "No preview snippet available for this file."}
              </Text>
            </ScrollView>

            <View style={{ marginTop: spacing.md, alignItems: "flex-end" }}>
              <Button
                title="Close"
                variant="secondary"
                small
                onPress={() => setSelectedFile(null)}
              />
            </View>
          </Card>
        </View>
      </Modal>

      {/* Disconnect Confirmation Modal */}
      <Modal
        visible={confirmDisconnectModal}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDisconnectModal(false)}
      >
        <View style={s.modalOverlay}>
          <Card style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={font.h3}>Disconnect Repository?</Text>
              <Pressable onPress={() => setConfirmDisconnectModal(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <Text style={[font.small, { color: colors.textMuted, marginVertical: spacing.md, lineHeight: 20 }]}>
              Disconnecting <Text style={{ fontWeight: "700" }}>{repo?.fullName}</Text> will halt synchronization for this workspace. All existing project tasks, artifacts, and conversations will remain preserved.
            </Text>

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm }}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setConfirmDisconnectModal(false)}
                disabled={disconnecting}
              />
              <Button
                title={disconnecting ? "Disconnecting..." : "Confirm Disconnect"}
                variant="primary"
                onPress={handleDisconnect}
                disabled={disconnecting}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerCard: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  tabItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  tabItemActive: {
    backgroundColor: colors.primarySoft,
  },
  tabLabel: {
    ...font.small,
    color: colors.textMuted,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  card: {
    padding: spacing.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    maxWidth: 380,
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  errorBanner: {
    padding: spacing.md,
    backgroundColor: colors.danger + "15",
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  staleBanner: {
    padding: spacing.md,
    backgroundColor: colors.warning + "15",
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  statsGrid: {
    flexDirection: "row",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  statBox: {
    flex: 1,
    minWidth: 140,
    alignItems: "center",
    padding: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  commitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  moduleLocationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: 4,
  },
  contributorChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  twoCol: {
    flexDirection: "row",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  halfCard: {
    flex: 1,
    minWidth: 300,
    padding: spacing.lg,
  },
  prRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalContent: {
    width: "100%",
    maxWidth: 520,
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  repoPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 13,
    color: colors.text,
  },
  promptChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  promptChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 9,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  promptChipTxt: {
    fontSize: 11.5,
    color: colors.primary,
    fontWeight: "600",
  },
  aiInputRow: {
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "center",
  },
  aiTextInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 13,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
  },
  aiResponseCard: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    gap: spacing.sm,
  },
  snapshotScroll: {
    maxHeight: 280,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  detailItem: {
    flex: 1,
    minWidth: 200,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "600",
  },
  fileModalContent: {
    width: "100%",
    maxWidth: 680,
    padding: spacing.lg,
  },
});
