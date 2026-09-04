/**
 * client/components/MethodologyWipBanner.tsx
 * ============================================================================
 * Polished Work-in-Progress (WIP) banner and view for Scrum, Kanban, and Hybrid
 * methodologies in NexusFlow V4.
 *
 * Ensures users know what is planned, why Waterfall is the active baseline,
 * and allows 1-click fallback to Waterfall.
 * ============================================================================
 */

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MethodologyConfig, getMethodologyConfig } from "@/utils/methodologyConfig";
import { colors, spacing, radius, font } from "@/theme";

interface MethodologyWipBannerProps {
  methodology: string;
  onSwitchToWaterfall?: () => void;
  inline?: boolean;
}

export default function MethodologyWipBanner({
  methodology,
  onSwitchToWaterfall,
  inline = false,
}: MethodologyWipBannerProps) {
  const config = getMethodologyConfig(methodology);
  const wip = config.wipDetails;

  if (config.status === "ACTIVE" || !wip) {
    return null;
  }

  if (inline) {
    return (
      <View style={s.inlineCard}>
        <View style={s.inlineLeft}>
          <View style={s.wipBadge}>
            <Text style={s.wipBadgeText}>WORK IN PROGRESS</Text>
          </View>
          <Text style={s.inlineTitle}>{config.name} Environment ({wip.targetRelease})</Text>
          <Text style={s.inlineDesc}>Waterfall is currently the primary active methodology.</Text>
        </View>
        {onSwitchToWaterfall && (
          <Pressable onPress={onSwitchToWaterfall} style={s.inlineBtn}>
            <Ionicons name="swap-horizontal" size={14} color="#fff" />
            <Text style={s.inlineBtnText}>Use Waterfall</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.card}>
        <View style={s.headerRow}>
          <View style={s.iconWrap}>
            <Ionicons name="construct-outline" size={28} color={colors.accent || "#b45309"} />
          </View>
          <View style={s.titleWrap}>
            <View style={s.badgeRow}>
              <View style={s.wipBadge}>
                <Text style={s.wipBadgeText}>WORK IN PROGRESS</Text>
              </View>
              <View style={s.releaseBadge}>
                <Text style={s.releaseBadgeText}>{wip.targetRelease}</Text>
              </View>
            </View>
            <Text style={s.headline}>{wip.headline}</Text>
          </View>
        </View>

        <Text style={s.description}>{wip.description}</Text>

        <View style={s.featuresSection}>
          <Text style={s.featuresHeader}>PLANNED CAPABILITIES</Text>
          <View style={s.featureList}>
            {wip.previewFeatures.map((feat, idx) => (
              <View key={idx} style={s.featureItem}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.success || "#15803d"} />
                <Text style={s.featureText}>{feat}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.calloutBox}>
          <Ionicons name="information-circle" size={20} color={colors.primary || "#3b82f6"} />
          <Text style={s.calloutText}>
            NexusFlow V4 implements the complete end-to-end Waterfall engineering environment (Requirements, System Design, Implementation, QA, and Deployment).
          </Text>
        </View>

        {onSwitchToWaterfall && (
          <Pressable onPress={onSwitchToWaterfall} style={s.actionButton}>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
            <Text style={s.actionButtonText}>Switch to Waterfall Environment</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg || 16,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    maxWidth: 620,
    width: "100%",
    backgroundColor: colors.surface || "#fff",
    borderRadius: radius.lg || 16,
    borderWidth: 1,
    borderColor: colors.border || "#e2e8f0",
    padding: spacing.xl || 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.md || 12,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.md || 12,
    backgroundColor: "#fef3c7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md || 12,
  },
  titleWrap: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  wipBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#fed7aa",
  },
  wipBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9a3412",
    letterSpacing: 0.5,
  },
  releaseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  releaseBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#475569",
  },
  headline: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text || "#1e293b",
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted || "#64748b",
    marginBottom: spacing.lg || 16,
  },
  featuresSection: {
    backgroundColor: "#f8fafc",
    borderRadius: radius.md || 12,
    padding: spacing.md || 12,
    marginBottom: spacing.lg || 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  featuresHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  featureList: {
    gap: 8,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  featureText: {
    fontSize: 13,
    color: colors.text || "#334155",
  },
  calloutBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#eff6ff",
    borderRadius: radius.md || 12,
    padding: spacing.md || 12,
    marginBottom: spacing.lg || 16,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  calloutText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#1e40af",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary || "#2563eb",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.md || 10,
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  // Inline card styles
  inlineCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: radius.md || 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: spacing.md || 16,
    marginVertical: 8,
  },
  inlineLeft: {
    flex: 1,
    marginRight: 12,
  },
  inlineTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#92400e",
    marginTop: 2,
  },
  inlineDesc: {
    fontSize: 12,
    color: "#b45309",
    marginTop: 2,
  },
  inlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#d97706",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  inlineBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});
