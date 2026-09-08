import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/contexts/theme-context";
import {
  Q3_OPTIONS,
  useOnboardingState,
} from "@/contexts/onboarding-context";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import { makeAcuityTokens } from "@/lib/theme/tokens";

import { DiagnosticCard } from "./_components/diagnostic-card";
import { ScreenTestimonial } from "./_components/screen-testimonial";
import { useV10RedirectIfEnabled } from "./_v10/route-switch";

const TESTIMONIAL = {
  quote:
    "I tried three journaling apps. This is the first one that stuck because I just talk.",
  name: "Jamie L.",
};

/**
 * Screen 4 — Diagnostic Q3, multi-select with explicit Continue.
 * Slice 3 v1.2. The provider's toggleQ3 owns the "All of the above"
 * mutual-exclusivity logic so screens stay dumb.
 *
 * Continue is disabled until at least one option is selected. On
 * tap → pushes /onboarding-new/bridge (slice 4 — placeholder
 * shipped here so the nav doesn't crash during the QA window).
 */

function Q3Screen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { q3, toggleQ3 } = useOnboardingState();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const canContinue = q3.length > 0;

  const onContinue = () => {
    if (!canContinue) return;
    void trackOnboardingEvent("funnel_diagnostic_attempts", { values: q3 });
    // Updated flow 2026-05-25: Q3 → Q4 → Q5 → bridge. Mirrors web's
    // 5-question diagnostic vector before the failed-solution pivot.
    router.push("/onboarding-new/q4" as never);
  };

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
          keyboardShouldPersistTaps="handled"
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
            What have you tried to fix it?
          </Text>
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 14,
              lineHeight: 20,
              color: tokens.textTer,
              marginTop: 6,
              marginBottom: 24,
            }}
          >
            Select all that apply.
          </Text>

          <View style={{ gap: 10 }}>
            {Q3_OPTIONS.map((opt) => (
              <DiagnosticCard
                key={opt.key}
                label={opt.label}
                selected={q3.includes(opt.key)}
                onPress={() => toggleQ3(opt.key)}
                tokens={tokens}
              />
            ))}
          </View>

          <View style={{ marginTop: 32 }}>
            <ScreenTestimonial
              quote={TESTIMONIAL.quote}
              name={TESTIMONIAL.name}
              tokens={tokens}
            />
          </View>
        </ScrollView>

        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: 20,
          }}
        >
          <Pressable
            onPress={onContinue}
            disabled={!canContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            accessibilityState={{ disabled: !canContinue }}
            style={({ pressed }) => ({
              backgroundColor: canContinue
                ? tokens.text
                : tokens.cardBgTint,
              borderRadius: tokens.radius.pill,
              paddingVertical: 14,
              alignItems: "center",
              opacity: pressed && canContinue ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 16,
                fontWeight: "600",
                color: canContinue ? tokens.bg : tokens.textTer,
              }}
            >
              Continue →
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

/**
 * Route entry point. This screen exists ONLY in the legacy flow — v10
 * collapses the eleven pre-record screens into two, so there is no v10
 * equivalent.
 *
 * Flag OFF renders Q3Screen exactly as before. Flag ON redirects to the
 * start of the v10 flow rather than rendering a screen from a funnel the
 * user is not in, which is what a stale deep link or a back-swipe would
 * otherwise land on. The file is kept intact so flag OFF restores the
 * previous flow with nothing missing (spec §9).
 */
export default function Q3Route() {
  const redirecting = useV10RedirectIfEnabled();
  if (redirecting) return null;
  return <Q3Screen />;
}
