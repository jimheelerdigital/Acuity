import { useEffect } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import type { AcuityTokens } from "@/lib/theme/tokens";

/**
 * Per-screen testimonial pinned near the bottom of the onboarding
 * screens. Italic quote + attribution, faded in 500ms after the
 * rest of the screen settles so the eye lands on it last.
 *
 * Reduced motion: instant render at final opacity.
 *
 * Pairing convention matches the web funnel exactly so a user
 * who walks the web /start flow and then opens the app sees the
 * same voices on the same screens:
 *   - Pain hook:   Priya R.
 *   - Q1 (loop):   David K.
 *   - Q2 (when):   Sarah K.
 *   - Q3 (tried):  Jamie L.
 *   - Q4 (cost):   David K.
 *   - Q5 (desire): Marcus T.
 *   - Bridge:      Sarah K.
 *   - Promise:     Marcus T.
 *   - Commitment / Recording: none (action screens stay clean)
 *
 * The pain / Q1-Q3 screens shipped in slices 2-3 without
 * testimonials; backfilling them is a follow-up. This component
 * is consumed by slice 4 (Q4 + Q5) first.
 */

const DELAY_MS = 500;
const DURATION_MS = 400;
const EASE_CUBIC_OUT = Easing.bezier(0.215, 0.61, 0.355, 1);

export function ScreenTestimonial({
  quote,
  name,
  tokens,
}: {
  quote: string;
  name: string;
  tokens: AcuityTokens;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      if (reduceMotion) {
        opacity.value = 1;
        translateY.value = 0;
      } else {
        opacity.value = withDelay(
          DELAY_MS,
          withTiming(1, { duration: DURATION_MS, easing: EASE_CUBIC_OUT })
        );
        translateY.value = withDelay(
          DELAY_MS,
          withTiming(0, { duration: DURATION_MS, easing: EASE_CUBIC_OUT })
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, { paddingHorizontal: 4 }]}>
      <View
        style={{
          borderLeftWidth: 2,
          borderLeftColor: tokens.cardBorder,
          paddingLeft: 12,
        }}
      >
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 13,
            lineHeight: 19,
            fontStyle: "italic",
            color: tokens.textSec,
          }}
        >
          &ldquo;{quote}&rdquo;
        </Text>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 11,
            lineHeight: 16,
            color: tokens.textTer,
            marginTop: 6,
          }}
        >
          — {name}
        </Text>
      </View>
    </Animated.View>
  );
}
