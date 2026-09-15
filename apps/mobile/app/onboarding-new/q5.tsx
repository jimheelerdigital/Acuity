import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/contexts/theme-context";
import {
  Q5_OPTIONS,
  useOnboardingState,
  type Q5Answer,
} from "@/contexts/onboarding-context";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import { makeAcuityTokens } from "@/lib/theme/tokens";

import { DiagnosticCard } from "./_components/diagnostic-card";
import { ScreenTestimonial } from "./_components/screen-testimonial";
import { useV10RedirectIfEnabled } from "./_v10/route-switch";

/**
 * Screen 6 — Diagnostic Q5 ("What would change if you could finally
 * see the pattern?"). Single-select with auto-advance, mirrors
 * DIAGNOSTIC5_OPTIONS in the web funnel.
 *
 * Q5 is the last diagnostic before the failed-solution bridge.
 * All five answers (q1 loop + q2 duration + q3 tried + q4 cost +
 * q5 desire) feed into the slice 6 personalized-promise lookup —
 * matches web's getPersonalizedPromise(answers) which picks the
 * variant from the full diagnostic vector.
 *
 * Marcus T. testimonial matches the web pairing.
 */

const AUTO_ADVANCE_MS = 200;
const TESTIMONIAL = {
  quote:
    "I finally feel like I'm in control of my week instead of my week controlling me.",
  name: "Marcus T.",
};

function Q5Screen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { q5, setQ5 } = useOnboardingState();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const onSelect = (key: Q5Answer) => {
    setQ5(key);
    void trackOnboardingEvent("funnel_diagnostic_desire", { value: key });
    setTimeout(() => {
      router.push("/onboarding-new/bridge" as never);
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
            What would change if you could finally see the pattern?
          </Text>

          <View style={{ gap: 10 }}>
            {Q5_OPTIONS.map((opt) => (
              <DiagnosticCard
                key={opt.key}
                label={opt.label}
                selected={q5 === opt.key}
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
 * Flag OFF renders Q5Screen exactly as before. Flag ON redirects to the
 * start of the v10 flow rather than rendering a screen from a funnel the
 * user is not in, which is what a stale deep link or a back-swipe would
 * otherwise land on. The file is kept intact so flag OFF restores the
 * previous flow with nothing missing (spec §9).
 */
export default function Q5Route() {
  const redirecting = useV10RedirectIfEnabled();
  if (redirecting) return null;
  return <Q5Screen />;
}
