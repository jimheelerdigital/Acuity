import { useCallback, useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { useTheme } from "@/contexts/theme-context";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import { dismissV10, markV10Started } from "@/lib/onboarding-v10/state";

import { CoralScreen, FunnelCta, RippleWordmark, coralType } from "./_ui";

/**
 * First screen (1.9.1): two clear choices.
 *   - "I'm new" → create the account → the questions → first recording.
 *   - "I have an account — Log in" → the Log in screen.
 *
 * Replaces the small "Already have an account? Sign in" link that used to
 * sit under the first question, which returning users missed (they ended up
 * creating a second, empty account).
 */
export default function V10Start() {
  const { palette } = useTheme();
  const tokens = makeAcuityTokens({ dark: true, accent: palette });
  const ct = coralType(tokens);

  useEffect(() => {
    void markV10Started();
    trackV10("v10_start_viewed", {});
  }, []);

  const onNew = useCallback(() => {
    trackV10("v10_start_new", {});
    router.push("/onboarding-new/account");
  }, []);

  const onLogIn = useCallback(async () => {
    trackV10("v10_signin_from_funnel", {});
    // Sticky: a returning user must not be dropped back into the funnel on
    // the next cold launch. Written BEFORE navigating so AuthGate reads it.
    await dismissV10();
    router.replace("/(auth)/sign-in");
  }, []);

  return (
    <CoralScreen tokens={tokens}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "center" }}>
          <View style={{ alignItems: "center", marginBottom: 28 }}>
            <RippleWordmark height={40} />
          </View>
          <Text accessibilityRole="header" style={{ ...ct.h1, textAlign: "center", marginBottom: 12 }}>
            Talk it out. Ripple sorts it out.
          </Text>
          <Text style={{ ...ct.muted, textAlign: "center" }}>
            Your to-dos, habits and patterns, from a few minutes of talking.
          </Text>
        </View>
        <View style={{ paddingHorizontal: 24, paddingBottom: 24, gap: 12 }}>
          <FunnelCta label="I'm new" onPress={onNew} tokens={tokens} onCoral />
          <Pressable
            onPress={onLogIn}
            accessibilityRole="button"
            accessibilityLabel="I have an account. Log in"
            style={{
              borderWidth: 1.5,
              borderColor: "rgba(255,255,255,0.85)",
              borderRadius: 999,
              paddingVertical: 15,
              alignItems: "center",
            }}
          >
            <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 16, color: "#ffffff" }}>
              I have an account — Log in
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </CoralScreen>
  );
}
