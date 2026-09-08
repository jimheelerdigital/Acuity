import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import type { AcuityTokens } from "@/lib/theme/tokens";

/**
 * Shared v10 funnel UI: ONE call-to-action and ONE type scale.
 *
 * Everything here reads from `makeAcuityTokens` — no hex, no font names.
 * The single literal is the CTA label's `#ffffff`, which is the on-primary
 * colour the palette has no token for (the same exception the funnel
 * screens already documented individually; it now exists once).
 *
 * ── Why the CTA is not a copy of app/paywall.tsx ─────────────────────
 * The brief pointed at paywall.tsx as the canonical primary button. Its
 * SHAPE is canonical and reproduced faithfully — pill radius, tall
 * padding, centred bold white label on a coral fill. Its GLOW is not:
 * paywall.tsx spreads `tokens.glowPrimary` (`{color, radius, opacity}`)
 * into the style array, and RN's style flattening reads that `opacity`
 * as a TOP-LEVEL opacity on the button. app/subscribe.tsx hit exactly
 * this and documents the outcome: "the button rendered at glow-opacity
 * (~40%) … and the white label went near invisible." Copying it would
 * have reproduced the bug this component exists to fix, so the glow is
 * applied as the RN shadow props the token was always meant to feed —
 * matching the CORRECTED usage in subscribe.tsx and (tabs)/_layout.tsx.
 *
 * ── Why the fill is primaryLo, not primary ───────────────────────────
 * Measured against the shipped palette (coral, both modes):
 *
 *   white on tokens.primary   #ff8a65   2.31:1   fails even AA-large
 *   white on tokens.primaryHi #ffa47e   1.93:1   worse
 *   white on tokens.primaryLo #e06b46   3.30:1   passes AA for large text
 *
 * So a white label on `primary` was never readable — the missing glow
 * made it worse, but it was under-contrast on its own. Per the brief's
 * fallback ("deepen the button FILL … keep the white label + glow"),
 * the fill is `primaryLo`: the same hue, one step darker, still
 * unmistakably the brand coral. The glow uses `primary` so the halo
 * stays the brighter accent and the button still reads as coral.
 *
 * AA-large requires >= 18.66px bold, so `LABEL_SIZE` is 19 and the family
 * is `fontDisplay` (Manrope_700Bold). Shrinking the label below that
 * silently drops the button under the accessibility threshold.
 */

/** Bold display type at or above this size clears WCAG's large-text bar. */
const LABEL_SIZE = 19;

export interface FunnelCtaProps {
  label: string;
  onPress: () => void;
  tokens: AcuityTokens;
  /** Greys out and blocks presses. */
  disabled?: boolean;
  /** Swaps the label for a spinner. Implies `disabled`. */
  busy?: boolean;
  /** Shown instead of `label` while busy, when a word beats a spinner. */
  busyLabel?: string;
  /** `lg` is the recording Stop button; everything else is `md`. */
  size?: "md" | "lg";
  /**
   * Set on a CORAL surface, where a coral button is invisible against its
   * own background — the CoralScreen gradient bottoms out at exactly the
   * `primaryLo` this button is filled with.
   *
   * Inverts to a white pill with a coral label. That is not a violation of
   * "never dark text on coral": there is no dark text, and the button is a
   * WHITE surface, not a coral one. Contrast is identical to the normal
   * variant (3.30:1) because inverting a pair preserves its ratio.
   */
  onCoral?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

export function FunnelCta({
  label,
  onPress,
  tokens,
  disabled = false,
  busy = false,
  busyLabel,
  size = "md",
  onCoral = false,
  accessibilityLabel,
  style,
}: FunnelCtaProps) {
  const inactive = disabled || busy;
  const fill = onCoral ? "#ffffff" : tokens.primaryLo;
  const labelColor = onCoral ? tokens.primaryLo : "#ffffff";

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => ({
        backgroundColor: fill,
        borderRadius: tokens.radius.pill,
        paddingVertical: size === "lg" ? 20 : 18,
        alignItems: "center",
        justifyContent: "center",
        // Disabled reads as flat-and-dimmed; pressed keeps full opacity so
        // the press feels like a press rather than a fade.
        opacity: disabled ? 0.45 : busy ? 0.8 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
        // The glow, as RN shadow props. NOT a spread of tokens.glowPrimary —
        // see the note at the top of this file. On a coral surface a coral
        // glow is invisible, so the white pill gets a soft dark lift instead.
        shadowColor: onCoral ? tokens.shadowLift.color : tokens.glowPrimary.color,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: inactive
          ? 0
          : onCoral
            ? tokens.shadowLift.radius
            : tokens.glowPrimary.radius,
        shadowOpacity: inactive
          ? 0
          : onCoral
            ? tokens.shadowLift.opacity
            : tokens.glowPrimary.opacity,
        elevation: inactive ? 0 : Math.round(tokens.glowPrimary.radius / 2),
        ...style,
      })}
    >
      {busy && !busyLabel ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: LABEL_SIZE,
            // The palette has no on-primary token; white is the CTA label
            // colour throughout the app. Never dark text on coral — on a
            // coral SURFACE the button inverts to white instead.
            color: labelColor,
          }}
        >
          {busy && busyLabel ? busyLabel : label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * One type scale for every funnel screen.
 *
 * Built as a function of tokens so colour and family always come from the
 * palette. The contrast figures below are measured on the shipped coral
 * palette and hold in both modes:
 *
 *   tokens.text     18.5:1 light / 16.7:1 dark
 *   tokens.textSec   7.9:1 light /  7.7:1 dark   ← body copy lives here
 *   tokens.textTer   4.0:1 light /  3.8:1 dark   ← large/meta ONLY
 *
 * `textTer` is below AA for normal-size body text in both modes, which is
 * why body and lead both use `textSec`. Reserve `caption` for genuine
 * meta — timestamps, counts, legal — never for something the user has to
 * read to follow the flow.
 */
export function funnelType(tokens: AcuityTokens) {
  return {
    /** Screen headline. One per screen. */
    h1: {
      fontFamily: tokens.fontDisplay,
      fontSize: 30,
      lineHeight: 36,
      color: tokens.text,
    },
    /** Section heading inside a screen. */
    h2: {
      fontFamily: tokens.fontDisplay,
      fontSize: 22,
      lineHeight: 28,
      color: tokens.text,
    },
    /** The sentence under a headline — still primary reading. */
    lead: {
      fontFamily: tokens.fontSans,
      fontSize: 17,
      lineHeight: 26,
      color: tokens.textSec,
    },
    /** Standard body copy. */
    body: {
      fontFamily: tokens.fontSans,
      fontSize: 16,
      lineHeight: 24,
      color: tokens.textSec,
    },
    /** Meta only — never primary reading text. */
    caption: {
      fontFamily: tokens.fontSans,
      fontSize: 13,
      lineHeight: 18,
      color: tokens.textTer,
    },
  } as const;
}


// ─────────────────────────────────────────────────────────────────────
// Coral surfaces — the opening screens (recognition, mirror)
// ─────────────────────────────────────────────────────────────────────

/**
 * Full-bleed coral background for the opening screens.
 *
 * A same-hue vertical gradient rather than a flat fill: it gives the
 * screen depth (the brief's "optionally a subtle same-hue gradient") and,
 * because it runs primary -> primaryLo, the lower two-thirds — where the
 * body copy and the cards sit — is the darker end of the ramp. That is
 * doing real work, not decoration:
 *
 *   white on tokens.primary   #ff8a65   2.31:1
 *   white on tokens.primaryLo #e06b46   3.30:1
 *
 * Neither reaches AA for normal-size text. Running the ramp downward puts
 * the copy over the better end instead of the worse one. See the note in
 * the diff summary — the honest fix is a deeper coral token, which is a
 * palette decision rather than a funnel one.
 *
 * The status-bar area keeps the top (brighter) stop, so the screen still
 * reads as the bright marketing coral at a glance.
 */
export function CoralScreen({
  tokens,
  children,
  style,
}: {
  tokens: AcuityTokens;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ flex: 1, backgroundColor: tokens.primary }, style]}>
      <LinearGradient
        colors={[tokens.primaryHi, tokens.primary, tokens.primaryLo]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

/**
 * Type scale for coral surfaces. Everything is white — the hard rule is
 * that text on coral NEVER flips to dark, so states vary opacity, never
 * colour. `#ffffff` is the on-primary colour the palette has no token for;
 * it appears here and in FunnelCta and nowhere else in the funnel.
 */
export function coralType(tokens: AcuityTokens) {
  return {
    h1: {
      fontFamily: tokens.fontDisplay,
      fontSize: 30,
      lineHeight: 38,
      color: "#ffffff",
    },
    lead: {
      fontFamily: tokens.fontSans,
      fontSize: 17,
      lineHeight: 26,
      color: "#ffffff",
      opacity: 0.92,
    },
    body: {
      fontFamily: tokens.fontSans,
      fontSize: 16,
      lineHeight: 24,
      color: "#ffffff",
      opacity: 0.9,
    },
    /** Card lead line. */
    cardTitle: {
      fontFamily: tokens.fontDisplay,
      fontSize: 17,
      lineHeight: 24,
      color: "#ffffff",
    },
    /** Low-emphasis on coral — still white, just quieter. */
    muted: {
      fontFamily: tokens.fontSans,
      fontSize: 14,
      lineHeight: 20,
      color: "#ffffff",
      opacity: 0.78,
    },
  } as const;
}

/**
 * Translucent-white choice card on a coral surface.
 *
 * Selected is a BRIGHTER translucent white plus a white border — never a
 * flip to a white card or to dark text, which is the rule this whole
 * treatment exists to obey. Pressed sits between the two so a tap is felt
 * without previewing the selected state.
 */
export function coralCardStyle(
  tokens: AcuityTokens,
  { selected = false, pressed = false }: { selected?: boolean; pressed?: boolean } = {}
): ViewStyle {
  return {
    backgroundColor: selected
      ? "rgba(255,255,255,0.28)"
      : pressed
        ? "rgba(255,255,255,0.20)"
        : "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: selected ? "#ffffff" : "rgba(255,255,255,0.28)",
    borderRadius: tokens.radius.md,
    paddingVertical: 18,
    paddingHorizontal: 20,
    transform: [{ scale: pressed ? 0.99 : 1 }],
  };
}
