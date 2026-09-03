/**
 * ChatPanel.tsx — Complete Global Chat + Team Chat System with Members Panel & Unread Badges.
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useTeams, type Team } from "@/hooks/useTeams";
import { useChat, type ChatMessage } from "@/hooks/useChat";
import { Avatar, Badge, Button, Card, EmptyState } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { colors, spacing, radius, font } from "@/theme";
import { API_BASE_URL } from "@/utils/api";

const API = API_BASE_URL;

interface MemberDetail {
  userId: string;
  name: string;
  avatar?: string;
  role?: string;
  skills?: Record<string, number>;
  verifiedSkills?: Array<{
    skill: string;
    percentage: number;
    difficulty: string;
  }>;
}

export default function ChatPanel({
  teamId: initialTeamId,
  standalone = false,
}: {
  teamId?: string;
  standalone?: boolean;
}) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const { user, token } = useAuth();
  const { teams } = useTeams();
  const toast = useToast();

  const {
    activeScope,
    setActiveScope,
    messages,
    loading,
    unreadCounts,
    sendMessage,
  } = useChat(initialTeamId || "global");

  const [text, setText] = useState("");
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<MemberDetail[]>([]);
  const [sidebarTab, setSidebarTab] = useState<"chat" | "conversations">("chat");
  const scrollRef = useRef<ScrollView>(null);

  const currentUserId = (user?._id || user?.id)?.toString();
  const isGlobal = activeScope === "global";
  const activeTeam = teams.find((t) => t._id === activeScope) || teams.find((t) => t._id === initialTeamId);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 60);
    }
  }, [messages.length]);

  // Load team members and verified skills
  const loadTeamMembers = useCallback(async () => {
    if (isGlobal || !activeScope || !token) return;
    setMembersLoading(true);
    try {
      // 1. Fetch team details
      const teamRes = await fetch(`${API}/api/teams/${activeScope}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const teamData = teamRes.ok ? await teamRes.json() : null;

      // 2. Fetch verified skill graph
      let skillGraphMap: Record<string, any[]> = {};
      try {
        const graphRes = await fetch(`${API}/api/skills/team/${activeScope}/graph`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (graphRes.ok) {
          const graphData = await graphRes.json();
          if (Array.isArray(graphData)) {
            for (const item of graphData) {
              const uid = item.userId?.toString();
              if (uid) skillGraphMap[uid] = item.verifiedSkills || [];
            }
          }
        }
      } catch {}

      const rawMembers = teamData?.members || activeTeam?.members || [];
      const enriched: MemberDetail[] = rawMembers.map((m: any) => {
        const uid = (typeof m.userId === "object" ? m.userId?._id : m.userId)?.toString() || "";
        return {
          userId: uid,
          name: m.name || "Team Member",
          avatar: m.avatar || null,
          role: m.role || (teamData?.ownerId?.toString() === uid ? "Leader" : "Member"),
          skills: m.skills || {},
          verifiedSkills: skillGraphMap[uid] || [],
        };
      });

      setTeamMembers(enriched);
    } catch {
      // non-fatal
    } finally {
      setMembersLoading(false);
    }
  }, [activeScope, isGlobal, token, activeTeam]);

  const handleOpenMembers = () => {
    setShowMembersModal(true);
    loadTeamMembers();
  };

  const handleSend = async () => {
    if (!text.trim()) return;
    const msg = text.trim();
    setText("");
    try {
      await sendMessage(msg);
    } catch (e: any) {
      toast(e.message || "Failed to send message", "error");
      setText(msg);
    }
  };

  return (
    <View style={s.root}>
      {/* ── Mobile Top Switcher (on narrow screens only) ── */}
      {!isDesktop && (
        <View style={s.mobileTopNav}>
          <Pressable
            onPress={() => setSidebarTab("conversations")}
            style={[s.mobileTabBtn, sidebarTab === "conversations" && s.mobileTabBtnActive]}
          >
            <Ionicons name="chatbubbles-outline" size={16} color={sidebarTab === "conversations" ? colors.primary : colors.textMuted} />
            <Text style={[font.small, sidebarTab === "conversations" && { fontWeight: "700", color: colors.primary }]}>
              Channels {unreadCounts.total > 0 && `(${unreadCounts.total})`}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSidebarTab("chat")}
            style={[s.mobileTabBtn, sidebarTab === "chat" && s.mobileTabBtnActive]}
          >
            <Ionicons name="chatbox-outline" size={16} color={sidebarTab === "chat" ? colors.primary : colors.textMuted} />
            <Text style={[font.small, sidebarTab === "chat" && { fontWeight: "700", color: colors.primary }]}>
              {isGlobal ? "Global Chat" : activeTeam?.name || "Team Chat"}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={s.layoutRow}>
        {/* ── LEFT SIDEBAR: Conversations List ── */}
        {(isDesktop || sidebarTab === "conversations") && (
          <View style={[s.sidebar, !isDesktop && s.sidebarMobile]}>
            <View style={s.sidebarHeader}>
              <Text style={font.h3}>Channels</Text>
              {unreadCounts.total > 0 && (
                <Badge label={`${unreadCounts.total} unread`} color={colors.danger} />
              )}
            </View>

            <ScrollView contentContainerStyle={s.conversationList}>
              {/* GLOBAL CHAT ITEM */}
              <Pressable
                onPress={() => {
                  setActiveScope("global");
                  if (!isDesktop) setSidebarTab("chat");
                }}
                style={[
                  s.convoItem,
                  activeScope === "global" && s.convoItemActive,
                ]}
              >
                <View style={[s.convoIconWrap, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="globe" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[font.body, { fontWeight: "700" }]} numberOfLines={1}>
                    Global Chat
                  </Text>
                  <Text style={[font.caption, { color: colors.textMuted }]} numberOfLines={1}>
                    Everyone on NexusFlow
                  </Text>
                </View>
                {unreadCounts.global > 0 && (
                  <Badge label={`${unreadCounts.global}`} color={colors.danger} />
                )}
              </Pressable>

              {/* TEAMS SECTION */}
              <View style={s.sectionDivider}>
                <Text style={s.sectionTitle}>YOUR TEAMS</Text>
              </View>

              {teams.length === 0 ? (
                <Text style={[font.caption, { color: colors.textFaint, paddingHorizontal: spacing.sm }]}>
                  No workspaces joined yet.
                </Text>
              ) : (
                teams.map((t) => {
                  const isSel = activeScope === t._id;
                  const unread = unreadCounts.teams[t._id] || 0;
                  const count = t.members?.length || 1;
                  return (
                    <Pressable
                      key={t._id}
                      onPress={() => {
                        setActiveScope(t._id);
                        if (!isDesktop) setSidebarTab("chat");
                      }}
                      style={[s.convoItem, isSel && s.convoItemActive]}
                    >
                      <Avatar name={t.name} size={36} image={t.logo} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[font.body, { fontWeight: "700" }]} numberOfLines={1}>
                          {t.name}
                        </Text>
                        <Text style={[font.caption, { color: colors.textMuted }]} numberOfLines={1}>
                          {count} member{count !== 1 ? "s" : ""}
                        </Text>
                      </View>
                      {unread > 0 && <Badge label={`${unread}`} color={colors.danger} />}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}

        {/* ── MAIN CHAT AREA ── */}
        {(isDesktop || sidebarTab === "chat") && (
          <View style={s.mainArea}>
            {/* Chat Header */}
            <View style={s.chatHeader}>
              <View style={s.headerLeft}>
                {isGlobal ? (
                  <View style={[s.convoIconWrap, { backgroundColor: colors.primarySoft }]}>
                    <Ionicons name="globe" size={20} color={colors.primary} />
                  </View>
                ) : (
                  <Avatar name={activeTeam?.name || "Team"} size={36} image={activeTeam?.logo} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={font.h3} numberOfLines={1}>
                    {isGlobal ? "Global Chat" : activeTeam?.name || "Team Chat"}
                  </Text>
                  <Text style={[font.caption, { color: colors.textMuted }]} numberOfLines={1}>
                    {isGlobal ? "Public channel · All registered NexusFlow users" : `${activeTeam?.members?.length || 1} team members`}
                  </Text>
                </View>
              </View>

              {!isGlobal && (
                <Button
                  title="Members"
                  icon="people-outline"
                  variant="secondary"
                  small
                  onPress={handleOpenMembers}
                />
              )}
            </View>

            {/* Messages Scroll View */}
            <ScrollView
              ref={scrollRef}
              style={s.messageScroll}
              contentContainerStyle={s.messageListContent}
              keyboardShouldPersistTaps="handled"
            >
              {loading && (
                <View style={{ padding: spacing.lg, alignItems: "center" }}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={[font.caption, { color: colors.textMuted, marginTop: 6 }]}>Loading messages...</Text>
                </View>
              )}

              {messages.length === 0 && !loading && (
                <Card style={s.chatEmptyCard}>
                  <Ionicons
                    name={isGlobal ? "globe-outline" : "chatbubbles-outline"}
                    size={42}
                    color={colors.primary}
                  />
                  <Text style={[font.h3, { marginTop: spacing.sm, textAlign: "center" }]}>
                    {isGlobal ? "Welcome to Global Chat" : `Start the conversation with ${activeTeam?.name || "your team"}`}
                  </Text>
                  <Text style={[font.small, { color: colors.textMuted, textAlign: "center", maxWidth: 360, marginTop: 4, lineHeight: 18 }]}>
                    {isGlobal
                      ? "Messages sent here are visible to all members registered on the platform."
                      : "Discuss project architecture, blockers, and sprint updates with your teammates in real-time."}
                  </Text>
                </Card>
              )}

              {messages.map((m: ChatMessage) => {
                const isMe = m.senderId === currentUserId;
                return (
                  <View key={m._id} style={[s.messageRow, isMe ? s.messageRowMe : s.messageRowOther]}>
                    {!isMe && (
                      <View style={s.senderAvatarWrap}>
                        <Avatar name={m.senderName || "Member"} size={30} />
                      </View>
                    )}
                    <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleOther]}>
                      {!isMe && (
                        <Text style={s.senderName} numberOfLines={1}>
                          {m.senderName || "Member"}
                        </Text>
                      )}
                      <Text style={[s.messageText, isMe && s.messageTextMe]}>{m.message}</Text>
                      <Text style={[s.messageTime, isMe && s.messageTimeMe]}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {m.editedAt ? " (edited)" : ""}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Bottom Message Input Bar */}
            <View style={s.inputBar}>
              <TextInput
                style={s.textInput}
                value={text}
                onChangeText={setText}
                placeholder={isGlobal ? "Message Global Chat..." : `Message ${activeTeam?.name || "team"}...`}
                placeholderTextColor={colors.textFaint}
                onSubmitEditing={handleSend}
                multiline={false}
              />
              <Pressable
                onPress={handleSend}
                style={[s.sendButton, !text.trim() && s.sendButtonDisabled]}
                disabled={!text.trim()}
              >
                <Ionicons name="send" size={17} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* ── TEAM MEMBERS MODAL ── */}
      <Modal
        visible={showMembersModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMembersModal(false)}
      >
        <View style={s.modalOverlay}>
          <Card style={s.modalCard}>
            <View style={s.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                <Ionicons name="people" size={20} color={colors.primary} />
                <Text style={font.h2}>{activeTeam?.name || "Team"} Members</Text>
              </View>
              <Pressable onPress={() => setShowMembersModal(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            {membersLoading ? (
              <View style={{ padding: spacing.xl, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[font.caption, { color: colors.textMuted, marginTop: 8 }]}>Loading members & verified badges...</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={s.memberList}>
                {teamMembers.map((m) => (
                  <View key={m.userId} style={s.memberCard}>
                    <Avatar name={m.name} size={40} image={m.avatar} />
                    <View style={{ flex: 1, minWidth: 0, marginLeft: spacing.sm }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={[font.body, { fontWeight: "700" }]}>{m.name}</Text>
                        <Badge label={m.role || "Member"} color={m.role === "Leader" ? colors.primary : colors.textMuted} />
                      </View>
                      <Text style={[font.caption, { color: colors.textFaint, marginTop: 2 }]} numberOfLines={1}>
                        ID: {m.userId}
                      </Text>

                      {/* Verified Skill Badges */}
                      {m.verifiedSkills && m.verifiedSkills.length > 0 && (
                        <View style={s.badgeRow}>
                          {m.verifiedSkills.map((v, vi) => (
                            <View key={vi} style={s.verifiedBadge}>
                              <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                              <Text style={s.verifiedBadgeText}>
                                {v.skill} ({v.percentage}%)
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={{ marginTop: spacing.md, alignItems: "flex-end" }}>
              <Button title="Close" variant="secondary" small onPress={() => setShowMembersModal(false)} />
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  mobileTopNav: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mobileTabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  mobileTabBtnActive: {
    borderBottomColor: colors.primary,
  },
  layoutRow: {
    flex: 1,
    flexDirection: "row",
  },
  sidebar: {
    width: 280,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  sidebarMobile: {
    width: "100%",
    borderRightWidth: 0,
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  conversationList: {
    padding: spacing.xs,
    gap: 2,
  },
  convoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: "transparent",
  },
  convoItemActive: {
    backgroundColor: colors.primarySoft,
  },
  convoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionDivider: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textFaint,
    letterSpacing: 0.6,
  },
  mainArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  messageScroll: {
    flex: 1,
  },
  messageListContent: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: 40,
  },
  chatEmptyCard: {
    alignItems: "center",
    padding: spacing.xl,
    marginTop: spacing.xl,
    marginHorizontal: spacing.md,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
    marginVertical: 2,
  },
  messageRowMe: {
    justifyContent: "flex-end",
  },
  messageRowOther: {
    justifyContent: "flex-start",
  },
  senderAvatarWrap: {
    marginBottom: 4,
  },
  bubble: {
    maxWidth: "75%",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
  },
  bubbleMe: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 3,
  },
  bubbleOther: {
    backgroundColor: colors.surfaceAlt,
    borderBottomLeftRadius: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  senderName: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 3,
  },
  messageText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  messageTextMe: {
    color: "#ffffff",
  },
  messageTime: {
    fontSize: 10,
    color: colors.textFaint,
    marginTop: 4,
    textAlign: "right",
  },
  messageTimeMe: {
    color: "rgba(255, 255, 255, 0.75)",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 540,
    maxHeight: "80%",
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  memberList: {
    gap: spacing.sm,
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.successSoft || "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.success,
  },
});
