/**
 * ChatPanel.tsx — Team chat panel for workspace.
 */
import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useChat, type ChatMessage } from "@/hooks/useChat";
import { colors, spacing, radius, font } from "@/theme";
import { useAuth } from "@/context/AuthContext";

export default function ChatPanel({ teamId }: { teamId: string }) {
  const { user } = useAuth();
  const { messages, loading, sendMessage } = useChat(teamId);
  const [text, setText] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (messages.length > 0) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!text.trim()) return;
    await sendMessage(text.trim(), teamId);
    setText("");
  };

  const currentUserId = (user?._id || user?.id)?.toString();

  return (
    <View style={s.wrap}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.scrollContent}
        style={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {loading && messages.length === 0 && (
          <Text style={s.loading}>Loading messages...</Text>
        )}
        {messages.map((m: ChatMessage) => {
          const isMe = m.senderId === currentUserId;
          return (
            <View key={m._id} style={[s.row, isMe ? s.rowMe : s.rowOther]}>
              <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleOther]}>
                {!isMe && <Text style={s.sender}>{m.senderName || "Member"}</Text>}
                <Text style={[s.text, isMe && s.textMe]}>{m.message}</Text>
                <Text style={s.time}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {m.editedAt && " (edited)"}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor={colors.textFaint}
          onSubmitEditing={handleSend}
        />
        <Pressable onPress={handleSend} style={[s.sendBtn, !text.trim() && s.sendBtnDisabled]}>
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, gap: spacing.sm, paddingBottom: 80 },
  loading: { textAlign: "center", color: colors.textMuted, marginTop: spacing.lg },
  row: { flexDirection: "row", marginVertical: 2 },
  rowMe: { justifyContent: "flex-end" },
  rowOther: { justifyContent: "flex-start" },
  bubble: { maxWidth: "75%", paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.lg },
  bubbleMe: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  sender: { fontSize: 11, fontWeight: "700", color: colors.accentDark, marginBottom: 2 },
  text: { fontSize: 14, color: colors.text, lineHeight: 20 },
  textMe: { color: "#fff" },
  time: { fontSize: 10, color: colors.textFaint, marginTop: 4, textAlign: "right" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: colors.text, backgroundColor: colors.surfaceAlt },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { backgroundColor: colors.textFaint },
});
