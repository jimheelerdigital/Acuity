import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/theme-context";

/**
 * Placeholder for slice 3 (Diagnostic Q1). Exists so slice 2's
 * Continue button has a valid expo-router destination during the
 * QA window between slice 2 ship and slice 3 ship.
 *
 * The real composition (5-option single-select with auto-advance)
 * lands in slice 3 and overwrites this file.
 */
export default function PlaceholderQ1Screen() {
  const { tokens } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <SafeAreaView
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: tokens.textSec, fontFamily: tokens.fontSans }}>
          Q1 — coming in slice 3
        </Text>
      </SafeAreaView>
    </View>
  );
}
