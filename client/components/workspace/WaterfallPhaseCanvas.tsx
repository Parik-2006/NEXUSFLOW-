/**
 * client/components/workspace/WaterfallPhaseCanvas.tsx
 * Native / standard React Native fallback for Waterfall phase pipeline.
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, font } from "@/theme";
import type { PhaseNodeData } from "./WaterfallPhaseCanvas.web";

export type { PhaseNodeData };

interface WaterfallPhaseCanvasProps {
  phases: PhaseNodeData[];
  activePhaseKey?: string;
  onSelectPhase: (phaseKey: string) => void;
}

export default function WaterfallPhaseCanvas({
  phases,
  activePhaseKey,
  onSelectPhase,
}: WaterfallPhaseCanvasProps) {
  const [selectedPhase, setSelectedPhase] = useState<PhaseNodeData | null>(
    phases.find((p) => p.key === activePhaseKey) || phases[0] || null
  );

  const phaseColors = {
    cleared: colors.success,
    in_progress: colors.primary,
    pending: colors.borderStrong,
  };

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          <View style={s.iconWrap}>
            <Ionicons name="git-commit" size={18} color={colors.primary} />
          </View>
          <View>
            <Text style={s.title}>Waterfall Engineering Cascade</Text>
            <Text style={s.subTitle}>Sequential phase gate pipeline</Text>
          </View>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pipelineScroll}>
        {phases.map((p, idx) => {
          const isSelected = selectedPhase?.key === p.key;
          const nodeColor = phaseColors[p.status] || phaseColors.pending;
          return (
            <React.Fragment key={p.key}>
              <Pressable
                onPress={() => {
                  setSelectedPhase(p);
                  onSelectPhase(p.key);
                }}
                style={[s.nodeCard, isSelected && s.nodeCardSelected]}
              >
                <View style={[s.nodeCircle, { backgroundColor: nodeColor }]}>
                  <Text style={s.nodeNum}>{p.order}</Text>
                </View>
                <Text style={s.nodeLabel} numberOfLines={1}>{p.label}</Text>
                <Text style={s.nodeSub}>{p.doneCount}/{p.taskCount} done</Text>
              </Pressable>
              {idx < phases.length - 1 && (
                <View style={s.connectorWrap}>
                  <View style={[s.connectorLine, { backgroundColor: p.gatePassed ? colors.success : colors.border }]} />
                  <Ionicons name="chevron-forward" size={14} color={p.gatePassed ? colors.success : colors.textFaint} />
                </View>
              )}
            </React.Fragment>
          );
        })}
      </ScrollView>

      {selectedPhase && (
        <View style={s.detailsDrawer}>
          <View style={s.drawerHead}>
            <View style={s.drawerBadge}>
              <Text style={s.drawerBadgeTxt}>PHASE {selectedPhase.order}</Text>
            </View>
            <Text style={s.drawerTitle}>{selectedPhase.label}</Text>
            <Text style={[s.statusBadge, { color: phaseColors[selectedPhase.status] }]}>
              {selectedPhase.status.toUpperCase()}
            </Text>
          </View>

          <View style={s.drawerMetrics}>
            <View style={s.metricBox}>
              <Text style={s.metricVal}>{selectedPhase.doneCount} / {selectedPhase.taskCount}</Text>
              <Text style={s.metricLabel}>Tasks Completed</Text>
            </View>
            <View style={s.metricBox}>
              <Text style={s.metricVal}>
                {selectedPhase.taskCount ? Math.round((selectedPhase.doneCount / selectedPhase.taskCount) * 100) : 0}%
              </Text>
              <Text style={s.metricLabel}>Progress</Text>
            </View>
            <View style={s.metricBox}>
              <Text style={[s.metricVal, { color: selectedPhase.gatePassed ? colors.success : colors.warning }]}>
                {selectedPhase.gatePassed ? "Passed" : "In Review"}
              </Text>
              <Text style={s.metricLabel}>Phase Gate</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  subTitle: {
    fontSize: 11.5,
    color: colors.textMuted,
  },
  pipelineScroll: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  nodeCard: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    width: 110,
  },
  nodeCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  nodeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  nodeNum: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  nodeLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  nodeSub: {
    fontSize: 10.5,
    color: colors.textMuted,
    marginTop: 2,
  },
  connectorWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  connectorLine: {
    width: 20,
    height: 2,
  },
  detailsDrawer: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  drawerHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  drawerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  drawerBadgeTxt: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  drawerTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.text,
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: "700",
  },
  drawerMetrics: {
    flexDirection: "row",
    gap: 8,
  },
  metricBox: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: 8,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  metricVal: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  metricLabel: {
    fontSize: 10.5,
    color: colors.textMuted,
  },
});
