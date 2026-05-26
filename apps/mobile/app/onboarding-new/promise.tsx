import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/theme-context";

/**
 * Placeholder for slice 6 (Personalized Promise). Exists so the
 * slice 5 bridge Continue button has a valid expo-router
 * destination during the QA window between slice 5 and slice 6.
 *
 * The real composition (typewriter headline picked from the
 * five-answer diagnostic vector + Marcus T. testimonial + CTA
 * to the commitment screen) lands in slice 6 and overwrites
 * this file.
 */
export default function PlaceholderPromiseScreen() {
  const { tokens } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <SafeAreaView
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: tokens.textSec, fontFamily: tokens.fontSans }}>
          Promise — coming in slice 6
        </Text>
      </SafeAreaView>
    </View>
  );
}
