import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackButton } from "@/components/back-button";

/**
 * Placeholder — the full "Ask Your Past Self" experience lives on web
 * today (apps/web/src/app/insights/ask). Mobile will link out to the
 * web version or get a native port in a later phase; this screen
 * exists so the Insights tile has a real route to navigate to
 * instead of dumping the user on Expo Router's Unmatched Route.
 */
export default function AskPastSelfScreen() {
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
        <Text className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-3">
          Ask
        </Text>
        <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 text-center mb-3">
          Ask Your Past Self
        </Text>
        <Text className="text-base leading-relaxed text-zinc-500 dark:text-zinc-400 text-center">
          Coming soon to mobile. Ask natural-language questions across
          your own journal history and get answers in your own words.
        </Text>
      </View>
    </SafeAreaView>
  );
}
