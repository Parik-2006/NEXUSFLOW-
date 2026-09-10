/**
 * client/components/workspace/KanbanPoliciesPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN POLICIES & GOVERNANCE PANEL (Prompts 10, 11)
 *
 * Explicit policy management:
 *   - Column-level WIP limits (Hard vs Advisory)
 *   - Pull policies (DoR requirement, Blocked pull restrictions)
 *   - Definition of Ready (DoR) & Definition of Done (DoD) criteria
 *   - Classes of Service (Standard, Fixed Date, Expedite, Improvement)
 *   - Authorized WIP override history
 * ============================================================================
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/feedback";
import { Badge, Button, SkeletonCard } from "@/components/ui";
import { fetchKanbanPolicies, updateKanbanPolicies } from "@/services/kanbanApiService";
import { colors, spacing, radius, font } from "@/theme";

interface KanbanPoliciesPanelProps {
  teamId: string;
}

export default function KanbanPoliciesPanel({ teamId }: KanbanPoliciesPanelProps) {
  const { token, user } = useAuth();
  const toast = useToast();
  const [policies, setPolicies] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [columns, setColumns] = useState<any[]>([]);
  const [wipMode, setWipMode] = useState("advisory");
  const [sleDays, setSleDays] = useState("4");

  const loadPolicies = useCallback(async () => {
    try {
      const res = await fetchKanbanPolicies(teamId, token);
      const p = res.policies || {};
      setPolicies(p);
      setColumns(p.workflowColumns || []);
      setWipMode(p.wipPolicy?.mode || "advisory");
      setSleDays(String(p.serviceLevelExpectation?.targetDays || 4));
    } catch (err: any) {
      toast(err.message || "Failed to load policies", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, token, toast]);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPolicies();
  };

  const handleUpdateLimit = (colId: string, limitVal: string) => {
    const num = parseInt(limitVal, 10);
    setColumns((prev) =>
      prev.map((c) => (c.id === colId ? { ...c, wipLimit: isNaN(num) ? 0 : Math.max(0, num) } : c))
    );
  };

  const handleSavePolicies = async () => {
    setSaving(true);
    try {
      await updateKanbanPolicies(
        teamId,
        {
          workflowColumns: columns,
          wipPolicy: {
            ...policies?.wipPolicy,
            mode: wipMode,
          },
          serviceLevelExpectation: {
            ...policies?.serviceLevelExpectation,
            targetDays: parseFloat(sleDays) || 4,
          },
        },
        token
      );
      toast("Kanban policies updated successfully.", "success");
      loadPolicies();
    } catch (err: any) {
      toast(err.message || "Failed to save policies (Leader access required)", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={s.container}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  const dor = policies?.definitionOfReady || [];
  const dod = policies?.definitionOfDone || [];
  const cosList = policies?.classesOfService || [];

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── 1. Header & Save Button ────────────────────────────────────────── */}
      <View style={s.headerCard}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Kanban Workflow & WIP Policies</Text>
          <Text style={s.headerSub}>
            Deterministic rules governing pull eligibility, WIP limits, and service-level agreements.
          </Text>
        </View>
        <Button
          title={saving ? "Saving..." : "Save Policies"}
          icon="checkmark"
          disabled={saving}
          onPress={handleSavePolicies}
        />
      </View>

      {/* ── 2. Column WIP Limits Configuration ─────────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Ionicons name="options-outline" size={18} color={colors.primary} />
          <Text style={s.cardTitle}>Column WIP Limits</Text>
        </View>

        {/* WIP Mode Toggle */}
        <View style={s.modeRow}>
          <Text style={s.modeLabel}>WIP Policy Enforcement Mode:</Text>
          <View style={s.modeBtns}>
            <Pressable
              onPress={() => setWipMode("advisory")}
              style={[s.modeBtn, wipMode === "advisory" && s.modeBtnActive]}
            >
              <Text style={[s.modeBtnText, wipMode === "advisory" && s.modeBtnTextActive]}>Advisory (Warn)</Text>
            </Pressable>
            <Pressable
              onPress={() => setWipMode("hard")}
              style={[s.modeBtn, wipMode === "hard" && s.modeBtnActive]}
            >
              <Text style={[s.modeBtnText, wipMode === "hard" && s.modeBtnTextActive]}>Hard (Strict Block)</Text>
            </Pressable>
          </View>
        </View>

        {/* Columns limits list */}
        <View style={s.colList}>
          {columns.map((col) => (
            <View key={col.id} style={s.colRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.colName}>{col.name}</Text>
                <Text style={s.colIdText}>Stage ID: {col.id}</Text>
              </View>

              <View style={s.limitInputWrap}>
                <Text style={s.limitLabel}>WIP Limit:</Text>
                {col.isDoneColumn ? (
                  <Text style={s.unlimitedText}>Unlimited</Text>
                ) : (
                  <TextInput
                    style={s.limitInput}
                    keyboardType="numeric"
                    value={String(col.wipLimit)}
                    onChangeText={(v) => handleUpdateLimit(col.id, v)}
                  />
                )}
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* ── 3. SLE Target Days ─────────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Ionicons name="timer-outline" size={18} color="#4F46E5" />
          <Text style={s.cardTitle}>Service Level Expectation (SLE)</Text>
        </View>
        <Text style={s.subText}>
          Target days to complete an item from Ready/Active to Done at 85% confidence.
        </Text>
        <View style={s.sleRow}>
          <Text style={s.sleLabel}>Target SLE (Days):</Text>
          <TextInput
            style={s.sleInput}
            keyboardType="numeric"
            value={sleDays}
            onChangeText={setSleDays}
          />
        </View>
      </View>

      {/* ── 4. Definition of Ready & Done ─────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Ionicons name="checkbox-outline" size={18} color={colors.success} />
          <Text style={s.cardTitle}>Definition of Ready (DoR)</Text>
        </View>
        {dor.map((item: string, i: number) => (
          <Text key={i} style={s.checkItem}>✓ {item}</Text>
        ))}

        <View style={[s.cardHeader, { marginTop: spacing.md }]}>
          <Ionicons name="checkmark-done-outline" size={18} color={colors.success} />
          <Text style={s.cardTitle}>Definition of Done (DoD)</Text>
        </View>
        {dod.map((item: string, i: number) => (
          <Text key={i} style={s.checkItem}>✓ {item}</Text>
        ))}
      </View>

      {/* ── 5. Classes of Service ──────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Ionicons name="ribbon-outline" size={18} color={colors.primary} />
          <Text style={s.cardTitle}>Classes of Service</Text>
        </View>
        {cosList.map((cos: any) => (
          <View key={cos.id} style={s.cosRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={s.cosName}>{cos.name}</Text>
              {cos.expediteWipBypass && (
                <Badge label="WIP BYPASS PERMITTED" color={colors.danger} />
              )}
            </View>
            <Text style={s.cosPolicy}>{cos.policy}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  headerTitle: {
    ...font.h3,
    color: colors.text,
  },
  headerSub: {
    ...font.caption,
    color: colors.textFaint,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  cardTitle: {
    ...font.caption,
    fontWeight: "700",
    color: colors.text,
  },
  subText: {
    fontSize: 11,
    color: colors.textFaint,
  },
  modeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + "44",
  },
  modeLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  modeBtns: {
    flexDirection: "row",
    gap: 6,
  },
  modeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeBtnActive: {
    backgroundColor: colors.primary + "18",
    borderColor: colors.primary,
  },
  modeBtnText: {
    fontSize: 11,
    color: colors.textFaint,
    fontWeight: "600",
  },
  modeBtnTextActive: {
    color: colors.primary,
  },
  colList: {
    gap: 8,
    marginTop: spacing.xs,
  },
  colRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  colName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  colIdText: {
    fontSize: 10,
    color: colors.textFaint,
  },
  limitInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  limitLabel: {
    fontSize: 12,
    color: colors.textFaint,
  },
  limitInput: {
    width: 50,
    height: 32,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  unlimitedText: {
    fontSize: 12,
    color: colors.textFaint,
    fontStyle: "italic",
  },
  sleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  sleLabel: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "600",
  },
  sleInput: {
    width: 60,
    height: 34,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
  checkItem: {
    fontSize: 12,
    color: colors.text,
    marginLeft: 6,
    paddingVertical: 1,
  },
  cosRow: {
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.md,
    gap: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cosName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  cosPolicy: {
    fontSize: 11,
    color: colors.textFaint,
  },
});
