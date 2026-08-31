/**
 * SkillMatrix.tsx — Feature 5: Team Member Skill Matrix.
 * ---------------------------------------------------------------------------------
 * A visual member × skill matrix with proportional bars and a per-member top-skill
 * highlight.
 *
 * FIX 2 RULES:
 * 1. Users can edit ONLY THEIR OWN skills. The pencil icon only renders for the
 *    current user's row.
 * 2. Teammate names are clickable to view their read-only profile.
 * 3. 1–10 rating scale maintained.
 */
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, avatarColor } from "@/theme";

const SKILLS = ["frontend", "backend", "devops", "design", "ml", "testing"] as const;
const SHORT: Record<string, string> = { frontend: "FE", backend: "BE", devops: "Ops", design: "UX", ml: "ML", testing: "QA" };

export type SkillMatrixMember = {
  userId: string;
  name?: string;
  avatar?: string;
  role?: string;
  skills?: Record<string, number>;
};

export default function SkillMatrix({
  members,
  currentUserId,
  currentUserName,
  onEditMember,
  onViewMemberProfile,
}: {
  members: SkillMatrixMember[];
  currentUserId?: string;
  currentUserName?: string;
  onEditMember?: (member: SkillMatrixMember) => void;
  onViewMemberProfile?: (member: SkillMatrixMember) => void;
}) {
  if (!members.length) return null;

  return (
    <View style={s.wrap}>
      {/* Column header */}
      <View style={s.headerRow}>
        <View style={s.nameCell}>
          <Text style={s.scaleHint}>Scale: 1–10</Text>
        </View>
        {SKILLS.map((k) => (
          <View key={k} style={s.skillCell}><Text style={s.skillHead}>{SHORT[k]}</Text></View>
        ))}
      </View>

      {members.map((m, idx) => {
        const name = m.name || "Member";
        const top = SKILLS.map((k) => ({ k, v: m.skills?.[k] ?? 5 })).sort((a, b) => b.v - a.v)[0];
        const mKey = m.userId || (m as any)._id || `m_${idx}`;
        const mUserId = (m.userId || (m as any)._id)?.toString();

        // Strict self-ownership check
        const isSelf = Boolean(
          (mUserId && currentUserId && mUserId === currentUserId) ||
          (currentUserName && m.name && m.name.toLowerCase().trim() === currentUserName.toLowerCase().trim())
        );

        return (
          <View key={mKey} style={s.row}>
            <View style={s.nameCell}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Pressable
                  onPress={() => onViewMemberProfile?.(m)}
                  hitSlop={4}
                  style={{ flex: 1 }}
                >
                  <Text style={[s.name, onViewMemberProfile && s.nameClickable]} numberOfLines={1}>
                    {name} {isSelf && <Text style={s.selfTag}>(You)</Text>}
                  </Text>
                </Pressable>

                {/* Edit button ONLY for current authenticated user */}
                {isSelf && onEditMember && (
                  <Pressable
                    onPress={() => onEditMember(m)}
                    hitSlop={6}
                    style={s.editBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit my skills`}
                  >
                    <Ionicons name="pencil" size={11} color={colors.primary} />
                  </Pressable>
                )}
              </View>
              <Text style={s.topSkill}>★ {SHORT[top.k]} {top.v}/10</Text>
            </View>

            {SKILLS.map((k) => {
              const v = m.skills?.[k] ?? 5;
              const isTop = k === top.k;
              const c = avatarColor(name);
              return (
                <View key={k} style={s.skillCell}>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { height: `${Math.min(100, Math.max(10, v * 10))}%`, backgroundColor: isTop ? c : c + "66" }]} />
                  </View>
                  <Text style={[s.barVal, isTop && { color: colors.text, fontWeight: "800" }]}>{v}</Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  headerRow: { flexDirection: "row", alignItems: "flex-end" },
  row: { flexDirection: "row", alignItems: "flex-end", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  nameCell: { width: 104, justifyContent: "flex-end", paddingBottom: 2 },
  name: { fontSize: 12, fontWeight: "700", color: colors.text },
  nameClickable: { color: colors.primary },
  selfTag: { fontSize: 10, fontWeight: "600", color: colors.textMuted },
  scaleHint: { fontSize: 9, fontWeight: "700", color: colors.textFaint },
  editBtn: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft, marginLeft: 2 },
  topSkill: { fontSize: 10, fontWeight: "700", color: colors.branch, marginTop: 1 },
  skillCell: { flex: 1, alignItems: "center", gap: 3 },
  skillHead: { fontSize: 10, fontWeight: "800", color: colors.textFaint, letterSpacing: 0.3 },
  barTrack: { width: 14, height: 44, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden", justifyContent: "flex-end" },
  barFill: { width: "100%", borderRadius: 3 },
  barVal: { fontSize: 10, fontWeight: "700", color: colors.textMuted },
});
