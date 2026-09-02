import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Field, Button } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { colors, spacing, radius, font, shadow, layout } from "@/theme";

export default function ForgotPassword() {
  const router = useRouter();
  const toast = useToast();
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleRequest = async () => {
    if (!email.trim()) {
      setErrorMsg("Please enter your email address.");
      toast("Enter your email to continue", "error");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await forgotPassword(email.trim());
      setSuccessMsg("If an account with that email exists, a reset link has been sent.");
      toast("Reset link sent", "success");
    } catch (e: any) {
      const msg = e.message ?? "Failed to send reset link.";
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
          <View style={s.card}>
            <Text style={font.h2}>Forgot Password</Text>
            <Text style={s.cardSub}>
              Enter your email and we'll send you a reset link.
            </Text>

            {errorMsg && (
              <View style={s.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={s.errorTxt}>{errorMsg}</Text>
              </View>
            )}
            {successMsg && (
              <View style={s.successBanner}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={s.successTxt}>{successMsg}</Text>
              </View>
            )}

            <View style={{ gap: spacing.md, marginTop: spacing.md }}>
              <Field
                label="Email"
                icon="mail-outline"
                placeholder="you@company.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={(v) => { setEmail(v); setErrorMsg(null); }}
              />
              <Button title="Send Reset Link" icon="send" onPress={handleRequest} loading={busy} />
            </View>

            <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={8}>
              <Text style={s.backTxt}>Back to Login</Text>
            </Pressable>
          </View>
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
  cardSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, padding: spacing.sm, borderRadius: radius.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.danger + "33" },
  errorTxt: { fontSize: 12.5, color: colors.danger, fontWeight: "600", flex: 1 },
  successBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.successSoft || colors.success + "22", padding: spacing.sm, borderRadius: radius.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.success + "44" },
  successTxt: { fontSize: 12.5, color: colors.success, fontWeight: "600", flex: 1 },
  backBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: radius.md, marginTop: spacing.md },
  backTxt: { fontSize: 14, fontWeight: "700", color: colors.primary },
});
