import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Text, View } from "react-native";

import { useOnboarding } from "./context";

/**
 * Step 10 — "Ready when you are" CTA. Terminal step. Finish tap in
 * the shell POSTs /api/onboarding/complete + calls auth refresh; the
 * AuthGate then lands the user on /(tabs) where the Record button is
 * the primary surface.
 */
export function Step10Ready() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  useEffect(() => {
    setCanContinue(true);
    setCapturedData(null);
  }, [setCanContinue, setCapturedData]);

  return (
    <View className="flex-1 items-center justify-center">
      <View className="h-20 w-20 items-center justify-center rounded-full bg-violet-600/15 mb-6">
        <Ionicons name="sparkles-outline" size={40} color="#7C3AED" />
      </View>
      <Text className="text-center text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-4">
        You&rsquo;re set up
      </Text>
      <Text className="text-center text-base leading-relaxed text-zinc-600 dark:text-zinc-300 max-w-xs">
        Tap Finish and we&rsquo;ll drop you on the home screen. The
        Record button is the only thing you need — one minute, every
        day, and the rest happens in the background.
      </Text>
      <View className="mt-6 rounded-2xl border border-violet-900/30 bg-violet-950/10 px-4 py-3">
        <Text className="text-xs text-violet-400">
          Your Day 14 Life Audit is already scheduled.
        </Text>
      </View>
    </View>
  );
}
