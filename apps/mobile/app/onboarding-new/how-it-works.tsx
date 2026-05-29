import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { useOnboardingState, type Q1Answer } from "@/contexts/onboarding-context";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import { makeAcuityTokens } from "@/lib/theme/tokens";

/**
 * Screen 8.5 — Mechanism ("Here's how it works"). Inserted between
 * Promise (8) and Commitment (9) in the pain-first onboarding flow.
 *
 * Single scrollable screen. Three steps animate in SEQUENTIALLY
 * from top to bottom. Content in Steps 2 and 3 is DYNAMIC based
 * on the user's diagnostic branch (derived from Q1 answer).
 *
 * Light theme. No mic button, no emojis, no slides.
 * prefers-reduced-motion: everything visible immediately.
 */

const PURPLE = "#7C5CFC";
const PURPLE_LIGHT = "#F0ECFF";
const PURPLE_MID = "#B8A9FE";
const EASE_CUBIC_OUT = Easing.bezier(0.215, 0.61, 0.355, 1);

// ─── Timing (ms from mount) ─────────────────────────────────────────
// HARD REQUIREMENT: Continue button visible within 4s of mount.
// Headline: 0ms start, 300ms fade, 400ms pause
// Step 1: 700ms start, 400ms fade, 500ms pause
// Step 2: 1600ms start, 400ms fade, cards 4×150ms stagger, 500ms pause
// Step 3: 3100ms start, 400ms fade, dots 7×80ms, insight 300ms
// Closing + CTA: 4000ms start, 300ms fade, SIMULTANEOUS
const HEADLINE_DUR = 300;
const STEP1_START = 700;
const STEP1_DUR = 400;
const STEP2_START = 1600;
const STEP2_DUR = 400;
const CARD_STAGGER = 150;
const STEP3_START = 3100;
const STEP3_DUR = 400;
const DOT_STAGGER = 80;
const INSIGHT_DELAY = 300;
const CLOSING_START = 4000;
const CTA_START = 4000;

// ─── Branch mapping ─────────────────────────────────────────────────

type MechBranch = "blur" | "patterns" | "rumination" | "graveyard" | "mask" | "drift";

function q1ToBranch(q1: Q1Answer | null): MechBranch {
  switch (q1) {
    case "same_fights": return "patterns";
    case "goals_not_real": return "drift";
    case "blurry_days": return "blur";
    case "work_bleeds": return "blur";
    case "something_else":
    default: return "blur";
  }
}

// ─── Dynamic content per branch ─────────────────────────────────────

interface BranchContent {
  cards: { text: string; icon: string }[];
  step3Sub: string;
  insight: string;
}

const BRANCH_CONTENT: Record<MechBranch, BranchContent> = {
  blur: {
    cards: [
      { text: "Block 30 minutes for the thing you keep postponing", icon: "\u25A1" },
      { text: "Build a record of my days \u2014 0% this week", icon: "\u25B2" },
      { text: "Foggy \u2192 Aware", icon: "\u25CF" },
      { text: "You described 3 days as 'fine' but couldn't name a single highlight", icon: "\u25C6" },
    ],
    step3Sub: "Over time, Acuity shows you where your days actually go \u2014 not where you think they go. Patterns across weeks and months that explain the fog.",
    insight: "Your 'fine' days had zero unstructured time. Your best day had 2 hours of nothing planned.",
  },
  patterns: {
    cards: [
      { text: "Talk to them about what happened Tuesday", icon: "\u25A1" },
      { text: "Break the cycle \u2014 0% this week", icon: "\u25B2" },
      { text: "Frustrated \u2192 Aware", icon: "\u25CF" },
      { text: "The tension started 2 days before the argument \u2014 every time", icon: "\u25C6" },
    ],
    step3Sub: "Over time, Acuity maps the cycle \u2014 what triggers it, when it starts, and why it keeps repeating. The pattern becomes visible.",
    insight: "The argument happened Tuesday. The tension started Sunday. Same pattern, 3 weeks in a row.",
  },
  rumination: {
    cards: [
      { text: "Write down the 3 thoughts that keep looping", icon: "\u25A1" },
      { text: "Process my day before bed \u2014 0% this week", icon: "\u25B2" },
      { text: "Racing \u2192 Settled", icon: "\u25CF" },
      { text: "Your 11pm spiral starts with something that happened at 2pm", icon: "\u25C6" },
    ],
    step3Sub: "Over time, Acuity catches what your brain is processing before it reaches your pillow. The backlog shrinks because it finally has somewhere to go.",
    insight: "You slept best on Wednesday \u2014 the only day you processed out loud before 6pm.",
  },
  graveyard: {
    cards: [
      { text: "Try Acuity for 7 days instead of what hasn't worked", icon: "\u25A1" },
      { text: "Stick with one thing for 30 days \u2014 0% this week", icon: "\u25B2" },
      { text: "Skeptical \u2192 Curious", icon: "\u25CF" },
      { text: "You've quit every tool on Day 4. There's a reason for that.", icon: "\u25C6" },
    ],
    step3Sub: "Over time, Acuity becomes the record you've never been able to keep. Not because you're more disciplined \u2014 because 60 seconds is all it asks.",
    insight: "Day 4 is when you almost quit. Every tool. Every time. Now you know when to push through.",
  },
  mask: {
    cards: [
      { text: "Tell one person how you actually feel this week", icon: "\u25A1" },
      { text: "Check in with myself daily \u2014 0% this week", icon: "\u25B2" },
      { text: "Performing \u2192 Honest", icon: "\u25CF" },
      { text: "You said 'I'm fine' on your lowest days. Every time.", icon: "\u25C6" },
    ],
    step3Sub: "Over time, Acuity sees what nobody else does \u2014 the gap between how you perform and how you actually feel. Tracked daily, visible weekly.",
    insight: "Your energy for everyone else averaged 8/10. For yourself: 3/10. Every single day.",
  },
  drift: {
    cards: [
      { text: "Name one thing you used to care about", icon: "\u25A1" },
      { text: "Reconnect with what matters \u2014 0% this week", icon: "\u25B2" },
      { text: "Numb \u2192 Present", icon: "\u25CF" },
      { text: "You talked about who you used to be twice. Who you want to become \u2014 zero times.", icon: "\u25C6" },
    ],
    step3Sub: "Over time, Acuity tracks who you're becoming \u2014 so you notice before another year disappears without you choosing it.",
    insight: "Your highest energy was Sunday morning. By Monday evening, gone. The reset happens every week.",
  },
};

// ─── Waveform bar heights ───────────────────────────────────────────
const WAVE_HEIGHTS = [
  12, 20, 28, 16, 32, 24, 30, 14, 22, 34, 18, 26, 20, 30, 14, 24, 18, 28,
];

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

// ─── Animated waveform bar (loops continuously) ─────────────────────

function WaveformBar({ index, baseHeight, reduceMotion }: {
  index: number; baseHeight: number; reduceMotion: boolean;
}) {
  const height = useSharedValue(baseHeight);

  useEffect(() => {
    if (reduceMotion) { height.value = baseHeight; return; }
    const low = baseHeight * 0.3;
    const high = baseHeight;
    const dur = 600 + (index % 5) * 80;
    height.value = withDelay(
      index * 40,
      withRepeat(
        withSequence(
          withTiming(high, { duration: dur, easing: Easing.inOut(Easing.sin) }),
          withTiming(low, { duration: dur, easing: Easing.inOut(Easing.sin) })
        ),
        -1, true
      )
    );
  }, [reduceMotion, baseHeight, index, height]);

  const style = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View style={[style, {
      width: 3, borderRadius: 1.5, backgroundColor: PURPLE_MID, marginHorizontal: 2,
    }]} />
  );
}

// ─── FadeSlideIn wrapper ────────────────────────────────────────────

function FadeSlideIn({ delay, duration = 600, reduceMotion, children }: {
  delay: number; duration?: number; reduceMotion: boolean; children: React.ReactNode;
}) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 16);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withDelay(delay, withTiming(1, { duration, easing: EASE_CUBIC_OUT }));
    translateY.value = withDelay(delay, withTiming(0, { duration, easing: EASE_CUBIC_OUT }));
  }, [delay, duration, reduceMotion, opacity, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value, transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

// ─── Week dot ───────────────────────────────────────────────────────

function WeekDot({ index, label, delay, reduceMotion, tokens }: {
  index: number; label: string; delay: number; reduceMotion: boolean;
  tokens: ReturnType<typeof makeAcuityTokens>;
}) {
  const filled = index < 5;
  const fillScale = useSharedValue(reduceMotion || !filled ? (filled ? 1 : 0) : 0);
  const lineWidth = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion || !filled) return;
    fillScale.value = withDelay(delay, withTiming(1, { duration: 300, easing: EASE_CUBIC_OUT }));
    if (index < 4) {
      lineWidth.value = withDelay(delay + 200, withTiming(1, { duration: 200, easing: EASE_CUBIC_OUT }));
    }
  }, [delay, filled, index, reduceMotion, fillScale, lineWidth]);

  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scale: fillScale.value }] }));
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: lineWidth.value }] }));

  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{
          width: 28, height: 28, borderRadius: 14, borderWidth: 1.5,
          borderColor: filled ? PURPLE_MID : tokens.cardBorder,
          backgroundColor: filled ? "transparent" : tokens.cardBg,
          alignItems: "center", justifyContent: "center",
        }}>
          {filled && (
            <Animated.View style={[fillStyle, {
              width: 18, height: 18, borderRadius: 9, backgroundColor: PURPLE,
            }]} />
          )}
        </View>
        {index < 6 && (
          <Animated.View style={[lineStyle, {
            width: 8, height: 2,
            backgroundColor: filled && index < 4 ? PURPLE_MID : "transparent",
            marginLeft: 1,
          }]} />
        )}
      </View>
      <Text style={{
        fontFamily: tokens.fontMono, fontSize: 9, fontWeight: "600",
        color: filled ? tokens.textSec : tokens.textTer, marginTop: 5, letterSpacing: 0.3,
      }}>{label}</Text>
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────

export default function HowItWorksScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });
  const { q1 } = useOnboardingState();
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [showCta, setShowCta] = useState(false);
  const ctaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const branch = useMemo(() => q1ToBranch(q1), [q1]);
  const content = BRANCH_CONTENT[branch];

  useEffect(() => { void trackOnboardingEvent("funnel_mechanism_viewed"); }, []);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (!cancelled) setReduceMotion(v); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;
    if (reduceMotion) { setShowCta(true); return; }
    ctaTimerRef.current = setTimeout(() => setShowCta(true), CTA_START);
    return () => { if (ctaTimerRef.current) clearTimeout(ctaTimerRef.current); };
  }, [reduceMotion]);

  const onContinue = () => { router.push("/onboarding-new/commitment" as never); };

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
          <FadeSlideIn delay={0} duration={HEADLINE_DUR} reduceMotion={rm}>
            <Text style={{
              fontFamily: tokens.fontDisplay, fontSize: 26, lineHeight: 33,
              fontWeight: "700", letterSpacing: -0.3, color: tokens.text,
              textAlign: "center", marginBottom: 36,
            }}>
              One minute. Every day.{"\n"}That's all it takes.
            </Text>
          </FadeSlideIn>

          {/* ── STEP 1: TALK ── */}
          <FadeSlideIn delay={STEP1_START} duration={STEP1_DUR} reduceMotion={rm}>
            <View style={{ marginBottom: 32 }}>
              <Text style={{
                fontFamily: tokens.fontMono, fontSize: 10, fontWeight: "700",
                letterSpacing: 1.6, color: PURPLE, textTransform: "uppercase", marginBottom: 8,
              }}>Step 1</Text>
              <Text style={{
                fontFamily: tokens.fontDisplay, fontSize: 20, lineHeight: 26,
                fontWeight: "700", color: tokens.text, marginBottom: 6,
              }}>Talk for 60 seconds.</Text>
              <Text style={{
                fontFamily: tokens.fontSans, fontSize: 14, lineHeight: 20,
                color: tokens.textSec, marginBottom: 16,
              }}>About your day. Your stress. Your wins. Whatever's on your mind.</Text>

              <View style={{ flexDirection: "row", alignItems: "center", height: 40, paddingVertical: 2 }}>
                {WAVE_HEIGHTS.map((h, i) => (
                  <WaveformBar key={i} index={i} baseHeight={h} reduceMotion={rm} />
                ))}
              </View>
            </View>
          </FadeSlideIn>

          {/* ── STEP 2: WE EXTRACT (dynamic) ── */}
          <FadeSlideIn delay={STEP2_START} duration={STEP2_DUR} reduceMotion={rm}>
            <View style={{ marginBottom: 32 }}>
              <Text style={{
                fontFamily: tokens.fontMono, fontSize: 10, fontWeight: "700",
                letterSpacing: 1.6, color: PURPLE, textTransform: "uppercase", marginBottom: 8,
              }}>Step 2</Text>
              <Text style={{
                fontFamily: tokens.fontDisplay, fontSize: 20, lineHeight: 26,
                fontWeight: "700", color: tokens.text, marginBottom: 6,
              }}>We pull out what matters.</Text>
              <Text style={{
                fontFamily: tokens.fontSans, fontSize: 14, lineHeight: 20,
                color: tokens.textSec, marginBottom: 16,
              }}>Tasks, goals, mood shifts, and patterns {"\u2014"} extracted from your own words.</Text>

              {content.cards.map((card, i) => (
                <FadeSlideIn
                  key={i}
                  delay={rm ? 0 : STEP2_START + STEP2_DUR + i * CARD_STAGGER}
                  duration={400}
                  reduceMotion={rm}
                >
                  <View style={{
                    backgroundColor: "#FFFFFF", borderRadius: 12,
                    borderLeftWidth: 3, borderLeftColor: PURPLE,
                    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
                    flexDirection: "row", alignItems: "center",
                    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
                  }}>
                    <Text style={{ fontSize: 13, color: PURPLE, marginRight: 10, fontWeight: "600" }}>
                      {card.icon}
                    </Text>
                    <Text style={{
                      fontFamily: tokens.fontSans, fontSize: 13, lineHeight: 18,
                      color: tokens.text, fontWeight: "500", flex: 1,
                    }}>{card.text}</Text>
                  </View>
                </FadeSlideIn>
              ))}
            </View>
          </FadeSlideIn>

          {/* ── STEP 3: YOUR PICTURE (dynamic) ── */}
          <FadeSlideIn delay={STEP3_START} duration={STEP3_DUR} reduceMotion={rm}>
            <View style={{ marginBottom: 32 }}>
              <Text style={{
                fontFamily: tokens.fontMono, fontSize: 10, fontWeight: "700",
                letterSpacing: 1.6, color: PURPLE, textTransform: "uppercase", marginBottom: 8,
              }}>Step 3</Text>
              <Text style={{
                fontFamily: tokens.fontDisplay, fontSize: 20, lineHeight: 26,
                fontWeight: "700", color: tokens.text, marginBottom: 6,
              }}>A living picture of your life.</Text>
              <Text style={{
                fontFamily: tokens.fontSans, fontSize: 14, lineHeight: 20,
                color: tokens.textSec, marginBottom: 20,
              }}>{content.step3Sub}</Text>

              {/* Week dots */}
              <View style={{
                flexDirection: "row", justifyContent: "space-between",
                marginBottom: 16, paddingHorizontal: 8,
              }}>
                {DAYS.map((day, i) => (
                  <WeekDot
                    key={i} index={i} label={day}
                    delay={rm ? 0 : STEP3_START + STEP3_DUR + i * DOT_STAGGER}
                    reduceMotion={rm} tokens={tokens}
                  />
                ))}
              </View>

              {/* Weekly insight card (dynamic) */}
              <FadeSlideIn
                delay={rm ? 0 : STEP3_START + STEP3_DUR + 7 * DOT_STAGGER + INSIGHT_DELAY}
                duration={500} reduceMotion={rm}
              >
                <View style={{
                  backgroundColor: PURPLE_LIGHT, borderRadius: 12,
                  borderLeftWidth: 3, borderLeftColor: PURPLE,
                  paddingVertical: 12, paddingHorizontal: 14,
                }}>
                  <Text style={{
                    fontFamily: tokens.fontMono, fontSize: 9, fontWeight: "700",
                    letterSpacing: 1, color: PURPLE, textTransform: "uppercase", marginBottom: 6,
                  }}>Weekly insight</Text>
                  <Text style={{
                    fontFamily: tokens.fontSans, fontSize: 13, lineHeight: 18,
                    color: tokens.text, fontWeight: "500",
                  }}>{content.insight}</Text>
                </View>
              </FadeSlideIn>
            </View>
          </FadeSlideIn>

          {/* ── Closing line ── */}
          <FadeSlideIn delay={CLOSING_START} duration={300} reduceMotion={rm}>
            <Text style={{
              fontFamily: tokens.fontDisplay, fontSize: 16, lineHeight: 24,
              fontWeight: "700", color: tokens.text, textAlign: "center",
              fontStyle: "italic", marginBottom: 24,
            }}>
              You already think about your life every day. Acuity just makes sure it counts.
            </Text>
          </FadeSlideIn>

          {/* ── Continue button ── */}
          {showCta && (
            <FadeSlideIn delay={rm ? 0 : CTA_START} duration={300} reduceMotion={rm}>
              <Pressable
                onPress={onContinue}
                accessibilityRole="button"
                accessibilityLabel="Continue"
                style={({ pressed }) => ({
                  alignSelf: "stretch", backgroundColor: PURPLE,
                  borderRadius: tokens.radius.pill, paddingVertical: 14,
                  alignItems: "center", opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{
                  fontFamily: tokens.fontSans, fontSize: 16, fontWeight: "600", color: "#ffffff",
                }}>Continue</Text>
              </Pressable>
            </FadeSlideIn>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
