/**
 * NexusFlowLogo — the official NEXUSFLOW brand mark (icon + wordmark).
 *
 * Source asset: assets/branding/nexusflow-logo.png (1254×1254, transparent).
 * Rendered asset: assets/branding/nexusflow-logo-512.png (optimized derivative).
 *
 * - Square, transparent PNG → fixed 1:1 box + resizeMode "contain": never
 *   distorted or cropped, no background, no layout shift (size is reserved).
 * - The wordmark is part of the image, so screens should not repeat a
 *   "NexusFlow" text title next to it.
 */
import React from "react";
import { Image, StyleSheet, View, ViewStyle } from "react-native";

const LOGO = require("../../assets/branding/nexusflow-logo-512.png");

type Props = {
  /** Rendered width/height in px (the logo is square). */
  size?: number;
  style?: ViewStyle;
  /** Accessible name; the image contains the "NEXUSFLOW" wordmark. */
  accessibilityLabel?: string;
};

export default function NexusFlowLogo({ size = 120, style, accessibilityLabel = "NexusFlow logo" }: Props) {
  return (
    <View style={[{ width: size, height: size }, style]}>
      <Image
        source={LOGO}
        style={styles.image}
        resizeMode="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", height: "100%", backgroundColor: "transparent" },
});
