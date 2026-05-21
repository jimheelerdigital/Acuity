import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * Mobile counterpart to apps/web/src/components/recommended-activity.tsx.
 * Same 24h-dismiss behavior, AsyncStorage instead of localStorage.
 */

const DISMISS_KEY = "acuity_prompt_dismissed_until";

export function RecommendedActivity({
  prompt,
  label,
  goalId,
}: {
  prompt: string;
  label?: string;
  goalId?: string;
}) {
  const router = useRouter();
  const { tokens } = useTheme();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(DISMISS_KEY)
      .then((until) => {
        if (!until) {
          setHidden(false);
          return;
        }
        const untilMs = Number(until);
        if (Number.isFinite(untilMs) && untilMs > Date.now()) {
          setHidden(true);
        } else {
          AsyncStorage.removeItem(DISMISS_KEY).catch(() => {});
          setHidden(false);
        }
      })
      .catch(() => setHidden(false));
  }, []);

  if (hidden) return null;

  const dismiss = async () => {
    const until = Date.now() + 24 * 60 * 60 * 1000;
    await AsyncStorage.setItem(DISMISS_KEY, String(until)).catch(() => {});
    setHidden(true);
  };

  return (
    <View
      className="mb-6 rounded-2xl border p-4"
      style={{
        borderColor: `${tokens.primary}55`,
        backgroundColor: `${tokens.primary}14`,
      }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: tokens.primary }}
          >
            {label ?? "Try this today"}
          </Text>
          <Text
            className="mt-2 text-base font-medium leading-snug"
            style={{ color: tokens.text }}
          >
            {prompt}
          </Text>
        </View>
        <Pressable
          onPress={dismiss}
          hitSlop={8}
          className="rounded px-2 py-1"
        >
          <Text className="text-xs" style={{ color: tokens.textSec }}>
            Not today
          </Text>
        </Pressable>
      </View>
      <Pressable
        onPress={() =>
          goalId ? router.push(`/goal/${goalId}`) : router.push("/record")
        }
        className="mt-4 flex-row items-center justify-center gap-1.5 self-start rounded-full px-4 py-2"
        style={{ backgroundColor: tokens.primary }}
      >
        <Ionicons name="mic" size={14} color="#FFFFFF" />
        <Text
          className="text-xs font-semibold"
          style={{ color: "#FFFFFF" }}
        >
          {goalId ? "Open this goal" : "Record about this"}
        </Text>
      </Pressable>
    </View>
  );
}
