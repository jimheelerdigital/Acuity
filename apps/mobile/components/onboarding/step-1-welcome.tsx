import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Text, View } from "react-native";

import { useOnboarding } from "./context";

/**
 * Step 1 — Welcome. Two-sentence pitch with a big violet mic glyph.
 * Continue is always enabled; this is a read-only landing screen.
 */
export function Step1Welcome() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  useEffect(() => {
    setCanContinue(true);
    setCapturedData(null);
  }, [setCanContinue, setCapturedData]);

  return (
    <View className="flex-1 items-center justify-center">
      <View className="h-20 w-20 items-center justify-center rounded-full bg-violet-600 mb-6 shadow-lg shadow-violet-500/30">
        <Ionicons name="mic" size={40} color="#FFFFFF" />
      </View>
      <Text className="text-center text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-4">
        Welcome to Acuity
      </Text>
      <Text className="text-center text-base leading-relaxed text-zinc-600 dark:text-zinc-300 max-w-xs">
        A one-minute voice journal that turns your daily thoughts into
        patterns, tasks, and long-term insight.
      </Text>
    </View>
  );
}
