import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * HeroCard — large gradient-backed card with a soft corner glow blob.
 *
 * The blob is a low-opacity radial-like effect achieved by stacking
 * a second LinearGradient (`gradMixSoft`) in the top-right corner.
 * Real radial gradients would need react-native-svg or a third-party
 * lib — the layered linear approach is the design's endorsed
 * fallback (README "Implementation Notes for React Native" §4).
 *
 * Use cases (per design):
 *   - Home hero "Life Matrix" card (variant='primary')
 *   - Home "Weekly insight teaser" card (variant='secondary')
 *   - Profile identity hero (variant='primary')
 *   - Entry detail pull-quote hero (variant='primary')
 *   - Onboarding extract review pull-quote (variant='primary')
 *
 * Padding defaults to 20 (matches the design's hero cards). Caller
 * passes children — content layout lives in the screen.
 */

export interface HeroCardProps {
  /**
   * primary  — gradPrimary corner blob over cardBgTint surface
   * secondary — gradSecondary corner blob (used for Weekly Insight)
   * mix      — gradMix (warm→cool full bleed, used in extract review)
   */
  variant?: "primary" | "secondary" | "mix";
  /** Override default padding (20). */
  padding?: number;
  style?: ViewStyle;
  children: ReactNode;
}

export function HeroCard({
  variant = "primary",
  padding = 20,
  style,
  children,
}: HeroCardProps) {
  const { tokens } = useTheme();

  // Mix variant is a full-bleed gradient (no surface tint underneath).
  if (variant === "mix") {
    return (
      <View
        style={[
          {
            borderRadius: tokens.radius.xl,
            overflow: "hidden",
            borderWidth: 0.5,
            borderColor: tokens.cardBorder,
          },
          style,
        ]}
      >
        <LinearGradient
          colors={tokens.gradMix.colors}
          locations={tokens.gradMix.locations}
          start={tokens.gradMix.start}
          end={tokens.gradMix.end}
          style={{ padding }}
        >
          {children}
        </LinearGradient>
      </View>
    );
  }

  // primary / secondary: hue-tinted card surface + corner blob.
  const blob =
    variant === "secondary"
      ? {
          colors: tokens.gradSecondary.colors.map((c) => `${c}55`) as [
            string,
            string,
            ...string[],
          ],
        }
      : {
          colors: tokens.gradPrimary.colors.map((c) => `${c}55`) as [
            string,
            string,
            ...string[],
          ],
        };

  return (
    <View
      style={[
        {
          borderRadius: tokens.radius.xl,
          overflow: "hidden",
          backgroundColor: tokens.cardBgTint,
          borderWidth: 0.5,
          borderColor: tokens.cardBorder,
        },
        style,
      ]}
    >
      {/* Corner blob — sized 60% of card width, anchored top-right.
          opacity in the color hex already; absolute-positioned so it
          doesn't push content. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -20,
          right: -20,
          width: 240,
          height: 180,
          opacity: 0.6,
        }}
      >
        <LinearGradient
          colors={blob.colors}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ flex: 1, borderRadius: 999 }}
        />
      </View>
      <View style={{ padding }}>{children}</View>
    </View>
  );
}
