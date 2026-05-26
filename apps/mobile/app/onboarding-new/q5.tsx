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
import { makeAcuityTokens } from "@/lib/theme/tokens";

import { DiagnosticCard } from "./_components/diagnostic-card";
import { ScreenTestimonial } from "./_components/screen-testimonial";

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

export default function Q5Screen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { q5, setQ5 } = useOnboardingState();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const onSelect = (key: Q5Answer) => {
    setQ5(key);
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
