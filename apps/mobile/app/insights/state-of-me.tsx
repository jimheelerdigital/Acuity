import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackButton } from "@/components/back-button";

/**
 * Placeholder — the full State of Me report lives on web
 * (apps/web/src/app/insights/state-of-me). Mobile port is future
 * work; this screen unblocks the Insights tile's deep link so
 * users don't hit Expo Router's Unmatched Route fallback.
 */
export default function StateOfMeScreen() {
  const router = useRouter();
  return (
    <SafeAreaView
      edges={["top"]}
      className="flex-1 bg-white dark:bg-[#0B0B12]"
    >
      <View className="p-5">
        <BackButton onPress={() => router.back()} />
      </View>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-xs font-semibold uppercase tracking-widest text-amber-400 mb-3">
          Quarterly
        </Text>
        <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 text-center mb-3">
          State of Me
        </Text>
        <Text className="text-base leading-relaxed text-zinc-500 dark:text-zinc-400 text-center">
          Your quarterly State of Me report — coming soon. Every 90
          days, Acuity will write a long-form read across the
          quarter: themes, mood arc, patterns worth noticing.
        </Text>
      </View>
    </SafeAreaView>
  );
}
