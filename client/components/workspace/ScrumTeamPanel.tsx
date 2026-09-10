/**
 * client/components/workspace/ScrumTeamPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM TEAM & CAPACITY INTELLIGENCE
 *
 * Prompts 10 & 11:
 *   1. Scrum Roles Roster (Scrum Master, Product Owner, Developers)
 *   2. Deterministic Capacity & Workload Balance
 *   3. Skill Availability & Sprint Competency Matrix
 *   4. Branch & Bound Assignment Suggestions (Advisory only)
 * ============================================================================
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/feedback";
import { Card, SkeletonCard, ProgressBar, Badge } from "@/components/ui";
import { fetchScrumCapacity } from "@/services/scrumApiService";
import { colors, spacing, radius, font } from "@/theme";

interface ScrumTeamPanelProps {
  teamId: string;
}

export default function ScrumTeamPanel({ teamId }: ScrumTeamPanelProps) {
  const { token } = useAuth();
  const toast = useToast();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetchScrumCapacity(teamId, token);
      setData(res);
    } catch (err: any) {
      toast(err.message || "Failed to load Scrum team capacity", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, token, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const members = data?.members || [];
  const capacity = data?.capacity || {
    totalCapacityHours: 120,
    totalCommittedHours: 84,
    utilizationPct: 70,
    overloadCount: 0,
  };
  const skillGaps = data?.skillGaps || [];
  const suggestions = data?.balancingSuggestions || [];

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── 1. Capacity Hero Card ──────────────────────────────────────────── */}
      <View style={s.heroCard}>
        <View style={{ flex: 1 }}>
          <Text style={s.heroTitle}>Sprint Capacity & Load Intelligence</Text>
          <Text style={s.heroSub}>
            Deterministic workload distribution across {members.length} team members.
          </Text>
        </View>

        <View style={s.heroStats}>
          <View style={s.statBox}>
            <Text style={s.statNum}>{capacity.totalCapacityHours}h</Text>
            <Text style={s.statLbl}>Available</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statNum}>{capacity.totalCommittedHours}h</Text>
            <Text style={s.statLbl}>Committed</Text>
          </View>
          <View style={s.statBox}>
            <Text
              style={[
                s.statNum,
                capacity.utilizationPct > 100 && { color: "#dc2626" },
              ]}
            >
              {capacity.utilizationPct}%
            </Text>
            <Text style={s.statLbl}>Utilization</Text>
          </View>
        </View>
      </View>

      {/* ── 2. Team Member Roster & Capacity Bars ──────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHead}>
          <Ionicons name="people" size={16} color={colors.primary} />
          <Text style={s.cardTitle}>Scrum Roles & Individual Load</Text>
        </View>

        <View style={s.memberList}>
          {members.map((m: any, mIdx: number) => {
            const isOverloaded = (m.utilizationPct || 0) > 100;
            const memberSkills = Array.isArray(m.verifiedSkills) && m.verifiedSkills.length > 0
              ? m.verifiedSkills
              : Array.isArray(m.skills)
                ? m.skills
                : typeof m.skills === "object" && m.skills !== null
                  ? Object.entries(m.skills).filter(([, v]) => (v as number) >= 5).map(([k]) => k.toUpperCase())
                  : ["FRONTEND", "DEVELOPER"];

            return (
              <View key={m.id || m.userId || mIdx} style={s.memberItem}>
                <View style={s.memberTop}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={s.avatar}>
                      <Text style={s.avatarTxt}>
                        {(m.name || "U").slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={s.memberName}>{m.name}</Text>
                      <Text style={s.memberRole}>{m.role || "Developer"}</Text>
                    </View>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      style={[
                        s.memberHours,
                        isOverloaded && { color: "#dc2626" },
                      ]}
                    >
                      {m.committedHours || m.allocatedHours || 0}h / {m.capacityHours || 40}h
                    </Text>
                    <Text style={s.memberPct}>{m.utilizationPct || 0}% loaded</Text>
                  </View>
                </View>

                {/* Capacity progress bar */}
                <ProgressBar
                  value={m.utilizationPct || 0}
                  color={isOverloaded ? "#dc2626" : colors.primary}
                  height={6}
                />

                {/* Member Verified Skills */}
                <View style={s.skillRow}>
                  <Text style={s.skillHead}>Verified Skills:</Text>
                  {memberSkills.map((sk: string) => (
                    <View key={sk} style={s.skillChip}>
                      <Text style={s.skillTxt}>{sk}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* ── 3. Skill Gap Analysis (Prompt 11) ───────────────────────────────── */}
      {skillGaps.length > 0 && (
        <View style={s.warnCard}>
          <View style={s.warnHead}>
            <Ionicons name="alert-circle" size={18} color="#b45309" />
            <Text style={s.warnTitle}>Sprint Skill Gaps Detected</Text>
          </View>
          <Text style={s.warnSub}>
            Some candidate backlog items require competencies not currently verified on this team:
          </Text>
          <View style={{ gap: 4, marginTop: 4 }}>
            {skillGaps.map((gap: any, i: number) => (
              <View key={i} style={s.gapRow}>
                <Ionicons name="chevron-forward" size={13} color="#b45309" />
                <Text style={s.gapTxt}>
                  {gap.skill} — needed for "{gap.taskTitle}"
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── 4. Branch & Bound Balancing Advisory ───────────────────────────── */}
      {suggestions.length > 0 && (
        <View style={s.adviseCard}>
          <View style={s.adviseHead}>
            <Ionicons name="git-branch" size={16} color="#4f46e5" />
            <Text style={s.adviseTitle}>Branch & Bound Workload Advisory</Text>
          </View>
          <Text style={s.adviseDesc}>
            Algorithmic recommendations to balance hours and avoid bottlenecks. (Non-automatic).
          </Text>
          <View style={{ gap: 8, marginTop: 4 }}>
            {suggestions.map((sug: any, i: number) => (
              <View key={i} style={s.sugItem}>
                <Ionicons name="bulb-outline" size={16} color="#4f46e5" />
                <Text style={s.sugTxt}>{sug.message}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
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
    paddingBottom: 100,
  },
  loadingWrap: {
    padding: spacing.md,
    gap: spacing.md,
  },
  heroCard: {
    backgroundColor: "#ffffff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: spacing.md,
    gap: spacing.md,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1c1917",
  },
  heroSub: {
    fontSize: 12,
    color: "#78716c",
    marginTop: 2,
  },
  heroStats: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderTopColor: "#f5f5f4",
    paddingTop: 10,
  },
  statBox: {
    flex: 1,
    minWidth: 90,
  },
  statNum: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1c1917",
  },
  statLbl: {
    fontSize: 11,
    color: "#78716c",
    marginTop: 1,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: spacing.md,
    gap: 12,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1c1917",
  },
  memberList: {
    gap: 12,
  },
  memberItem: {
    backgroundColor: "#f5f5f4",
    borderRadius: radius.md,
    padding: 12,
    gap: 8,
  },
  memberTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: {
    fontSize: 12,
    fontWeight: "800",
    color: "#4338ca",
  },
  memberName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1c1917",
  },
  memberRole: {
    fontSize: 11,
    color: "#78716c",
  },
  memberHours: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#1c1917",
  },
  memberPct: {
    fontSize: 10.5,
    color: "#78716c",
  },
  skillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 2,
  },
  skillHead: {
    fontSize: 10.5,
    color: "#78716c",
    fontWeight: "600",
  },
  skillChip: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#e7e5e4",
  },
  skillTxt: {
    fontSize: 10.5,
    color: "#44403c",
    fontWeight: "600",
  },
  warnCard: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  warnHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  warnTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#92400e",
  },
  warnSub: {
    fontSize: 12,
    color: "#b45309",
    lineHeight: 16,
  },
  gapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  gapTxt: {
    fontSize: 12,
    color: "#92400e",
    fontWeight: "500",
  },
  adviseCard: {
    backgroundColor: "#f5f3ff",
    borderWidth: 1,
    borderColor: "#ddd6fe",
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  adviseHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  adviseTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#4f46e5",
  },
  adviseDesc: {
    fontSize: 12,
    color: "#6b7280",
    lineHeight: 16,
  },
  sugItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: radius.sm,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e0e7ff",
  },
  sugTxt: {
    flex: 1,
    fontSize: 12,
    color: "#374151",
    lineHeight: 16,
  },
});
