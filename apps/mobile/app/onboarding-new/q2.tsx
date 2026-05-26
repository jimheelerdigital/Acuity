import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/contexts/theme-context";
import {
  Q2_OPTIONS,
  useOnboardingState,
  type Q2Answer,
} from "@/contexts/onboarding-context";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import { makeAcuityTokens } from "@/lib/theme/tokens";

import { DiagnosticCard } from "./_components/diagnostic-card";
import { ScreenTestimonial } from "./_components/screen-testimonial";

const TESTIMONIAL = {
  quote:
    "Over a year. It was uncomfortable to admit, but that's what made me try it.",
  name: "Sarah K.",
};

/**
 * Screen 3 — Diagnostic Q2, single-select with auto-advance.
 * Same composition as q1.tsx; different header + option set.
 */

const AUTO_ADVANCE_MS = 200;

export default function Q2Screen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { q2, setQ2 } = useOnboardingState();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const onSelect = (key: Q2Answer) => {
    setQ2(key);
    void trackOnboardingEvent("funnel_diagnostic_duration", { value: key });
    setTimeout(() => {
      router.push("/onboarding-new/q3" as never);
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
            How long have you been stuck in this loop?
          </Text>

          <View style={{ gap: 10 }}>
            {Q2_OPTIONS.map((opt) => (
              <DiagnosticCard
                key={opt.key}
                label={opt.label}
                selected={q2 === opt.key}
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
