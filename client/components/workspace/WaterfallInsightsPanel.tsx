import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import UnifiedProjectHealthPanel from "@/components/workspace/UnifiedProjectHealthPanel";
import RiskPanel from "@/components/workspace/RiskPanel";
import GraphPanel from "@/components/workspace/GraphPanel";
import ProjectLearningPanel from "@/components/workspace/ProjectLearningPanel";
import CapabilityIntelligencePanel from "@/components/workspace/CapabilityIntelligencePanel";
import { useTeamTasks } from "@/hooks/useTeamTasks";
import { colors, spacing, radius, font } from "@/theme";

type InsightSubTab = "health" | "learning" | "capability" | "risks" | "dag";

interface InsightTabOption {
  key: InsightSubTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const SUB_TABS: InsightTabOption[] = [
  { key: "health",    label: "Project Health",icon: "shield-checkmark-outline", color: colors.primary },
  { key: "learning",  label: "Learning Loop", icon: "school-outline",           color: colors.greedy },
  { key: "capability",label: "Capability",    icon: "people-outline",           color: colors.branch },
  { key: "risks",     label: "Risk Radar",    icon: "alert-circle-outline",     color: colors.warning },
  { key: "dag",       label: "Dependency DAG",icon: "git-network-outline",       color: colors.topo },
];

export default function WaterfallInsightsPanel({
  teamId,
  projectId,
  onNavigatePlan,
}: {
  teamId: string;
  projectId?: string;
  onNavigatePlan?: () => void;
}) {
  const { rawTasks, loading: tasksLoading } = useTeamTasks(teamId);
  const [activeSubTab, setActiveSubTab] = useState<InsightSubTab>("health");

  // Mode: "example" (demonstration preview) or "actual" (live project data)
  const hasLiveTasks = rawTasks.length > 0;
  const [dataMode, setDataMode] = useState<"example" | "actual">(hasLiveTasks ? "actual" : "example");

  useEffect(() => {
    if (hasLiveTasks) {
      setDataMode("actual");
    }
  }, [hasLiveTasks]);

  const isDemoMode = dataMode === "example" && !hasLiveTasks;

  return (
    <View style={s.container}>
      {/* Data Provenance Indicator Banner */}
      <View style={[s.provenanceBanner, isDemoMode ? s.provenanceBannerDemo : s.provenanceBannerLive]}>
        <View style={s.provenanceLeft}>
          <View style={[s.provenanceIconCircle, isDemoMode ? s.provenanceIconDemo : s.provenanceIconLive]}>
            <Ionicons
              name={isDemoMode ? "flask-outline" : "shield-checkmark"}
              size={18}
              color={isDemoMode ? colors.accentDark : colors.success}
            />
          </View>
          <View style={{ flex: 1, minWidth: 200 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={s.provenanceTitle}>
                {isDemoMode ? "DEMONSTRATION & EXAMPLE INSIGHTS" : "LIVE PERSISTED PROJECT METRICS"}
              </Text>
              <View style={[s.provenanceBadge, isDemoMode ? s.provenanceBadgeDemo : s.provenanceBadgeLive]}>
                <Text style={[s.provenanceBadgeTxt, isDemoMode ? s.provenanceBadgeTxtDemo : s.provenanceBadgeTxtLive]}>
                  {isDemoMode ? "EXAMPLE MODE" : "ACTUAL DATA"}
                </Text>
              </View>
            </View>
            <Text style={s.provenanceDesc}>
              {isDemoMode
                ? "This Waterfall project has not generated execution tasks yet. Insights below display illustrative example data to preview analytical features. Real findings will activate once artifacts are analyzed, finalized, and converted to tasks."
                : `Analytical views below are computed directly from ${rawTasks.length} authoritative persisted project tasks, team assignments, and dependency models.`}
            </Text>
          </View>
        </View>

        {!hasLiveTasks && (
          <View style={s.modeToggleGroup}>
            <Pressable
              onPress={() => setDataMode("example")}
              style={[s.modeToggleBtn, dataMode === "example" && s.modeToggleBtnActive]}
            >
              <Ionicons
                name="eye-outline"
                size={12}
                color={dataMode === "example" ? colors.primary : colors.textMuted}
              />
              <Text style={[s.modeToggleBtnTxt, dataMode === "example" && s.modeToggleBtnTxtActive]}>
                Example Demo
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setDataMode("actual")}
              style={[s.modeToggleBtn, dataMode === "actual" && s.modeToggleBtnActive]}
            >
              <Ionicons
                name="server-outline"
                size={12}
                color={dataMode === "actual" ? colors.primary : colors.textMuted}
              />
              <Text style={[s.modeToggleBtnTxt, dataMode === "actual" && s.modeToggleBtnTxtActive]}>
                Actual Project
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Sub-navigation bar */}
      <View style={s.navBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.navList}
        >
          {SUB_TABS.map((tab) => {
            const isActive = activeSubTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveSubTab(tab.key)}
                style={[
                  s.navItem,
                  isActive && {
                    backgroundColor: tab.color + "18",
                    borderColor: tab.color + "44",
                  },
                ]}
              >
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={isActive ? tab.color : colors.textMuted}
                />
                <Text
                  style={[
                    s.navLabel,
                    isActive && { color: tab.color, fontWeight: "700" },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Content Area */}
      <View style={s.content}>
        {dataMode === "actual" && !hasLiveTasks && !tasksLoading ? (
          <View style={s.emptyActualContainer}>
            <View style={s.emptyActualCard}>
              <View style={s.emptyActualIconCircle}>
                <Ionicons name="analytics-outline" size={32} color={colors.primary} />
              </View>
              <Text style={font.h2}>No Persisted Project Tasks Available Yet</Text>
              <Text style={s.emptyActualDesc}>
                Actual project insights require persisted tasks, dependencies, and team execution evidence.
                Upload your project documents and finalize the Waterfall plan in Overview to generate active tasks.
              </Text>
              {onNavigatePlan && (
                <Pressable style={s.setupBtn} onPress={onNavigatePlan}>
                  <Ionicons name="document-text-outline" size={16} color="#fff" />
                  <Text style={s.setupBtnTxt}>Open Overview → Project Setup & Plan</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : (
          <>
            {activeSubTab === "health" && (
              <UnifiedProjectHealthPanel projectId={projectId || teamId} teamId={teamId} />
            )}
            {activeSubTab === "learning" && (
              <ProjectLearningPanel projectId={projectId || teamId} />
            )}
            {activeSubTab === "capability" && (
              <CapabilityIntelligencePanel projectId={projectId || teamId} />
            )}
            {activeSubTab === "risks" && (
              <RiskPanel teamId={teamId} projectId={projectId} />
            )}
            {activeSubTab === "dag" && <GraphPanel teamId={teamId} />}
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  provenanceBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  provenanceBannerDemo: {
    backgroundColor: "#FBF7EE",
    borderBottomColor: "#EAE0CE",
  },
  provenanceBannerLive: {
    backgroundColor: colors.successSoft,
    borderBottomColor: colors.success + "33",
  },
  provenanceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 260,
  },
  provenanceIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  provenanceIconDemo: {
    backgroundColor: "#F3EAD5",
  },
  provenanceIconLive: {
    backgroundColor: colors.surface,
  },
  provenanceTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: colors.text,
  },
  provenanceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  provenanceBadgeDemo: {
    backgroundColor: "#F3E8CF",
    borderColor: "#D9C79E",
  },
  provenanceBadgeLive: {
    backgroundColor: colors.success + "22",
    borderColor: colors.success + "55",
  },
  provenanceBadgeTxt: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  provenanceBadgeTxtDemo: {
    color: "#8C6B1B",
  },
  provenanceBadgeTxtLive: {
    color: colors.success,
  },
  provenanceDesc: {
    fontSize: 11.5,
    color: colors.textMuted,
    lineHeight: 16,
    marginTop: 2,
  },
  modeToggleGroup: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
    gap: 2,
  },
  modeToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  modeToggleBtnActive: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeToggleBtnTxt: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  modeToggleBtnTxtActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  navBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  navList: {
    gap: 8,
    alignItems: "center",
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: colors.surfaceAlt,
  },
  navLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  content: {
    flex: 1,
  },
  emptyActualContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.bg,
  },
  emptyActualCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    maxWidth: 500,
    width: "100%",
  },
  emptyActualIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyActualDesc: {
    ...font.body,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  setupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  setupBtnTxt: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
});
