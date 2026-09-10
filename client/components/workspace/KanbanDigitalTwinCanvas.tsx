/**
 * client/components/workspace/KanbanDigitalTwinCanvas.tsx
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN DIGITAL TWIN (NATIVE FALLBACK)
 *
 * Provides responsive 2D matrix projection for React Native non-web runtimes.
 * ============================================================================
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, font } from "@/theme";
import type { KanbanTwinItem, KanbanTwinMember } from "./KanbanDigitalTwinCanvas.web";

interface KanbanDigitalTwinProps {
  items: KanbanTwinItem[];
  columns: { id: string; name: string; wipLimit: number; count: number }[];
  members?: KanbanTwinMember[];
  onSelectItem?: (item: KanbanTwinItem) => void;
}

export default function KanbanDigitalTwinCanvas({
  items,
  columns,
}: KanbanDigitalTwinProps) {
  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <View style={s.titleWrap}>
          <Ionicons name="cube-outline" size={16} color={colors.primary} />
          <Text style={s.title}>Kanban Flow Topology</Text>
        </View>
      </View>

      <View style={s.grid}>
        {columns.map((col) => (
          <View key={col.id} style={s.col}>
            <Text style={s.colName} numberOfLines={1}>{col.name}</Text>
            <Text style={s.colCount}>
              {col.count}{col.wipLimit ? ` / ${col.wipLimit}` : ""}
            </Text>
          </View>
        ))}
      </View>
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
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    ...font.caption,
    fontWeight: "700",
    color: colors.text,
  },
  grid: {
    flexDirection: "row",
    gap: 8,
  },
  col: {
    flex: 1,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    alignItems: "center",
  },
  colName: {
    ...font.caption,
    fontSize: 11,
    color: colors.textFaint,
  },
  colCount: {
    ...font.h3,
    color: colors.primary,
    marginTop: 4,
  },
});
