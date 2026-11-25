import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Field, Button } from "@/components/ui";
import NexusFlowLogo from "@/components/branding/NexusFlowLogo";
import { useToast } from "@/components/feedback";
import { colors, spacing, radius, font, shadow } from "@/theme";
import { API_BASE_URL } from "@/utils/api";
import { passwordPolicyError } from "@/utils/passwordPolicy";

type Phase = "checking" | "invalid" | "form" | "done";

/**
 * Phase 2 — password reset screen (opened from the e-mailed link
 * /reset-password?token=…). The token is kept in memory and removed from the
 * address bar; the server validates, consumes it once, and revokes sessions.
 */
export default function ResetPassword() {
  const params = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const toast = useToast();
  const { resetPassword } = useAuth();
  const tokenRef = useRef<string>(typeof params.token === "string" ? params.token : "");
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.search) {
      window.history.replaceState({}, "", "/reset-password");
    }
    const token = tokenRef.current;
    if (!token) {
      setPhase("invalid");
      return;
    }
    fetch(`${API_BASE_URL}/api/auth/reset-password/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        if (r.status === 429) {
          setErrorMsg("Too many attempts. Please try again later.");
          setPhase("invalid");
          return;
        }
        const d = await r.json().catch(() => ({}));
        setPhase(d.valid ? "form" : "invalid");
      })
      .catch(() => {
        setErrorMsg("Could not reach the server. Please try again.");
        setPhase("invalid");
      });
  }, []);

  const onSubmit = async () => {
    const policy = passwordPolicyError(password);
    if (policy) return setErrorMsg(policy);
    if (password !== confirm) return setErrorMsg("Passwords do not match.");
    setBusy(true);
    setErrorMsg(null);
    try {
      await resetPassword(tokenRef.current, password, confirm);
      tokenRef.current = "";
      setPhase("done");
      toast("Password updated. Please sign in.", "success");
    } catch (e: any) {
      const msg = e?.message ?? "Failed to reset password.";
      setErrorMsg(msg);
      if (/invalid|expired/i.test(msg)) setPhase("invalid");
    } finally {
      setBusy(false);
    }
  };

  const goLogin = () => router.replace("/(auth)/login");

  return (
    <View style={s.root}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <NexusFlowLogo size={112} style={{ marginBottom: spacing.md }} />
          <View style={s.card}>
            {phase === "checking" && (
              <View style={s.center} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.primary} />
                <Text style={s.cardSub}>Checking your reset link…</Text>
              </View>
            )}

            {phase === "invalid" && (
              <>
                <View style={[s.iconWrap, { backgroundColor: colors.dangerSoft }]}>
                  <Ionicons name="alert-circle" size={26} color={colors.danger} />
                </View>
                <Text style={[font.h2, s.centerText]}>Link invalid or expired</Text>
                <Text style={[s.cardSub, s.centerText]}>
                  {errorMsg ?? "Reset links can be used once and expire after a short time. Request a new one to continue."}
                </Text>
                <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                  <Button title="Request a new link" icon="mail" onPress={() => router.replace("/(auth)/forgot-password")} />
                  <Button title="Back to Login" variant="secondary" onPress={goLogin} />
                </View>
              </>
            )}

            {phase === "form" && (
              <>
                <Text style={font.h2}>Choose a new password</Text>
                <Text style={s.cardSub}>At least 8 characters, with letters and numbers. You'll be signed out everywhere.</Text>
                {errorMsg && (
                  <View style={s.errorBanner} accessibilityLiveRegion="polite">
                    <Ionicons name="alert-circle" size={16} color={colors.danger} />
                    <Text style={s.errorTxt}>{errorMsg}</Text>
                  </View>
                )}
                <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                  <Field
                    label="New password"
                    icon="lock-closed-outline"
                    placeholder="New password"
                    passwordToggle
                    autoCapitalize="none"
                    autoComplete="new-password"
                    value={password}
                    onChangeText={(v) => { setPassword(v); setErrorMsg(null); }}
                  />
                  <Field
                    label="Confirm password"
                    icon="lock-closed-outline"
                    placeholder="Repeat new password"
                    passwordToggle
                    autoCapitalize="none"
                    autoComplete="new-password"
                    value={confirm}
                    onChangeText={(v) => { setConfirm(v); setErrorMsg(null); }}
                    onSubmitEditing={onSubmit}
                  />
                  <Button title="Update password" icon="checkmark" onPress={onSubmit} loading={busy} />
                </View>
              </>
            )}

            {phase === "done" && (
              <>
                <View style={[s.iconWrap, { backgroundColor: colors.successSoft || colors.success + "22" }]}>
                  <Ionicons name="checkmark-circle" size={26} color={colors.success} />
                </View>
                <Text style={[font.h2, s.centerText]}>Password updated</Text>
                <Text style={[s.cardSub, s.centerText]}>All previous sessions were signed out. Sign in with your new password.</Text>
                <Button title="Back to Login" icon="log-in" onPress={goLogin} style={{ marginTop: spacing.lg }} />
              </>
            )}
          </View>
          {phase === "form" && (
            <Pressable style={s.backBtn} onPress={goLogin} hitSlop={8}>
              <Text style={s.backTxt}>Back to Login</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl },
  card: {
    width: "100%", maxWidth: 400, backgroundColor: colors.surface,
    borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.border,
    ...(shadow.lg as object),
  },
  center: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  centerText: { textAlign: "center" },
  iconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: spacing.md },
  cardSub: { fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 19 },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, padding: spacing.sm, borderRadius: radius.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.danger + "33" },
  errorTxt: { fontSize: 12.5, color: colors.danger, fontWeight: "600", flex: 1 },
  backBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 12, marginTop: spacing.md },
  backTxt: { fontSize: 13, fontWeight: "700", color: colors.primary },
});
