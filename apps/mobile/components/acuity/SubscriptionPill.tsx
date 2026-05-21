import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Text, View, type ViewStyle } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * SubscriptionPill — subscription state badge (Free / Pro / Trial).
 *
 * Per spec (_design/design_handoff_acuity_v2/screen-profile.jsx): the
 * Pro pill is a gradMix-filled pill with a leading sparkle icon + 9pt
 * mono uppercase label. The Free state isn't called out in the spec,
 * so we render a quiet equivalent — bgSub fill, no glow, mono label
 * — that visually deprioritizes it (the design's "Pro" pill is the
 * focal point; Free shouldn't compete).
 *
 * Trial uses the goodSoft / good colorway so it reads as "active +
 * positive" without being mistaken for Pro.
 *
 * Use cases:
 *   - Profile identity hero (this file's primary consumer)
 *   - Any other surface that needs to display subscription state
 *     consistently
 *
 * Q11 Phase B (2026-05-21) — extracted from the inline conditional
 * className badge that was at apps/mobile/app/(tabs)/profile.tsx:190-
 * 206 (hardcoded bg-violet-600/20 + text-violet-400 + bg-zinc-800
 * fallback).
 */

export type SubscriptionStatus =
  | "FREE"
  | "PRO"
  | "TRIAL"
  | "PAST_DUE"
  | "CANCELED";

export interface SubscriptionPillProps {
  status: SubscriptionStatus;
  /** Custom label override. Defaults to a spec-aligned status name. */
  label?: string;
  style?: ViewStyle;
}

const DEFAULT_LABELS: Record<SubscriptionStatus, string> = {
  FREE: "Free Plan",
  PRO: "Pro",
  TRIAL: "Trial",
  PAST_DUE: "Past Due",
  CANCELED: "Canceled",
};

export function SubscriptionPill({
  status,
  label,
  style,
}: SubscriptionPillProps) {
  const { tokens } = useTheme();
  const text = label ?? DEFAULT_LABELS[status];

  // PRO renders the gradMix-filled "Pro pill" from the spec.
  if (status === "PRO") {
    return (
      <View
        style={[
          {
            borderRadius: tokens.radius.pill,
            overflow: "hidden",
            alignSelf: "flex-start",
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
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Ionicons name="sparkles" size={10} color="#ffffff" />
          <Text
            style={{
              fontFamily: tokens.fontMono,
              fontSize: 9,
              fontWeight: "700",
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "#ffffff",
            }}
          >
            {text}
          </Text>
        </LinearGradient>
      </View>
    );
  }

  // TRIAL renders with the good (mint) palette as an "active + positive"
  // affordance, distinct from Pro's gradient.
  if (status === "TRIAL") {
    return (
      <View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            borderRadius: tokens.radius.pill,
            backgroundColor: tokens.goodSoft,
            borderWidth: 0.5,
            borderColor: tokens.good,
            paddingHorizontal: 10,
            paddingVertical: 4,
            alignSelf: "flex-start",
          },
          style,
        ]}
      >
        <Text
          style={{
            fontFamily: tokens.fontMono,
            fontSize: 9,
            fontWeight: "700",
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: tokens.good,
          }}
        >
          {text}
        </Text>
      </View>
    );
  }

  // FREE / PAST_DUE / CANCELED — quiet pill, bgSub fill, hairline,
  // mono uppercase tertiary text. Visually deprioritized so the
  // Pro pill is always the focal point when present.
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          borderRadius: tokens.radius.pill,
          backgroundColor: tokens.bgSub,
          borderWidth: 0.5,
          borderColor: tokens.line,
          paddingHorizontal: 10,
          paddingVertical: 4,
          alignSelf: "flex-start",
        },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: tokens.fontMono,
          fontSize: 9,
          fontWeight: "700",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: tokens.textTer,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
