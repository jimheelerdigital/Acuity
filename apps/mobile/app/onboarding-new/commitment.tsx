import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/contexts/theme-context";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import { makeAcuityTokens } from "@/lib/theme/tokens";

import { CommitmentRing } from "./_components/commitment-ring";

/**
 * Screen 9 — Commitment. Slice 7 (2026-05-26) onboarding-v2.
 *
 * Light theme (continues from the promise screen — visual relief
 * doesn't flip back to dark until the user has committed and we
 * land on the recording surface).
 *
 * Mechanic: 3-second press-and-hold on the central 140pt button.
 * Progress ring fills 0→100% over 3000ms with haptic milestones at
 * 1000ms (Light), 2000ms (Medium), 3000ms (Heavy + Success). Early
 * release resets the ring and fires funnel_commitment_abandoned.
 * On completion: 800ms hold to let the user feel the finish, then
 * push to /onboarding-new/record.
 *
 * Confetti deliberately skipped — web ships canvas-confetti for the
 * celebration, but the moment that matters here is the gesture
 * itself, not the burst. The 3-second hold IS the commitment;
 * adding celebration on a 30-frame native animation budget would
 * dilute the focus. Confetti might land as a polish layer later.
 *
 * Stack:
 *   - Pressable onPressIn/onPressOut for the hold gesture (cleaner
 *     than LongPress + manual progress for our case; we need
 *     start + end immediately, not just a single "long press
 *     happened" callback after delay)
 *   - expo-haptics for milestone feedback
 *   - CommitmentRing handles the visual layers (SVG ring +
 *     breathing inner disc) via Reanimated worklets
 *
 * Reduced-motion: breathing skipped, ring snaps full immediately
 * on press (no fill animation), but the 3-second hold requirement
 * stays. The user still has to commit — we just don't decorate it.
 * Haptic milestones still fire because they're informational, not
 * decorative.
 *
 * No testimonial on this screen — action screens stay clean per
 * the web mapping.
 */

const HOLD_DURATION_MS = 3000;
const POST_COMPLETION_DELAY_MS = 800;
const HAPTIC_LIGHT_AT_MS = 1000;
const HAPTIC_MEDIUM_AT_MS = 2000;
const PURPLE = "#7C5CFC";

export default function CommitmentScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const [holding, setHolding] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  // Timer refs so press-out can cancel everything cleanly.
  const lightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediumTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (!cancelled) setReduceMotion(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const clearAllTimers = () => {
    if (lightTimerRef.current) clearTimeout(lightTimerRef.current);
    if (mediumTimerRef.current) clearTimeout(mediumTimerRef.current);
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
    lightTimerRef.current = null;
    mediumTimerRef.current = null;
    completionTimerRef.current = null;
  };

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      clearAllTimers();
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  const onPressIn = () => {
    if (completed) return;
    setHolding(true);
    void trackOnboardingEvent("funnel_commitment_started");

    // 1s — light impact
    lightTimerRef.current = setTimeout(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, HAPTIC_LIGHT_AT_MS);

    // 2s — medium impact
    mediumTimerRef.current = setTimeout(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, HAPTIC_MEDIUM_AT_MS);

    // 3s — heavy impact + success notification + state flip
    completionTimerRef.current = setTimeout(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );
      void trackOnboardingEvent("funnel_commitment_completed");
      setCompleted(true);

      // 800ms breath, then transition. Match web's
      // post-confetti-burst timing for a familiar pace.
      transitionTimerRef.current = setTimeout(() => {
        router.push("/onboarding-new/record" as never);
      }, POST_COMPLETION_DELAY_MS);
    }, HOLD_DURATION_MS);
  };

  const onPressOut = () => {
    if (completed) return; // post-completion release is a no-op
    // Did the user release before 3s elapsed? completionTimerRef
    // still being set means yes — fire abandoned.
    const wasMidHold =
      lightTimerRef.current !== null ||
      mediumTimerRef.current !== null ||
      completionTimerRef.current !== null;
    clearAllTimers();
    setHolding(false);
    if (wasMidHold) {
      void trackOnboardingEvent("funnel_commitment_abandoned");
    }
  };

  // Wait for the reduce-motion probe before rendering anything that
  // depends on it. The screen is short-lived; one tick of nothing
  // beats a glitchy re-render after the probe resolves.
  if (reduceMotion === null) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.bg }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]} />
      </View>
    );
  }

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
              fontFamily: tokens.fontDisplay,
              fontSize: 28,
              lineHeight: 34,
              fontWeight: "700",
              letterSpacing: -0.3,
              color: tokens.text,
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            Hold to commit to one minute a day.
          </Text>
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 14,
              lineHeight: 20,
              color: tokens.textTer,
              textAlign: "center",
              marginBottom: 48,
            }}
          >
            Three seconds. Press and hold.
          </Text>

          <Pressable
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            disabled={completed}
            accessibilityRole="button"
            accessibilityLabel="Hold to commit"
            accessibilityHint="Press and hold for three seconds to commit"
          >
            <CommitmentRing
              holding={holding}
              holdDurationMs={HOLD_DURATION_MS}
              reduceMotion={reduceMotion}
              ringColor={PURPLE}
              trackColor={tokens.cardBgTint}
              fillColor={PURPLE}
            >
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 14,
                  fontWeight: "600",
                  color: "#ffffff",
                  textAlign: "center",
                }}
              >
                {completed ? "Ready" : "Hold"}
              </Text>
            </CommitmentRing>
          </Pressable>

          {/* Status text under the ring — matches the haptic state
              so a user with the screen on silent still has a visual
              cue that progress is real. */}
          <Text
            style={{
              fontFamily: tokens.fontMono,
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 1.4,
              color: tokens.textTer,
              textTransform: "uppercase",
              marginTop: 32,
              minHeight: 14,
            }}
          >
            {completed
              ? "Committed"
              : holding
              ? "Holding…"
              : "Press and hold the circle"}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}
