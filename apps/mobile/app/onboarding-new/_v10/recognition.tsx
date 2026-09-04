import { useCallback, useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { useTheme } from "@/contexts/theme-context";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import {
  V10_BRANCHES,
  V10_BRANCH_ORDER,
  V10_RECOGNITION_HEADLINE,
  type V10Branch,
} from "@/lib/onboarding-v10/branches";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import {
  dismissV10,
  markV10Started,
  setV10Branch,
} from "@/lib/onboarding-v10/state";

/**
 * Screen 1 — Recognition (dark).
 *
 * Six cards. Tap stores the branch and AUTO-ADVANCES: spec §4 is explicit
 * that there is no Continue button and no logo. Both matter —
 *
 *   - No Continue: this is tap 1 of the two product taps to active
 *     recording (§3). A Continue button would make it three, and the
 *     two-tap path is the north-star metric's main lever.
 *   - No logo: §1 bans any brand mark before the reveal. The first thing
 *     she should recognize is herself, not us.
 *
 * "Just let me talk" is a first-class sixth option, not an escape hatch —
 * §0 lists it as a deliberate v9 addition so nobody is forced into a
 * category.
 */
export default function V10Recognition() {
  const { palette } = useTheme();
  // Screens 1-2 are dark per spec §1, regardless of the user's saved
  // appearance preference — same override the legacy pain screen uses.
  const tokens = makeAcuityTokens({ dark: true, accent: palette });

  useEffect(() => {
    void markV10Started();
    trackV10("v10_recognition_viewed");
  }, []);

  const choose = (branch: V10Branch) => {
    // Light haptic on selection — the screen has no other confirmation,
    // since it advances immediately.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    void setV10Branch(branch);
    trackV10("v10_branch_selected", { branch });
    router.push("/onboarding-new/promise");
  };

  const onSignIn = useCallback(async () => {
    // Sticky: a returning user who found this must not be dropped back
    // into the funnel on the next cold launch. Written BEFORE navigating
    // so AuthGate reads the new value, not a race.
    trackV10("v10_signin_from_funnel", {});
    await dismissV10();
    router.replace("/(auth)/sign-in");
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: 48,
          paddingBottom: 32,
          justifyContent: "center",
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 30,
            lineHeight: 38,
            color: tokens.text,
            marginBottom: 32,
          }}
        >
          {V10_RECOGNITION_HEADLINE}
        </Text>

        <View style={{ gap: 12 }}>
          {V10_BRANCH_ORDER.map((key) => {
            const b = V10_BRANCHES[key];
            return (
              <Pressable
                key={key}
                onPress={() => choose(key)}
                accessibilityRole="button"
                accessibilityLabel={`${b.card}. ${b.support}`}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? tokens.cardBgRaised : tokens.cardBg,
                  borderColor: tokens.line,
                  borderWidth: 1,
                  borderRadius: 16,
                  paddingVertical: 18,
                  paddingHorizontal: 20,
                  transform: [{ scale: pressed ? 0.99 : 1 }],
                })}
              >
                <Text
                  style={{
                    fontFamily: tokens.fontDisplay,
                    fontSize: 18,
                    color: tokens.text,
                    marginBottom: 4,
                  }}
                >
                  {b.card}
                </Text>
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 15,
                    lineHeight: 21,
                    color: tokens.textSec,
                  }}
                >
                  {b.support}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Escape hatch for returning users ──────────────────────
            Now that a cold launch can land here, someone who already has
            an account — a reinstalling subscriber whose token was
            rejected, say — could otherwise be trapped in a signup funnel
            with no way to reach sign-in. Screen 7's Apple/Google buttons
            do sign existing accounts in, but email there is signup-only
            and would fail with AlreadyRegistered, so the funnel is not a
            reliable route back to an existing account.

            Low emphasis on purpose: this is a safety valve, not a
            competing call to action for the new users the screen is for. */}
        <Pressable
          onPress={onSignIn}
          accessibilityRole="button"
          style={{ paddingVertical: 18, alignItems: "center" }}
        >
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 14,
              color: tokens.textTer,
            }}
          >
            Already have an account?{" "}
            <Text style={{ textDecorationLine: "underline" }}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
