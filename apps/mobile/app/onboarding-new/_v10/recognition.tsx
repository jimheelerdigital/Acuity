import { useCallback, useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { useTheme } from "@/contexts/theme-context";

import { CoralScreen, coralCardStyle, coralType } from "./_ui";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import {
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
 * Plain-language card labels, replacing the one-word titles ("The loop",
 * "The load", …) that read as cryptic. Each is the self-explanatory line
 * a user recognizes themselves in — effectively the branch's existing
 * `support` sentence promoted to lead, so the card no longer needs a
 * second line under it.
 *
 * Keys are unchanged: this is a DISPLAY override only, and every
 * downstream branch string still comes from lib/onboarding-v10/branches.ts.
 */
const V10_CARD_LABEL: Record<V10Branch, string> = {
  rumination: "I keep replaying the same things",
  overload: "Everyone's list lives in my head",
  patterns: "Same problems, same week, again",
  stuck: "Busy all day, nothing actually moves",
  mask: "Holding it together for everyone else",
  open: "I just need to talk it out",
};

/**
 * Screen 1 — Recognition (coral).
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
  // Screens 1-2 ignore the user's saved appearance preference by design.
  // They are now the coral marketing surface rather than the dark one;
  // `dark: true` is kept so the token set's own contrast assumptions match
  // a dark backdrop, which the coral gradient is closer to than cream.
  const tokens = makeAcuityTokens({ dark: true, accent: palette });
  const ct = coralType(tokens);

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
    <CoralScreen tokens={tokens}>
      <SafeAreaView style={{ flex: 1 }}>
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
          style={{ ...ct.h1, marginBottom: 32 }}
        >
          {V10_RECOGNITION_HEADLINE}
        </Text>

        <View style={{ gap: 12 }}>
          {V10_BRANCH_ORDER.map((key) => {
            return (
              <Pressable
                key={key}
                onPress={() => choose(key)}
                accessibilityRole="button"
                accessibilityLabel={V10_CARD_LABEL[key]}
                style={({ pressed }) => coralCardStyle(tokens, { pressed })}
              >
                {/* One line, not two: the plain label already says what the
                    old `support` sentence said. */}
                <Text style={ct.cardTitle}>{V10_CARD_LABEL[key]}</Text>
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
          <Text style={ct.muted}>
            Already have an account?{" "}
            <Text style={{ textDecorationLine: "underline" }}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
      </SafeAreaView>
    </CoralScreen>
  );
}
