/**
 * client/components/workspace/ScrumOverviewPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM OVERVIEW (EXECUTIVE DASHBOARD & SETUP/PLAN)
 *
 * Implements:
 *   1. Internal Segmented Navigation:
 *      - Executive Dashboard (Team Control Center)
 *      - Project Setup & Plan (Artifacts, AI Analysis, Suggestion Review, Backlog, Sprint Planning)
 *   2. Unobtrusive Scrum Guidance Banner (New to Scrum? Open Guide)
 *   3. Executive Project Summary & Health State
 *   4. Active Sprint Command Hero & Metrics (or explicit safe empty state)
 *   5. Three.js Scrum Digital Twin Spatial Projection
 *   6. Backlog Status Distribution & Capacity Balance
 *   7. Blocker & Delivery Risk Summary
 *   8. Quick Jumps to the 8 Primary Scrum Workspace Tabs
 * ============================================================================
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { useToast } from "@/components/feedback";
import { Card, ProgressBar, Badge, SkeletonCard, Button } from "@/components/ui";
import ScrumDigitalTwinCanvas from "./ScrumDigitalTwinCanvas";
import ScrumGuideBanner from "@/components/ScrumGuideBanner";
import ScrumSetupPlanPanel from "./ScrumSetupPlanPanel";
import { fetchScrumOverview } from "@/services/scrumApiService";
import { colors, spacing, radius, font } from "@/theme";

interface ScrumOverviewPanelProps {
  teamId: string;
  projectId?: string;
  initialSection?: string | null;
  onClearSection?: () => void;
  onNavigate: (tab: string) => void;
}

// 7 primary jumps from Overview to other main tabs
const SCRUM_JUMPS: { tab: string; icon: keyof typeof Ionicons.glyphMap; label: string; desc: string; color: string }[] = [
  { tab: "advisor", icon: "sparkles",           label: "Project AI",    desc: "Context-Aware Assistant", color: colors.accent },
  { tab: "team",    icon: "people",             label: "Team",          desc: "Roles & Workload Balance",color: colors.branch },
  { tab: "tasks",   icon: "list",               label: "Tasks",         desc: "Sprint Execution Board",  color: colors.greedy },
  { tab: "insights",icon: "analytics",          label: "Insights",      desc: "6 Analytical Subtabs",   color: colors.merge },
  { tab: "retro",   icon: "refresh-circle",     label: "Retrospective", desc: "Review & Action Items",   color: "#059669" },
  { tab: "chat",    icon: "chatbubbles",        label: "Chats",         desc: "Team Collaboration",      color: colors.info },
  { tab: "github",  icon: "logo-github",        label: "GitHub",        desc: "Code & PR Intelligence",  color: colors.primary },
];

export default function ScrumOverviewPanel({
  teamId,
  projectId,
  initialSection,
  onClearSection,
  onNavigate,
}: ScrumOverviewPanelProps) {
  const { token, user } = useAuth();
  const { team } = useTeam(teamId);
  const toast = useToast();

  const [activeSegment, setActiveSegment] = useState<"dashboard" | "plan">(
    initialSection === "plan" ? "plan" : "dashboard"
  );
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (initialSection === "plan") {
      setActiveSegment("plan");
      if (onClearSection) onClearSection();
    }
  }, [initialSection, onClearSection]);

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
  const hasActiveSprint = !!currentSprint && (currentSprint.status === "ACTIVE" || currentSprint.status === "PLANNING");
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

  // Safe completion calculation: never calculate 0 of 0 as 100%
  const totalTasks = metrics.tasksCount?.total || 0;
  const doneTasks = metrics.tasksCount?.done || 0;
  const sprintProgressRatio = totalTasks > 0 ? doneTasks / totalTasks : 0;
  const sprintProgressPct = Math.round(sprintProgressRatio * 100);

  // Digital Twin projection data
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

  const resolvedProjectId = projectId || data?.project?._id || team?.activeProjectId || teamId;

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* ── Internal Segmented Navigation ────────────────────────────────────── */}
      <View style={s.segmentNavWrap}>
        <Pressable
          style={[s.segmentBtn, activeSegment === "dashboard" && s.segmentBtnActive]}
          onPress={() => setActiveSegment("dashboard")}
        >
          <Ionicons
            name="grid"
            size={15}
            color={activeSegment === "dashboard" ? "#4F46E5" : colors.textMuted}
          />
          <Text style={[s.segmentBtnTxt, activeSegment === "dashboard" && s.segmentBtnTxtActive]}>
            Executive Dashboard
          </Text>
        </Pressable>

        <Pressable
          style={[s.segmentBtn, activeSegment === "plan" && s.segmentBtnActive]}
          onPress={() => setActiveSegment("plan")}
        >
          <Ionicons
            name="document-text"
            size={15}
            color={activeSegment === "plan" ? "#4F46E5" : colors.textMuted}
          />
          <Text style={[s.segmentBtnTxt, activeSegment === "plan" && s.segmentBtnTxtActive]}>
            Project Setup & Plan
          </Text>
          <View style={s.segmentBadge}>
            <Text style={s.segmentBadgeTxt}>
              {backlog.totalCount > 0 ? `${backlog.totalCount} Stories` : "Setup"}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* ── Internal View Routing ────────────────────────────────────────────── */}
      {activeSegment === "plan" ? (
        <ScrumSetupPlanPanel
          teamId={teamId}
          projectId={resolvedProjectId}
          onNavigateToTasks={() => onNavigate("tasks")}
        />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* Scrum Onboarding Guidance Banner */}
          <ScrumGuideBanner
            onNavigateTab={(tabKey, section) => {
              if (section === "plan" || tabKey === "plan") {
                setActiveSegment("plan");
              } else {
                onNavigate(tabKey);
              }
            }}
          />

          {/* ── 1. Executive Project Summary Card ────────────────────────────── */}
          <Card style={s.summaryCard}>
            <View style={s.summaryTopRow}>
              <View style={{ flex: 1 }}>
                <View style={s.badgeRow}>
                  <View style={s.methodologyBadge}>
                    <Ionicons name="rocket-outline" size={12} color="#4F46E5" />
                    <Text style={s.methodologyBadgeTxt}>SCRUM WORKSPACE</Text>
                  </View>
                  <View style={s.domainBadge}>
                    <Ionicons name="sparkles-outline" size={12} color="#059669" />
                    <Text style={s.domainBadgeTxt}>{team?.discoverySettings?.domain || "Agile Team"}</Text>
                  </View>
                  <View style={s.phaseBadge}>
                    <Text style={s.phaseBadgeTxt}>
                      {hasActiveSprint ? `SPRINT ${currentSprint.number}` : "BACKLOG PLANNING"}
                    </Text>
                  </View>
                </View>

                <Text style={s.projectHeading}>{team?.projectTitle || team?.name || "Workspace"}</Text>
                {!!team?.projectDescription && (
                  <Text style={s.projectDesc} numberOfLines={2}>{team.projectDescription}</Text>
                )}
              </View>

              <View style={s.progressGauge}>
                <Text style={s.progressGaugePct}>
                  {hasActiveSprint ? `${sprintProgressPct}%` : "—"}
                </Text>
                <Text style={s.progressGaugeLbl}>
                  {hasActiveSprint ? "SPRINT PROGRESS" : "NO SPRINT"}
                </Text>
              </View>
            </View>

            {hasActiveSprint && (
              <View style={s.progressWrap}>
                <ProgressBar
                  value={sprintProgressRatio}
                  color={sprintProgressRatio === 1 ? colors.success : "#4F46E5"}
                  height={8}
                />
              </View>
            )}

            <View style={s.statusMetricsRow}>
              <View style={s.metaPill}>
                <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                <Text style={s.metaPillTxt}>
                  {team?.members?.length === 1 ? "1 Engineer" : `${team?.members?.length || 1} Engineers`}
                </Text>
              </View>
              <View style={s.metaPill}>
                <Ionicons name="list-circle-outline" size={14} color={colors.textMuted} />
                <Text style={s.metaPillTxt}>{backlog.totalCount} Backlog Stories</Text>
              </View>
              <View style={s.metaPill}>
                <Ionicons name="flag-outline" size={14} color={colors.textMuted} />
                <Text style={s.metaPillTxt}>
                  {hasActiveSprint ? `Sprint ${currentSprint.number} Active` : "Planning Next Sprint"}
                </Text>
              </View>
            </View>
          </Card>

          {/* ── 2. Active Sprint Command Hero or Clean Empty State ────────────── */}
          {hasActiveSprint ? (
            <View style={s.sprintHero}>
              <View style={s.heroTop}>
                <View style={s.heroBadge}>
                  <Ionicons name="rocket" size={14} color="#4F46E5" />
                  <Text style={s.heroBadgeTxt}>
                    SPRINT {String(currentSprint.number).padStart(2, "0")} — {currentSprint.name}
                  </Text>
                </View>
                <View style={s.statusPill}>
                  <View style={s.liveDot} />
                  <Text style={s.statusPillTxt}>{currentSprint.status.toUpperCase()}</Text>
                </View>
              </View>

              <Text style={s.heroTitle}>{currentSprint.goal || "No Sprint Goal defined"}</Text>

              <View style={s.heroDatesRow}>
                <View style={s.datePill}>
                  <Ionicons name="calendar-outline" size={13} color="#4338CA" />
                  <Text style={s.datePillTxt}>
                    {currentSprint.startDate ? new Date(currentSprint.startDate).toLocaleDateString() : "Started"} →{" "}
                    {currentSprint.endDate ? new Date(currentSprint.endDate).toLocaleDateString() : "End of Sprint"}
                  </Text>
                </View>
                {currentSprint.daysRemaining !== undefined && (
                  <View style={[s.datePill, { backgroundColor: currentSprint.daysRemaining <= 3 ? "#FEE2E2" : "#E0E7FF" }]}>
                    <Ionicons
                      name="time-outline"
                      size={13}
                      color={currentSprint.daysRemaining <= 3 ? "#DC2626" : "#4338CA"}
                    />
                    <Text
                      style={[
                        s.datePillTxt,
                        { color: currentSprint.daysRemaining <= 3 ? "#DC2626" : "#4338CA", fontWeight: "700" },
                      ]}
                    >
                      {currentSprint.daysRemaining} days remaining
                    </Text>
                  </View>
                )}
              </View>

              {/* Metrics Grid */}
              <View style={s.metricsGrid}>
                <View style={s.metricBox}>
                  <Text style={s.metricNum}>{metrics.totalStoryPoints || 0}</Text>
                  <Text style={s.metricLbl}>Committed Points</Text>
                </View>
                <View style={s.metricBox}>
                  <Text style={s.metricNum}>{metrics.completedStoryPoints || 0}</Text>
                  <Text style={s.metricLbl}>Completed Points</Text>
                </View>
                <View style={s.metricBox}>
                  <Text style={s.metricNum}>
                    {doneTasks}/{totalTasks}
                  </Text>
                  <Text style={s.metricLbl}>Tasks Shipped</Text>
                </View>
                <View style={s.metricBox}>
                  <Text style={[s.metricNum, metrics.blockedCount > 0 && { color: "#DC2626" }]}>
                    {metrics.blockedCount || 0}
                  </Text>
                  <Text style={s.metricLbl}>Blocked Tasks</Text>
                </View>
              </View>

              <View style={s.heroActionRow}>
                <Pressable onPress={() => onNavigate("tasks")} style={s.heroBtn}>
                  <Text style={s.heroBtnTxt}>Open Sprint Board</Text>
                  <Ionicons name="arrow-forward" size={13} color="#fff" />
                </Pressable>
                <Pressable onPress={() => onNavigate("insights")} style={s.heroOutlineBtn}>
                  <Text style={s.heroOutlineBtnTxt}>Sprint Burndown & Analytics</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={s.noSprintCard}>
              <View style={s.noSprintIcon}>
                <Ionicons name="calendar-outline" size={32} color="#4F46E5" />
              </View>
              <Text style={s.noSprintTitle}>No Active Sprint</Text>
              <Text style={s.noSprintDesc}>
                No active sprint yet. Start by preparing your Product Backlog and planning your first sprint in Project Setup & Plan.
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.md }}>
                <Button
                  title="Prepare Product Backlog"
                  icon="document-text"
                  onPress={() => setActiveSegment("plan")}
                />
                <Button
                  title="Open Tasks Board"
                  icon="list"
                  variant="outline"
                  onPress={() => onNavigate("tasks")}
                />
              </View>
            </View>
          )}

          {/* ── 3. Three.js Scrum Digital Twin ───────────────────────────────── */}
          <ScrumDigitalTwinCanvas
            tasks={twinTasks}
            members={twinMembers}
            sprintGoal={currentSprint?.goal || "Sprint Delivery"}
            sprintNumber={currentSprint?.number || 1}
          />

          {/* ── 4. High-Priority Blockers & Risks ────────────────────────────── */}
          {blockers.length > 0 && (
            <View style={s.blockerCard}>
              <View style={s.blockerHead}>
                <Ionicons name="alert-circle" size={16} color="#DC2626" />
                <Text style={s.blockerTitle}>{blockers.length} Active Blocker(s) Impeding Velocity</Text>
              </View>
              {blockers.map((b: any, idx: number) => (
                <View key={idx} style={s.blockerRow}>
                  <View style={s.blockerDot} />
                  <Text style={s.blockerTxt}>{b.title || b.description || "Unresolved impediment"}</Text>
                  {!!b.assignedTo && <Text style={s.blockerOwner}>@{b.assignedTo}</Text>}
                </View>
              ))}
            </View>
          )}

          {/* ── 5. Backlog & Capacity Distribution Grid ─────────────────────── */}
          <View style={s.twoCol}>
            {/* Backlog Summary */}
            <View style={[s.infoCard, { flex: 1 }]}>
              <View style={s.infoCardHead}>
                <Ionicons name="layers-outline" size={16} color="#4F46E5" />
                <Text style={s.infoCardTitle}>Product Backlog</Text>
              </View>
              <Text style={s.infoCardBig}>{backlog.totalCount} Stories</Text>
              <Text style={s.infoCardSub}>
                {backlog.totalStoryPoints} total story points · {backlog.readyCount} Definition of Ready satisfied
              </Text>
              <Pressable onPress={() => setActiveSegment("plan")} style={s.cardAction}>
                <Text style={s.cardActionTxt}>Manage Backlog & Plan Next Sprint →</Text>
              </Pressable>
            </View>

            {/* Team Capacity Summary */}
            <View style={[s.infoCard, { flex: 1 }]}>
              <View style={s.infoCardHead}>
                <Ionicons name="speedometer-outline" size={16} color="#059669" />
                <Text style={s.infoCardTitle}>Capacity Allocation</Text>
              </View>
              <Text style={s.infoCardBig}>{capacity.utilizationPct}% Utilized</Text>
              <Text style={s.infoCardSub}>
                {capacity.allocatedHours}h committed across {team?.members?.length || 1} team members
              </Text>
              <Pressable onPress={() => onNavigate("team")} style={s.cardAction}>
                <Text style={s.cardActionTxt}>Inspect Team Capacity →</Text>
              </Pressable>
            </View>
          </View>

          {/* ── 6. Upcoming Scrum Ceremonies ─────────────────────────────────── */}
          {events.length > 0 && (
            <View style={s.ceremonyCard}>
              <View style={s.ceremonyHead}>
                <Ionicons name="time-outline" size={16} color={colors.text} />
                <Text style={s.ceremonyTitle}>Upcoming Scrum Ceremonies & Milestones</Text>
              </View>
              <View style={s.ceremonyList}>
                {events.map((ev: any, idx: number) => (
                  <View key={idx} style={s.ceremonyItem}>
                    <Ionicons name="calendar" size={15} color="#4F46E5" style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.ceremonyItemTitle}>{ev.title}</Text>
                      <Text style={s.ceremonyItemDesc}>
                        {ev.date ? new Date(ev.date).toLocaleDateString() : "Scheduled"} · {ev.description}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── 7. Primary Navigation Quick Jumps ────────────────────────────── */}
          <View style={s.jumpsWrap}>
            <Text style={s.jumpsHeading}>Workspace Navigation</Text>
            <View style={s.jumpsGrid}>
              {SCRUM_JUMPS.map((jump) => (
                <Pressable
                  key={jump.tab}
                  onPress={() => onNavigate(jump.tab)}
                  style={s.jumpCard}
                >
                  <View style={[s.jumpIconCircle, { backgroundColor: jump.color + "16" }]}>
                    <Ionicons name={jump.icon} size={18} color={jump.color} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.jumpLabel}>{jump.label}</Text>
                    <Text style={s.jumpDesc} numberOfLines={1}>{jump.desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
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
  },
  loadingWrap: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  segmentNavWrap: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  segmentBtnActive: {
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
  },
  segmentBtnTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  segmentBtnTxtActive: {
    color: "#4F46E5",
    fontWeight: "700",
  },
  segmentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  segmentBadgeTxt: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
  },
  summaryCard: {
    padding: spacing.md,
    gap: 12,
  },
  summaryTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  methodologyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  methodologyBadgeTxt: {
    fontSize: 9,
    fontWeight: "800",
    color: "#4F46E5",
    letterSpacing: 0.5,
  },
  domainBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  domainBadgeTxt: {
    fontSize: 9,
    fontWeight: "700",
    color: "#059669",
  },
  phaseBadge: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  phaseBadgeTxt: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.textMuted,
  },
  projectHeading: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
  },
  projectDesc: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: 2,
  },
  progressGauge: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 90,
  },
  progressGaugePct: {
    fontSize: 20,
    fontWeight: "800",
    color: "#4F46E5",
  },
  progressGaugeLbl: {
    fontSize: 8,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  progressWrap: {
    marginTop: 2,
  },
  statusMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 2,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metaPillTxt: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  sprintHero: {
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 12,
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
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  heroBadgeTxt: {
    fontSize: 11,
    fontWeight: "800",
    color: "#4338CA",
    letterSpacing: 0.5,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
  },
  statusPillTxt: {
    fontSize: 9,
    fontWeight: "800",
    color: "#15803D",
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#312E81",
    lineHeight: 22,
  },
  heroDatesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  datePillTxt: {
    fontSize: 11,
    color: "#4338CA",
    fontWeight: "600",
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  metricBox: {
    flex: 1,
    minWidth: 110,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#C7D2FE",
    borderRadius: radius.md,
    padding: 10,
    alignItems: "center",
  },
  metricNum: {
    fontSize: 18,
    fontWeight: "800",
    color: "#312E81",
  },
  metricLbl: {
    fontSize: 10,
    fontWeight: "600",
    color: "#6366F1",
    marginTop: 2,
  },
  heroActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
    flexWrap: "wrap",
  },
  heroBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#4F46E5",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  heroBtnTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  heroOutlineBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  heroOutlineBtnTxt: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4338CA",
  },
  noSprintCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  noSprintIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  noSprintTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  noSprintDesc: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 440,
    lineHeight: 19,
    marginTop: 4,
  },
  blockerCard: {
    backgroundColor: "#FEF2F2",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#FECACA",
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
    color: "#991B1B",
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
    backgroundColor: "#DC2626",
  },
  blockerTxt: {
    flex: 1,
    fontSize: 12,
    color: "#7F1D1D",
    fontWeight: "500",
  },
  blockerOwner: {
    fontSize: 11,
    color: "#B91C1C",
    fontWeight: "700",
  },
  twoCol: {
    flexDirection: "row",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
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
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  infoCardBig: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  infoCardSub: {
    fontSize: 11.5,
    color: colors.textMuted,
    lineHeight: 16,
  },
  cardAction: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
  cardActionTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4F46E5",
  },
  ceremonyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text,
  },
  ceremonyList: {
    gap: 10,
  },
  ceremonyItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  ceremonyItemTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  ceremonyItemDesc: {
    fontSize: 11.5,
    color: colors.textMuted,
    lineHeight: 16,
    marginTop: 1,
  },
  jumpsWrap: {
    gap: 8,
    marginTop: spacing.sm,
  },
  jumpsHeading: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.2,
  },
  jumpsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  jumpCard: {
    flex: 1,
    minWidth: 180,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
  },
  jumpIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  jumpLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  jumpDesc: {
    fontSize: 10,
    color: colors.textMuted,
  },
});
