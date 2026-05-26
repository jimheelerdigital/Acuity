import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/theme-context";

/**
 * Placeholder for slice 11 (Account creation — Apple + Google +
 * email OAuth, claim TrySession into new User on signup, store
 * session JWT, route to paywall). Exists so slice 10's Continue
 * button has a valid expo-router destination during the slice 10
 * → slice 11 ship window.
 *
 * The real composition (three OAuth options with Apple first per
 * Guideline 4.8, email expand-inline, claim call on signup
 * success, push to /onboarding-new/paywall) lands in slice 11
 * and overwrites this file.
 */
export default function PlaceholderAccountScreen() {
  const { tokens } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <SafeAreaView
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: tokens.textSec, fontFamily: tokens.fontSans }}>
          Account — coming in slice 11
        </Text>
      </SafeAreaView>
    </View>
  );
}
