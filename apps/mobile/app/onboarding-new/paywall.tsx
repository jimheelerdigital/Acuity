import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
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

import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import { MONTHLY_PRICE_CENTS, formatDollars } from "@/lib/pricing";
import { makeAcuityTokens } from "@/lib/theme/tokens";

/**
 * Screen 14 — Paywall. Slice 12 (2026-05-26).
 *
 * Final screen of the pain-first onboarding. User has recorded,
 * seen their extraction, signed up, and is now in TRIAL state.
 * This screen asks them to commit to a paid trial via Stripe —
 * soft paywall with an explicit "Remind me later" escape (the
 * distinguishing feature vs. web /start's no-escape mandatory
 * paywall, by design — mobile's value-before-paywall acquisition
 * context warrants the option).
 *
 * Apple Option-C handoff:
 *   - $4.99/month in body copy, NOT in the CTA label
 *   - Start-trial opens SFSafariView via expo-web-browser to
 *     /upgrade?src=onboarding_paywall&signup=fresh
 *   - Real purchase on web Stripe; webhook updates
 *     User.subscriptionStatus → PRO; user returns to app and
 *     lands on /home with PRO state
 *
 * Onboarding-completion side effect (mount): POSTs to
 * /api/onboarding/complete with skipped:false. Without that,
 * AuthGate would yank the user back to /onboarding?step=1 the
 * moment they routed to /(tabs) — the new flow has conceptually
 * onboarded them; the existing 8-step post-signup onboarding is
 * redundant. refresh() after so AuthGate sees the new state.
 *
 * Timeline cards staggered 300ms apart. Week 1 carries a
 * checkmark + "You just did this" — the checkmark IS the
 * commitment proof; the user literally just did the slice 8/9/10
 * record → extraction → reveal arc.
 *
 * Pricing from lib/pricing (mobile mirror of the web canonical
 * source — not hardcoded; price changes need to update both
 * files until the constants are promoted to packages/shared in
 * a future cleanup).
 */

const PURPLE = "#7C5CFC";
const EASE_CUBIC_OUT = Easing.bezier(0.215, 0.61, 0.355, 1);
const CARD_DURATION_MS = 500;
const CARD_STAGGER_MS = 300;
const PAYWALL_SRC = "onboarding_paywall";

interface TimelineCard {
  week: string;
  body: string;
  /** When true, the card renders the "just did this" checkmark
   *  affordance. Only Week 1 carries it. */
  completed?: boolean;
}

const CARDS: TimelineCard[] = [
  {
    week: "Week 1",
    body: "Daily task extraction + mood tracking",
    completed: true,
  },
  {
    week: "Week 2",
    body: "Patterns start forming",
  },
  {
    week: "Week 3",
    body: "Your Life Matrix takes shape",
  },
  {
    week: "Week 4",
    body: "Your first monthly memoir",
  },
];

export default function PaywallScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });
  const { refresh } = useAuth();

  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const inflightRef = useRef(false);

  // One sharedValue per card for the staggered cascade.
  const card1 = useSharedValue(0);
  const card2 = useSharedValue(0);
  const card3 = useSharedValue(0);
  const card4 = useSharedValue(0);
  // Body + CTA cascade together at the tail.
  const tailProgress = useSharedValue(0);

  const cardProgresses = [card1, card2, card3, card4];

  // Fire paywall_viewed + mark onboarding complete + probe reduce-motion.
  useEffect(() => {
    let cancelled = false;
    void trackOnboardingEvent("funnel_paywall_viewed");

    void (async () => {
      try {
        await api.post<{ ok: boolean }>("/api/onboarding/complete", {
          skipped: false,
        });
        if (!cancelled) {
          await refresh();
        }
      } catch {
        // Non-fatal. User can still exit via the CTAs; worst case
        // AuthGate redirects to /onboarding?step=1 and they manually
        // complete the standard flow. Slice 13's feature flag work
        // will harden this further.
      }
    })();

    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (!cancelled) setReduceMotion(v);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cascade once reduce-motion preference resolves.
  useEffect(() => {
    if (reduceMotion === null) return;

    if (reduceMotion) {
      cardProgresses.forEach((v) => {
        v.value = 1;
      });
      tailProgress.value = 1;
      return;
    }

    cardProgresses.forEach((v, i) => {
      v.value = withDelay(
        i * CARD_STAGGER_MS,
        withTiming(1, {
          duration: CARD_DURATION_MS,
          easing: EASE_CUBIC_OUT,
        })
      );
    });
    tailProgress.value = withDelay(
      CARDS.length * CARD_STAGGER_MS,
      withTiming(1, {
        duration: CARD_DURATION_MS,
        easing: EASE_CUBIC_OUT,
      })
    );
    // sharedValue refs are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const tailStyle = useAnimatedStyle(() => ({
    opacity: tailProgress.value,
    transform: [{ translateY: (1 - tailProgress.value) * 12 }],
  }));

  const onStartTrial = async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    void trackOnboardingEvent("funnel_trial_started");

    const base =
      process.env.EXPO_PUBLIC_API_URL ?? "https://getacuity.io";
    const url = `${base.replace(/\/$/, "")}/upgrade?src=${PAYWALL_SRC}&signup=fresh`;

    try {
      await WebBrowser.openBrowserAsync(url, {
        // Match the system's interface style so Safari chrome
        // doesn't jarringly flip from light → dark. Same pattern
        // profile.tsx uses for the Stripe Portal handoff.
        toolbarColor: tokens.bg,
        controlsColor: PURPLE,
        dismissButtonStyle: "close",
      });
    } catch {
      // Non-fatal — user can re-tap.
    }
    inflightRef.current = false;

    // When Safari dismisses (cancel OR success), refresh the user
    // state so a PRO transition via the webhook reflects on the
    // home screen, then route there.
    await refresh();
    router.replace("/(tabs)" as never);
  };

  const onRemindLater = () => {
    void trackOnboardingEvent("funnel_paywall_dismissed");
    router.replace("/(tabs)" as never);
  };

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
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 32,
            paddingBottom: 24,
            flexGrow: 1,
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
            }}
          >
            You&apos;ve already started. Keep going.
          </Text>
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 15,
              lineHeight: 22,
              color: tokens.textTer,
              marginTop: 8,
              marginBottom: 28,
            }}
          >
            Here&apos;s what your next 30 days look like:
          </Text>

          <View style={{ gap: 10 }}>
            {CARDS.map((card, i) => (
              <TimelineCardView
                key={card.week}
                card={card}
                progress={cardProgresses[i]}
                tokens={tokens}
              />
            ))}
          </View>

          <Animated.View style={[tailStyle, { marginTop: 32 }]}>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 14,
                lineHeight: 20,
                color: tokens.textSec,
                textAlign: "center",
              }}
            >
              All of this is free for 30 days.
            </Text>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 12,
                lineHeight: 17,
                color: tokens.textTer,
                textAlign: "center",
                marginTop: 4,
              }}
            >
              {formatDollars(MONTHLY_PRICE_CENTS)}/month after your trial.
              Cancel anytime.
            </Text>
          </Animated.View>

          <Animated.View style={[tailStyle, { marginTop: 24 }]}>
            <Pressable
              onPress={() => void onStartTrial()}
              accessibilityRole="button"
              accessibilityLabel="Start trial"
              style={({ pressed }) => ({
                backgroundColor: PURPLE,
                borderRadius: tokens.radius.pill,
                paddingVertical: 16,
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
                shadowColor: PURPLE,
                shadowOpacity: 0.35,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 8 },
              })}
            >
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 16,
                  fontWeight: "700",
                  color: "#ffffff",
                }}
              >
                Start trial
              </Text>
            </Pressable>

            <Pressable
              onPress={onRemindLater}
              accessibilityRole="button"
              accessibilityLabel="Remind me later"
              style={({ pressed }) => ({
                marginTop: 12,
                paddingVertical: 12,
                alignItems: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 14,
                  fontWeight: "500",
                  color: tokens.textTer,
                }}
              >
                Remind me later
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function TimelineCardView({
  card,
  progress,
  tokens,
}: {
  card: TimelineCard;
  progress: ReturnType<typeof useSharedValue<number>>;
  tokens: ReturnType<typeof makeAcuityTokens>;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }],
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          flexDirection: "row",
          gap: 12,
          borderRadius: tokens.radius.lg,
          backgroundColor: card.completed
            ? "rgba(124,92,252,0.06)"
            : tokens.cardBg,
          borderWidth: 0.5,
          borderColor: card.completed ? PURPLE : tokens.cardBorder,
          paddingHorizontal: 14,
          paddingVertical: 14,
        },
      ]}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: card.completed ? PURPLE : tokens.cardBgTint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {card.completed ? (
          <Text
            style={{
              color: "#ffffff",
              fontSize: 14,
              fontWeight: "700",
              lineHeight: 16,
            }}
          >
            ✓
          </Text>
        ) : (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: tokens.textTer,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: tokens.fontMono,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.4,
            color: card.completed ? PURPLE : tokens.textTer,
            textTransform: "uppercase",
          }}
        >
          {card.week}
        </Text>
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 15,
            lineHeight: 21,
            fontWeight: "600",
            color: tokens.text,
            marginTop: 4,
          }}
        >
          {card.body}
        </Text>
        {card.completed && (
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 12,
              lineHeight: 17,
              color: tokens.textSec,
              marginTop: 4,
              fontStyle: "italic",
            }}
          >
            You just did this.
          </Text>
        )}
      </View>
    </Animated.View>
  );
}
