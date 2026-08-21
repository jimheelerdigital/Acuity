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

const TESTIMONIAL = {
  quote:
    "I didn't realize I was living the same week on repeat until Ripple showed me.",
  name: "Priya R.",
};

/**
 * Screen 1 of the pain-first onboarding (slice 2 v1.2). The hook.
 *
 * Visual: dark atmospheric, no logo / no chrome / no back button.
 * The dark canvas is intentional — the next four screens flip to
 * light, and that dark-to-light transition IS the emotional pivot
 * from "stuck" to "shown a way out".
 *
 * Motion (cubic-out, 400ms unless noted):
 *   - Headline: fade-up, 0ms delay
 *   - Sub:      fade-up, 200ms delay
 *   - CTA:      fade-in, 800ms delay (300ms duration)
 *
 * Reduced-motion: every animated value snaps to its final state
 * synchronously. AccessibilityInfo.isReduceMotionEnabled() is the
 * source of truth; we don't subscribe to live changes because the
 * screen is short-lived.
 *
 * The dark surface is forced via `makeAcuityTokens({ dark: true })`
 * regardless of the user's saved theme — slice 2 is theme-locked
 * dark, slices 7-9 are theme-locked light. The user's accent
 * palette IS honored so the small accent glints (none on this
 * screen, but the StatusBar inherits the bg color) stay consistent.
 */

const HEADLINE_DURATION = 400;
const SUB_DURATION = 400;
const CTA_DURATION = 300;
const SUB_DELAY = 200;
const CTA_DELAY = 800;
const FADE_UP_OFFSET = 12;

const EASE_CUBIC_OUT = Easing.bezier(0.215, 0.61, 0.355, 1);

export default function PainScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  // Force dark tokens for this screen — independent of the user's
  // saved appearance preference. The flow's emotional pivot needs
  // the dark canvas regardless of system / user setting.
  const tokens = makeAcuityTokens({ dark: true, accent: palette });

  const headlineOpacity = useSharedValue(0);
  const headlineY = useSharedValue(FADE_UP_OFFSET);
  const subOpacity = useSharedValue(0);
  const subY = useSharedValue(FADE_UP_OFFSET);
  const ctaOpacity = useSharedValue(0);

  const [ready, setReady] = useState(false);

  // Fire on mount — the cold-launch entry for the pain-first funnel.
  useEffect(() => {
    void trackOnboardingEvent("funnel_pain_hook_viewed");
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
    router.push("/onboarding-new/q1" as never);
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        {/* Headline + sub vertically centered in the upper-mid of
            the screen. CTA pinned to the lower-third. The negative
            space between is part of the composition — empty by
            design, not awaiting content. */}
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
                fontSize: 38,
                lineHeight: 44,
                fontWeight: "700",
                letterSpacing: -0.5,
                color: tokens.text,
              }}
            >
              Same week.{"\n"}Same loop.{"\n"}Same you.
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
              Days blur. Nothing sticks. Life passes.
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
