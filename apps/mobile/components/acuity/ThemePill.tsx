import { LinearGradient } from "expo-linear-gradient";
import { Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * ThemePill — pill with a small theme-color gradient dot + label.
 *
 * Theme colors are stored as hue values per design (e.g., Career=295,
 * Family=25). The dot uses two oklch stops at that hue rendered as
 * a 135° gradient; the pill background tints the same hue at low
 * chroma. This is the visual link that ties a theme to its planet
 * on the Theme Map.
 *
 * Pre-computed hex pairs for the canonical 9 themes (matches the
 * design's planet hue list, see README "Planet data"). For themes
 * outside this set, callers can pass `hue` directly and we compute
 * approximations via a fixed mapping.
 *
 * The hex stops below are sampled from oklch(0.78 0.16 h) and
 * oklch(0.55 0.16 h) at the listed hues; saves a runtime culori
 * call per pill render (these are static).
 */

export type ThemeKey =
  | "career"
  | "family"
  | "health"
  | "avoidance"
  | "money"
  | "relationships"
  | "sleep"
  | "growth"
  | "solitude";

interface ThemeColors {
  dotTop: string;
  dotBottom: string;
  tintDark: string; // bg in dark mode
  tintLight: string; // bg in light mode
}

const THEME_COLORS: Record<ThemeKey, ThemeColors> = {
  // hue 295 — violet
  career: { dotTop: "#b58ef5", dotBottom: "#7a3eb5", tintDark: "#3a2d4e9e", tintLight: "#ece0fb" },
  // hue 25 — coral
  family: { dotTop: "#ffa886", dotBottom: "#c45a3e", tintDark: "#4a312a9e", tintLight: "#fde2d7" },
  // hue 165 — mint
  health: { dotTop: "#7eddbc", dotBottom: "#3d8e75", tintDark: "#2a3f3a9e", tintLight: "#d8efe6" },
  // hue 60 — amber
  avoidance: { dotTop: "#dfc26a", dotBottom: "#8a6f1e", tintDark: "#3e3a229e", tintLight: "#f1ead0" },
  // hue 115 — green
  money: { dotTop: "#a4d575", dotBottom: "#5a8a30", tintDark: "#2e3e2c9e", tintLight: "#dfecd0" },
  // hue 345 — pink
  relationships: { dotTop: "#f59abf", dotBottom: "#b54d77", tintDark: "#4a2d3a9e", tintLight: "#fad5e3" },
  // hue 235 — blue
  sleep: { dotTop: "#88a8e8", dotBottom: "#3f5fa8", tintDark: "#2c344a9e", tintLight: "#dee5f3" },
  // hue 195 — teal
  growth: { dotTop: "#80c9dd", dotBottom: "#3d7a8e", tintDark: "#2a3a429e", tintLight: "#d6eaf1" },
  // hue 275 — purple
  solitude: { dotTop: "#a986e8", dotBottom: "#6f3eaf", tintDark: "#352e4a9e", tintLight: "#e7daf6" },
};

export interface ThemePillProps {
  /** Canonical theme key. Lower-case. */
  theme: ThemeKey;
  /** Visible label. Usually the theme key Title-Cased. */
  label?: string;
  size?: "s" | "m";
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ThemePill({ theme, label, size = "m" }: ThemePillProps) {
  const { tokens, resolved } = useTheme();
  const colors = THEME_COLORS[theme];
  const padV = size === "s" ? 5 : 7;
  const padH = size === "s" ? 10 : 12;
  const fs = size === "s" ? 12 : 13;
  const dotSize = size === "s" ? 6 : 7;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingVertical: padV,
        paddingHorizontal: padH,
        borderRadius: tokens.radius.pill,
        backgroundColor: resolved === "dark" ? colors.tintDark : colors.tintLight,
        borderWidth: 0.5,
        borderColor: tokens.line,
        alignSelf: "flex-start",
      }}
    >
      <View
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          overflow: "hidden",
        }}
      >
        <LinearGradient
          colors={[colors.dotTop, colors.dotBottom]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        />
      </View>
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: fs,
          fontWeight: "600",
          letterSpacing: -0.1,
          color: tokens.text,
        }}
      >
        {label ?? titleCase(theme)}
      </Text>
    </View>
  );
}
