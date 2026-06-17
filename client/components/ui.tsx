/**
 * ui.tsx — NexusFlow shared UI primitives.
 * Card, Button, Badge, Pill, StatCard, Avatar, MemberChip, EmptyState,
 * Skeleton, FAB, SearchBar, SectionHeader, ProgressBar, Field, Stepper, Chip.
 */
import React from "react";
import {
  View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator,
  ViewStyle, TextStyle, Animated, Easing, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, shadow, font, avatarColor, initials } from "@/theme";

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const inner = <View style={[s.card, style]}>{children}</View>;
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85, transform: [{ scale: 0.995 }] }}>{inner}</Pressable>;
  return inner;
}

// ── Button ──────────────────────────────────────────────────────────────────
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export function Button({
  title, onPress, variant = "primary", icon, loading, disabled, style, small,
}: {
  title: string; onPress?: () => void; variant?: BtnVariant; icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean; disabled?: boolean; style?: ViewStyle; small?: boolean;
}) {
  const v = BTN[variant];
  const isOff = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isOff}
      style={({ pressed }) => [
        s.btn, small && s.btnSmall, { backgroundColor: v.bg, borderColor: v.border },
        isOff && { opacity: 0.5 }, pressed && { opacity: 0.85 }, style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 15 : 17} color={v.fg} />}
          <Text style={[s.btnTxt, small && { fontSize: 13 }, { color: v.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}
const BTN: Record<BtnVariant, { bg: string; fg: string; border: string }> = {
  primary:   { bg: colors.primary, fg: "#fff", border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
  ghost:     { bg: "transparent", fg: colors.primary, border: "transparent" },
  danger:    { bg: colors.danger, fg: "#fff", border: colors.danger },
  success:   { bg: colors.success, fg: "#fff", border: colors.success },
};

// ── Badge / Pill ─────────────────────────────────────────────────────────────
export function Badge({ label, color, bg, dot }: { label: string; color: string; bg?: string; dot?: boolean }) {
  return (
    <View style={[s.badge, { backgroundColor: bg ?? color + "1a" }]}>
      {dot && <View style={[s.badgeDot, { backgroundColor: color }]} />}
      <Text style={[s.badgeTxt, { color }]}>{label}</Text>
    </View>
  );
}
export const Pill = Badge;

// ── StatCard ──────────────────────────────────────────────────────────────────
export function StatCard({ icon, label, value, color, sub }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string | number; color: string; sub?: string;
}) {
  return (
    <View style={[s.card, s.stat]}>
      <View style={[s.statIcon, { backgroundColor: color + "1a" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

// ── Avatar + MemberChip ───────────────────────────────────────────────────────
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(name) }]}>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: size * 0.4 }}>{initials(name)}</Text>
    </View>
  );
}
export function MemberChip({ name, sub }: { name: string; sub?: string }) {
  return (
    <View style={s.memberChip}>
      <Avatar name={name} size={24} />
      <View>
        <Text style={s.memberChipName}>{name}</Text>
        {sub ? <Text style={s.memberChipSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}
export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <View style={s.stack}>
      {shown.map((n, i) => (
        <View key={n + i} style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <View style={s.stackRing}><Avatar name={n} size={26} /></View>
        </View>
      ))}
      {extra > 0 && (
        <View style={[s.stackRing, s.stackMore, { marginLeft: -8 }]}>
          <Text style={s.stackMoreTxt}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, message, actionLabel, onAction, actionIcon }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; message?: string;
  actionLabel?: string; onAction?: () => void; actionIcon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}><Ionicons name={icon} size={32} color={colors.primary} /></View>
      <Text style={s.emptyTitle}>{title}</Text>
      {message ? <Text style={s.emptyMsg}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} icon={actionIcon} onPress={onAction} style={{ marginTop: spacing.md, alignSelf: "center", paddingHorizontal: 20 }} />
      ) : null}
    </View>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: any; style?: ViewStyle }) {
  const op = React.useRef(new Animated.Value(0.4)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(op, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [op]);
  return <Animated.View style={[{ height, width, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, opacity: op }, style]} />;
}
export function SkeletonCard() {
  return (
    <View style={[s.card, { gap: 10 }]}>
      <Skeleton height={18} width="60%" />
      <Skeleton height={12} width="40%" />
      <Skeleton height={8} width="100%" />
    </View>
  );
}

// ── FAB ─────────────────────────────────────────────────────────────────────
export function FAB({ icon = "add", onPress, label }: { icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.fab, label ? { paddingHorizontal: 18 } : null, pressed ? { opacity: 0.9, transform: [{ scale: 0.97 }] } : null]}>
      <Ionicons name={icon} size={24} color="#fff" />
      {label ? <Text style={s.fabLabel}>{label}</Text> : null}
    </Pressable>
  );
}

// ── SearchBar ──────────────────────────────────────────────────────────────────
export function SearchBar({ value, onChangeText, placeholder = "Search…", onClear }: {
  value: string; onChangeText: (t: string) => void; placeholder?: string; onClear?: () => void;
}) {
  return (
    <View style={s.search}>
      <Ionicons name="search" size={16} color={colors.textFaint} />
      <TextInput
        style={s.searchInput} value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={colors.textFaint}
        autoCapitalize="none" autoCorrect={false}
      />
      {value.length > 0 && (
        <Pressable onPress={() => (onClear ? onClear() : onChangeText(""))} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
        </Pressable>
      )}
    </View>
  );
}

// ── SectionHeader ──────────────────────────────────────────────────────────────
export function SectionHeader({ title, subtitle, right, accent }: {
  title: string; subtitle?: string; right?: React.ReactNode; accent?: string;
}) {
  return (
    <View style={s.sectionHead}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
        {accent ? <View style={[s.accentBar, { backgroundColor: accent }]} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={font.h3}>{title}</Text>
          {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
        </View>
      </View>
      {right}
    </View>
  );
}

// ── ProgressBar ────────────────────────────────────────────────────────────────
export function ProgressBar({ value, color = colors.primary, height = 8, showTrack = true }: {
  value: number; color?: string; height?: number; showTrack?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={[s.progressTrack, { height, backgroundColor: showTrack ? colors.border : "transparent" }]}>
      <View style={{ width: `${pct}%`, height: "100%", borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

// ── Field (labeled input) ────────────────────────────────────────────────────
export function Field({
  label, hint, icon, passwordToggle, ...props
}: {
  label?: string; hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Render an eye toggle that reveals/hides the value (sets secureTextEntry). */
  passwordToggle?: boolean;
} & React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = React.useState(false);
  const [reveal, setReveal] = React.useState(false);
  const secure = passwordToggle ? !reveal : props.secureTextEntry;
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={s.fieldLabel}>{label}</Text> : null}
      <View
        style={[
          s.fieldWrap,
          props.multiline && { height: 88, alignItems: "flex-start" },
          focused && s.fieldWrapFocus,
        ]}
      >
        {icon ? <Ionicons name={icon} size={17} color={focused ? colors.primary : colors.textFaint} style={{ marginTop: props.multiline ? 11 : 0 }} /> : null}
        <TextInput
          {...props}
          secureTextEntry={secure}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
          placeholderTextColor={colors.textFaint}
          style={[s.fieldInput, props.multiline && { height: 80, textAlignVertical: "top" }, props.style as any]}
        />
        {passwordToggle ? (
          <Pressable onPress={() => setReveal((r) => !r)} hitSlop={8}>
            <Ionicons name={reveal ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={s.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

// ── Stepper ────────────────────────────────────────────────────────────────────
export function Stepper({ value, onChange, min = 0, max = 999, step = 1, suffix }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <View style={s.stepper}>
      <Pressable style={s.stepBtn} onPress={() => onChange(Math.max(min, value - step))}><Ionicons name="remove" size={18} color={colors.text} /></Pressable>
      <Text style={s.stepVal}>{value}{suffix ? ` ${suffix}` : ""}</Text>
      <Pressable style={s.stepBtn} onPress={() => onChange(Math.min(max, value + step))}><Ionicons name="add" size={18} color={colors.text} /></Pressable>
    </View>
  );
}

// ── Chip (selectable) ────────────────────────────────────────────────────────
export function Chip({ label, active, onPress, color = colors.primary }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: color, borderColor: color }]}>
      <Text style={[s.chipTxt, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, ...(shadow.sm as object) },

  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1 },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm },
  btnTxt: { fontWeight: "700", fontSize: 14 },

  badge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeTxt: { fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },

  stat: { flex: 1, padding: spacing.md, gap: 2, minWidth: 0 },
  statIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  statSub: { fontSize: 10, color: colors.textFaint },

  avatar: { alignItems: "center", justifyContent: "center" },
  memberChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 8, paddingRight: 12, borderWidth: 1, borderColor: colors.border },
  memberChipName: { fontSize: 13, fontWeight: "700", color: colors.text },
  memberChipSub: { fontSize: 10, color: colors.textMuted },
  stack: { flexDirection: "row", alignItems: "center" },
  stackRing: { borderWidth: 2, borderColor: colors.surface, borderRadius: 999 },
  stackMore: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  stackMoreTxt: { color: "#fff", fontSize: 10, fontWeight: "800" },

  empty: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 6 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.text, textAlign: "center" },
  emptyMsg: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 19, maxWidth: 320 },

  fab: { position: "absolute", right: 20, bottom: 24, height: 56, minWidth: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, ...(shadow.lg as object) },
  fabLabel: { color: "#fff", fontWeight: "800", fontSize: 15 },

  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, padding: 0 },

  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 },
  sectionSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  accentBar: { width: 4, height: 18, borderRadius: 2 },

  progressTrack: { width: "100%", borderRadius: 999, overflow: "hidden" },

  fieldLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  fieldWrap: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12 },
  fieldWrapFocus: { borderColor: colors.primary, backgroundColor: colors.surface, ...(Platform.OS === "web" ? { boxShadow: `0 0 0 3px ${colors.primarySoft}` } as any : {}) },
  fieldInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: colors.text, ...(Platform.OS === "web" ? { outlineStyle: "none" } as any : {}) },
  fieldHint: { fontSize: 11, color: colors.textFaint },

  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepBtn: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  stepVal: { fontSize: 16, fontWeight: "800", color: colors.text, minWidth: 64, textAlign: "center" },

  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipTxt: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
});
