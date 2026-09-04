import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Badge, EmptyState } from "@/components/ui";
import { colors, spacing, radius, font } from "@/theme";
import { API_BASE_URL } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";

export interface ProjectEventItem {
  _id: string;
  eventType: string;
  entityType: string;
  entityId?: string;
  title: string;
  description?: string;
  actorName?: string;
  source?: string;
  metadata?: any;
  timestamp: string;
}

const FILTER_PILLS = [
  { id: "all", label: "All Events" },
  { id: "requirement", label: "Requirements" },
  { id: "task", label: "Tasks" },
  { id: "phase_gate", label: "Phase Gates" },
  { id: "risk", label: "Risks" },
];

export default function ProjectEventTimeline({ projectId }: { projectId: string }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<ProjectEventItem[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");

  const fetchEvents = async () => {
    if (!projectId) return;
    try {
      const url =
        activeFilter === "all"
          ? `${API_BASE_URL}/api/projects/${projectId}/events?limit=50`
          : `${API_BASE_URL}/api/projects/${projectId}/events?limit=50&entityType=${activeFilter}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.events)) {
        setEvents(data.events);
      }
    } catch (err) {
      console.error("Failed to load project events:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [projectId, activeFilter]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEvents();
  };

  const getEventIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    if (type.includes("PHASE")) return "git-network-outline";
    if (type.includes("REQUIREMENT")) return "document-text-outline";
    if (type.includes("TASK")) return "checkmark-circle-outline";
    if (type.includes("RISK")) return "shield-outline";
    if (type.includes("DAA") || type.includes("CRITICAL")) return "analytics-outline";
    return "time-outline";
  };

  const getEventColor = (type: string) => {
    if (type.includes("BLOCKED") || type.includes("DELETED")) return colors.danger;
    if (type.includes("OVERRIDDEN") || type.includes("RISK")) return colors.warning;
    if (type.includes("COMPLETED") || type.includes("APPROVED")) return colors.success;
    if (type.includes("REQUIREMENT")) return "#4F46E5";
    return colors.primary;
  };

  return (
    <View style={s.container}>
      {/* Filter Row */}
      <View style={s.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {FILTER_PILLS.map((p) => {
            const active = activeFilter === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setActiveFilter(p.id)}
                style={[s.pill, active && s.pillActive]}
              >
                <Text style={[s.pillText, active && s.pillTextActive]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Event Timeline Content */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.loadingText}>Loading project audit trail...</Text>
        </View>
      ) : events.length === 0 ? (
        <EmptyState
          icon="time"
          title="No Project Events Logged"
          message="Actions, requirement updates, phase transitions, and calculations will appear here."
        />
      ) : (
        <ScrollView
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {events.map((e, idx) => {
            const color = getEventColor(e.eventType);
            const icon = getEventIcon(e.eventType);
            const timeStr = new Date(e.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            const dateStr = new Date(e.timestamp).toLocaleDateString([], {
              month: "short",
              day: "numeric",
            });

            return (
              <View key={e._id || idx} style={s.eventRow}>
                {/* Timeline node & rail */}
                <View style={s.timelineCol}>
                  <View style={[s.iconCircle, { backgroundColor: color + "18", borderColor: color + "44" }]}>
                    <Ionicons name={icon} size={15} color={color} />
                  </View>
                  {idx < events.length - 1 && <View style={s.timelineRail} />}
                </View>

                {/* Event Card */}
                <View style={s.eventCard}>
                  <View style={s.cardHeader}>
                    <Text style={s.eventTitle}>{e.title}</Text>
                    <Text style={s.eventTime}>{dateStr} · {timeStr}</Text>
                  </View>
                  {!!e.description && (
                    <Text style={s.eventDesc}>{e.description}</Text>
                  )}
                  <View style={s.cardFooter}>
                    <Text style={s.actorName}>By {e.actorName || "System"}</Text>
                    <Badge label={e.entityType.toUpperCase()} color={colors.surfaceAlt} />
                  </View>
                </View>
              </View>
            );
          })}
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
  filterRow: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.primary + "18",
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  pillTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  listContent: {
    padding: spacing.md,
    gap: 2,
  },
  eventRow: {
    flexDirection: "row",
    gap: 12,
  },
  timelineCol: {
    alignItems: "center",
    width: 32,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  timelineRail: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  eventCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  eventTime: {
    fontSize: 10,
    color: colors.textMuted,
  },
  eventDesc: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 17,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actorName: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500",
  },
});
