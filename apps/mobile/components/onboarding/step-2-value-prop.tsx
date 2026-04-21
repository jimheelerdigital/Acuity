import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Text, View } from "react-native";

import { useOnboarding } from "./context";

/**
 * Step 2 — Value prop. Three cards explaining what the app does. No
 * inputs; Continue is always enabled.
 */

const CARDS: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  accent: string;
}> = [
  {
    icon: "eye-outline",
    title: "Notice patterns",
    body: "See recurring themes you'd otherwise miss.",
    accent: "#A78BFA",
  },
  {
    icon: "repeat-outline",
    title: "Build a habit",
    body: "One minute a day is enough to change how you see the week.",
    accent: "#34D399",
  },
  {
    icon: "bulb-outline",
    title: "Get clarity",
    body: "Weekly and quarterly reports turn journaling into insight.",
    accent: "#F59E0B",
  },
];

export function Step2ValueProp() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  useEffect(() => {
    setCanContinue(true);
    setCapturedData(null);
  }, [setCanContinue, setCapturedData]);

  return (
    <View className="flex-1">
      <Text className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
        What you&apos;ll get
      </Text>
      <Text className="text-base text-zinc-500 dark:text-zinc-400 mb-8">
        Three things Acuity does differently.
      </Text>
      <View className="gap-3">
        {CARDS.map((c) => (
          <View
            key={c.title}
            className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-4 flex-row items-start gap-3"
          >
            <View
              className="h-10 w-10 rounded-full items-center justify-center"
              style={{ backgroundColor: c.accent + "20" }}
            >
              <Ionicons name={c.icon} size={20} color={c.accent} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {c.title}
              </Text>
              <Text className="mt-0.5 text-sm leading-snug text-zinc-500 dark:text-zinc-400">
                {c.body}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
