import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/theme-context";

/**
 * Placeholder for slice 9 (Processing slideshow). Exists so slice
 * 8's post-upload router push lands cleanly during the slice 8 →
 * slice 9 ship window.
 *
 * The real composition (port of web's PROCESSING_SLIDES from
 * try-debrief-flow.tsx — slide deck cycling every ~4s, status
 * text rotation through "Finding the pattern…" / "Reading between
 * your words…" / etc., progress bar, poll for completion) lands
 * in slice 9 and overwrites this file.
 */
export default function PlaceholderProcessingScreen() {
  const { tokens } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <SafeAreaView
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: tokens.textSec, fontFamily: tokens.fontSans }}>
          Processing — coming in slice 9
        </Text>
      </SafeAreaView>
    </View>
  );
}
