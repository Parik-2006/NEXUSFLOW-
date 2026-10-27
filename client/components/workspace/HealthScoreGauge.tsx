/**
 * client/components/workspace/HealthScoreGauge.tsx
 * ============================================================================
 * NEXUSFLOW V4 — SHARED CIRCULAR PROJECT HEALTH SCORE GAUGE
 *
 * Polished circular health gauge UI shared between Waterfall and Scrum.
 * Presentation-only component: NEVER calculates or mutates underlying health scores.
 * Honors methodology isolation and respects distinct scoring semantics.
 * ============================================================================
 */

import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/theme";

export interface HealthScoreGaugeProps {
  score: number | null | undefined;
  grade?: string;
  status?: string;
  assessmentScope?: string;
  methodologyLabel?: string;
  summary?: string;
  calculatedAt?: string | Date | null;
  criticalFactors?: string[];
  onRecalculate?: () => void;
  isRecalculating?: boolean;
  title?: string;
}

export default function HealthScoreGauge({
  score,
  grade = "N/A",
  status = "INSUFFICIENT_DATA",
  assessmentScope,
  methodologyLabel,
  summary,
  calculatedAt,
  criticalFactors = [],
  onRecalculate,
  isRecalculating = false,
  title = "Overall Project Health",
}: HealthScoreGaugeProps) {
  const isAvailable = score !== null && score !== undefined && !isNaN(score);

  // Derive semantic color matching established grade/severity rules
  const getScoreColor = () => {
    if (!isAvailable) return { primary: "#64748b", soft: "#f1f5f9", border: "#cbd5e1" };
    if (score >= 80) return { primary: "#16a34a", soft: "#dcfce7", border: "#86efac" };
    if (score >= 65) return { primary: "#0d9488", soft: "#ccfbf1", border: "#5eead4" };
    if (score >= 50) return { primary: "#d97706", soft: "#fef3c7", border: "#fcd34d" };
    if (score >= 35) return { primary: "#ea580c", soft: "#ffedd5", border: "#fdba74" };
    return { primary: "#dc2626", soft: "#fee2e2", border: "#fca5a5" };
  };

  const colorScheme = getScoreColor();
  const formattedStatus = (status || (isAvailable ? "HEALTHY" : "INSUFFICIENT_DATA")).replace(/_/g, " ");

  const formattedTime = calculatedAt
    ? new Date(calculatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <View style={styles.card}>
      {/* Card Header with Title, Scope & Recalculate */}
      <View style={styles.cardHeader}>
        <View style={styles.titleArea}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle}>{title}</Text>
            {assessmentScope ? (
              <View style={styles.scopeBadge}>
                <Text style={styles.scopeBadgeTxt}>{assessmentScope.toUpperCase()}</Text>
              </View>
            ) : null}
            {methodologyLabel ? (
              <View style={[styles.scopeBadge, { backgroundColor: "#f3e8ff", borderColor: "#d8b4fe" }]}>
                <Text style={[styles.scopeBadgeTxt, { color: "#7e22ce" }]}>{methodologyLabel.toUpperCase()}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {onRecalculate ? (
          <Pressable
            style={[styles.recalcBtn, isRecalculating && { opacity: 0.7 }]}
            onPress={onRecalculate}
            disabled={isRecalculating}
          >
            {isRecalculating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="sync-outline" size={15} color={colors.primary} />
            )}
            <Text style={styles.recalcTxt}>{isRecalculating ? "Recalculating..." : "Recalculate"}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Prominent Circular Gauge & Supporting Information */}
      <View style={styles.scoreRow}>
        {/* Circular Progress Ring */}
        <View style={[styles.circleOuterTrack, { borderColor: colorScheme.border }]}>
          <View style={[styles.circleInner, { borderColor: colorScheme.primary }]}>
            <Text style={[styles.scoreNum, { color: isAvailable ? colorScheme.primary : colors.textMuted }]}>
              {isAvailable ? score : "N/A"}
            </Text>
            {isAvailable ? <Text style={styles.scoreDenom}>/100</Text> : null}
          </View>
        </View>

        {/* Badges, Summary & Timestamp */}
        <View style={styles.scoreMeta}>
          <View style={styles.badgeRow}>
            <View style={[styles.gradePill, { backgroundColor: colorScheme.soft, borderColor: colorScheme.border }]}>
              <Text style={[styles.gradeTxt, { color: colorScheme.primary }]}>
                {isAvailable ? `Grade ${grade}` : "Grade N/A"}
              </Text>
            </View>

            <View style={[styles.statusPill, { backgroundColor: colorScheme.soft }]}>
              <View style={[styles.statusDot, { backgroundColor: colorScheme.primary }]} />
              <Text style={[styles.statusTxt, { color: colorScheme.primary }]}>{formattedStatus}</Text>
            </View>
          </View>

          <Text style={styles.summaryTxt}>
            {summary || "Deterministic health evaluation synthesized from backlog readiness, active constraints, and capacity metrics."}
          </Text>

          {formattedTime ? (
            <Text style={styles.timestampTxt}>
              Last calculated: {formattedTime}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Primary Contributing Health Constraints Banner */}
      {criticalFactors && criticalFactors.length > 0 ? (
        <View style={styles.criticalFactorsBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.criticalFactorsTitle}>Primary Contributing Health Constraints</Text>
            {criticalFactors.map((cf, idx) => (
              <Text key={idx} style={styles.criticalFactorItem}>• {cf}</Text>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 8,
  },
  titleArea: {
    flex: 1,
    minWidth: 200,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  scopeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  scopeBadgeTxt: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.3,
  },
  recalcBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  recalcTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },

  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  circleOuterTrack: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  circleInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreNum: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  scoreDenom: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: -3,
  },

  scoreMeta: {
    flex: 1,
    gap: 4,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  gradePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  gradeTxt: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusTxt: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  summaryTxt: {
    ...font.small,
    color: colors.text,
    marginTop: 2,
  },
  timestampTxt: {
    fontSize: 10,
    color: colors.textFaint,
  },

  criticalFactorsBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#fef2f2",
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  criticalFactorsTitle: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#dc2626",
  },
  criticalFactorItem: {
    fontSize: 11,
    color: "#b91c1c",
    lineHeight: 15,
  },
});
