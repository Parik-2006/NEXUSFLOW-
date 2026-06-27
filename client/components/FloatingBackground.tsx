/**
 * FloatingBackground.tsx — ambient premium backdrop.
 * ---------------------------------------------------------------------------------
 * Soft, low-opacity gradient blobs that drift slowly behind all content. Purely
 * decorative: absolutely positioned, pointerEvents="none", rendered BEFORE the
 * scroll content so it never intercepts touches or alters layout. Uses RN
 * Animated (no dependency) and a web blur filter for the glassy glow.
 */
import React, { useEffect, useRef } from "react";
import { View, Animated, Easing, StyleSheet, Platform } from "react-native";
import { colors } from "@/theme";

function Blob({ color, size, left, top, dur, dx, dy }: {
  color: string; size: number; left: string; top: string; dur: number; dx: number; dy: number;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t, dur]);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", left: left as any, top: top as any, width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.07, transform: [{ translateX }, { translateY }, { scale }] },
        Platform.OS === "web" ? ({ filter: "blur(55px)" } as any) : null,
      ]}
    />
  );
}

export default function FloatingBackground() {
  return (
    <View pointerEvents="none" style={s.fill}>
      <Blob color={colors.primary} size={320} left="-8%" top="2%" dur={11000} dx={40} dy={30} />
      <Blob color={colors.accent} size={260} left="62%" top="8%" dur={13000} dx={-50} dy={40} />
      <Blob color="#8A7BA8" size={300} left="48%" top="58%" dur={15000} dx={30} dy={-40} />
      <Blob color="#C18A3E" size={220} left="-6%" top="64%" dur={12000} dx={45} dy={-25} />
    </View>
  );
}

const s = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
});
