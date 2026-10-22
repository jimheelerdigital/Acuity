import { useEffect } from "react";
import { ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { goBackOr } from "@/lib/navigation";

import { StickyBackButton } from "@/components/back-button";
import { HabitsPane } from "@/components/growth/habits-pane";
import { useTheme } from "@/contexts/theme-context";
import { isHabitsEnabled } from "@/lib/feature-flags";
import { KeyboardScroll } from "@/components/keyboard/keyboard-scroll";

/**
 * Habits — standalone screen (home-screen quick action "Habits" opens
 * /habits). 1.9.1: renders the same HabitsPane as the Growth tab so rows
 * behave identically everywhere (tap to check, swipe for Edit / Delete,
 * long-press menu, widget sync). It used to be a separate, older copy
 * with no edit or delete.
 *
 * ── v1 is manual on purpose ──────────────────────────────────────────
 * The extraction pipeline could plausibly propose habits from a debrief,
 * and that is a real future hook. It is NOT this version, because a habit
 * the user never chose — appearing on their Home with a streak attached —
 * is an obligation the product invented for them. When it lands, the shape
 * should be: extraction proposes, the user confirms, and only then does a
 * Habit row exist.
 */
export default function HabitsScreen() {
  const { tokens } = useTheme();

  useEffect(() => {
    if (!isHabitsEnabled()) router.replace("/(tabs)");
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }} edges={["top"]}>
      <StickyBackButton onPress={() => goBackOr("/(tabs)")} />
      <KeyboardScroll
        contentContainerStyle={{ paddingTop: 56, paddingBottom: 40 }}
      >
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 26,
            color: tokens.text,
            marginBottom: 6,
            paddingHorizontal: 20,
          }}
        >
          Habits
        </Text>
        <HabitsPane />
      </KeyboardScroll>
    </SafeAreaView>
  );
}
