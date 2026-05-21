import { LinearGradient } from "expo-linear-gradient";
import { Text, View, type ViewStyle } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * Avatar — gradient circle with initials.
 *
 * Per spec (_design/design_handoff_acuity_v2/screen-home.jsx for the
 * 44px Home variant, screen-profile.jsx for the 64px Profile identity
 * hero variant): gradMix linear gradient background, white initial
 * glyph centered, optional 1.5–2px white-tint border for separation
 * against hero backgrounds.
 *
 * Use cases (per design):
 *   - Home greeting (size=44)
 *   - Profile identity hero (size=64)
 *
 * Q11 Phase B (2026-05-21) — extracted from inline implementations in
 * home/identity-hero.tsx (44px) and (tabs)/profile.tsx (64px). Profile
 * was using a hardcoded violet-600 bg + violet-400 initial; now both
 * call sites match the palette.
 */

export interface AvatarProps {
  initials: string;
  /** Pixel size of the circle. Default 44 (Home variant). */
  size?: number;
  /** Show the white-tint separator border. Default true. */
  border?: boolean;
  /** Override the initial font size. Defaults to ~38% of `size`. */
  initialFontSize?: number;
  style?: ViewStyle;
}

export function Avatar({
  initials,
  size = 44,
  border = true,
  initialFontSize,
  style,
}: AvatarProps) {
  const { tokens } = useTheme();
  const fontSize = initialFontSize ?? Math.round(size * 0.38);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
          borderWidth: border ? 1.5 : 0,
          // White-tint border at ~15% alpha — separates the gradient
          // disc from hero / heroGrad backgrounds without being a
          // hard ring. Matches the design's "ffffff26" choice.
          borderColor: border ? "#ffffff26" : "transparent",
        },
        style,
      ]}
    >
      <LinearGradient
        colors={tokens.gradMix.colors}
        locations={tokens.gradMix.locations}
        start={tokens.gradMix.start}
        end={tokens.gradMix.end}
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize,
            fontWeight: "700",
            letterSpacing: -0.3,
            color: "#ffffff",
          }}
        >
          {initials}
        </Text>
      </LinearGradient>
    </View>
  );
}
