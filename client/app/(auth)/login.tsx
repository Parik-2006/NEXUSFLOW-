import { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Field, Button } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { colors, spacing, radius, font, shadow, layout } from "@/theme";

const HIGHLIGHTS = [
  { icon: "sparkles-outline", text: "AI turns a project brief into a ready backlog" },
  { icon: "git-network-outline", text: "Smart sprint, dependency & assignment planning" },
  { icon: "people-outline", text: "Real-time collaboration for your whole team" },
] as const;

export default function Login() {
  const { signIn } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!email.trim()) { toast("Enter your email to continue", "error"); return; }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: any) {
      toast(e.message ?? "Sign in failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.split}>
            {/* Brand / value panel — hidden on very narrow screens by wrapping */}
            <View style={s.brandPane}>
              <View style={s.logoRow}>
                <View style={s.logo}><Ionicons name="git-network" size={24} color="#fff" /></View>
                <Text style={s.wordmark}>NexusFlow</Text>
              </View>
              <Text style={s.heroTitle}>Plan less. Ship more.</Text>
              <Text style={s.heroSub}>
                The AI project workspace that plans your sprints, untangles
                dependencies and assigns work to the right people — automatically.
              </Text>
              <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                {HIGHLIGHTS.map((h) => (
                  <View key={h.text} style={s.highlight}>
                    <View style={s.highlightIcon}><Ionicons name={h.icon as any} size={16} color={colors.accentDark} /></View>
                    <Text style={s.highlightTxt}>{h.text}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Auth card */}
            <View style={s.card}>
              <Text style={font.h2}>Welcome back</Text>
              <Text style={s.cardSub}>Sign in to your workspace</Text>

              <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                <Field
                  label="Email"
                  icon="mail-outline"
                  placeholder="you@company.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  onSubmitEditing={onSubmit}
                />
                <Field
                  label="Password"
                  icon="lock-closed-outline"
                  placeholder="••••••••"
                  passwordToggle
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={onSubmit}
                />

                <View style={s.rowBetween}>
                  <Pressable style={s.remember} onPress={() => setRemember((r) => !r)} hitSlop={6}>
                    <View style={[s.checkbox, remember && s.checkboxOn]}>
                      {remember && <Ionicons name="checkmark" size={13} color="#fff" />}
                    </View>
                    <Text style={s.rememberTxt}>Remember me</Text>
                  </Pressable>
                  <Text style={s.link}>Forgot password?</Text>
                </View>

                <Button title="Sign in" icon="arrow-forward" onPress={onSubmit} loading={busy} style={{ marginTop: 2 }} />
              </View>

              <View style={s.divider}><View style={s.line} /><Text style={s.dividerTxt}>new here?</Text><View style={s.line} /></View>
              <Text style={s.hint}>
                This is a live demo — enter any email and password to create your
                workspace instantly.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl },
  split: { width: "100%", maxWidth: layout.maxWidth, flexDirection: "row", flexWrap: "wrap", gap: spacing.xxl, alignItems: "center", justifyContent: "center" },

  brandPane: { flex: 1, minWidth: 280, maxWidth: 420, gap: spacing.sm },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.lg },
  logo: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  wordmark: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5, color: colors.text },
  heroTitle: { fontSize: 34, fontWeight: "800", letterSpacing: -1, color: colors.text, lineHeight: 40 },
  heroSub: { fontSize: 15, color: colors.textMuted, lineHeight: 23, marginTop: spacing.sm },
  highlight: { flexDirection: "row", alignItems: "center", gap: 10 },
  highlightIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  highlightTxt: { flex: 1, fontSize: 13.5, color: colors.text, fontWeight: "500" },

  card: {
    width: "100%", maxWidth: 400, backgroundColor: colors.surface,
    borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.border,
    ...(shadow.lg as object),
  },
  cardSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },

  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  remember: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  rememberTxt: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  link: { fontSize: 13, color: colors.primary, fontWeight: "700" },

  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: spacing.lg },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerTxt: { fontSize: 11, color: colors.textFaint, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: spacing.md, lineHeight: 18 },
});
