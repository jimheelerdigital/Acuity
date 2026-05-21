import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { WARN_AMBER } from "@/lib/tone-colors";

import { useOnboarding } from "./context";

/**
 * Step 2 — Value prop. Three cards explaining what the app does. No
 * inputs; Continue is always enabled.
 */

type CardAccentKey = "primary" | "good" | "warn";

const CARDS: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  accentKey: CardAccentKey;
}> = [
  {
    icon: "eye-outline",
    title: "Notice patterns",
    body: "See recurring themes you'd otherwise miss.",
    accentKey: "primary",
  },
  {
    icon: "repeat-outline",
    title: "Build a habit",
    body: "One minute a day is enough to change how you see the week.",
    accentKey: "good",
  },
  {
    icon: "bulb-outline",
    title: "Get clarity",
    body: "Weekly and quarterly reports turn journaling into insight.",
    accentKey: "warn",
  },
];

export function Step2ValueProp() {
  const { tokens } = useTheme();
  const { setCanContinue, setCapturedData } = useOnboarding();
  useEffect(() => {
    setCanContinue(true);
    setCapturedData(null);
  }, [setCanContinue, setCapturedData]);

  const resolveAccent = (k: CardAccentKey): string => {
    switch (k) {
      case "good":
        return tokens.good;
      case "warn":
        return WARN_AMBER;
      case "primary":
      default:
        return tokens.primary;
    }
  };

  return (
    <View className="flex-1">
      <Text
        className="text-3xl font-semibold tracking-tight mb-2"
        style={{ color: tokens.text }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        What you&apos;ll get
      </Text>
      <Text
        className="text-base mb-8"
        style={{ color: tokens.textSec }}
      >
        Three things Acuity does differently.
      </Text>
      <View className="gap-3">
        {CARDS.map((c) => {
          const accent = resolveAccent(c.accentKey);
          return (
            <View
              key={c.title}
              className="rounded-2xl border p-4 flex-row items-start gap-3"
              style={{
                borderColor: tokens.line,
                backgroundColor: tokens.cardBg,
              }}
            >
              <View
                className="h-10 w-10 rounded-full items-center justify-center"
                style={{ backgroundColor: `${accent}20` }}
              >
                <Ionicons name={c.icon} size={20} color={accent} />
              </View>
              <View className="flex-1">
                <Text
                  className="text-base font-semibold"
                  style={{ color: tokens.text }}
                >
                  {c.title}
                </Text>
                <Text
                  className="mt-0.5 text-sm leading-snug"
                  style={{ color: tokens.textSec }}
                >
                  {c.body}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
