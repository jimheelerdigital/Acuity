import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/theme-context";

/**
 * Placeholder for slice 8 (Recording — 15s min / 60s suggested
 * target / 90s hard cap, uploads to /api/mobile/try-recording via
 * lib/try-session.submitTryRecording). Exists so slice 7's
 * post-commitment transition has a valid expo-router destination
 * during the QA window between slice 7 and slice 8.
 *
 * The real composition (giant mic button with breathing pulse,
 * waveform visualization, timer, 15s-minimum stop-button gate,
 * 90s auto-stop, post-record nav to /processing) lands in slice
 * 8 and overwrites this file.
 */
export default function PlaceholderRecordScreen() {
  const { tokens } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <SafeAreaView
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: tokens.textSec, fontFamily: tokens.fontSans }}>
          Recording — coming in slice 8
        </Text>
      </SafeAreaView>
    </View>
  );
}
