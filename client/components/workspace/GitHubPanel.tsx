import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Badge, SkeletonCard, EmptyState, Field } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { colors, spacing, radius, font } from "@/theme";
import { API_BASE_URL } from "@/utils/api";

const API = API_BASE_URL;

interface GitHubSummary {
  repoFullName: string;
  repoUrl: string;
  recentCommits: Array<{ sha: string; message: string; author?: string; date?: string }>;
  recentWeekCommitCount: number;
  pullRequests: Array<{ number: number; title: string; state: string; author?: string; url?: string; draft?: boolean }>;
  openPRCount: number;
  stalePRs: Array<{ number: number; title: string; updatedAt: string }>;
  openIssues: Array<{ number: number; title: string; url: string; labels: string[] }>;
  contributors: Array<{ login: string; avatarUrl: string; contributions: number; profileUrl: string }>;
  inactiveContributors: Array<{ login: string; contributions: number }>;
  branches: string[];
  fetchedAt: string;
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
  const [summary, setSummary] = useState<GitHubSummary | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [ownerInput, setOwnerInput] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [connecting, setConnecting] = useState(false);

  const checkStatusAndFetch = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    try {
      const statusRes = await fetch(`${API}/api/projects/${projectId}/github/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setConnected(statusData.connected);

        if (statusData.connected) {
          const sumRes = await fetch(`${API}/api/projects/${projectId}/github/summary`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (sumRes.ok) {
            const sumData = await sumRes.json();
            setSummary(sumData.summary || null);
          }
        }
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId, token]);

  const handleOAuthInit = async () => {
    try {
      const res = await fetch(`${API}/api/github/auth/init?projectId=${projectId}&teamId=${teamId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authUrl) {
          if (Platform.OS === "web") {
            window.location.href = data.authUrl;
          } else {
            Linking.openURL(data.authUrl);
          }
        }
      } else {
        const err = await res.json();
        toast(err.error || "GitHub OAuth not configured.", "info");
      }
    } catch (e: any) {
      toast(e.message || "Failed to start GitHub authentication", "error");
    }
  };

  const handleManualConnect = async () => {
    if (!ownerInput.trim() || !repoInput.trim()) {
      toast("Enter both owner and repository name", "info");
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
          repoOwner: ownerInput.trim(),
          repoName: repoInput.trim(),
        }),
      });
      if (res.ok) {
        toast("Repository connected successfully", "success");
        checkStatusAndFetch();
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

  const handleRefresh = async () => {
    if (!projectId) return;
    setRefreshing(true);
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/github/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary || null);
        toast("GitHub activity refreshed", "success");
      }
    } catch (e: any) {
      toast(e.message || "Failed to refresh GitHub data", "error");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    checkStatusAndFetch();
  }, [checkStatusAndFetch]);

  if (loading) {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <SkeletonCard />
        <SkeletonCard />
      </ScrollView>
    );
  }

  if (!connected) {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <Card style={s.card}>
          <View style={{ alignItems: "center", paddingVertical: spacing.lg }}>
            <Ionicons name="logo-github" size={48} color={colors.text} />
            <Text style={[font.h2, { marginTop: spacing.md }]}>Connect GitHub Repository</Text>
            <Text
              style={[
                font.small,
                { color: colors.textMuted, textAlign: "center", maxWidth: 440, marginTop: spacing.xs },
              ]}
            >
              Link your repository to track commits, PR status, contributors, and detect stalled development cycles.
            </Text>

            <View style={{ marginTop: spacing.lg, gap: spacing.sm, width: "100%", maxWidth: 360 }}>
              <Button
                title="Authenticate with GitHub OAuth"
                icon="logo-github"
                variant="primary"
                onPress={handleOAuthInit}
              />
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", width: "100%", maxWidth: 360, marginVertical: spacing.lg }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <Text style={[font.caption, { color: colors.textMuted, marginHorizontal: spacing.sm }]}>OR LINK REPO</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>

            <View style={{ width: "100%", maxWidth: 360, gap: spacing.sm }}>
              <Field
                label="Repository Owner"
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
              <Button
                title={connecting ? "Connecting..." : "Connect Repository"}
                variant="secondary"
                onPress={handleManualConnect}
                disabled={connecting}
              />
            </View>
          </View>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
    >
      {/* Header Bar */}
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
            <Ionicons name="logo-github" size={22} color={colors.text} />
            <Text style={font.h2}>{summary?.repoFullName || "GitHub Activity"}</Text>
            <Badge label="Connected" color={colors.success} />
          </View>
          {summary?.repoUrl && (
            <Text
              style={[font.caption, { color: colors.info, marginTop: 2 }]}
              onPress={() => Linking.openURL(summary.repoUrl)}
            >
              {summary.repoUrl}
            </Text>
          )}
        </View>
        <Button
          title={refreshing ? "Refreshing..." : "Sync Activity"}
          icon="refresh"
          variant="secondary"
          small
          onPress={handleRefresh}
          disabled={refreshing}
        />
      </View>

      {/* Metrics Grid */}
      <View style={s.statsGrid}>
        <Card style={s.statBox}>
          <Text style={[font.h2, { color: colors.primary }]}>{summary?.recentWeekCommitCount ?? 0}</Text>
          <Text style={[font.caption, { color: colors.textMuted }]}>Commits (7d)</Text>
        </Card>
        <Card style={s.statBox}>
          <Text style={[font.h2, { color: colors.accentDark }]}>{summary?.openPRCount ?? 0}</Text>
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

      {/* Recent Commits */}
      <Card style={s.card}>
        <View style={s.sectionHeader}>
          <Ionicons name="git-commit" size={18} color={colors.primary} />
          <Text style={font.h3}>Recent Commits</Text>
        </View>
        {(!summary?.recentCommits || summary.recentCommits.length === 0) ? (
          <Text style={[font.small, { color: colors.textMuted }]}>No recent commits recorded.</Text>
        ) : (
          summary.recentCommits.slice(0, 8).map((c, i) => (
            <View key={i} style={s.commitRow}>
              <Badge label={c.sha || "sha"} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[font.body, { fontWeight: "700" }]} numberOfLines={1}>{c.message}</Text>
                <Text style={[font.caption, { color: colors.textMuted }]}>
                  {c.author} · {c.date ? new Date(c.date).toLocaleDateString() : ""}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>

      {/* Pull Requests & Inactive Contributors */}
      <View style={s.twoCol}>
        {/* Open PRs */}
        <Card style={s.halfCard}>
          <View style={s.sectionHeader}>
            <Ionicons name="git-pull-request" size={18} color={colors.accentDark} />
            <Text style={font.h3}>Pull Requests</Text>
          </View>
          {(!summary?.pullRequests || summary.pullRequests.length === 0) ? (
            <Text style={[font.small, { color: colors.textMuted }]}>No pull requests found.</Text>
          ) : (
            summary.pullRequests.slice(0, 5).map((pr) => (
              <View key={pr.number} style={s.prRow}>
                <Badge label={`#${pr.number}`} color={pr.state === "open" ? colors.success : colors.textMuted} />
                <Text style={[font.small, { flex: 1 }]} numberOfLines={1}>{pr.title}</Text>
              </View>
            ))
          )}
        </Card>

        {/* Contributors */}
        <Card style={s.halfCard}>
          <View style={s.sectionHeader}>
            <Ionicons name="people" size={18} color={colors.info} />
            <Text style={font.h3}>Contributors</Text>
          </View>
          {(!summary?.contributors || summary.contributors.length === 0) ? (
            <Text style={[font.small, { color: colors.textMuted }]}>No contributors recorded.</Text>
          ) : (
            summary.contributors.slice(0, 6).map((c) => (
              <View key={c.login} style={s.contributorRow}>
                <Text style={[font.body, { fontWeight: "700" }]}>{c.login}</Text>
                <Badge label={`${c.contributions} commits`} color={colors.accentDark} />
              </View>
            ))
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  card: {
    padding: spacing.lg,
  },
  statsGrid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  statBox: {
    flex: 1,
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
  twoCol: {
    flexDirection: "row",
    gap: spacing.md,
  },
  halfCard: {
    flex: 1,
    padding: spacing.lg,
  },
  prRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  contributorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
});
