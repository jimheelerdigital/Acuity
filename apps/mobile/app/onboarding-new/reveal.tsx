import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/theme-context";

/**
 * Placeholder for slice 10 (Reveal). Exists so slice 9's post-
 * processing router push lands cleanly during the slice 9 → slice
 * 10 ship window.
 *
 * The real composition (staggered fade-up of the user's actual
 * extraction — pull-quote HeroCard, mood + energy row, themes,
 * tasks, goals — followed by the "Imagine what a week looks like"
 * sub and a Continue CTA to account creation) lands in slice 10
 * and overwrites this file. Reveal reads from
 * lib/try-session.getStoredTryExtraction (persisted in slice 9
 * via setStoredTryExtraction).
 */
export default function PlaceholderRevealScreen() {
  const { tokens } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <SafeAreaView
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: tokens.textSec, fontFamily: tokens.fontSans }}>
          Reveal — coming in slice 10
        </Text>
      </SafeAreaView>
    </View>
  );
}
