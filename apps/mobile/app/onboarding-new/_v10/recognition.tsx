import { useEffect } from "react";
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
import { markV10Started, setV10Branch } from "@/lib/onboarding-v10/state";

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
      </ScrollView>
    </SafeAreaView>
  );
}
