import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/contexts/theme-context";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import { trackOnboardingEvent } from "@/lib/onboarding-events";

import {
  PROCESSING_SLIDES,
  SLIDE_MS,
} from "./_components/processing-slides";

/**
 * Screen 11 — Processing slideshow. Slice 9 (2026-05-26).
 *
 * Background story: the slice 8 record screen already POSTs to
 * /api/mobile/try-recording and awaits the synchronous Whisper +
 * Claude response in its "Sending to the model…" state. By the
 * time we land here, the extraction is already persisted in
 * AsyncStorage by lib/try-session.submitTryRecording. This screen
 * is therefore not a true loading state — it's a journey-
 * storytelling teaser that bridges the user from "I just recorded"
 * to "here's what came out of it", giving them five slides of
 * what their 30-day arc on Acuity looks like.
 *
 * Web's PROCESSING_SLIDES double as a real loading state because
 * web's pipeline can take 15-25s; mobile's is already done. The
 * spec called for polling — we instead just play the slides for
 * their fixed budget (5 × 4s = 20s, with a Continue-now affordance
 * once we're past slide 1 so impatient users can skip ahead).
 *
 * Slide motion: each slide fades + translates up on mount, fades
 * out as the index advances. Card + testimonial follow the
 * existing ScreenTestimonial cascade pattern so the eye lands on
 * label → text → quote in order.
 *
 * Progress bar at bottom: linear timer that fills from 0 to 100%
 * over the total slide budget. Visual cue that something is in
 * motion even if a slide's text doesn't change immediately.
 *
 * Reduced-motion: skip slide cycling, render the first slide
 * statically, show a small "Processing…" label, and auto-advance
 * to /reveal after a brief dwell so the user isn't stuck on a
 * still frame.
 */

const REDUCED_MOTION_DWELL_MS = 2000;
const SLIDE_FADE_MS = 400;
const SKIP_AVAILABLE_AT_SLIDE = 1; // user can skip starting on slide 2
const EASE_CUBIC_OUT = Easing.bezier(0.215, 0.61, 0.355, 1);
const PURPLE = "#7C5CFC";

export default function ProcessingScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const [slideIndex, setSlideIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);

  const slideOpacity = useSharedValue(0);
  const slideY = useSharedValue(12);
  const progress = useSharedValue(0);

  useEffect(() => {
    void trackOnboardingEvent("funnel_processing_viewed");
  }, []);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (!cancelled) setReduceMotion(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    router.push("/onboarding-new/reveal" as never);
  };

  // Reduced-motion path: brief dwell, no cycling, then advance.
  useEffect(() => {
    if (reduceMotion === null) return;
    if (!reduceMotion) return;
    slideOpacity.value = 1;
    slideY.value = 0;
    progress.value = withTiming(1, {
      duration: REDUCED_MOTION_DWELL_MS,
      easing: Easing.linear,
    });
    dwellTimerRef.current = setTimeout(finish, REDUCED_MOTION_DWELL_MS);
    return () => {
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  // Normal-motion path: slides cycle through PROCESSING_SLIDES.
  useEffect(() => {
    if (reduceMotion === null || reduceMotion) return;

    // First slide entrance.
    slideOpacity.value = withTiming(1, {
      duration: SLIDE_FADE_MS,
      easing: EASE_CUBIC_OUT,
    });
    slideY.value = withTiming(0, {
      duration: SLIDE_FADE_MS,
      easing: EASE_CUBIC_OUT,
    });

    // Progress bar fills linearly across the full slide budget.
    const totalMs = PROCESSING_SLIDES.length * SLIDE_MS;
    progress.value = withTiming(1, {
      duration: totalMs,
      easing: Easing.linear,
    });

    intervalRef.current = setInterval(() => {
      setSlideIndex((prev) => {
        const next = prev + 1;
        if (next >= PROCESSING_SLIDES.length) {
          // Last slide just finished — advance to reveal.
          finish();
          return prev;
        }
        // Fade current out (worklets handle the visual swap), the
        // setSlideIndex on the next render line drives the content.
        slideOpacity.value = 0;
        slideY.value = 12;
        // Schedule the entrance of the next slide so the swap reads
        // as a fade-out → fade-in rather than a crossfade.
        setTimeout(() => {
          slideOpacity.value = withTiming(1, {
            duration: SLIDE_FADE_MS,
            easing: EASE_CUBIC_OUT,
          });
          slideY.value = withTiming(0, {
            duration: SLIDE_FADE_MS,
            easing: EASE_CUBIC_OUT,
          });
        }, 50);
        return next;
      });
    }, SLIDE_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    };
  }, []);

  const slideStyle = useAnimatedStyle(() => ({
    opacity: slideOpacity.value,
    transform: [{ translateY: slideY.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, progress.value * 100))}%`,
  }));

  if (reduceMotion === null) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.bg }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]} />
      </View>
    );
  }

  if (reduceMotion) {
    const first = PROCESSING_SLIDES[0];
    return (
      <View style={{ flex: 1, backgroundColor: tokens.bg }}>
        <StatusBar style="dark" />
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 28,
            }}
          >
            <Text
              style={{
                fontFamily: tokens.fontMono,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.4,
                color: PURPLE,
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Processing…
            </Text>
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 22,
                lineHeight: 30,
                fontWeight: "700",
                color: tokens.text,
                textAlign: "center",
              }}
            >
              {first.text}
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: 28,
              paddingBottom: 24,
            }}
          >
            <View
              style={{
                height: 3,
                borderRadius: 2,
                backgroundColor: tokens.cardBgTint,
                overflow: "hidden",
              }}
            >
              <Animated.View
                style={[
                  progressStyle,
                  {
                    height: "100%",
                    backgroundColor: PURPLE,
                  },
                ]}
              />
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const slide = PROCESSING_SLIDES[slideIndex];
  const canSkip = slideIndex >= SKIP_AVAILABLE_AT_SLIDE;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 28,
          }}
        >
          <Animated.View
            style={[
              slideStyle,
              {
                alignItems: "center",
                width: "100%",
              },
            ]}
          >
            <Text
              style={{
                fontFamily: tokens.fontMono,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.4,
                color: PURPLE,
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              {slide.label}
            </Text>
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 24,
                lineHeight: 32,
                fontWeight: "700",
                letterSpacing: -0.3,
                color: tokens.text,
                textAlign: "center",
                marginBottom: 28,
              }}
            >
              {slide.text}
            </Text>
            {slide.testimonial && (
              <View
                style={{
                  paddingHorizontal: 16,
                  borderLeftWidth: 2,
                  borderLeftColor: tokens.cardBorder,
                  alignSelf: "stretch",
                  marginHorizontal: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 14,
                    lineHeight: 21,
                    fontStyle: "italic",
                    color: tokens.textSec,
                  }}
                >
                  &ldquo;{slide.testimonial.quote}&rdquo;
                </Text>
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 12,
                    lineHeight: 17,
                    color: tokens.textTer,
                    marginTop: 8,
                  }}
                >
                  — {slide.testimonial.name}
                </Text>
              </View>
            )}
          </Animated.View>
        </View>

        <View
          style={{
            paddingHorizontal: 28,
            paddingBottom: 24,
          }}
        >
          {canSkip && (
            <View
              style={{
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <Text
                onPress={finish}
                accessibilityRole="button"
                accessibilityLabel="See your extraction now"
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 13,
                  fontWeight: "600",
                  color: tokens.textTer,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                See it now →
              </Text>
            </View>
          )}
          <View
            style={{
              height: 3,
              borderRadius: 2,
              backgroundColor: tokens.cardBgTint,
              overflow: "hidden",
            }}
          >
            <Animated.View
              style={[
                progressStyle,
                {
                  height: "100%",
                  backgroundColor: PURPLE,
                },
              ]}
            />
          </View>
          {/* Slide pip indicators — discreet count for orientation. */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
              marginTop: 14,
            }}
          >
            {PROCESSING_SLIDES.map((_, i) => (
              <View
                key={i}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor:
                    i === slideIndex ? PURPLE : tokens.cardBorder,
                  opacity: i === slideIndex ? 1 : 0.5,
                }}
              />
            ))}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
