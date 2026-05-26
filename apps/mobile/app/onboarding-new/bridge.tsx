import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/contexts/theme-context";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import { makeAcuityTokens } from "@/lib/theme/tokens";

import { ScreenTestimonial } from "./_components/screen-testimonial";

/**
 * Screen 7 — Failed Solution bridge. Dark atmospheric pivot,
 * mirrors the slice 2 pain screen so the user experiences a
 * symmetric dark-light-dark-light cadence across the flow:
 *
 *   1 (dark) pain → 2-6 (light) diagnostics → 7 (dark) bridge →
 *   8+ (light) promise / commitment / recording / reveal / signup
 *
 * The dark-to-dark callback is the emotional pivot from "you've
 * tried everything" (Q3 answers) to "here's why this is different
 * (one minute, not discipline)".
 *
 * Sarah K. testimonial — matches the web pairing on the
 * failed-solution screen. The component handles its own
 * 500ms-delayed fade-up.
 *
 * Motion (cubic-out):
 *   - Headline: fade-up 400ms, 0ms delay
 *   - Sub:      fade-up 400ms, 200ms delay
 *   - Testimonial: 500ms internal delay (component)
 *   - CTA:      fade-in 300ms, 1200ms delay — lower emphasis than
 *               later CTAs per spec; gives the body copy time to
 *               land before the user can advance
 */

const HEADLINE_DURATION = 400;
const SUB_DURATION = 400;
const CTA_DURATION = 300;
const SUB_DELAY = 200;
const CTA_DELAY = 1200;
const FADE_UP_OFFSET = 12;

const EASE_CUBIC_OUT = Easing.bezier(0.215, 0.61, 0.355, 1);

const TESTIMONIAL = {
  quote:
    "I used to let tasks pile up in my head until 2 AM. Now I debrief into Acuity and actually sleep.",
  name: "Sarah K.",
};

export default function BridgeScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  // Forced dark — symmetric with pain.tsx. Independent of user theme.
  const tokens = makeAcuityTokens({ dark: true, accent: palette });

  const headlineOpacity = useSharedValue(0);
  const headlineY = useSharedValue(FADE_UP_OFFSET);
  const subOpacity = useSharedValue(0);
  const subY = useSharedValue(FADE_UP_OFFSET);
  const ctaOpacity = useSharedValue(0);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    void trackOnboardingEvent("funnel_failed_solution_viewed");
  }, []);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      if (reduceMotion) {
        headlineOpacity.value = 1;
        headlineY.value = 0;
        subOpacity.value = 1;
        subY.value = 0;
        ctaOpacity.value = 1;
      } else {
        headlineOpacity.value = withTiming(1, {
          duration: HEADLINE_DURATION,
          easing: EASE_CUBIC_OUT,
        });
        headlineY.value = withTiming(0, {
          duration: HEADLINE_DURATION,
          easing: EASE_CUBIC_OUT,
        });
        subOpacity.value = withDelay(
          SUB_DELAY,
          withTiming(1, {
            duration: SUB_DURATION,
            easing: EASE_CUBIC_OUT,
          })
        );
        subY.value = withDelay(
          SUB_DELAY,
          withTiming(0, {
            duration: SUB_DURATION,
            easing: EASE_CUBIC_OUT,
          })
        );
        ctaOpacity.value = withDelay(
          CTA_DELAY,
          withTiming(1, {
            duration: CTA_DURATION,
            easing: EASE_CUBIC_OUT,
          })
        );
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [headlineOpacity, headlineY, subOpacity, subY, ctaOpacity]);

  const headlineStyle = useAnimatedStyle(() => ({
    opacity: headlineOpacity.value,
    transform: [{ translateY: headlineY.value }],
  }));
  const subStyle = useAnimatedStyle(() => ({
    opacity: subOpacity.value,
    transform: [{ translateY: subY.value }],
  }));
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
  }));

  const onContinue = () => {
    router.push("/onboarding-new/promise" as never);
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: 28,
          }}
        >
          <Animated.View style={headlineStyle}>
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 30,
                lineHeight: 38,
                fontWeight: "700",
                letterSpacing: -0.4,
                color: tokens.text,
              }}
            >
              Written journaling asks for discipline. Acuity just asks for
              one minute.
            </Text>
          </Animated.View>

          <Animated.View style={[subStyle, { marginTop: 20 }]}>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 15,
                lineHeight: 22,
                color: tokens.textTer,
              }}
            >
              No typing. No prompts. No blank pages. Just talk.
            </Text>
          </Animated.View>

          <View style={{ marginTop: 32 }}>
            <ScreenTestimonial
              quote={TESTIMONIAL.quote}
              name={TESTIMONIAL.name}
              tokens={tokens}
            />
          </View>
        </View>

        <Animated.View
          style={[
            ctaStyle,
            {
              paddingHorizontal: 28,
              paddingBottom: 24,
            },
          ]}
        >
          <Pressable
            onPress={onContinue}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              opacity: pressed ? 0.7 : 1,
              paddingVertical: 12,
            })}
          >
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 17,
                fontWeight: "600",
                color: tokens.text,
              }}
            >
              Continue →
            </Text>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}
