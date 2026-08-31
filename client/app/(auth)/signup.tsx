import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Field, Button } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { colors, spacing, radius, font, shadow, layout } from "@/theme";

const HIGHLIGHTS = [
  { icon: "shield-checkmark-outline", text: "Production-grade authentication & strict team isolation" },
  { icon: "sparkles-outline", text: "AI-driven project decomposition, guidance & copilot" },
  { icon: "git-network-outline", text: "DAA algorithm-powered sprint & dependency planning" },
] as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Signup() {
  const { signUp } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!name.trim()) {
      setErrorMsg("Please enter your full name.");
      toast("Name is required", "error");
      return;
    }
    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      setErrorMsg("Please enter a valid email address.");
      toast("Valid email is required", "error");
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg("Password must be at least 6 characters long.");
      toast("Password too short (min 6 chars)", "error");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      toast("Passwords do not match", "error");
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      await signUp(name.trim(), email.trim(), password, confirmPassword);
      toast("Account created successfully! Welcome to NexusFlow.", "success");
    } catch (e: any) {
      const msg = e.message ?? "Registration failed";
      setErrorMsg(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.split}>
            {/* Brand / value panel */}
            <View style={s.brandPane}>
              <View style={s.logoRow}>
                <View style={s.logo}><Ionicons name="git-network" size={24} color="#fff" /></View>
                <Text style={s.wordmark}>NexusFlow</Text>
              </View>
              <Text style={s.heroTitle}>Create your account.</Text>
              <Text style={s.heroSub}>
                Join NEXUSFLOW to plan sprints with DAA algorithms, collaborate on
                isolated team projects, and build with Project AI.
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
              <Text style={font.h2}>Create your account</Text>
              <Text style={s.cardSub}>Set up your personal workspace profile</Text>

              {errorMsg && (
                <View style={s.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text style={s.errorTxt}>{errorMsg}</Text>
                </View>
              )}

              <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                <Field
                  label="Full Name"
                  icon="person-outline"
                  placeholder="Alex Morgan"
                  value={name}
                  onChangeText={(v) => { setName(v); setErrorMsg(null); }}
                  onSubmitEditing={onSubmit}
                />
                <Field
                  label="Email"
                  icon="mail-outline"
                  placeholder="you@company.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={(v) => { setEmail(v); setErrorMsg(null); }}
                  onSubmitEditing={onSubmit}
                />
                <Field
                  label="Password"
                  icon="lock-closed-outline"
                  placeholder="At least 6 characters"
                  passwordToggle
                  value={password}
                  onChangeText={(v) => { setPassword(v); setErrorMsg(null); }}
                  onSubmitEditing={onSubmit}
                />
                <Field
                  label="Confirm Password"
                  icon="shield-checkmark-outline"
                  placeholder="Repeat your password"
                  passwordToggle
                  value={confirmPassword}
                  onChangeText={(v) => { setConfirmPassword(v); setErrorMsg(null); }}
                  onSubmitEditing={onSubmit}
                />

                <Button title="Create Account" icon="arrow-forward" onPress={onSubmit} loading={busy} style={{ marginTop: 4 }} />
              </View>

              <View style={s.divider}><View style={s.line} /><Text style={s.dividerTxt}>Already have an account?</Text><View style={s.line} /></View>
              <Pressable
                style={s.loginBtn}
                onPress={() => router.push("/(auth)/login" as any)}
                hitSlop={8}
              >
                <Text style={s.loginBtnTxt}>Login</Text>
              </Pressable>
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
    width: "100%", maxWidth: 420, backgroundColor: colors.surface,
    borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.border,
    ...(shadow.lg as object),
  },
  cardSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },

  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, padding: spacing.sm, borderRadius: radius.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.danger + "33" },
  errorTxt: { fontSize: 12.5, color: colors.danger, fontWeight: "600", flex: 1 },

  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: spacing.lg },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerTxt: { fontSize: 11, color: colors.textFaint, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },

  loginBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, marginTop: spacing.md },
  loginBtnTxt: { fontSize: 14, fontWeight: "700", color: colors.primary },
});
