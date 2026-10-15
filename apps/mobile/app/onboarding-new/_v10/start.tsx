import { useCallback, useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";

import { trackV10 } from "@/lib/onboarding-v10/analytics";
import { dismissV10, markV10Started } from "@/lib/onboarding-v10/state";

import { LightScreen, PrimaryButton, RippleLockupCoral, Stars, V11 } from "../_v11/ui";

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
    <LightScreen>
      <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "center" }}>
        <Animated.View entering={FadeInDown.duration(450)} style={{ alignItems: "center" }}>
          <RippleLockupCoral height={46} />
          <Text
            accessibilityRole="header"
            style={{ marginTop: 26, textAlign: "center", fontFamily: V11.heading, fontSize: 30, lineHeight: 36, letterSpacing: -0.8, color: V11.ink }}
          >
            Talk it out. Ripple sorts it out.
          </Text>
          <Text style={{ marginTop: 12, textAlign: "center", fontSize: 17, lineHeight: 25, color: V11.sec, maxWidth: 320 }}>
            Your to-dos, habits and patterns, from a few minutes of talking.
          </Text>
          <View style={{ marginTop: 22 }}>
            <Stars label="on the App Store" />
          </View>
        </Animated.View>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 12 }}>
        <PrimaryButton label="I'm new here" onPress={onNew} />
        <Pressable
          onPress={onLogIn}
          accessibilityRole="button"
          accessibilityLabel="I have an account. Log in"
          style={{
            borderWidth: 1,
            borderColor: V11.lineStrong,
            backgroundColor: "#ffffff",
            borderRadius: 999,
            paddingVertical: 17,
            alignItems: "center",
          }}
        >
          <Text style={{ fontFamily: V11.display, fontSize: 17, color: V11.ink }}>I have an account · Log in</Text>
        </Pressable>
      </View>
    </LightScreen>
  );
}
