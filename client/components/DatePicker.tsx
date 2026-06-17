/**
 * DatePicker.tsx — Feature 12: better deadline input UX.
 * On web renders a real native <input type="date"> (calendar UI, validation,
 * mobile-web friendly). On native it falls back to the validated text Field.
 * Value is the canonical "YYYY-MM-DD" string used by the task form — schema
 * unchanged (still stored as an ISO Date server-side).
 */
import React from "react";
import { Platform, View, Text, StyleSheet } from "react-native";
import { Field } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

export default function DatePicker({
  label, value, onChange, min, mode = "date",
}: {
  label?: string; value: string; onChange: (v: string) => void; min?: string; mode?: "date" | "time";
}) {
  if (Platform.OS === "web") {
    return (
      <View style={{ gap: 6 }}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        {React.createElement("input", {
          type: mode,
          value: value || "",
          min,
          onChange: (e: any) => onChange(e.target.value),
          style: {
            width: "100%",
            boxSizing: "border-box",
            padding: "11px 12px",
            fontSize: 14,
            color: colors.text,
            backgroundColor: colors.surfaceAlt,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            outline: "none",
            fontFamily: "inherit",
          },
        })}
      </View>
    );
  }
  // Native fallback — typed entry with a light validation hint.
  if (mode === "time") {
    return <Field label={label} placeholder="HH:mm" value={value} onChangeText={onChange} icon="time-outline" />;
  }
  const invalid = value.trim().length > 0 && Number.isNaN(new Date(value).getTime());
  return (
    <Field
      label={label}
      placeholder="YYYY-MM-DD"
      value={value}
      onChangeText={onChange}
      icon="calendar-outline"
      hint={invalid ? "Use format YYYY-MM-DD" : undefined}
    />
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
});
