import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, RefreshControl } from "react-native";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Button, Card, Badge } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { API_BASE_URL } from "@/utils/api";
import { colors, spacing, radius, font } from "@/theme";
import { getSocket } from "@/services/socket";

type Msg = {
  _id: string;
  senderId: string;
  senderName: string;
  message: string;
  createdAt: string;
};

export default function GlobalChat() {
  const { user, token } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState<number>(0);
  const scrollRef = useRef<ScrollView>(null);

  const currentUserId = (user?._id || user?.id)?.toString();

  const markRead = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/chat/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scope: "global" }),
      });
      setUnread(0);
    } catch {}
  }, [token]);

  const loadUnread = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/unread`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUnread(data.global || 0);
      }
    } catch {}
  }, [token]);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/global?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const arr = await res.json();
        setMessages(Array.isArray(arr) ? arr : []);
      }
    } catch {
      // keep
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setMessages([]);
    loadMessages();
    loadUnread();
  }, [token, loadMessages, loadUnread]);

  // Real-time
  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    const onMsg = (m: Msg) => {
      setMessages((prev) => [...prev, m]);
      // If the user is currently viewing this page, treat as read
      if (m.senderId !== currentUserId) {
        setUnread((u) => u + 1);
      }
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    };
    socket.on("chat:global:new", onMsg);
    socket.on("reconnect", () => { loadMessages(); loadUnread(); });
    return () => {
      socket.off("chat:global:new", onMsg);
      socket.off("reconnect", () => {});
    };
  }, [token, currentUserId, loadMessages, loadUnread]);

  // Mark global chat read on focus
  useEffect(() => {
    markRead();
  }, [markRead]);

  const send = async () => {
    if (!text.trim()) return;
    const t = text.trim();
    setText("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/global`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: t }),
      });
      if (!res.ok) throw new Error("Failed to send");
    } catch (e: any) {
      toast(e.message || "Failed to send message", "error");
      setText(t);
    }
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={font.h3}>Global Chat</Text>
          {unread > 0 && <Badge label={`${unread} unread`} color={colors.danger} />}
        </View>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadMessages} tintColor={colors.primary} />}
      >
        {messages.length === 0 && !loading && (
          <Card style={{ alignItems: "center", padding: spacing.xl, marginTop: spacing.xl }}>
            <Ionicons name="chatbubbles-outline" size={42} color={colors.textFaint} />
            <Text style={[font.h3, { marginTop: spacing.sm }]}>Say hello to the world</Text>
            <Text style={s.sub}>Messages here go to every NexusFlow user.</Text>
          </Card>
        )}
        {messages.map((m) => {
          const isMe = m.senderId === currentUserId;
          return (
            <View key={m._id} style={[s.row, isMe ? s.rowMe : s.rowOther]}>
              <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleOther]}>
                {!isMe && <Text style={s.sender}>{m.senderName}</Text>}
                <Text style={[s.text, isMe && { color: "#fff" }]}>{m.message}</Text>
                <Text style={[s.time, isMe && { color: "#fff" }]}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </View>
          );
        })}
        {loading && messages.length > 0 && <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} />}
      </ScrollView>

      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Message everyone..."
          placeholderTextColor={colors.textFaint}
          onSubmitEditing={send}
        />
        <Pressable onPress={send} style={[s.sendBtn, !text.trim() && { opacity: 0.5 }]} disabled={!text.trim()}>
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  scrollContent: { padding: spacing.md, gap: spacing.sm, paddingBottom: 24 },
  row: { flexDirection: "row", marginVertical: 2 },
  rowMe: { justifyContent: "flex-end" },
  rowOther: { justifyContent: "flex-start" },
  bubble: { maxWidth: "75%", paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.lg },
  bubbleMe: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  sender: { fontSize: 11, fontWeight: "700", color: colors.accentDark, marginBottom: 2 },
  text: { fontSize: 14, color: colors.text, lineHeight: 20 },
  time: { fontSize: 10, color: colors.textFaint, marginTop: 4, textAlign: "right" },
  sub: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: colors.text, backgroundColor: colors.surfaceAlt },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});