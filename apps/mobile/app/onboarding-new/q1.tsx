import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/contexts/theme-context";
import {
  Q1_OPTIONS,
  useOnboardingState,
  type Q1Answer,
} from "@/contexts/onboarding-context";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import { makeAcuityTokens } from "@/lib/theme/tokens";

import { DiagnosticCard } from "./_components/diagnostic-card";
import { ScreenTestimonial } from "./_components/screen-testimonial";
import { useV10RedirectIfEnabled } from "./_v10/route-switch";

const TESTIMONIAL = {
  quote:
    "I picked 'days that blur together.' Seeing it written down hit different.",
  name: "David K.",
};

/**
 * Screen 2 — Diagnostic Q1, single-select with auto-advance.
 * Slice 3 v1.2. Light theme regardless of user appearance — the
 * flow's emotional arc requires the dark→light flip out of pain.tsx.
 *
 * On tap: persists the answer to the OnboardingProvider context,
 * then after AUTO_ADVANCE_MS pushes /onboarding-new/q2. The brief
 * pause lets the selected-state animation register so the user
 * sees their tap acknowledged before the screen changes.
 *
 * No "Continue" button — single-select diagnostics auto-advance so
 * the flow stays kinetic. The user can swipe back if they need to
 * revise (the back-stack is intact under the Stack layout).
 */

const AUTO_ADVANCE_MS = 200;

function Q1Screen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { q1, setQ1 } = useOnboardingState();
  // Force light tokens — screen 2 ignores user appearance preference.
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const onSelect = (key: Q1Answer) => {
    setQ1(key);
    void trackOnboardingEvent("funnel_diagnostic_loop", { value: key });
    setTimeout(() => {
      router.push("/onboarding-new/q2" as never);
    }, AUTO_ADVANCE_MS);
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 32,
            paddingBottom: 32,
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
              marginBottom: 28,
            }}
          >
            What&apos;s the loop you can&apos;t break?
          </Text>

          <View style={{ gap: 10 }}>
            {Q1_OPTIONS.map((opt) => (
              <DiagnosticCard
                key={opt.key}
                label={opt.label}
                selected={q1 === opt.key}
                onPress={() => onSelect(opt.key)}
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
      </SafeAreaView>
    </View>
  );
}

/**
 * Route entry point. This screen exists ONLY in the legacy flow — v10
 * collapses the eleven pre-record screens into two, so there is no v10
 * equivalent.
 *
 * Flag OFF renders Q1Screen exactly as before. Flag ON redirects to the
 * start of the v10 flow rather than rendering a screen from a funnel the
 * user is not in, which is what a stale deep link or a back-swipe would
 * otherwise land on. The file is kept intact so flag OFF restores the
 * previous flow with nothing missing (spec §9).
 */
export default function Q1Route() {
  const redirecting = useV10RedirectIfEnabled();
  if (redirecting) return null;
  return <Q1Screen />;
}
