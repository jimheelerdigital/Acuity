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
  /**
   * Trial-only urgency input (slice 6, 2026-05-25). When `status==="TRIAL"`
   * and this is set, the pill shifts visual treatment based on days
   * remaining: gradMix tint at 4-7 days, bad-tinted at 1-3 days. Mobile
   * doesn't have a `warn` token so we reuse `bad` for the urgent tint.
   */
  daysRemaining?: number;
  /**
   * When true, force the "TRIAL ENDED" variant regardless of `status`.
   * Used by surfaces that detect a recent FREE-post-expiry transition
   * and want to keep the pill expressive for ~14 days afterward.
   */
  trialEnded?: boolean;
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
  daysRemaining,
  trialEnded,
  style,
}: SubscriptionPillProps) {
  const { tokens } = useTheme();
  const text = label ?? DEFAULT_LABELS[status];

  // TRIAL ENDED — wins over any status. FREE-post-expiry surfaces pass
  // trialEnded=true while within the ~14-day post-expiry window so the
  // pill stays expressive instead of silently dropping to "Free Plan".
  if (trialEnded) {
    const endedLabel = label ?? "Trial ended";
    return (
      <View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            borderRadius: tokens.radius.pill,
            backgroundColor: tokens.badSoft,
            borderWidth: 0.5,
            borderColor: tokens.bad,
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
            color: tokens.bad,
          }}
        >
          {endedLabel}
        </Text>
      </View>
    );
  }

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
          colors={tokens.gradMix.colors as unknown as readonly [string, string, ...string[]]}
          locations={tokens.gradMix.locations as unknown as readonly [number, number, ...number[]]}
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
  // affordance, distinct from Pro's gradient. Slice 6: when daysRemaining
  // is provided we shift visual treatment based on urgency.
  if (status === "TRIAL") {
    if (typeof daysRemaining === "number") {
      if (daysRemaining <= 0) {
        // Trial ended but caller passed status=TRIAL anyway (cron not
        // yet flipped). Treat as ended for visual consistency.
        const endedLabel = label ?? "Trial ended";
        return (
          <View
            style={[
              {
                flexDirection: "row",
                alignItems: "center",
                borderRadius: tokens.radius.pill,
                backgroundColor: tokens.badSoft,
                borderWidth: 0.5,
                borderColor: tokens.bad,
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
                color: tokens.bad,
              }}
            >
              {endedLabel}
            </Text>
          </View>
        );
      }
      const countLabel = label ?? `Trial · ${daysRemaining}d`;
      if (daysRemaining <= 3) {
        // Urgent — bad-tinted (mobile's warning red/amber). Hairline.
        return (
          <View
            style={[
              {
                flexDirection: "row",
                alignItems: "center",
                borderRadius: tokens.radius.pill,
                backgroundColor: tokens.badSoft,
                borderWidth: 0.5,
                borderColor: tokens.bad,
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
                color: tokens.bad,
              }}
            >
              {countLabel}
            </Text>
          </View>
        );
      }
      if (daysRemaining <= 7) {
        // Mid-trial — gradMix fill, white text.
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
              colors={tokens.gradMix.colors as unknown as readonly [string, string, ...string[]]}
              locations={tokens.gradMix.locations as unknown as readonly [number, number, ...number[]]}
              start={tokens.gradMix.start}
              end={tokens.gradMix.end}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
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
                {countLabel}
              </Text>
            </LinearGradient>
          </View>
        );
      }
      // > 7 days remaining — legacy mint pill, with the day count.
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
            {countLabel}
          </Text>
        </View>
      );
    }
    // No daysRemaining provided — legacy "Trial" pill.
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
