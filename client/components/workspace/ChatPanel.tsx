/**
 * ChatPanel — team chat + AI project planning.
 * Type "@ai <project description>" to auto-generate tasks (saved to MongoDB
 * and auto-assigned via Branch & Bound). "@ai plan sprint <hours>" runs Knapsack.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, FlatList, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getSocket } from "@/services/socket";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui";
import { colors, spacing, radius, font } from "@/theme";

type Msg = { _id: string; text: string; name: string; userId: string; createdAt: string };

const SUGGESTIONS = [
  "@ai Build a checkout flow with cart, payment, and confirmation",
  "@ai plan sprint 40",
];

export default function ChatPanel({ teamId, initialText }: { teamId: string; initialText?: string }) {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState(initialText ?? "");
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    const socket = getSocket(token);
    const onMessage = (m: Msg) => {
      setMessages((p) => [...p, m]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    };
    const onStream = ({ id, text }: { id: string; text: string }) => {
      setMessages((p) => {
        const ex = p.find((m) => m._id === id);
        if (ex) return p.map((m) => (m._id === id ? { ...m, text: m.text + text } : m));
        return [...p, { _id: id, text, name: "AI", userId: "ai", createdAt: new Date().toISOString() }];
      });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    };
    socket.on("chat:message", onMessage);
    socket.on("chat:stream", onStream);
    return () => { socket.off("chat:message", onMessage); socket.off("chat:stream", onStream); };
  }, [token]);

  const send = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg) return;
    getSocket(token).emit("chat:message", { teamId, text: msg });
    setInput("");
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {messages.length === 0 && (
        <View style={s.intro}>
          <View style={s.aiIcon}><Ionicons name="sparkles" size={26} color={colors.topo} /></View>
          <Text style={font.h3}>AI Project Planning</Text>
          <Text style={s.introSub}>Describe your project and AI breaks it into tasks — saved and prioritised automatically.</Text>
          <View style={{ gap: 8, width: "100%", marginTop: spacing.md }}>
            {SUGGESTIONS.map((sug) => (
              <Pressable key={sug} style={s.sug} onPress={() => send(sug)}>
                <Ionicons name="flash" size={14} color={colors.topo} />
                <Text style={s.sugTxt} numberOfLines={1}>{sug}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m._id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        renderItem={({ item }) => {
          const mine = item.userId === (user as any)?.id;
          const ai = item.userId === "ai";
          return (
            <View style={[s.msgRow, mine && { flexDirection: "row-reverse" }]}>
              {!mine && <Avatar name={ai ? "AI" : item.name} size={28} />}
              <View style={[s.bubble, mine ? s.mine : ai ? s.aiBubble : s.theirs]}>
                {!mine && <Text style={[s.sender, ai && { color: colors.topo }]}>{item.name}</Text>}
                <Text style={[s.msgTxt, mine && { color: "#fff" }]}>{item.text}</Text>
              </View>
            </View>
          );
        }}
      />

      <View style={s.inputBar}>
        <TextInput
          style={s.input} value={input} onChangeText={setInput}
          placeholder="Message or @ai <project>…" placeholderTextColor={colors.textFaint}
          onSubmitEditing={() => send()} returnKeyType="send" multiline
        />
        <Pressable style={s.sendBtn} onPress={() => send()}>
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  intro: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", padding: spacing.xl, gap: 6, zIndex: 1 },
  aiIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.topo + "1a", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  introSub: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 19, maxWidth: 300 },
  sug: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12 },
  sugTxt: { flex: 1, fontSize: 13, color: colors.text, fontWeight: "600" },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubble: { maxWidth: "78%", paddingVertical: 9, paddingHorizontal: 12, borderRadius: radius.lg },
  mine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  aiBubble: { backgroundColor: colors.topo + "12", borderWidth: 1, borderColor: colors.topo + "33", borderBottomLeftRadius: 4 },
  sender: { fontSize: 11, color: colors.textMuted, marginBottom: 2, fontWeight: "700" },
  msgTxt: { fontSize: 14, color: colors.text, lineHeight: 19 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, maxHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text, backgroundColor: colors.surfaceAlt },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
