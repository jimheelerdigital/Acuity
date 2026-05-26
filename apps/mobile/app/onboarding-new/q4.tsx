import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/contexts/theme-context";
import {
  Q4_OPTIONS,
  useOnboardingState,
} from "@/contexts/onboarding-context";
import { makeAcuityTokens } from "@/lib/theme/tokens";

import { DiagnosticCard } from "./_components/diagnostic-card";
import { ScreenTestimonial } from "./_components/screen-testimonial";

/**
 * Screen 5 — Diagnostic Q4 ("What's it costing you?"), multi-select
 * with explicit Continue. Mirrors web's DIAGNOSTIC4_OPTIONS exactly
 * (apps/web/src/components/onboarding-funnel.tsx).
 *
 * No "All of the above" semantics here — none of the cost framings
 * collapse to a single bucket and the web funnel doesn't include
 * that option either.
 *
 * David K. testimonial at the bottom matches the web pairing.
 */

const TESTIMONIAL = {
  quote:
    "My partner noticed the difference before I did. I'm actually present when I get home now.",
  name: "David K.",
};

export default function Q4Screen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { q4, toggleQ4 } = useOnboardingState();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const canContinue = q4.length > 0;

  const onContinue = () => {
    if (!canContinue) return;
    router.push("/onboarding-new/q5" as never);
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
            What&apos;s it costing you?
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
            {Q4_OPTIONS.map((opt) => (
              <DiagnosticCard
                key={opt.key}
                label={opt.label}
                selected={q4.includes(opt.key)}
                onPress={() => toggleQ4(opt.key)}
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
              backgroundColor: canContinue ? tokens.text : tokens.cardBgTint,
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
