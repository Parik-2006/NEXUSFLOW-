/**
 * feedback.tsx — Toasts, confirmation dialogs, and a reusable ModalSheet.
 * Provides ToastProvider/useToast and ConfirmProvider/useConfirm (one
 * FeedbackProvider wraps both), plus a <ModalSheet> bottom-sheet modal.
 */
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  View, Text, Pressable, StyleSheet, Animated, Modal, ScrollView, KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, shadow, font } from "@/theme";
import { Button } from "@/components/ui";

// ── Toasts ──────────────────────────────────────────────────────────────────
type ToastType = "success" | "error" | "info";
type Toast = { id: number; type: ToastType; text: string };

const ToastCtx = createContext<(text: string, type?: ToastType) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

const TOAST_META: Record<ToastType, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  success: { icon: "checkmark-circle", color: colors.success, bg: colors.successSoft },
  error:   { icon: "alert-circle",     color: colors.danger,  bg: colors.dangerSoft },
  info:    { icon: "information-circle",color: colors.info,    bg: colors.infoSoft },
};

function ToastItem({ toast, onDone }: { toast: Toast; onDone: (id: number) => void }) {
  const y = useRef(new Animated.Value(-20)).current;
  const op = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(y, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(y, { toValue: -20, duration: 200, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => onDone(toast.id));
    }, 2800);
    return () => clearTimeout(t);
  }, []);
  const m = TOAST_META[toast.type];
  return (
    <Animated.View style={[t.toast, { backgroundColor: m.bg, borderColor: m.color + "55", opacity: op, transform: [{ translateY: y }] }]}>
      <Ionicons name={m.icon} size={20} color={m.color} />
      <Text style={[t.toastTxt, { color: m.color }]} numberOfLines={3}>{toast.text}</Text>
    </Animated.View>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
type ConfirmOpts = { title: string; message?: string; confirmLabel?: string; destructive?: boolean };
const ConfirmCtx = createContext<(opts: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

// ── Provider ──────────────────────────────────────────────────────────────────
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(1);
  const push = useCallback((text: string, type: ToastType = "info") => {
    const id = idRef.current++;
    setToasts((prev) => [...prev, { id, type, text }]);
  }, []);
  const remove = useCallback((id: number) => setToasts((prev) => prev.filter((x) => x.id !== id)), []);

  const [confirm, setConfirm] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((opts: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirm({ ...opts, resolve })), []);
  const close = (v: boolean) => { confirm?.resolve(v); setConfirm(null); };

  return (
    <ToastCtx.Provider value={push}>
      <ConfirmCtx.Provider value={ask}>
        {children}
        <View style={[t.toastWrap, { pointerEvents: "box-none" }]}>
          {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onDone={remove} />)}
        </View>
        <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => close(false)}>
          <Pressable style={t.confirmOverlay} onPress={() => close(false)}>
            <Pressable style={t.confirmCard} onPress={() => {}}>
              <View style={[t.confirmIcon, { backgroundColor: confirm?.destructive ? colors.dangerSoft : colors.primarySoft }]}>
                <Ionicons name={confirm?.destructive ? "trash" : "help-circle"} size={24} color={confirm?.destructive ? colors.danger : colors.primary} />
              </View>
              <Text style={t.confirmTitle}>{confirm?.title}</Text>
              {confirm?.message ? <Text style={t.confirmMsg}>{confirm.message}</Text> : null}
              <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.md }}>
                <Button title="Cancel" variant="secondary" onPress={() => close(false)} style={{ flex: 1 }} />
                <Button title={confirm?.confirmLabel ?? "Confirm"} variant={confirm?.destructive ? "danger" : "primary"} onPress={() => close(true)} style={{ flex: 1 }} />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}

// ── ModalSheet ────────────────────────────────────────────────────────────────
export function ModalSheet({ visible, onClose, title, children, full }: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode; full?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={t.sheetOverlay} onPress={onClose}>
          <Pressable style={[t.sheet, full && t.sheetFull]} onPress={() => {}}>
            <View style={t.sheetHandle} />
            <View style={t.sheetHead}>
              <Text style={font.h2}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={10} style={t.sheetClose}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const t = StyleSheet.create({
  toastWrap: { position: "absolute", top: 48, left: 0, right: 0, alignItems: "center", gap: 8, zIndex: 9999 },
  toast: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 480, width: "90%", paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, ...(shadow.md as object) },
  toastTxt: { flex: 1, fontSize: 13, fontWeight: "700" },

  confirmOverlay: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  confirmCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, width: "100%", maxWidth: 380, alignItems: "center", ...(shadow.lg as object) },
  confirmIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  confirmTitle: { ...font.h3, textAlign: "center" },
  confirmMsg: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 6, lineHeight: 19 },

  sheetOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: "92%", paddingTop: spacing.sm },
  sheetFull: { minHeight: "75%" },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.sm },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  sheetClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
});
