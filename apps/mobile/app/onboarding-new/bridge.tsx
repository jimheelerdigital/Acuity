import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/theme-context";

/**
 * Placeholder for slice 4 (Failed Solution bridge). Exists so the
 * slice 3 Q3 Continue button has a valid expo-router destination
 * during the QA window between slice 3 ship and slice 4 ship.
 *
 * The real composition (dark atmospheric pivot — "Written
 * journaling asks for discipline. Acuity just asks for one
 * minute.") lands in slice 4 and overwrites this file.
 */
export default function PlaceholderBridgeScreen() {
  const { tokens } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <SafeAreaView
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: tokens.textSec, fontFamily: tokens.fontSans }}>
          Bridge — coming in slice 4
        </Text>
      </SafeAreaView>
    </View>
  );
}
