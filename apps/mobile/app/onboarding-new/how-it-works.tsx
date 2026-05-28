import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/contexts/theme-context";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import { makeAcuityTokens } from "@/lib/theme/tokens";

/**
 * Screen 8.5 — Mechanism ("Here's how it works"). Inserted between
 * Promise (8) and Commitment (9) in the pain-first onboarding flow.
 *
 * Single scrollable screen. Three steps animate in sequentially from
 * top to bottom — no slides, no auto-advance, no separate views.
 * The user watches the animation build, then taps Continue.
 *
 * Light theme — continues the relief arc from the Promise screen.
 *
 * Timeline:
 *   0ms      — headline fades in (400ms)
 *   800ms    — Step 1 fades + slides up (600ms)
 *   ~2600ms  — Step 2 fades + slides up (600ms), cards stagger in
 *   ~4800ms  — Step 3 fades + slides up (600ms), week dots fill
 *   ~6800ms  — closing line fades in
 *   ~7600ms  — Continue button fades in
 *
 * Total animation: ~8s from mount to Continue visible.
 *
 * Step 1 waveform loops continuously (ambient, not interactive).
 * No mic button. No emojis. Purple accents only.
 *
 * prefers-reduced-motion: everything visible immediately, no animation.
 * Waveform shows static bars.
 */

const PURPLE = "#7C5CFC";
const PURPLE_LIGHT = "#F0ECFF";
const PURPLE_MID = "#B8A9FE";
const EASE_CUBIC_OUT = Easing.bezier(0.215, 0.61, 0.355, 1);

// ─── Timing constants (ms from mount) ───────────────────────────────
const HEADLINE_START = 0;
const HEADLINE_DUR = 400;
const STEP1_START = 800;
const STEP1_DUR = 600;
const STEP2_START = 2600;
const STEP2_DUR = 600;
const CARD_STAGGER = 200;
const STEP3_START = 4800;
const STEP3_DUR = 600;
const DOT_STAGGER = 100;
const INSIGHT_DELAY = 700; // after dots
const CLOSING_START = 6800;
const CTA_START = 7600;

// ─── Extraction cards data ──────────────────────────────────────────
const CARDS = [
  { text: "Follow up with Jamie about Friday", icon: "\u25A1" },
  { text: "Career transition \u2014 34% this month", icon: "\u25B2" },
  { text: "Anxious \u2192 Grounded", icon: "\u25CF" },
  { text: "Sleep mentioned 4 times this week", icon: "\u25C6" },
];

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

// ─── Animated waveform bar (loops continuously) ─────────────────────

function WaveformBar({
  index,
  baseHeight,
  reduceMotion,
}: {
  index: number;
  baseHeight: number;
  reduceMotion: boolean;
}) {
  const height = useSharedValue(baseHeight);

  useEffect(() => {
    if (reduceMotion) {
      height.value = baseHeight;
      return;
    }
    // Each bar oscillates between a low and high height, offset by index
    // to create a wave effect. Different bars have different ranges.
    const low = baseHeight * 0.3;
    const high = baseHeight;
    const dur = 600 + (index % 5) * 80; // vary speed per bar

    height.value = withDelay(
      index * 40,
      withRepeat(
        withSequence(
          withTiming(high, { duration: dur, easing: Easing.inOut(Easing.sin) }),
          withTiming(low, { duration: dur, easing: Easing.inOut(Easing.sin) })
        ),
        -1, // infinite
        true
      )
    );
  }, [reduceMotion, baseHeight, index, height]);

  const style = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          width: 3,
          borderRadius: 1.5,
          backgroundColor: PURPLE_MID,
          marginHorizontal: 2,
        },
      ]}
    />
  );
}

// Waveform heights — 18 bars
const WAVE_HEIGHTS = [
  12, 20, 28, 16, 32, 24, 30, 14, 22, 34, 18, 26, 20, 30, 14, 24, 18, 28,
];

// ─── FadeSlideIn wrapper ────────────────────────────────────────────

function FadeSlideIn({
  delay,
  duration = 600,
  reduceMotion,
  children,
}: {
  delay: number;
  duration?: number;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 16);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration, easing: EASE_CUBIC_OUT })
    );
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration, easing: EASE_CUBIC_OUT })
    );
  }, [delay, duration, reduceMotion, opacity, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

// ─── Week dot (fills in with stagger) ───────────────────────────────

function WeekDot({
  index,
  label,
  delay,
  reduceMotion,
  tokens,
}: {
  index: number;
  label: string;
  delay: number;
  reduceMotion: boolean;
  tokens: ReturnType<typeof makeAcuityTokens>;
}) {
  const filled = index < 5; // Mon–Fri filled
  const fillScale = useSharedValue(reduceMotion || !filled ? (filled ? 1 : 0) : 0);
  const lineWidth = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion || !filled) return;
    fillScale.value = withDelay(
      delay,
      withTiming(1, { duration: 300, easing: EASE_CUBIC_OUT })
    );
    // Connecting line animates after the dot fills
    if (index < 4) {
      lineWidth.value = withDelay(
        delay + 200,
        withTiming(1, { duration: 200, easing: EASE_CUBIC_OUT })
      );
    }
  }, [delay, filled, index, reduceMotion, fillScale, lineWidth]);

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fillScale.value }],
  }));
  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: lineWidth.value }],
  }));

  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {/* Dot */}
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: filled ? PURPLE_MID : tokens.cardBorder,
            backgroundColor: filled ? "transparent" : tokens.cardBg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {filled && (
            <Animated.View
              style={[
                fillStyle,
                {
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: PURPLE,
                },
              ]}
            />
          )}
        </View>
        {/* Connecting line */}
        {index < 6 && (
          <Animated.View
            style={[
              lineStyle,
              {
                width: 8,
                height: 2,
                backgroundColor: filled && index < 4 ? PURPLE_MID : "transparent",
                marginLeft: 1,
              },
            ]}
          />
        )}
      </View>
      <Text
        style={{
          fontFamily: tokens.fontMono,
          fontSize: 9,
          fontWeight: "600",
          color: filled ? tokens.textSec : tokens.textTer,
          marginTop: 5,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────

export default function HowItWorksScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [showCta, setShowCta] = useState(false);
  const ctaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void trackOnboardingEvent("funnel_mechanism_viewed");
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

  // Show CTA after full animation sequence
  useEffect(() => {
    if (reduceMotion === null) return;
    if (reduceMotion) {
      setShowCta(true);
      return;
    }
    ctaTimerRef.current = setTimeout(() => setShowCta(true), CTA_START);
    return () => {
      if (ctaTimerRef.current) clearTimeout(ctaTimerRef.current);
    };
  }, [reduceMotion]);

  const onContinue = () => {
    router.push("/onboarding-new/commitment" as never);
  };

  if (reduceMotion === null) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.bg }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]} />
      </View>
    );
  }

  const rm = reduceMotion;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 36, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Headline ── */}
          <FadeSlideIn delay={HEADLINE_START} duration={HEADLINE_DUR} reduceMotion={rm}>
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 26,
                lineHeight: 33,
                fontWeight: "700",
                letterSpacing: -0.3,
                color: tokens.text,
                textAlign: "center",
                marginBottom: 36,
              }}
            >
              One minute. Every day.{"\n"}That's all it takes.
            </Text>
          </FadeSlideIn>

          {/* ── STEP 1: TALK ── */}
          <FadeSlideIn delay={STEP1_START} duration={STEP1_DUR} reduceMotion={rm}>
            <View style={{ marginBottom: 32 }}>
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 1.6,
                  color: PURPLE,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Step 1
              </Text>
              <Text
                style={{
                  fontFamily: tokens.fontDisplay,
                  fontSize: 20,
                  lineHeight: 26,
                  fontWeight: "700",
                  color: tokens.text,
                  marginBottom: 6,
                }}
              >
                Talk for 60 seconds.
              </Text>
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 14,
                  lineHeight: 20,
                  color: tokens.textSec,
                  marginBottom: 16,
                }}
              >
                About your day. Your stress. Your wins. Whatever's on your mind.
              </Text>

              {/* Waveform — loops continuously */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  height: 40,
                  paddingVertical: 2,
                }}
              >
                {WAVE_HEIGHTS.map((h, i) => (
                  <WaveformBar
                    key={i}
                    index={i}
                    baseHeight={h}
                    reduceMotion={rm}
                  />
                ))}
              </View>
            </View>
          </FadeSlideIn>

          {/* ── STEP 2: WE EXTRACT ── */}
          <FadeSlideIn delay={STEP2_START} duration={STEP2_DUR} reduceMotion={rm}>
            <View style={{ marginBottom: 32 }}>
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 1.6,
                  color: PURPLE,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Step 2
              </Text>
              <Text
                style={{
                  fontFamily: tokens.fontDisplay,
                  fontSize: 20,
                  lineHeight: 26,
                  fontWeight: "700",
                  color: tokens.text,
                  marginBottom: 6,
                }}
              >
                We pull out what matters.
              </Text>
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 14,
                  lineHeight: 20,
                  color: tokens.textSec,
                  marginBottom: 16,
                }}
              >
                Tasks, goals, mood shifts, and patterns {"\u2014"} extracted from
                your own words.
              </Text>

              {/* Extraction cards — stagger in */}
              {CARDS.map((card, i) => (
                <FadeSlideIn
                  key={i}
                  delay={rm ? 0 : STEP2_START + STEP2_DUR + i * CARD_STAGGER}
                  duration={400}
                  reduceMotion={rm}
                >
                  <View
                    style={{
                      backgroundColor: "#FFFFFF",
                      borderRadius: 12,
                      borderLeftWidth: 3,
                      borderLeftColor: PURPLE,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      marginBottom: 8,
                      flexDirection: "row",
                      alignItems: "center",
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.05,
                      shadowRadius: 3,
                      elevation: 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: PURPLE,
                        marginRight: 10,
                        fontWeight: "600",
                      }}
                    >
                      {card.icon}
                    </Text>
                    <Text
                      style={{
                        fontFamily: tokens.fontSans,
                        fontSize: 13,
                        lineHeight: 18,
                        color: tokens.text,
                        fontWeight: "500",
                        flex: 1,
                      }}
                    >
                      {card.text}
                    </Text>
                  </View>
                </FadeSlideIn>
              ))}
            </View>
          </FadeSlideIn>

          {/* ── STEP 3: YOUR PICTURE ── */}
          <FadeSlideIn delay={STEP3_START} duration={STEP3_DUR} reduceMotion={rm}>
            <View style={{ marginBottom: 32 }}>
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 1.6,
                  color: PURPLE,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Step 3
              </Text>
              <Text
                style={{
                  fontFamily: tokens.fontDisplay,
                  fontSize: 20,
                  lineHeight: 26,
                  fontWeight: "700",
                  color: tokens.text,
                  marginBottom: 6,
                }}
              >
                A living picture of your life.
              </Text>
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 14,
                  lineHeight: 20,
                  color: tokens.textSec,
                  marginBottom: 20,
                }}
              >
                Over time, Acuity connects the dots you can't see {"\u2014"}{" "}
                patterns across your days, weeks, and months that show you who
                you're becoming.
              </Text>

              {/* Week dots — fill one at a time */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 16,
                  paddingHorizontal: 8,
                }}
              >
                {DAYS.map((day, i) => (
                  <WeekDot
                    key={i}
                    index={i}
                    label={day}
                    delay={rm ? 0 : STEP3_START + STEP3_DUR + i * DOT_STAGGER}
                    reduceMotion={rm}
                    tokens={tokens}
                  />
                ))}
              </View>

              {/* Weekly insight card */}
              <FadeSlideIn
                delay={rm ? 0 : STEP3_START + STEP3_DUR + 7 * DOT_STAGGER + INSIGHT_DELAY}
                duration={500}
                reduceMotion={rm}
              >
                <View
                  style={{
                    backgroundColor: PURPLE_LIGHT,
                    borderRadius: 12,
                    borderLeftWidth: 3,
                    borderLeftColor: PURPLE,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: tokens.fontMono,
                      fontSize: 9,
                      fontWeight: "700",
                      letterSpacing: 1,
                      color: PURPLE,
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    Weekly insight
                  </Text>
                  <Text
                    style={{
                      fontFamily: tokens.fontSans,
                      fontSize: 13,
                      lineHeight: 18,
                      color: tokens.text,
                      fontWeight: "500",
                    }}
                  >
                    You bring up work stress every Monday and Thursday. On days
                    you exercise, your mood improves by evening.
                  </Text>
                </View>
              </FadeSlideIn>
            </View>
          </FadeSlideIn>

          {/* ── Closing line ── */}
          <FadeSlideIn delay={CLOSING_START} duration={500} reduceMotion={rm}>
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 16,
                lineHeight: 24,
                fontWeight: "700",
                color: tokens.text,
                textAlign: "center",
                fontStyle: "italic",
                marginBottom: 24,
              }}
            >
              You already think about your life every day. Acuity just makes
              sure it counts.
            </Text>
          </FadeSlideIn>

          {/* ── Continue button ── */}
          {showCta && (
            <FadeSlideIn delay={rm ? 0 : CTA_START} duration={400} reduceMotion={rm}>
              <Pressable
                onPress={onContinue}
                accessibilityRole="button"
                accessibilityLabel="Continue"
                style={({ pressed }) => ({
                  alignSelf: "stretch",
                  backgroundColor: PURPLE,
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
            </FadeSlideIn>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
