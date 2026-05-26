import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/theme-context";

/**
 * Placeholder for slice 12 (Paywall — 30-day journey timeline +
 * trial CTA with "Remind me later" escape hatch + SFSafari
 * handoff to /upgrade for purchase). Exists so slice 11's
 * post-signup router push lands cleanly during the slice 11 →
 * slice 12 ship window.
 *
 * The real composition (atmospheric 4-card vertical timeline,
 * "All of this is free for 30 days", price + cancel-anytime body,
 * Start-trial CTA via WebBrowser.openBrowserAsync to /upgrade,
 * Remind-me-later dismissal to /(tabs)/home) lands in slice 12.
 */
export default function PlaceholderPaywallScreen() {
  const { tokens } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <SafeAreaView
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: tokens.textSec, fontFamily: tokens.fontSans }}>
          Paywall — coming in slice 12
        </Text>
      </SafeAreaView>
    </View>
  );
}
