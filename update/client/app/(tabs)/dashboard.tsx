import { View, Text, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTeams } from "@/hooks/useTeams";
import { useTaskAnalytics } from "@/hooks/useTaskAnalytics";
import TeamCard from "@/components/TeamCard";
import SortComparisonCard from "@/components/SortComparisonCard";

export default function Dashboard() {
  const { teams, loading, error } = useTeams();
  const router = useRouter();

  // DAA: Task Analytics Engine — Bubble Sort vs Merge Sort comparison for
  // the first team with tasks (representative sample for the dashboard).
  const analyticsTeamId = teams.find((t) => t.taskCount > 0)?._id;
  const { analytics, loading: analyticsLoading } = useTaskAnalytics(analyticsTeamId);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  if (error) return <View style={styles.center}><Text>Couldn't load teams.</Text></View>;

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={teams}
      keyExtractor={(t) => t._id}
      renderItem={({ item }) => (
        <TeamCard team={item} onPress={() => router.push(`/chat/${item._id}`)} />
      )}
      ListHeaderComponent={
        <>
          <Text style={styles.h}>Your Teams</Text>
          {analyticsTeamId && !analyticsLoading && analytics && (
            <View style={styles.analyticsWrap}>
              <SortComparisonCard analytics={analytics} />
            </View>
          )}
        </>
      }
      ListEmptyComponent={<Text style={styles.empty}>No teams yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16, gap: 12 },
  h: { fontSize: 24, fontWeight: "800", marginBottom: 8 },
  analyticsWrap: { marginBottom: 12 },
  empty: { textAlign: "center", color: "#667085", marginTop: 40 },
});
