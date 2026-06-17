import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

import { useOnboarding } from "./context";

/**
 * Step 10 — "Ready when you are" CTA. Terminal step. Finish tap in
 * the shell POSTs /api/onboarding/complete + calls auth refresh; the
 * AuthGate then lands the user on /(tabs) where the Record button is
 * the primary surface.
 */
export function Step10Ready() {
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
        style={{ backgroundColor: `${tokens.primary}26` }}
      >
        <Ionicons name="sparkles-outline" size={40} color={tokens.primary} />
      </View>
      <Text
        className="text-center text-3xl font-semibold tracking-tight mb-4"
        style={{ color: tokens.text }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        You&rsquo;re set up
      </Text>
      <Text
        className="text-center text-base leading-relaxed max-w-xs"
        style={{ color: tokens.textSec }}
      >
        Tap Finish and we&rsquo;ll drop you on the home screen. The
        Record button is the only thing you need — one minute, every
        day, and the rest happens in the background.
      </Text>
      <View
        className="mt-6 rounded-2xl border px-4 py-3"
        style={{
          borderColor: `${tokens.primary}55`,
          backgroundColor: `${tokens.primary}14`,
        }}
      >
        <Text className="text-xs" style={{ color: tokens.primary }}>
          Your Day 7 Life Audit is already scheduled.
        </Text>
      </View>
    </View>
  );
}
