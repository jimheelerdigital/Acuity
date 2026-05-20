import { Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { GradientText } from "./GradientText";

/**
 * TierPill — "Lv N · Name" pill with a gradient level number.
 *
 * Composition: GlassPill-style chrome (hairline + bgSub) with the
 * "Lv" prefix in textSec, the level number in a primary→secondary
 * gradient via GradientText, then a separator dot and the tier name
 * in textSec. The gradient on just the number is the design's read
 * — full pill gradient would feel kitschy.
 *
 * Use cases (per design):
 *   - Home Dashboard top bar tier indicator
 *   - Profile identity hero
 *   - Achievement strip locked-state preview
 */

export interface TierPillProps {
  level: number;
  name: string;
}

export function TierPill({ level, name }: TierPillProps) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: tokens.radius.pill,
        backgroundColor: tokens.bgSub,
        borderWidth: 0.5,
        borderColor: tokens.line,
        alignSelf: "flex-start",
      }}
    >
      <Text
        style={{
          fontFamily: tokens.fontMono,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.4,
          color: tokens.textTer,
        }}
      >
        LV
      </Text>
      <GradientText
        colors={[tokens.primary, tokens.secondary]}
        style={{
          fontFamily: tokens.fontDisplay,
          fontSize: 16,
          fontWeight: "700",
          letterSpacing: -0.4,
          fontVariant: ["tabular-nums"],
        }}
      >
        {level}
      </GradientText>
      <View
        style={{
          width: 3,
          height: 3,
          borderRadius: 1.5,
          backgroundColor: tokens.textTer,
          marginHorizontal: 2,
        }}
      />
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 12,
          fontWeight: "600",
          letterSpacing: -0.1,
          color: tokens.textSec,
        }}
      >
        {name}
      </Text>
    </View>
  );
}
