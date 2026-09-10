/**
 * client/components/workspace/ScrumDigitalTwinCanvas.tsx
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM DIGITAL TWIN (NATIVE FALLBACK)
 *
 * Clean 2D responsive presentation for mobile/native platforms where Three.js WebGL
 * canvas may be restricted. Provides the same rich data insights as the 3D twin.
 * ============================================================================
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, font } from "@/theme";
import type { DigitalTwinTask, DigitalTwinMember } from "./ScrumDigitalTwinCanvas.web";

interface ScrumDigitalTwinCanvasProps {
  tasks: DigitalTwinTask[];
  members: DigitalTwinMember[];
  sprintGoal?: string;
  sprintNumber?: number;
  onSelectTask?: (task: DigitalTwinTask) => void;
}

export default function ScrumDigitalTwinCanvas({
  tasks,
  members,
  sprintGoal,
  sprintNumber = 1,
  onSelectTask,
}: ScrumDigitalTwinCanvasProps) {
  const [selectedTask, setSelectedTask] = useState<DigitalTwinTask | null>(null);

  const sprintTasks = tasks.filter((t) => t.inSprint);
  const backlogTasks = tasks.filter((t) => !t.inSprint);

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={s.badgeIcon}>
              <Ionicons name="cube-outline" size={15} color={colors.primary} />
            </View>
            <Text style={s.title}>Scrum Digital Twin Overview</Text>
            <View style={s.sprintBadge}>
              <Text style={s.sprintBadgeText}>Sprint {sprintNumber}</Text>
            </View>
          </View>
          <Text style={s.subTitle} numberOfLines={1}>
            {sprintGoal ? `Goal: ${sprintGoal}` : "Active Sprint & Backlog Twin Projection"}
          </Text>
        </View>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Sprint Ring Committed Tasks ({sprintTasks.length})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scrollRow}>
          {sprintTasks.map((t) => (
            <Pressable
              key={t._id}
              onPress={() => {
                setSelectedTask(t);
                if (onSelectTask) onSelectTask(t);
              }}
              style={[s.taskCard, selectedTask?._id === t._id && s.taskCardSelected]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={s.taskPoints}>{t.storyPoints} pts</Text>
                <View style={[s.statusPill, { backgroundColor: t.status === "done" ? "#dcfce7" : "#dbeafe" }]}>
                  <Text style={[s.statusTxt, { color: t.status === "done" ? "#16a34a" : "#2563eb" }]}>{t.status}</Text>
                </View>
              </View>
              <Text style={s.taskTitle} numberOfLines={2}>{t.title}</Text>
              <Text style={s.taskMeta}>Priority Score: {t.priorityScore}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Team Capacity Utilization</Text>
        <View style={s.memberGrid}>
          {members.map((m) => (
            <View key={m.userId} style={s.memberCard}>
              <Text style={s.memberName}>{m.name}</Text>
              <Text style={s.memberRole}>{m.role}</Text>
              <Text style={[s.memberHours, m.utilization > 100 && { color: "#dc2626" }]}>
                {m.assignedHours}h / {m.capacityHours}h ({m.utilization}%)
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: spacing.md,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badgeIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#f5f3ff",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1c1917",
  },
  sprintBadge: {
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  sprintBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4338ca",
  },
  subTitle: {
    fontSize: 12,
    color: "#78716c",
    marginTop: 2,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#44403c",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scrollRow: {
    gap: 10,
    paddingVertical: 4,
  },
  taskCard: {
    width: 170,
    backgroundColor: "#f5f5f4",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: radius.md,
    padding: 10,
    gap: 6,
  },
  taskCardSelected: {
    borderColor: "#6366f1",
    backgroundColor: "#eef2ff",
  },
  taskPoints: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6366f1",
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusTxt: {
    fontSize: 9.5,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  taskTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1c1917",
    lineHeight: 16,
  },
  taskMeta: {
    fontSize: 10,
    color: "#78716c",
  },
  memberGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  memberCard: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: "#f5f5f4",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    minWidth: 120,
  },
  memberName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1c1917",
  },
  memberRole: {
    fontSize: 10.5,
    color: "#78716c",
    marginTop: 1,
  },
  memberHours: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0284c7",
    marginTop: 4,
  },
});
