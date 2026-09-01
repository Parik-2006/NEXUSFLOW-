import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Button, Card, Badge } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { API_BASE_URL } from "@/utils/api";
import { colors, spacing, radius, font } from "@/theme";

const SKILLS = ["Frontend", "Backend", "Python", "Java", "JavaScript", "React", "Node.js", "SQL", "Machine Learning", "DevOps", "Testing", "Design"];

export default function GlobalChat() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={font.h3}>Global Chat</Text>
        <View style={{ width: 32 }} />
      </View>
      <View style={s.body}>
        <Card style={{ alignItems: "center", padding: spacing.xxl }}>
          <Ionicons name="chatbubbles-outline" size={48} color={colors.textFaint} />
          <Text style={[font.h3, { marginTop: spacing.md }]}>Coming Soon</Text>
          <Text style={[s.sub, { marginTop: spacing.sm }]}>Global chat lets you communicate with all NEXUSFLOW users across teams.</Text>
          <Button title="Back to Dashboard" icon="arrow-back" onPress={() => router.back()} style={{ marginTop: spacing.lg }} />
        </Card>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  body: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl },
  sub: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
});
