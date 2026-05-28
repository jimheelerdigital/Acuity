import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  Text,
  View,
} from "react-native";
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

/**
 * Screen 8.5 — Product Explainer ("How It Works"). Inserted between
 * Promise (8) and Commitment (9) in the pain-first onboarding flow.
 *
 * Light theme — continues the relief arc from the Promise screen.
 *
 * Three auto-advancing slides (Instagram-story style):
 *   Slide 1 — The Input:  mic icon + waveform + "Open. Tap. Talk."
 *   Slide 2 — The Magic:  waveform transforms to floating cards
 *   Slide 3 — The Picture: cards arrange into a timeline view
 *
 * After slide 3, a closing line fades in with Continue button.
 *
 * Interaction:
 *   - Auto-play on mount (2.5s → 3s → 3s)
 *   - Tap anywhere to advance to next slide
 *   - Progress dots (3) at bottom
 *   - prefers-reduced-motion: all 3 slides stacked vertically, no animation
 *
 * No emojis anywhere. Purple accents and left-border card styling only.
 */

const PURPLE = "#7C5CFC";
const PURPLE_LIGHT = "#F0ECFF";
const PURPLE_MID = "#B8A9FE";
const EASE_CUBIC_OUT = Easing.bezier(0.215, 0.61, 0.355, 1);

const SLIDE_DURATIONS = [2500, 3000, 3000]; // ms per slide
const CARD_STAGGER = 200; // ms between card appearances

const CARDS = [
  {
    text: "Follow up with Jamie about Friday",
    type: "task" as const,
    accent: PURPLE,
  },
  {
    text: "Career transition \u2014 34% this month",
    type: "goal" as const,
    accent: PURPLE,
  },
  {
    text: "Anxious \u2192 Grounded",
    type: "mood" as const,
    accent: "#6B8E6B",
  },
  {
    text: "You mentioned sleep 4 times this week",
    type: "pattern" as const,
    accent: PURPLE_MID,
  },
];

// Icon shapes for card types (simple View-based, no emojis)
const CARD_ICONS: Record<string, { symbol: string }> = {
  task: { symbol: "\u25A1" }, // hollow square (checkbox)
  goal: { symbol: "\u25B2" }, // triangle (progress)
  mood: { symbol: "\u25CF" }, // filled circle
  pattern: { symbol: "\u25C6" }, // diamond
};

// ─── Waveform bars ──────────────────────────────────────────────────

const WAVEFORM_BAR_COUNT = 32;
const WAVEFORM_HEIGHTS = [
  0.3, 0.5, 0.7, 0.4, 0.9, 0.6, 0.8, 0.3, 0.5, 0.95, 0.4, 0.7, 0.6, 0.85,
  0.3, 0.5, 0.4, 0.8, 0.6, 0.3, 0.7, 0.5, 0.9, 0.4, 0.6, 0.8, 0.35, 0.7,
  0.5, 0.3, 0.6, 0.4,
];

function WaveformBar({
  index,
  height,
  animate,
  tokens,
}: {
  index: number;
  height: number;
  animate: boolean;
  tokens: ReturnType<typeof makeAcuityTokens>;
}) {
  const barHeight = useSharedValue(animate ? 4 : height * 28);

  useEffect(() => {
    if (!animate) {
      barHeight.value = height * 28;
      return;
    }
    barHeight.value = withDelay(
      index * 30,
      withTiming(height * 28, {
        duration: 600,
        easing: EASE_CUBIC_OUT,
      })
    );
  }, [animate, barHeight, height, index]);

  const style = useAnimatedStyle(() => ({
    height: barHeight.value,
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          width: 3,
          borderRadius: 1.5,
          backgroundColor: PURPLE_MID,
          marginHorizontal: 1.5,
        },
      ]}
    />
  );
}

// ─── Extraction card ────────────────────────────────────────────────

function ExtractionCard({
  card,
  index,
  visible,
  compact,
  reduceMotion,
  tokens,
}: {
  card: (typeof CARDS)[number];
  index: number;
  visible: boolean;
  compact?: boolean;
  reduceMotion: boolean;
  tokens: ReturnType<typeof makeAcuityTokens>;
}) {
  const opacity = useSharedValue(reduceMotion || visible ? 1 : 0);
  const translateY = useSharedValue(reduceMotion || visible ? 0 : 16);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    if (visible) {
      opacity.value = withDelay(
        index * CARD_STAGGER,
        withTiming(1, { duration: 400, easing: EASE_CUBIC_OUT })
      );
      translateY.value = withDelay(
        index * CARD_STAGGER,
        withTiming(0, { duration: 400, easing: EASE_CUBIC_OUT })
      );
    }
  }, [visible, reduceMotion, index, opacity, translateY]);

  useEffect(() => {
    if (reduceMotion) return;
    if (compact) {
      scale.value = withTiming(0.88, {
        duration: 500,
        easing: EASE_CUBIC_OUT,
      });
    }
  }, [compact, reduceMotion, scale]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  const icon = CARD_ICONS[card.type];

  return (
    <Animated.View
      style={[
        animStyle,
        {
          backgroundColor: "#FFFFFF",
          borderRadius: 14,
          borderLeftWidth: 3,
          borderLeftColor: card.accent,
          paddingVertical: compact ? 10 : 14,
          paddingHorizontal: 16,
          marginBottom: compact ? 6 : 10,
          flexDirection: "row",
          alignItems: "center",
          // Subtle shadow for depth
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
          elevation: 1,
        },
      ]}
    >
      <Text
        style={{
          fontSize: compact ? 12 : 14,
          color: card.accent,
          marginRight: 10,
          fontWeight: "600",
        }}
      >
        {icon.symbol}
      </Text>
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: compact ? 12 : 14,
          lineHeight: compact ? 17 : 20,
          color: tokens.text,
          fontWeight: "500",
          flex: 1,
        }}
      >
        {card.text}
      </Text>
    </Animated.View>
  );
}

// ─── Mic icon ───────────────────────────────────────────────────────

function MicIcon({ size = 64 }: { size?: number }) {
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    const pulse = () => {
      pulseScale.value = withTiming(1.06, {
        duration: 1200,
        easing: EASE_CUBIC_OUT,
      });
      setTimeout(() => {
        pulseScale.value = withTiming(1, {
          duration: 1200,
          easing: EASE_CUBIC_OUT,
        });
      }, 1200);
    };
    pulse();
    const id = setInterval(pulse, 2400);
    return () => clearInterval(id);
  }, [pulseScale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <Animated.View
      style={[
        animStyle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: PURPLE,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: PURPLE_LIGHT,
        },
      ]}
    >
      {/* Mic shape: vertical bar + rounded bottom */}
      <View
        style={{
          width: 12,
          height: 24,
          borderRadius: 6,
          backgroundColor: PURPLE,
        }}
      />
      <View
        style={{
          width: 20,
          height: 12,
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10,
          borderWidth: 2,
          borderTopWidth: 0,
          borderColor: PURPLE,
          marginTop: -4,
          backgroundColor: "transparent",
        }}
      />
      <View
        style={{
          width: 2,
          height: 6,
          backgroundColor: PURPLE,
          marginTop: 1,
        }}
      />
    </Animated.View>
  );
}

// ─── Progress dots ──────────────────────────────────────────────────

function ProgressDots({
  active,
  total,
  tokens,
}: {
  active: number;
  total: number;
  tokens: ReturnType<typeof makeAcuityTokens>;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 12,
      }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: i === active ? PURPLE : tokens.line,
          }}
        />
      ))}
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────

export default function HowItWorksScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const [activeSlide, setActiveSlide] = useState(0);
  const [showClosing, setShowClosing] = useState(false);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Headline animation
  const headlineOpacity = useSharedValue(0);
  const headlineScale = useSharedValue(0.96);

  // Closing line + CTA
  const closingOpacity = useSharedValue(0);
  const closingY = useSharedValue(8);
  const ctaOpacity = useSharedValue(0);

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

  // Headline entrance
  useEffect(() => {
    if (reduceMotion === null) return;
    if (reduceMotion) {
      headlineOpacity.value = 1;
      headlineScale.value = 1;
      setShowClosing(true);
      closingOpacity.value = 1;
      closingY.value = 0;
      ctaOpacity.value = 1;
      return;
    }

    headlineOpacity.value = withTiming(1, {
      duration: 600,
      easing: EASE_CUBIC_OUT,
    });
    headlineScale.value = withTiming(1, {
      duration: 600,
      easing: EASE_CUBIC_OUT,
    });
  }, [
    reduceMotion,
    headlineOpacity,
    headlineScale,
    closingOpacity,
    closingY,
    ctaOpacity,
  ]);

  // Auto-advance timer
  useEffect(() => {
    if (reduceMotion === null || reduceMotion) return;
    if (activeSlide >= 3) return; // done

    // 800ms pause before first slide content after headline
    const delay = activeSlide === 0 ? 800 : 0;
    const duration = SLIDE_DURATIONS[activeSlide] ?? 3000;

    timerRef.current = setTimeout(() => {
      if (activeSlide < 2) {
        setActiveSlide((s) => s + 1);
      } else {
        // After slide 3 completes, show closing
        setActiveSlide(3);
        setShowClosing(true);
        closingOpacity.value = withTiming(1, {
          duration: 500,
          easing: EASE_CUBIC_OUT,
        });
        closingY.value = withTiming(0, {
          duration: 500,
          easing: EASE_CUBIC_OUT,
        });
        ctaOpacity.value = withDelay(
          600,
          withTiming(1, { duration: 400, easing: EASE_CUBIC_OUT })
        );
      }
    }, delay + duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeSlide, reduceMotion, closingOpacity, closingY, ctaOpacity]);

  const advanceSlide = useCallback(() => {
    if (reduceMotion) return; // reduced-motion shows all content
    if (timerRef.current) clearTimeout(timerRef.current);

    if (activeSlide < 2) {
      setActiveSlide((s) => s + 1);
    } else if (!showClosing) {
      setActiveSlide(3);
      setShowClosing(true);
      closingOpacity.value = withTiming(1, {
        duration: 500,
        easing: EASE_CUBIC_OUT,
      });
      closingY.value = withTiming(0, {
        duration: 500,
        easing: EASE_CUBIC_OUT,
      });
      ctaOpacity.value = withDelay(
        300,
        withTiming(1, { duration: 400, easing: EASE_CUBIC_OUT })
      );
    }
  }, [
    activeSlide,
    showClosing,
    reduceMotion,
    closingOpacity,
    closingY,
    ctaOpacity,
  ]);

  const onContinue = () => {
    router.push("/onboarding-new/commitment" as never);
  };

  const headlineStyle = useAnimatedStyle(() => ({
    opacity: headlineOpacity.value,
    transform: [{ scale: headlineScale.value }],
  }));
  const closingStyle = useAnimatedStyle(() => ({
    opacity: closingOpacity.value,
    transform: [{ translateY: closingY.value }],
  }));
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
  }));

  if (reduceMotion === null) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.bg }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]} />
      </View>
    );
  }

  // ── Reduced motion: static stacked layout ──────────────────────
  if (reduceMotion) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.bg }}>
        <StatusBar style="dark" />
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <View
            style={{
              flex: 1,
              paddingHorizontal: 28,
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 24,
                lineHeight: 30,
                fontWeight: "700",
                letterSpacing: -0.3,
                color: tokens.text,
                textAlign: "center",
                marginBottom: 32,
              }}
            >
              One minute. Every day.{"\n"}That's all it takes.
            </Text>

            {/* Slide 1 summary */}
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 15,
                fontWeight: "600",
                color: tokens.text,
                marginBottom: 4,
              }}
            >
              Open the app. Tap record. Talk.
            </Text>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 13,
                lineHeight: 19,
                color: tokens.textSec,
                marginBottom: 20,
              }}
            >
              About your day. Your stress. Your wins. Whatever's on your mind.
            </Text>

            {/* Slide 2 cards */}
            {CARDS.map((card, i) => (
              <ExtractionCard
                key={i}
                card={card}
                index={i}
                visible
                compact
                reduceMotion
                tokens={tokens}
              />
            ))}
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 13,
                lineHeight: 19,
                color: tokens.textSec,
                marginTop: 8,
                marginBottom: 20,
              }}
            >
              AI pulls out what matters. Instantly.
            </Text>

            {/* Slide 3 summary */}
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 13,
                lineHeight: 19,
                color: tokens.textSec,
                marginBottom: 20,
              }}
            >
              Over time, you build a living picture of your life. Not a journal
              you'll abandon. A record that grows every time you talk.
            </Text>

            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 15,
                lineHeight: 22,
                fontWeight: "600",
                color: tokens.text,
                textAlign: "center",
                fontStyle: "italic",
              }}
            >
              You already think about your life every day. Acuity just makes
              sure it counts.
            </Text>
          </View>

          <View style={{ paddingHorizontal: 28, paddingBottom: 24 }}>
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
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Animated layout ────────────────────────────────────────────
  const currentDot = Math.min(activeSlide, 2);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <Pressable
          onPress={advanceSlide}
          style={{ flex: 1 }}
          accessibilityRole="button"
          accessibilityLabel="Advance to next slide"
        >
          {/* Headline — persists across all slides */}
          <Animated.View
            style={[
              headlineStyle,
              {
                paddingHorizontal: 28,
                paddingTop: 40,
                marginBottom: 24,
              },
            ]}
          >
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 24,
                lineHeight: 30,
                fontWeight: "700",
                letterSpacing: -0.3,
                color: tokens.text,
                textAlign: "center",
              }}
            >
              One minute. Every day.{"\n"}That's all it takes.
            </Text>
          </Animated.View>

          {/* Slide content area */}
          <View
            style={{
              flex: 1,
              paddingHorizontal: 28,
              justifyContent: "center",
            }}
          >
            {/* ── SLIDE 1: The Input ── */}
            {activeSlide === 0 && <SlideInput tokens={tokens} />}

            {/* ── SLIDE 2: The Magic ── */}
            {activeSlide === 1 && (
              <SlideMagic tokens={tokens} reduceMotion={false} />
            )}

            {/* ── SLIDE 3: The Picture ── */}
            {activeSlide === 2 && (
              <SlidePicture tokens={tokens} reduceMotion={false} />
            )}

            {/* ── Closing line ── */}
            {activeSlide >= 3 && (
              <View style={{ alignItems: "center" }}>
                {/* Mini timeline preview */}
                <View style={{ width: "100%", marginBottom: 32 }}>
                  {CARDS.map((card, i) => (
                    <ExtractionCard
                      key={i}
                      card={card}
                      index={0}
                      visible
                      compact
                      reduceMotion={false}
                      tokens={tokens}
                    />
                  ))}
                </View>

                <Animated.View style={closingStyle}>
                  <Text
                    style={{
                      fontFamily: tokens.fontDisplay,
                      fontSize: 16,
                      lineHeight: 24,
                      fontWeight: "600",
                      color: tokens.text,
                      textAlign: "center",
                      fontStyle: "italic",
                    }}
                  >
                    You already think about your life every day. Acuity just
                    makes sure it counts.
                  </Text>
                </Animated.View>
              </View>
            )}
          </View>
        </Pressable>

        {/* Progress dots */}
        {activeSlide < 3 && (
          <ProgressDots active={currentDot} total={3} tokens={tokens} />
        )}

        {/* Continue button — after closing line */}
        {showClosing && !reduceMotion && (
          <Animated.View
            style={[
              ctaStyle,
              { paddingHorizontal: 28, paddingBottom: 24 },
            ]}
          >
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
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
}

// ─── Slide 1: The Input ─────────────────────────────────────────────

function SlideInput({
  tokens,
}: {
  tokens: ReturnType<typeof makeAcuityTokens>;
}) {
  const textOpacity = useSharedValue(0);
  const textY = useSharedValue(12);
  const subOpacity = useSharedValue(0);
  const waveOpacity = useSharedValue(0);

  useEffect(() => {
    textOpacity.value = withTiming(1, {
      duration: 500,
      easing: EASE_CUBIC_OUT,
    });
    textY.value = withTiming(0, {
      duration: 500,
      easing: EASE_CUBIC_OUT,
    });
    subOpacity.value = withDelay(
      300,
      withTiming(1, { duration: 400, easing: EASE_CUBIC_OUT })
    );
    waveOpacity.value = withDelay(
      600,
      withTiming(1, { duration: 500, easing: EASE_CUBIC_OUT })
    );
  }, [textOpacity, textY, subOpacity, waveOpacity]);

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textY.value }],
  }));
  const subStyle = useAnimatedStyle(() => ({
    opacity: subOpacity.value,
  }));
  const waveStyle = useAnimatedStyle(() => ({
    opacity: waveOpacity.value,
  }));

  return (
    <View style={{ alignItems: "center" }}>
      <MicIcon size={72} />

      <Animated.View style={[textStyle, { marginTop: 28 }]}>
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 18,
            lineHeight: 24,
            fontWeight: "600",
            color: tokens.text,
            textAlign: "center",
          }}
        >
          Open the app. Tap record. Talk.
        </Text>
      </Animated.View>

      <Animated.View style={[subStyle, { marginTop: 10 }]}>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 14,
            lineHeight: 20,
            color: tokens.textSec,
            textAlign: "center",
          }}
        >
          About your day. Your stress. Your wins.{"\n"}Whatever's on your mind.
        </Text>
      </Animated.View>

      {/* Waveform */}
      <Animated.View
        style={[
          waveStyle,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            height: 36,
            marginTop: 28,
          },
        ]}
      >
        {WAVEFORM_HEIGHTS.map((h, i) => (
          <WaveformBar
            key={i}
            index={i}
            height={h}
            animate
            tokens={tokens}
          />
        ))}
      </Animated.View>
    </View>
  );
}

// ─── Slide 2: The Magic ─────────────────────────────────────────────

function SlideMagic({
  tokens,
  reduceMotion,
}: {
  tokens: ReturnType<typeof makeAcuityTokens>;
  reduceMotion: boolean;
}) {
  const labelOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const labelY = useSharedValue(reduceMotion ? 0 : 8);
  const subOpacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    // Label appears after cards (4 cards * 200ms stagger + 400ms anim)
    const labelDelay = CARDS.length * CARD_STAGGER + 200;
    labelOpacity.value = withDelay(
      labelDelay,
      withTiming(1, { duration: 400, easing: EASE_CUBIC_OUT })
    );
    labelY.value = withDelay(
      labelDelay,
      withTiming(0, { duration: 400, easing: EASE_CUBIC_OUT })
    );
    subOpacity.value = withDelay(
      labelDelay + 200,
      withTiming(1, { duration: 400, easing: EASE_CUBIC_OUT })
    );
  }, [reduceMotion, labelOpacity, labelY, subOpacity]);

  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
    transform: [{ translateY: labelY.value }],
  }));
  const subStyle = useAnimatedStyle(() => ({
    opacity: subOpacity.value,
  }));

  return (
    <View>
      {CARDS.map((card, i) => (
        <ExtractionCard
          key={i}
          card={card}
          index={i}
          visible
          reduceMotion={reduceMotion}
          tokens={tokens}
        />
      ))}

      <Animated.View style={[labelStyle, { marginTop: 16 }]}>
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 16,
            lineHeight: 22,
            fontWeight: "600",
            color: tokens.text,
            textAlign: "center",
          }}
        >
          AI pulls out what matters. Instantly.
        </Text>
      </Animated.View>

      <Animated.View style={[subStyle, { marginTop: 8 }]}>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 13,
            lineHeight: 19,
            color: tokens.textSec,
            textAlign: "center",
          }}
        >
          Tasks you mentioned. Goals you're tracking. Moods you didn't notice
          shifting. Patterns you can't see yourself.
        </Text>
      </Animated.View>
    </View>
  );
}

// ─── Slide 3: The Picture ───────────────────────────────────────────

function SlidePicture({
  tokens,
  reduceMotion,
}: {
  tokens: ReturnType<typeof makeAcuityTokens>;
  reduceMotion: boolean;
}) {
  const headerOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const headerY = useSharedValue(reduceMotion ? 0 : 12);
  const subOpacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    headerOpacity.value = withTiming(1, {
      duration: 500,
      easing: EASE_CUBIC_OUT,
    });
    headerY.value = withTiming(0, {
      duration: 500,
      easing: EASE_CUBIC_OUT,
    });
    subOpacity.value = withDelay(
      400,
      withTiming(1, { duration: 400, easing: EASE_CUBIC_OUT })
    );
  }, [reduceMotion, headerOpacity, headerY, subOpacity]);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerY.value }],
  }));
  const subStyle = useAnimatedStyle(() => ({
    opacity: subOpacity.value,
  }));

  // Week day labels for the timeline
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <View style={{ alignItems: "center" }}>
      <Animated.View style={headerStyle}>
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 18,
            lineHeight: 24,
            fontWeight: "600",
            color: tokens.text,
            textAlign: "center",
          }}
        >
          Over time, you build a living picture of your life.
        </Text>
      </Animated.View>

      {/* Mini week timeline */}
      <Animated.View
        style={[
          subStyle,
          {
            marginTop: 24,
            flexDirection: "row",
            justifyContent: "space-between",
            width: "100%",
            paddingHorizontal: 4,
          },
        ]}
      >
        {days.map((day, i) => {
          const filled = i < 5; // Mon-Fri filled, weekend empty
          return (
            <View key={day} style={{ alignItems: "center", flex: 1 }}>
              <View
                style={{
                  width: 32,
                  height: 40,
                  borderRadius: 8,
                  backgroundColor: filled ? PURPLE_LIGHT : tokens.cardBg,
                  borderWidth: filled ? 1 : 0.5,
                  borderColor: filled ? PURPLE_MID : tokens.cardBorder,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 6,
                }}
              >
                {filled && (
                  <View
                    style={{
                      width: 16,
                      height: 2,
                      borderRadius: 1,
                      backgroundColor: PURPLE,
                      marginBottom: 3,
                    }}
                  />
                )}
                {filled && (
                  <View
                    style={{
                      width: 12,
                      height: 2,
                      borderRadius: 1,
                      backgroundColor: PURPLE_MID,
                    }}
                  />
                )}
              </View>
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 9,
                  fontWeight: "600",
                  color: filled ? tokens.textSec : tokens.textTer,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {day}
              </Text>
            </View>
          );
        })}
      </Animated.View>

      <Animated.View style={[subStyle, { marginTop: 20 }]}>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 13,
            lineHeight: 19,
            color: tokens.textSec,
            textAlign: "center",
          }}
        >
          Not a journal you'll abandon. Not an app you'll forget. A record that
          grows every time you talk {"\u2014"} and shows you what you couldn't
          see alone.
        </Text>
      </Animated.View>
    </View>
  );
}
