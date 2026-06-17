/**
 * dashboard.tsx  —  Enhanced with DAA Intelligent Task Recommendation
 * ===================================================================
 * Original feature (team list) is fully preserved on the first tab.
 * A new "Recommend" tab surfaces the DAA engine for the most recently
 * joined team.
 *
 * Architecture change: View switches between two sub-screens using a
 * lightweight local state toggle — no new router dependency introduced.
 */

import {
  View, Text, FlatList, ActivityIndicator,
  StyleSheet, Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useTeams } from "@/hooks/useTeams";
import TeamCard from "@/components/TeamCard";
import RecommendationPanel from "@/components/RecommendationPanel";
import { useState } from "react";

type Tab = "teams" | "recommend";

export default function Dashboard() {
  const { teams, loading, error } = useTeams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("teams");

  // Use the first team as the recommendation context (most recently joined/created).
  const primaryTeamId = teams?.[0]?._id ?? null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text>Couldn't load teams.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Tab bar ──────────────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        <TabButton label="Your Teams"   active={activeTab === "teams"}     onPress={() => setActiveTab("teams")} />
        <TabButton label="⚡ Recommend" active={activeTab === "recommend"} onPress={() => setActiveTab("recommend")} />
      </View>

      {/* ── Teams list (original, unchanged) ─────────────────────────── */}
      {activeTab === "teams" && (
        <FlatList
          contentContainerStyle={styles.list}
          data={teams}
          keyExtractor={(t) => t._id}
          renderItem={({ item }) => (
            <TeamCard team={item} onPress={() => router.push(`/chat/${item._id}`)} />
          )}
          ListHeaderComponent={<Text style={styles.h}>Your Teams</Text>}
          ListEmptyComponent={<Text style={styles.empty}>No teams yet.</Text>}
        />
      )}

      {/* ── DAA Recommendation panel ──────────────────────────────────── */}
      {activeTab === "recommend" && (
        primaryTeamId
          ? <RecommendationPanel teamId={primaryTeamId} />
          : <View style={styles.center}>
              <Text style={styles.empty}>Join or create a team first to see recommendations.</Text>
            </View>
      )}
    </View>
  );
}

function TabButton({
  label, active, onPress,
}: {
  label: string; active: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.tabBtn, active && styles.tabBtnActive]}
      onPress={onPress}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container    : { flex: 1, backgroundColor: "#f9fafb" },
  center       : { flex: 1, justifyContent: "center", alignItems: "center" },
  list         : { padding: 16, gap: 12 },
  h            : { fontSize: 24, fontWeight: "800", marginBottom: 8 },
  empty        : { textAlign: "center", color: "#667085", marginTop: 40, paddingHorizontal: 24 },

  tabBar       : { flexDirection: "row", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  tabBtn       : { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabBtnActive : { borderBottomWidth: 2, borderBottomColor: "#6366f1" },
  tabLabel     : { fontSize: 14, fontWeight: "600", color: "#6b7280" },
  tabLabelActive: { color: "#6366f1" },
});
