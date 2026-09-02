import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
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
  const [filter, setFilter] = useState<"all" | "open" | "acknowledged" | "resolved">("open");

  const fetchRisks = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/risks?status=${filter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRisks(data.risks || []);
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [projectId, filter, token]);

  const handleScan = async () => {
    if (!projectId) return;
    setScanning(true);
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/risks/scan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRisks(data.risks || []);
        toast(`Risk scan complete: ${data.count || 0} risk(s) identified`, "success");
      }
    } catch (e: any) {
      toast(e.message || "Failed to scan risks", "error");
    } finally {
      setScanning(false);
    }
  };

  const handleUpdateStatus = async (riskId: string, newStatus: "acknowledged" | "resolved") => {
    if (!projectId) return;
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/risks/${riskId}`, {
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
      }
    } catch (e: any) {
      toast(e.message || "Failed to update risk", "error");
    }
  };

  useEffect(() => {
    fetchRisks();
  }, [fetchRisks]);

  // Real-time project risk socket updates
  useEffect(() => {
    if (!projectId) return;
    const socket = getSocket(token);
    socket.emit("room:join:project", { projectId });

    const handleRiskUpdate = (payload: any) => {
      if (payload.risks) {
        setRisks(payload.risks);
      } else {
        fetchRisks();
      }
    };

    socket.on("project:risk:updated", handleRiskUpdate);
    return () => {
      socket.off("project:risk:updated", handleRiskUpdate);
    };
  }, [projectId, token, fetchRisks]);

  if (loading) {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <SkeletonCard />
        <SkeletonCard />
      </ScrollView>
    );
  }

  const criticalCount = risks.filter((r) => r.severity === "critical" && r.status === "open").length;
  const highCount = risks.filter((r) => r.severity === "high" && r.status === "open").length;

  return (
    <ScrollView
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={scanning} onRefresh={handleScan} tintColor={colors.primary} />}
    >
      {/* Header action bar */}
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
            <Text style={font.h2}>Project Risk Intelligence</Text>
            {criticalCount > 0 && <Badge label={`${criticalCount} Critical`} color={colors.danger} />}
            {highCount > 0 && <Badge label={`${highCount} High`} color={colors.warning} />}
          </View>
          <Text style={[font.small, { color: colors.textMuted }]}>
            Deterministic scans detect approaching deadlines, overloaded members, blocker cascades & missing skills.
          </Text>
        </View>
        <Button
          title={scanning ? "Scanning..." : "Scan Risks"}
          icon="shield-checkmark"
          variant="primary"
          onPress={handleScan}
          disabled={scanning}
        />
      </View>

      {/* Filter Tabs */}
      <View style={s.filterRow}>
        {(["open", "acknowledged", "resolved", "all"] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[s.filterPill, filter === f && s.filterPillActive]}
          >
            <Text style={[font.small, filter === f ? { fontWeight: "700", color: colors.primary } : { color: colors.textMuted }]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Risk List */}
      {risks.length === 0 ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title="No Risks Detected"
          message="Your project currently has no active risk triggers in this category."
        />
      ) : (
        risks.map((risk) => {
          const color = severityColorMap[risk.severity] || colors.info;
          return (
            <Card key={risk._id} style={s.riskCard}>
              <View style={s.riskTop}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1 }}>
                  <Badge label={risk.severity.toUpperCase()} color={color} />
                  <Badge label={risk.affectedArea} color={colors.primary} />
                  <Text style={[font.h3, { flex: 1 }]} numberOfLines={1}>
                    {risk.title}
                  </Text>
                </View>
                {risk.status === "open" && (
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
                )}
                {risk.status !== "open" && (
                  <Badge label={risk.status} color={colors.textMuted} />
                )}
              </View>

              <Text style={[font.small, { color: colors.text, marginTop: spacing.xs }]}>
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
                  <Ionicons name="bulb-outline" size={14} color={colors.accentDark} />
                  <Text style={[font.small, { flex: 1, color: colors.accentDark }]}>
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
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  filterRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  filterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  filterPillActive: {
    backgroundColor: colors.primarySoft,
  },
  riskCard: {
    padding: spacing.md,
  },
  riskTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  evidenceBox: {
    backgroundColor: colors.surfaceAlt,
    padding: spacing.xs + 2,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  recommendationBox: {
    flexDirection: "row",
    gap: spacing.xs,
    backgroundColor: colors.accentSoft,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
    alignItems: "flex-start",
  },
});
