import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

import { useOnboarding } from "./context";

/**
 * Step 1 — Welcome. Two-sentence pitch with a big violet mic glyph.
 * Continue is always enabled; this is a read-only landing screen.
 */
export function Step1Welcome() {
  const { tokens } = useTheme();
  const { setCanContinue, setCapturedData } = useOnboarding();
  useEffect(() => {
    setCanContinue(true);
    setCapturedData(null);
  }, [setCanContinue, setCapturedData]);

  return (
    <View className="flex-1 items-center justify-center">
      <View
        className="h-20 w-20 items-center justify-center rounded-full mb-6"
        style={{
          backgroundColor: tokens.primary,
          shadowColor: tokens.glowPrimary.color,
          shadowOpacity: tokens.glowPrimary.opacity,
          shadowRadius: tokens.glowPrimary.radius,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Ionicons name="mic" size={40} color="#FFFFFF" />
      </View>
      <Text
        className="text-center text-3xl font-semibold tracking-tight mb-4"
        style={{ color: tokens.text }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        Welcome to Acuity
      </Text>
      <Text
        className="text-center text-base leading-relaxed max-w-xs"
        style={{ color: tokens.textSec }}
      >
        A one-minute voice journal that turns your daily thoughts into
        patterns, tasks, and long-term insight.
      </Text>
    </View>
  );
}
