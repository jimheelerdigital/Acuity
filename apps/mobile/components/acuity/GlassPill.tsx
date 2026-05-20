import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * GlassPill — translucent blurred surface used for floating chrome.
 *
 * Wraps `expo-blur`'s BlurView with a hairline border in the active
 * theme's `lineStrong` token so the edge reads against both light
 * and dark content. Default radius is `pill` (full rounded) which
 * matches every use case in the brief; pass a numeric `radius` to
 * override for the rare card-sized surface.
 *
 * Use cases (per design):
 *   - Recording top "Cancel" and "● REC" pills
 *   - Entry detail floating back / share / more buttons
 *   - Extract review sticky bottom action pill
 *
 * Intensity defaults to 28 (matches the CSS `blur(28px)` in the
 * source chrome). iOS clamps to its own scale internally; the
 * effective blur on-device is close to the design canvas.
 */

export interface GlassPillProps {
  intensity?: number;
  tint?: "light" | "dark" | "default";
  radius?: number;
  /** Padding shorthand — number for all sides or [vertical, horizontal]. */
  padding?: number | [number, number];
  style?: ViewStyle;
  children: ReactNode;
}

export function GlassPill({
  intensity = 28,
  tint,
  radius,
  padding,
  style,
  children,
}: GlassPillProps) {
  const { tokens, resolved } = useTheme();
  const effectiveTint = tint ?? (resolved === "dark" ? "dark" : "light");
  const effectiveRadius = radius ?? tokens.radius.pill;
  const padV = Array.isArray(padding) ? padding[0] : padding ?? 8;
  const padH = Array.isArray(padding) ? padding[1] : padding ?? 14;
  return (
    <View
      style={[
        {
          borderRadius: effectiveRadius,
          overflow: "hidden",
          borderWidth: 0.5,
          borderColor: tokens.lineStrong,
        },
        style,
      ]}
    >
      <BlurView
        intensity={intensity}
        tint={effectiveTint}
        style={{
          paddingVertical: padV,
          paddingHorizontal: padH,
        }}
      >
        {children}
      </BlurView>
    </View>
  );
}
