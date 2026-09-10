/**
 * client/components/workspace/ScrumOverviewPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM OVERVIEW DASHBOARD
 *
 * Prompt 4: Live Scrum Command Center
 *
 * Displays:
 *   1. Active Sprint Header (Number, Goal, Day progress, Timebox)
 *   2. Three.js Scrum Digital Twin (Spatial projection of Sprint & Backlog)
 *   3. Sprint Metrics & Progress Gauges (Completed, In Progress, Blocked, Remaining)
 *   4. Team Capacity & Workload Balance
 *   5. High-Priority Blockers & Cross-Sprint Dependency Alerts
 *   6. Product Backlog Summary & Sprint Readiness
 *   7. Upcoming Scrum Events (Daily Standup, Review, Retrospective)
 *   8. Quick Jumps to Scrum Environment Tabs
 * ============================================================================
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/feedback";
import { Card, ProgressBar, Badge, SkeletonCard, Button } from "@/components/ui";
import ScrumDigitalTwinCanvas from "./ScrumDigitalTwinCanvas";
import { fetchScrumOverview } from "@/services/scrumApiService";
import { colors, spacing, radius, font } from "@/theme";

interface ScrumOverviewPanelProps {
  teamId: string;
  onNavigate: (tab: string) => void;
}

export default function ScrumOverviewPanel({ teamId, onNavigate }: ScrumOverviewPanelProps) {
  const { token } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetchScrumOverview(teamId, token);
      setData(res);
    } catch (err: any) {
      toast(err.message || "Failed to load Scrum overview", "error");
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

  const currentSprint = data?.currentSprint;
  const metrics = data?.metrics || {
    completionRate: 0,
    totalStoryPoints: 0,
    completedStoryPoints: 0,
    blockedCount: 0,
    tasksCount: { todo: 0, in_progress: 0, in_review: 0, done: 0, blocked: 0, total: 0 },
  };
  const capacity = data?.capacity || { totalCapacity: 0, allocatedHours: 0, utilizationPct: 0, overloadedMembers: [] };
  const blockers = data?.blockers || [];
  const backlog = data?.backlogSummary || { totalCount: 0, totalStoryPoints: 0, readyCount: 0 };
  const events = data?.upcomingEvents || [];

  // Transform data for Digital Twin
  const twinTasks = useMemo(() => {
    if (!data) return [];
    const sTasks = (data.currentSprintTasks || []).map((t: any) => ({
      _id: t._id,
      title: t.title,
      status: t.status || "todo",
      storyPoints: t.storyPoints || 3,
      priorityScore: t.priorityScore || 50,
      assignedTo: t.assignedTo,
      dependencies: t.dependencies,
      inSprint: true,
      sprintNumber: currentSprint?.number || 1,
    }));
    const bTasks = (data.recentBacklogItems || []).map((t: any) => ({
      _id: t._id,
      title: t.title,
      status: "backlog" as const,
      storyPoints: t.storyPoints || 2,
      priorityScore: t.priorityScore || 40,
      assignedTo: t.assignedTo,
      dependencies: t.dependencies,
      inSprint: false,
    }));
    return [...sTasks, ...bTasks];
  }, [data, currentSprint]);

  const twinMembers = useMemo(() => {
    return (capacity.memberBreakdown || []).map((m: any) => ({
      userId: m.userId,
      name: m.name,
      role: m.role || "Developer",
      assignedHours: m.allocatedHours || 0,
      capacityHours: m.capacityHours || 40,
      utilization: m.utilizationPct || 0,
    }));
  }, [capacity]);

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
      {/* ── 1. Active Sprint Command Banner ─────────────────────────────────── */}
      <View style={s.sprintHero}>
        <View style={s.heroTop}>
          <View style={s.heroBadge}>
            <Ionicons name="rocket-outline" size={14} color="#4338ca" />
            <Text style={s.heroBadgeTxt}>
              {currentSprint ? `SPRINT ${String(currentSprint.number).padStart(2, "0")}` : "NO ACTIVE SPRINT"}
            </Text>
          </View>
          {currentSprint && (
            <View style={s.statusPill}>
              <View style={s.liveDot} />
              <Text style={s.statusPillTxt}>{currentSprint.status.toUpperCase()}</Text>
            </View>
          )}
        </View>

        <Text style={s.heroTitle}>
          {currentSprint?.goal || "No Sprint Goal defined yet. Head to Plan to organize Sprint 01."}
        </Text>

        {currentSprint ? (
          <View style={s.heroStatsRow}>
            <View style={s.heroStat}>
              <Text style={s.statVal}>{metrics.completionRate}%</Text>
              <Text style={s.statLbl}>Sprint Progress</Text>
            </View>
            <View style={s.heroStat}>
              <Text style={s.statVal}>
                {metrics.completedStoryPoints} / {metrics.totalStoryPoints}
              </Text>
              <Text style={s.statLbl}>Story Points Done</Text>
            </View>
            <View style={s.heroStat}>
              <Text style={s.statVal}>{capacity.utilizationPct}%</Text>
              <Text style={s.statLbl}>Capacity Used</Text>
            </View>
            <View style={s.heroStat}>
              <Text style={[s.statVal, metrics.blockedCount > 0 && { color: "#dc2626" }]}>
                {metrics.blockedCount}
              </Text>
              <Text style={s.statLbl}>Blocked Tasks</Text>
            </View>
          </View>
        ) : (
          <View style={{ marginTop: 12 }}>
            <Button
              title="Open Sprint Planning"
              icon="calendar"
              onPress={() => onNavigate("plan")}
              style={{ alignSelf: "flex-start" }}
            />
          </View>
        )}

        {currentSprint && (
          <View style={{ marginTop: 14 }}>
            <ProgressBar value={metrics.completionRate} color="#4f46e5" height={7} />
          </View>
        )}
      </View>

      {/* ── 2. Three.js Spatial Digital Twin ───────────────────────────────── */}
      <ScrumDigitalTwinCanvas
        tasks={twinTasks}
        members={twinMembers}
        sprintGoal={currentSprint?.goal}
        sprintNumber={currentSprint?.number || 1}
        onSelectTask={(t) => {
          if (t.inSprint) onNavigate("tasks");
          else onNavigate("plan");
        }}
      />

      {/* ── 3. Sprint Execution Metrics Matrix ──────────────────────────────── */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Sprint Execution Breakdown</Text>
        <Pressable onPress={() => onNavigate("tasks")} style={s.sectionLink}>
          <Text style={s.sectionLinkTxt}>Open Sprint Board</Text>
          <Ionicons name="arrow-forward" size={12} color={colors.primary} />
        </Pressable>
      </View>

      <View style={s.grid4}>
        <View style={s.metricCard}>
          <View style={[s.metricIcon, { backgroundColor: "#fef3c7" }]}>
            <Ionicons name="list" size={16} color="#d97706" />
          </View>
          <Text style={s.metricNum}>{metrics.tasksCount?.todo || 0}</Text>
          <Text style={s.metricLabel}>To Do</Text>
        </View>

        <View style={s.metricCard}>
          <View style={[s.metricIcon, { backgroundColor: "#dbeafe" }]}>
            <Ionicons name="construct" size={16} color="#2563eb" />
          </View>
          <Text style={s.metricNum}>{metrics.tasksCount?.in_progress || 0}</Text>
          <Text style={s.metricLabel}>In Progress</Text>
        </View>

        <View style={s.metricCard}>
          <View style={[s.metricIcon, { backgroundColor: "#f3e8ff" }]}>
            <Ionicons name="eye" size={16} color="#9333ea" />
          </View>
          <Text style={s.metricNum}>{metrics.tasksCount?.in_review || 0}</Text>
          <Text style={s.metricLabel}>In Review</Text>
        </View>

        <View style={s.metricCard}>
          <View style={[s.metricIcon, { backgroundColor: "#dcfce7" }]}>
            <Ionicons name="checkmark-done" size={16} color="#16a34a" />
          </View>
          <Text style={s.metricNum}>{metrics.tasksCount?.done || 0}</Text>
          <Text style={s.metricLabel}>Done</Text>
        </View>
      </View>

      {/* ── 4. Blockers & Dependency Alerts ─────────────────────────────────── */}
      {blockers.length > 0 && (
        <View style={s.blockerAlertBox}>
          <View style={s.blockerHead}>
            <Ionicons name="warning" size={18} color="#dc2626" />
            <Text style={s.blockerTitle}>Active Scrum Blockers ({blockers.length})</Text>
          </View>
          <View style={{ gap: 6, marginTop: 4 }}>
            {blockers.map((b: any) => (
              <View key={b._id} style={s.blockerRow}>
                <View style={s.blockerDot} />
                <Text style={s.blockerTxt} numberOfLines={1}>{b.title}</Text>
                {b.assignedName && <Text style={s.blockerOwner}>@{b.assignedName}</Text>}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── 5. Capacity & Backlog Readiness ─────────────────────────────────── */}
      <View style={s.twoCol}>
        {/* Capacity overview card */}
        <View style={[s.infoCard, { flex: 1 }]}>
          <View style={s.infoCardHead}>
            <Ionicons name="people-outline" size={16} color={colors.primary} />
            <Text style={s.infoCardTitle}>Team Load Balance</Text>
          </View>
          <Text style={s.infoCardBig}>
            {capacity.allocatedHours}h / {capacity.totalCapacity}h
          </Text>
          <ProgressBar value={capacity.utilizationPct} color={capacity.utilizationPct > 100 ? "#dc2626" : colors.primary} height={6} />
          <Text style={s.infoCardSub}>
            {capacity.overloadedMembers?.length > 0
              ? `⚠️ ${capacity.overloadedMembers.length} member(s) over 100% capacity`
              : "✓ Team workload is balanced for this Sprint"}
          </Text>
          <Pressable onPress={() => onNavigate("team")} style={s.cardAction}>
            <Text style={s.cardActionTxt}>Manage Capacity</Text>
          </Pressable>
        </View>

        {/* Backlog readiness card */}
        <View style={[s.infoCard, { flex: 1 }]}>
          <View style={s.infoCardHead}>
            <Ionicons name="layers-outline" size={16} color="#059669" />
            <Text style={s.infoCardTitle}>Product Backlog</Text>
          </View>
          <Text style={s.infoCardBig}>
            {backlog.totalCount} Stories ({backlog.totalStoryPoints} pts)
          </Text>
          <View style={s.readyRow}>
            <View style={s.readyDot} />
            <Text style={s.readyTxt}>{backlog.readyCount} items Sprint-Ready</Text>
          </View>
          <Text style={s.infoCardSub}>Deterministic DAA ranking available in Plan</Text>
          <Pressable onPress={() => onNavigate("plan")} style={s.cardAction}>
            <Text style={s.cardActionTxt}>Groom Backlog</Text>
          </Pressable>
        </View>
      </View>

      {/* ── 6. Upcoming Scrum Ceremonies ────────────────────────────────────── */}
      <View style={s.ceremonyCard}>
        <View style={s.ceremonyHead}>
          <Ionicons name="calendar-outline" size={16} color="#4f46e5" />
          <Text style={s.ceremonyTitle}>Scrum Ceremonies & Rhythm</Text>
        </View>
        <View style={s.ceremonyList}>
          <View style={s.ceremonyItem}>
            <Ionicons name="sunny-outline" size={18} color="#d97706" />
            <View style={{ flex: 1 }}>
              <Text style={s.ceremonyItemTitle}>Daily Standup</Text>
              <Text style={s.ceremonyItemDesc}>Daily 15-min sync on yesterday's work, today's focus & blockers</Text>
            </View>
          </View>
          <View style={s.ceremonyItem}>
            <Ionicons name="ribbon-outline" size={18} color="#0284c7" />
            <View style={{ flex: 1 }}>
              <Text style={s.ceremonyItemTitle}>Sprint Review</Text>
              <Text style={s.ceremonyItemDesc}>Inspect increment, demonstrate working features & collect feedback</Text>
            </View>
          </View>
          <View style={s.ceremonyItem}>
            <Ionicons name="refresh-circle-outline" size={18} color="#059669" />
            <View style={{ flex: 1 }}>
              <Text style={s.ceremonyItemTitle}>Sprint Retrospective</Text>
              <Text style={s.ceremonyItemDesc}>Reflect on processes, dependencies and create improvement commitments</Text>
            </View>
          </View>
        </View>
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
    paddingBottom: 100,
  },
  loadingWrap: {
    padding: spacing.md,
    gap: spacing.md,
  },
  sprintHero: {
    backgroundColor: "#ffffff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#e0e7ff",
    padding: spacing.lg,
    gap: 8,
    shadowColor: "#4338ca",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#eef2ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  heroBadgeTxt: {
    fontSize: 11,
    fontWeight: "800",
    color: "#4338ca",
    letterSpacing: 0.5,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#dcfce7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16a34a",
  },
  statusPillTxt: {
    fontSize: 10,
    fontWeight: "800",
    color: "#16a34a",
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1e1b4b",
    lineHeight: 24,
    marginTop: 4,
  },
  heroStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    flexWrap: "wrap",
    gap: 8,
  },
  heroStat: {
    minWidth: 80,
  },
  statVal: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1e1b4b",
  },
  statLbl: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1c1917",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sectionLinkTxt: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  grid4: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  metricCard: {
    flex: 1,
    minWidth: 75,
    backgroundColor: "#ffffff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  metricNum: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1c1917",
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#78716c",
  },
  blockerAlertBox: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  blockerHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  blockerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#991b1b",
  },
  blockerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  blockerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#dc2626",
  },
  blockerTxt: {
    flex: 1,
    fontSize: 12.5,
    color: "#7f1d1d",
    fontWeight: "500",
  },
  blockerOwner: {
    fontSize: 11,
    color: "#b91c1c",
    fontWeight: "700",
  },
  twoCol: {
    flexDirection: "row",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  infoCard: {
    backgroundColor: "#ffffff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: spacing.md,
    gap: 8,
    minWidth: 240,
  },
  infoCardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoCardTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#44403c",
    textTransform: "uppercase",
  },
  infoCardBig: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1c1917",
  },
  infoCardSub: {
    fontSize: 11.5,
    color: "#78716c",
    lineHeight: 16,
  },
  cardAction: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
  cardActionTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  readyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  readyDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#10b981",
  },
  readyTxt: {
    fontSize: 12,
    fontWeight: "600",
    color: "#065f46",
  },
  ceremonyCard: {
    backgroundColor: "#ffffff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: spacing.md,
    gap: 10,
  },
  ceremonyHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ceremonyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1c1917",
  },
  ceremonyList: {
    gap: 10,
  },
  ceremonyItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 4,
  },
  ceremonyItemTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1c1917",
  },
  ceremonyItemDesc: {
    fontSize: 11.5,
    color: "#78716c",
    lineHeight: 16,
    marginTop: 1,
  },
});
