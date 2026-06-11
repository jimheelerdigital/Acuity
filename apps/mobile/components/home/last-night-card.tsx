import { Pressable, Text, View } from "react-native";

import { ThemePill, type ThemeKey } from "@/components/acuity";
import { useTheme } from "@/contexts/theme-context";

/**
 * LastNightCard — pull-quote card from the user's most recent entry.
 *
 * Uses summary as the body (no separate pull-quote field in EntryDTO
 * yet — when the extraction pipeline starts persisting a
 * `pullQuote` field, swap to that). Theme pills below.
 *
 * Tap navigates to /entry/[id] via the `onPress` callback so the
 * parent owns routing.
 */

const KNOWN_THEMES = new Set<string>([
  "career",
  "family",
  "health",
  "avoidance",
  "money",
  "relationships",
  "sleep",
  "growth",
  "solitude",
]);

function asThemeKey(label: string): ThemeKey | null {
  const lower = label.toLowerCase();
  if (KNOWN_THEMES.has(lower)) return lower as ThemeKey;
  return null;
}

interface LastNightCardProps {
  summary: string;
  /** Date label for the eyebrow (e.g. "Last night", "Sunday"). */
  whenLabel: string;
  /** Duration string ("1m 47s"). Optional — hide row when absent. */
  durationLabel?: string;
  /** Up to 3 themes; pills only render for canonical theme keys. */
  themes: string[];
  onPress?: () => void;
}

export function LastNightCard({
  summary,
  whenLabel,
  durationLabel,
  themes,
  onPress,
}: LastNightCardProps) {
  const { tokens } = useTheme();
  const themeKeys = themes
    .slice(0, 3)
    .map((t) => ({ key: asThemeKey(t), label: t }))
    .filter((t): t is { key: ThemeKey; label: string } => t.key !== null);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{
        padding: 18,
        borderRadius: tokens.radius.xl,
        backgroundColor: tokens.cardBg,
        borderWidth: 0.5,
        borderColor: tokens.line,
        // Issue A (v1.3.3): faded when not tappable — parent passes
        // onPress=undefined while the entry is still processing.
        opacity: onPress ? 1 : 0.55,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            fontFamily: tokens.fontMono,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.0,
            color: tokens.textSec,
            textTransform: "uppercase",
          }}
        >
          {whenLabel}
        </Text>
        {durationLabel && (
          <Text
            style={{
              fontFamily: tokens.fontMono,
              fontSize: 11,
              color: tokens.textTer,
            }}
          >
            {durationLabel}
          </Text>
        )}
      </View>
      <Text
        numberOfLines={4}
        style={{
          fontFamily: tokens.fontDisplay,
          fontSize: 17,
          fontWeight: "500",
          letterSpacing: -0.3,
          color: tokens.text,
          lineHeight: 23,
          marginBottom: themeKeys.length > 0 ? 14 : 0,
        }}
      >
        {summary}
      </Text>
      {themeKeys.length > 0 && (
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {themeKeys.map((t) => (
            <ThemePill
              key={t.key}
              theme={t.key}
              label={t.label}
              size="s"
            />
          ))}
        </View>
      )}
    </Pressable>
  );
}
