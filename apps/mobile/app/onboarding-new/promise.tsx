import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/contexts/theme-context";
import { useOnboardingState } from "@/contexts/onboarding-context";
import { makeAcuityTokens } from "@/lib/theme/tokens";

import { ScreenTestimonial } from "./_components/screen-testimonial";
import { getPersonalizedPromise } from "./_components/promise-lookup";

/**
 * Screen 8 — Personalized Promise. Slice 6 v1.2 onboarding-v2.
 *
 * Light theme — relief moment after the dark bridge. The headline
 * is picked by getPersonalizedPromise(answers) from the full 5-
 * answer diagnostic vector and rendered via 30ms/char typewriter
 * with a pulsing purple cursor — mirrors web behavior exactly.
 *
 * Note on gradient accent: web doesn't apply a per-noun gradient
 * on this screen — the headline renders single-color with the
 * cursor as the only accent. Spec asked for "GradientText accent
 * on the operative noun — match web's gradient placement"; web's
 * placement is none, so we mirror that. Per-noun gradient would
 * be a future polish layer and is intentionally out of scope for
 * slice 6.
 *
 * Cursor color (#7C5CFC) matches the web purple. Stays consistent
 * across light/dark theme — accent stays purple even though most
 * of the screen text is dark-on-light. Pulse via withTiming
 * worklet to avoid invoking Reanimated 4's withRepeat in a way
 * that fights the typewriter loop's setInterval.
 *
 * Reduced-motion: skip typewriter, render full text + sub + CTA
 * immediately.
 *
 * Marcus T. testimonial matches the web pairing on this screen.
 */

const TYPEWRITER_CHAR_MS = 30;
const SUB_DELAY_AFTER_TYPE_MS = 400;
const CTA_DELAY_AFTER_TYPE_MS = 800;
const FADE_DURATION = 500;
const EASE_CUBIC_OUT = Easing.bezier(0.215, 0.61, 0.355, 1);
const CURSOR_COLOR = "#7C5CFC";

const SUB_TEXT =
  "Over time, the insights get richer as you map your own life — 60 seconds a day.";
const TESTIMONIAL = {
  quote:
    "The weekly reports are unreal. It's like having a therapist and a project manager rolled into one.",
  name: "Marcus T.",
};

export default function PromiseScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const { q1, q2, q4, q5 } = useOnboardingState();
  const headline = useMemo(
    () => getPersonalizedPromise({ q1, q2, q4, q5 }),
    [q1, q2, q4, q5]
  );

  const [typedChars, setTypedChars] = useState(0);
  const [showSub, setShowSub] = useState(false);
  const [showCta, setShowCta] = useState(false);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  const subOpacity = useSharedValue(0);
  const subY = useSharedValue(8);
  const ctaOpacity = useSharedValue(0);
  const cursorOpacity = useSharedValue(1);

  // Resolve reduce-motion preference before deciding the entrance path.
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (!cancelled) setReduceMotion(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Typewriter + cascade.
  useEffect(() => {
    if (reduceMotion === null) return;

    if (reduceMotion) {
      setTypedChars(headline.length);
      setShowSub(true);
      setShowCta(true);
      subOpacity.value = 1;
      subY.value = 0;
      ctaOpacity.value = 1;
      cursorOpacity.value = 0;
      return;
    }

    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setTypedChars(i);
      if (i >= headline.length) {
        clearInterval(interval);
        // Stop the cursor pulse on completion (matches web — cursor
        // disappears once the line is fully revealed).
        cursorOpacity.value = withTiming(0, {
          duration: 200,
          easing: EASE_CUBIC_OUT,
        });
        setTimeout(() => {
          setShowSub(true);
          subOpacity.value = withTiming(1, {
            duration: FADE_DURATION,
            easing: EASE_CUBIC_OUT,
          });
          subY.value = withTiming(0, {
            duration: FADE_DURATION,
            easing: EASE_CUBIC_OUT,
          });
        }, SUB_DELAY_AFTER_TYPE_MS);
        setTimeout(() => {
          setShowCta(true);
          ctaOpacity.value = withTiming(1, {
            duration: FADE_DURATION,
            easing: EASE_CUBIC_OUT,
          });
        }, CTA_DELAY_AFTER_TYPE_MS);
      }
    }, TYPEWRITER_CHAR_MS);

    return () => clearInterval(interval);
    // headline is memo-stable for a given diagnostic vector; the
    // intentional dep list omits sharedValue refs (Reanimated
    // sharedValues are stable refs by contract).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headline, reduceMotion]);

  // Cursor pulse — opacity oscillates while typing. Using a JS-
  // interval is cheaper than a Reanimated withRepeat here because
  // the cursor is only visible for the typewriter window and
  // disappears synchronously when it completes.
  useEffect(() => {
    if (reduceMotion || typedChars >= headline.length) return;
    const id = setInterval(() => {
      cursorOpacity.value =
        cursorOpacity.value > 0.5 ? 0.2 : 1;
    }, 450);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, typedChars, headline.length]);

  const subStyle = useAnimatedStyle(() => ({
    opacity: subOpacity.value,
    transform: [{ translateY: subY.value }],
  }));
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
  }));
  const cursorStyle = useAnimatedStyle(() => ({
    opacity: cursorOpacity.value,
  }));

  const onContinue = () => {
    router.push("/onboarding-new/commitment" as never);
  };

  const showCursor =
    reduceMotion === false && typedChars < headline.length;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: 28,
          }}
        >
          <View style={{ minHeight: 180 }}>
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 26,
                lineHeight: 34,
                fontWeight: "700",
                letterSpacing: -0.3,
                color: tokens.text,
              }}
            >
              {headline.slice(0, typedChars)}
              {showCursor && (
                <Animated.Text
                  style={[
                    cursorStyle,
                    {
                      color: CURSOR_COLOR,
                      fontWeight: "300",
                    },
                  ]}
                >
                  {"│"}
                </Animated.Text>
              )}
            </Text>
          </View>

          {showSub && (
            <Animated.View style={[subStyle, { marginTop: 24 }]}>
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 14,
                  lineHeight: 21,
                  color: tokens.textSec,
                }}
              >
                {SUB_TEXT}
              </Text>
            </Animated.View>
          )}

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
            disabled={!showCta}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            style={({ pressed }) => ({
              alignSelf: "stretch",
              backgroundColor: CURSOR_COLOR,
              borderRadius: tokens.radius.pill,
              paddingVertical: 14,
              alignItems: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 16,
                fontWeight: "600",
                color: "#ffffff",
              }}
            >
              Continue
            </Text>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}
