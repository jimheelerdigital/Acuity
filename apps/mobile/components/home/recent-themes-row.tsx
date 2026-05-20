import { ScrollView, Text, View } from "react-native";

import { ThemePill, type ThemeKey } from "@/components/acuity";
import { useTheme } from "@/contexts/theme-context";

/**
 * RecentThemesRow — horizontal-scroll strip of theme pills aggregated
 * from recent entries. Pulls from the entries already in scope —
 * no new endpoint. Dedupes (keeping first-seen order) and caps at
 * `max` (default 5).
 *
 * Themes that don't map to a canonical ThemeKey are silently dropped
 * (ThemePill only renders for known colors). If we want a generic
 * "neutral" theme pill later, extend ThemePill — don't fan that
 * complexity out here.
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

function pickThemeKeys(themes: string[], max: number): { key: ThemeKey; label: string }[] {
  const seen = new Set<string>();
  const out: { key: ThemeKey; label: string }[] = [];
  for (const raw of themes) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (!KNOWN_THEMES.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push({ key: lower as ThemeKey, label: raw });
    if (out.length >= max) break;
  }
  return out;
}

interface RecentThemesRowProps {
  /** All theme strings across recent entries. Order matters — earliest first wins. */
  themes: string[];
  max?: number;
}

export function RecentThemesRow({ themes, max = 5 }: RecentThemesRowProps) {
  const { tokens } = useTheme();
  const picks = pickThemeKeys(themes, max);
  if (picks.length === 0) return null;

  return (
    <View>
      <Text
        style={{
          fontFamily: tokens.fontMono,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: tokens.textTer,
          paddingHorizontal: 4,
          marginBottom: 10,
        }}
      >
        Recent themes
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}
      >
        {picks.map((t) => (
          <ThemePill key={t.key} theme={t.key} label={t.label} size="m" />
        ))}
      </ScrollView>
    </View>
  );
}
