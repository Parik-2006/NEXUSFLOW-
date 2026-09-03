import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Badge, SkeletonCard, EmptyState } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { colors, spacing, radius, font } from "@/theme";
import { API_BASE_URL } from "@/utils/api";
import { getSocket } from "@/services/socket";

const API = API_BASE_URL;

interface RiskItem {
  _id: string;
  title: string;
  explanation: string;
  evidence?: string;
  affectedArea: string;
  severity: "low" | "medium" | "high" | "critical";
  recommendation?: string;
  status: "open" | "acknowledged" | "resolved";
  category: string;
  createdAt?: string;
}

const severityColorMap: Record<string, string> = {
  critical: colors.danger,
  high: colors.warning,
  medium: colors.info,
  low: colors.textMuted,
};

export default function RiskPanel({
  teamId,
  projectId,
}: {
  teamId: string;
  projectId?: string;
}) {
  const { token } = useAuth();
  const toast = useToast();
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "acknowledged" | "resolved">("open");
  const [error, setError] = useState<string | null>(null);

  const targetId = projectId || teamId;

  const fetchRisks = useCallback(async (isSilent = false) => {
    if (!targetId || !token) {
      setLoading(false);
      return;
    }
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/projects/${targetId}/risks?status=${filter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const loadedRisks = data.risks || [];
        setRisks(loadedRisks);
        if (loadedRisks.length > 0 || filter !== "open") {
          setHasScanned(true);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status}: Failed to load risks`);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load risk intelligence.");
    } finally {
      setLoading(false);
    }
  }, [targetId, filter, token]);

  const handleScan = async () => {
    if (!targetId || !token) return;
    setScanning(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/projects/${targetId}/risks/scan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRisks(data.risks || []);
        setHasScanned(true);
        const count = data.count ?? data.risks?.length ?? 0;
        toast(`Risk scan complete: ${count} risk trigger(s) evaluated`, count > 0 ? "info" : "success");
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Risk scan failed");
      }
    } catch (e: any) {
      toast(e.message || "Risk scan failed. Try again.", "error");
      setError(e.message);
    } finally {
      setScanning(false);
    }
  };

  const handleUpdateStatus = async (riskId: string, newStatus: "acknowledged" | "resolved") => {
    if (!targetId || !token) return;
    try {
      const res = await fetch(`${API}/api/projects/${targetId}/risks/${riskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setRisks((prev) =>
          prev.map((r) => (r._id === riskId ? { ...r, status: newStatus } : r))
        );
        toast(`Risk marked as ${newStatus}`, "success");
      } else {
        throw new Error("Failed to update status");
      }
    } catch (e: any) {
      toast(e.message || "Failed to update risk status", "error");
    }
  };

  useEffect(() => {
    fetchRisks();
  }, [fetchRisks]);

  // Real-time project risk socket synchronization
  useEffect(() => {
    if (!targetId || !token) return;
    const socket = getSocket(token);
    socket.emit("room:join:project", { projectId: targetId });

    const handleRiskUpdate = (payload: any) => {
      if (payload?.risks) {
        setRisks(payload.risks);
        setHasScanned(true);
      } else {
        fetchRisks(true);
      }
    };

    socket.on("project:risk:updated", handleRiskUpdate);
    socket.on("reconnect", () => fetchRisks(true));

    return () => {
      socket.off("project:risk:updated", handleRiskUpdate);
      socket.off("reconnect", () => {});
    };
  }, [targetId, token, fetchRisks]);

  if (loading && risks.length === 0 && !error) {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <SkeletonCard />
        <SkeletonCard />
      </ScrollView>
    );
  }

  if (error && risks.length === 0) {
    return (
      <View style={s.container}>
        <EmptyState
          icon="alert-circle-outline"
          title="Risk Intelligence Unavailable"
          message={error}
          actionLabel="Retry"
          actionIcon="refresh"
          onAction={() => fetchRisks(false)}
        />
      </View>
    );
  }

  const criticalCount = risks.filter((r) => r.severity === "critical" && r.status === "open").length;
  const highCount = risks.filter((r) => r.severity === "high" && r.status === "open").length;
  const openCount = risks.filter((r) => r.status === "open").length;

  return (
    <ScrollView
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={scanning} onRefresh={handleScan} tintColor={colors.primary} />}
    >
      {/* Header action bar */}
      <View style={s.headerRow}>
        <View style={{ flex: 1, minWidth: 260 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" }}>
            <Text style={font.h2}>Project Risk Intelligence</Text>
            {criticalCount > 0 && <Badge label={`${criticalCount} Critical`} color={colors.danger} />}
            {highCount > 0 && <Badge label={`${highCount} High`} color={colors.warning} />}
            {openCount === 0 && hasScanned && <Badge label="All Clear" color={colors.success} />}
          </View>
          <Text style={[font.small, { color: colors.textMuted, marginTop: 4, lineHeight: 18 }]}>
            Deterministic engine scans 12+ risk detectors including approaching deadlines, blocker cascades, member overload, and missing skills.
          </Text>
        </View>
        <Button
          title={scanning ? "Scanning Risks..." : "Scan Risks"}
          icon="shield-checkmark"
          variant="primary"
          onPress={handleScan}
          disabled={scanning}
        />
      </View>

      {/* Filter Tabs */}
      <View style={s.filterRow}>
        {(["open", "acknowledged", "resolved", "all"] as const).map((f) => {
          const isActive = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[s.filterPill, isActive && s.filterPillActive]}
            >
              <Text
                style={[
                  font.small,
                  isActive ? { fontWeight: "700", color: colors.primary } : { color: colors.textMuted },
                ]}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Risk Cards List / Empty States */}
      {risks.length === 0 ? (
        !hasScanned ? (
          <Card style={s.emptyCard}>
            <Ionicons name="scan-outline" size={48} color={colors.primary} />
            <Text style={[font.h3, { marginTop: spacing.sm, textAlign: "center" }]}>Risk Scan Not Run Yet</Text>
            <Text style={[font.small, { color: colors.textMuted, textAlign: "center", maxWidth: 440, marginTop: 4, lineHeight: 18 }]}>
              Run a live deterministic scan to evaluate project deadlines, task dependencies, contributor capacities, and skill coverage.
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <Button title="Run Live Scan" icon="shield-checkmark" onPress={handleScan} disabled={scanning} />
            </View>
          </Card>
        ) : (
          <EmptyState
            icon="shield-checkmark-outline"
            title="No Risks Detected"
            message={`Your project currently has no active risk triggers in the "${filter}" category.`}
            actionLabel="Scan Again"
            actionIcon="refresh"
            onAction={handleScan}
          />
        )
      ) : (
        risks.map((risk) => {
          const color = severityColorMap[risk.severity] || colors.info;
          return (
            <Card key={risk._id} style={s.riskCard}>
              <View style={s.riskTop}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1, flexWrap: "wrap" }}>
                  <Badge label={risk.severity.toUpperCase()} color={color} />
                  {!!risk.affectedArea && (
                    <Badge label={risk.affectedArea} color={colors.primary} bg={colors.primarySoft} />
                  )}
                  <Text style={[font.h3, { flexShrink: 1 }]} numberOfLines={1}>
                    {risk.title}
                  </Text>
                </View>
                {risk.status === "open" ? (
                  <View style={s.actionsRow}>
                    <Button
                      title="Acknowledge"
                      variant="secondary"
                      small
                      onPress={() => handleUpdateStatus(risk._id, "acknowledged")}
                    />
                    <Button
                      title="Resolve"
                      variant="ghost"
                      small
                      onPress={() => handleUpdateStatus(risk._id, "resolved")}
                    />
                  </View>
                ) : (
                  <Badge label={risk.status.toUpperCase()} color={risk.status === "resolved" ? colors.success : colors.textMuted} />
                )}
              </View>

              <Text style={[font.body, { color: colors.text, marginTop: spacing.xs, lineHeight: 20 }]}>
                {risk.explanation}
              </Text>

              {!!risk.evidence && (
                <View style={s.evidenceBox}>
                  <Text style={[font.caption, { color: colors.textMuted, fontWeight: "600" }]}>
                    Evidence: {risk.evidence}
                  </Text>
                </View>
              )}

              {!!risk.recommendation && (
                <View style={s.recommendationBox}>
                  <Ionicons name="bulb-outline" size={16} color={colors.accentDark} style={{ marginTop: 2 }} />
                  <Text style={[font.small, { flex: 1, color: colors.accentDark, lineHeight: 18 }]}>
                    {risk.recommendation}
                  </Text>
                </View>
              )}
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  filterRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  filterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  riskCard: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  riskTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  evidenceBox: {
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recommendationBox: {
    flexDirection: "row",
    gap: spacing.xs,
    backgroundColor: colors.accentSoft,
    padding: spacing.sm + 2,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
    alignItems: "flex-start",
  },
  emptyCard: {
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
});
