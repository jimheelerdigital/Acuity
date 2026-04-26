import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { ThemeCardsStrip, type StripTheme } from "./ThemeCardsStrip";
import { ThemeDetailSheet, type DetailEntry } from "./ThemeDetailSheet";
import { ThemeMoodWaveRow, type WaveTheme } from "./ThemeMoodWaveRow";
import { ThemeRings, type ThemePeriods } from "./ThemeRings";
import { CARD_STYLE, PAGE_BG_STOPS, TEXT } from "./theme-tokens";

/**
 * Mobile composition root for v2 Theme Map. Mirrors apps/web/src/
 * components/theme-map/ThemeMapDashboard layer-for-layer with mobile-
 * appropriate scroll affordances + bottom sheet instead of modal.
 */

export type SentimentTone = "positive" | "challenging" | "neutral";

export type DashboardTheme = WaveTheme & {
  sentimentBand: SentimentTone;
  sparkline: number[];
  trendDescription: string;
  firstMentionedDaysAgo: number;
  recentEntries: DetailEntry[];
};

export function ThemeMapDashboard({
  themes,
  totalMentions,
  topThemeName,
  periods,
  windowStart,
  windowEnd,
}: {
  themes: DashboardTheme[];
  totalMentions: number;
  topThemeName: string | null;
  periods: ThemePeriods;
  windowStart: string | null;
  windowEnd: string;
}) {
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const activeTheme = themes.find((t) => t.id === activeThemeId) ?? null;

  if (themes.length === 0) {
    return (
      <EmptyState
        title="Patterns will appear as you record."
        body="Record your first reflection to see your themes start surfacing here."
      />
    );
  }

  const stripThemes: StripTheme[] = themes.slice(0, 5).map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    count: t.count,
    meanMood: t.meanMood,
    trend: t.trend,
  }));

  const maxCount = Math.max(...themes.map((t) => t.count));
  const VISIBLE = 11;
  const visibleThemes = showAll ? themes : themes.slice(0, VISIBLE);
  const hiddenCount = Math.max(0, themes.length - VISIBLE);
  const fewThemes = themes.length < 3;

  return (
    <View
      style={{
        marginHorizontal: 14,
        marginTop: 14,
        borderRadius: 24,
        overflow: "hidden",
      }}
    >
      <PageBackground />
      <View style={{ padding: 14, gap: 18 }}>
        <SectionLabel label="PERIOD AT A GLANCE" />

        <ThemeRings
          periods={periods}
          topThemeName={topThemeName ?? themes[0].name}
          totalMentions={totalMentions}
        />

        <ThemeCardsStrip themes={stripThemes} onTap={setActiveThemeId} />

        {!fewThemes && (
          <>
            <SectionLabel label="EVERY THEME · TAP TO EXPLORE" />
            <View style={{ ...CARD_STYLE, overflow: "hidden" }}>
              {visibleThemes.map((t, i) => (
                <ThemeMoodWaveRow
                  key={t.id}
                  rank={i + 1}
                  theme={t}
                  maxCountInPeriod={maxCount}
                  isFirst={i === 0}
                  onTap={setActiveThemeId}
                />
              ))}
            </View>
            {hiddenCount > 0 && (
              <View style={{ alignItems: "center" }}>
                <Pressable
                  onPress={() => setShowAll((v) => !v)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: "rgba(255,255,255,0.02)",
                    borderWidth: 0.5,
                    borderColor: "rgba(255,255,255,0.08)",
                  }}
                >
                  <Text style={{ color: TEXT.secondary, fontSize: 12, fontWeight: "500" }}>
                    {showAll ? "Show fewer themes" : `Show ${hiddenCount} more theme${hiddenCount === 1 ? "" : "s"}`}
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        )}

        {fewThemes && (
          <Text
            style={{
              textAlign: "center",
              fontSize: 12,
              color: TEXT.tertiary,
              paddingVertical: 12,
            }}
          >
            More patterns will appear as you keep journaling.
          </Text>
        )}
      </View>

      {activeTheme && (
        <ThemeDetailSheet
          theme={activeTheme}
          entries={activeTheme.recentEntries ?? []}
          windowStart={windowStart}
          windowEnd={windowEnd}
          onClose={() => setActiveThemeId(null)}
        />
      )}
    </View>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          backgroundColor: "#FB923C",
          shadowColor: "#FB923C",
          shadowOpacity: 1,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      <Text
        style={{
          fontSize: 10,
          letterSpacing: 2.4,
          fontWeight: "700",
          color: "rgba(168,168,180,0.65)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function PageBackground() {
  return (
    <Svg
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
    >
      <Defs>
        <SvgLinearGradient id="page-bg-v2" x1="0" y1="0" x2="0" y2="1">
          {PAGE_BG_STOPS.map((s) => (
            <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </SvgLinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#page-bg-v2)" />
    </Svg>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View
      style={{
        marginHorizontal: 14,
        marginTop: 14,
        padding: 32,
        borderRadius: 20,
        backgroundColor: "#0E0E1C",
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "rgba(251,146,60,0.18)",
          borderWidth: 0.5,
          borderColor: "rgba(251,146,60,0.4)",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 18,
        }}
      />
      <Text
        style={{
          fontSize: 17,
          fontWeight: "500",
          color: TEXT.primary,
          letterSpacing: -0.2,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontSize: 13,
          color: TEXT.secondary,
          textAlign: "center",
          maxWidth: 320,
        }}
      >
        {body}
      </Text>
    </View>
  );
}
