import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/theme-context";

/**
 * Placeholder for slice 7 (Commitment screen — 3-second hold
 * gesture, progress ring, haptic feedback). Exists so slice 6's
 * Continue button has a valid expo-router destination during the
 * QA window between slice 6 and slice 7.
 *
 * The real composition (LongPressGestureHandler + Reanimated
 * progress-ring worklet + react-native-haptic-feedback on hold
 * milestones + smooth transition to recording) lands in slice 7
 * and overwrites this file.
 */
export default function PlaceholderCommitmentScreen() {
  const { tokens } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <SafeAreaView
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: tokens.textSec, fontFamily: tokens.fontSans }}>
          Commitment — coming in slice 7
        </Text>
      </SafeAreaView>
    </View>
  );
}
