import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

import { HeroCard } from "@/components/acuity";
import { useTheme } from "@/contexts/theme-context";

import type { VersionCheckConfig } from "@/lib/version-check";

/**
 * UpdatePromptModal — atmospheric in-app update prompt. Sits on top
 * of the route stack via UpdatePromptOverlay's mount, hosted in the
 * root layout.
 *
 * Visual composition (mirrors DESIGN_SYSTEM.md §5.2 HeroCard +
 * mobile entry-detail pull-quote treatment):
 *
 *   - Full-screen dimmed backdrop, 60% black overlay.
 *   - Centered HeroCard variant="primary" — coral corner blob over
 *     cardBgTint surface.
 *   - Headline: display-22, Manrope 700, atmospheric leading-tight.
 *   - Body: sans 15 textSec, generous line-height.
 *   - Optional release-notes bullet list (textTer, mono "·" bullets).
 *   - Primary CTA: gradMix linear-gradient pill, white label,
 *     active scale 0.98. No ambient pulse — per §4.4 glow rule,
 *     this is a ceremonial CTA but the glow is OFF until tap so the
 *     modal doesn't feel like a marketing surface.
 *   - Dismiss "Later" link below — text-only, textSec, no fill.
 *     Hidden when isForced.
 *   - Footer note when isForced: "This update is required to
 *     continue.", mono 11 uppercase 1.4 letter-spacing, textTer.
 *
 * Motion:
 *
 *   - Entrance: opacity 0→1 + translateY 8→0 over durBase (280ms),
 *     easeStandard (cubic-bezier 0.32, 0.72, 0, 1).
 *   - Exit: opacity 1→0 + scale 1→0.96 over durBase, easeStandard.
 *     Mounts/unmounts on dismiss.
 *   - prefers-reduced-motion (iOS Settings → Accessibility → Motion
 *     → Reduce Motion): both entrance + exit collapse to a 0ms set
 *     so the modal blink-mounts. Honored via AccessibilityInfo
 *     check on mount.
 *
 * No pulse, no ambient shimmer, no glow halo. Per the design
 * non-negotiables: restraint signals confidence.
 */

const DUR_BASE_MS = 280;
const EASE_STANDARD = Easing.bezier(0.32, 0.72, 0, 1);

export interface UpdatePromptModalProps {
  config: VersionCheckConfig;
  isForced: boolean;
  /** Called after the dismiss exit animation finishes (or
   *  immediately when reduce-motion is on). */
  onDismiss: () => void;
  /** Tap-to-update side effect. Slice 4 wires the App Store URL. */
  onUpdate?: () => void;
}

export function UpdatePromptModal({
  config,
  isForced,
  onDismiss,
  onUpdate,
}: UpdatePromptModalProps) {
  const { tokens } = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);
  const scale = useSharedValue(1);

  useEffect(() => {
    // Resolve reduce-motion preference once on mount. AccessibilityInfo
    // also exposes a change listener — not subscribed because the
    // modal is short-lived (mount → user acts → unmount); honoring
    // a mid-modal preference flip isn't worth the wire.
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      setReduceMotion(v);
      // If reduce-motion is on, snap to final state (no animation).
      if (v) {
        opacity.value = 1;
        translateY.value = 0;
      } else {
        opacity.value = withTiming(1, {
          duration: DUR_BASE_MS,
          easing: EASE_STANDARD,
        });
        translateY.value = withTiming(0, {
          duration: DUR_BASE_MS,
          easing: EASE_STANDARD,
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDismiss() {
    if (reduceMotion) {
      onDismiss();
      return;
    }
    // Fade-down + scale-down exit. runOnJS hops the callback back to
    // the JS thread (Reanimated worklet → React state).
    opacity.value = withTiming(0, {
      duration: DUR_BASE_MS,
      easing: EASE_STANDARD,
    });
    scale.value = withTiming(
      0.96,
      { duration: DUR_BASE_MS, easing: EASE_STANDARD },
      (finished) => {
        if (finished) runOnJS(onDismiss)();
      }
    );
  }

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Modal
      transparent
      animationType="none"
      visible
      // Hardware back / swipe-down on iOS sheet — block when force-
      // update is active; otherwise treat as a Later tap.
      onRequestClose={isForced ? () => {} : handleDismiss}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 24,
        }}
      >
        <Animated.View style={[{ width: "100%", maxWidth: 380 }, animatedStyle]}>
          <HeroCard variant="primary" padding={24}>
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 22,
                fontWeight: "700",
                letterSpacing: -0.4,
                lineHeight: 26,
                color: tokens.text,
              }}
            >
              {config.headline}
            </Text>

            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 15,
                lineHeight: 22,
                letterSpacing: -0.1,
                color: tokens.textSec,
                marginTop: 14,
              }}
            >
              {config.body}
            </Text>

            {/* Optional release-notes list */}
            {config.releaseNotes && config.releaseNotes.length > 0 && (
              <View style={{ marginTop: 18, gap: 6 }}>
                {config.releaseNotes.map((note, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: tokens.fontMono,
                        fontSize: 13,
                        color: tokens.textTer,
                        lineHeight: 20,
                      }}
                    >
                      ·
                    </Text>
                    <Text
                      style={{
                        fontFamily: tokens.fontSans,
                        fontSize: 13,
                        lineHeight: 20,
                        color: tokens.textTer,
                        flex: 1,
                      }}
                    >
                      {note}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Primary CTA — gradMix linear-gradient pill */}
            <Pressable
              onPress={onUpdate}
              accessibilityRole="button"
              accessibilityLabel={config.ctaText}
              style={({ pressed }) => ({
                marginTop: 24,
                borderRadius: tokens.radius.pill,
                overflow: "hidden",
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <LinearGradient
                // expo-linear-gradient ships strict-tuple types; the
                // structured tokens give plain arrays. Cast matches
                // the same pattern used in mobile HeroCard etc.
                colors={
                  tokens.gradMix.colors as unknown as readonly [
                    string,
                    string,
                    ...string[],
                  ]
                }
                locations={
                  tokens.gradMix.locations as unknown as readonly [
                    number,
                    number,
                    ...number[],
                  ]
                }
                start={tokens.gradMix.start}
                end={tokens.gradMix.end}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 24,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 15,
                    fontWeight: "600",
                    letterSpacing: -0.2,
                    color: "#ffffff",
                  }}
                >
                  {config.ctaText}
                </Text>
              </LinearGradient>
            </Pressable>

            {/* Secondary dismiss — only when soft-update + dismissible */}
            {!isForced && config.dismissible && (
              <Pressable
                onPress={handleDismiss}
                accessibilityRole="button"
                accessibilityLabel="Later"
                style={{
                  marginTop: 10,
                  paddingVertical: 12,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 14,
                    fontWeight: "500",
                    letterSpacing: -0.1,
                    color: tokens.textSec,
                  }}
                >
                  Later
                </Text>
              </Pressable>
            )}

            {/* Force-update footer note */}
            {isForced && (
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  textAlign: "center",
                  color: tokens.textTer,
                  marginTop: 16,
                }}
              >
                This update is required to continue.
              </Text>
            )}
          </HeroCard>
        </Animated.View>
      </View>
    </Modal>
  );
}
