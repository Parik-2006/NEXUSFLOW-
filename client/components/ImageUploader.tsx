/**
 * ImageUploader.tsx — dependency-free image picker for profile photos & team logos.
 * ---------------------------------------------------------------------------------
 * On web: opens a native file picker (JPG/PNG/WEBP), downscales via an offscreen
 * <canvas> to keep the stored payload small, and returns a base64 data URL.
 * On native: falls back to a note (the app is web-primary; no expo-image-picker
 * dependency is added). Stored value is a plain string (data URL) — reused as
 * profileImage (local storage), team.logo and member.avatar (MongoDB strings).
 */
import React, { useState } from "react";
import { View, Text, Pressable, Image, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/theme";

const ACCEPT = "image/png,image/jpeg,image/webp";
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

// Downscale an image File to <= maxPx on its longest edge → base64 data URL.
async function processFile(file: File, maxPx = 256): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const im = new (window as any).Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });
  const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = (window as any).document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  // Keep PNG/WEBP as PNG (preserves logo transparency); photos → compact JPEG.
  const keepAlpha = file.type === "image/png" || file.type === "image/webp";
  return canvas.toDataURL(keepAlpha ? "image/png" : "image/jpeg", 0.85);
}

export default function ImageUploader({
  value, onChange, label, shape = "circle", size = 96, maxPx = 256,
}: {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
  shape?: "circle" | "square";
  size?: number;
  maxPx?: number;
}) {
  const [busy, setBusy] = useState(false);
  const br = shape === "circle" ? size / 2 : radius.md;

  const pick = () => {
    if (Platform.OS !== "web") return;
    const input = (window as any).document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.onchange = async (e: any) => {
      const file: File | undefined = e.target.files?.[0];
      if (!file) return;
      if (!ALLOWED.includes(file.type)) return; // JPG/PNG/WEBP only
      setBusy(true);
      try { onChange(await processFile(file, maxPx)); }
      catch { /* ignore */ }
      finally { setBusy(false); }
    };
    input.click();
  };

  return (
    <View style={{ gap: 8 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.row}>
        <View style={[s.preview, { width: size, height: size, borderRadius: br }]}>
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : value ? (
            <Image source={{ uri: value }} style={{ width: size, height: size, borderRadius: br }} resizeMode="cover" />
          ) : (
            <Ionicons name="image-outline" size={size * 0.34} color={colors.textFaint} />
          )}
        </View>
        <View style={{ gap: 6, flex: 1 }}>
          {Platform.OS === "web" ? (
            <>
              <Pressable style={s.btn} onPress={pick} disabled={busy}>
                <Ionicons name="cloud-upload-outline" size={15} color={colors.primary} />
                <Text style={s.btnTxt}>{value ? "Change image" : "Upload image"}</Text>
              </Pressable>
              {value ? (
                <Pressable style={s.btn} onPress={() => onChange(null)} disabled={busy}>
                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  <Text style={[s.btnTxt, { color: colors.danger }]}>Remove</Text>
                </Pressable>
              ) : null}
              <Text style={s.hint}>JPG, PNG or WEBP · resized automatically</Text>
            </>
          ) : (
            <Text style={s.hint}>Image upload is available on the web app.</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  preview: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 12, alignSelf: "flex-start" },
  btnTxt: { fontSize: 13, fontWeight: "700", color: colors.primary },
  hint: { fontSize: 11, color: colors.textFaint },
});
