import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StickyBackButton } from "@/components/back-button";
import { ProLockedCard } from "@/components/pro-locked-card";
import { LockedState } from "@/components/theme-map/LockedState";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { isFreeTierUser } from "@/lib/free-tier";

import { OrbitalCosmos } from "./_theme-map/OrbitalCosmos";
import {
  PlanetCallout,
  type PlanetCalloutData,
} from "./_theme-map/PlanetCallout";
import { StarField } from "./_theme-map/StarField";
import { hueForTheme, type OrbitalTheme } from "./_theme-map/types";

/**
 * Phase E rebuild (2026-05-21) — orbital cosmos Theme Map per design
 * spec _design/design_handoff_acuity_v2/screen-thememap.jsx.
 *
 * Layout (top → bottom):
 *   - StarField (absolute full-screen background, 70 deterministic stars)
 *   - StickyBackButton (chrome)
 *   - Header block (eyebrow + title + entries-count subtitle, centered)
 *   - Time selector (3 options, fits 375pt width cleanly)
 *   - OrbitalCosmos (9 planets across 4 ring guides, spin-in animation)
 *   - Insight strip (glass-blur card, sparkle icon, two-line text)
 *
 * Planet tap → PlanetCallout glass-blur overlay. Tap outside dismisses.
 *
 * Animation skip: module-scoped `hasShownEntranceThisSession` flag
 * lives for the JS bundle's lifetime — first orbital mount in a
 * session plays the entrance, subsequent mounts snap to final state.
 * Auto-clears on app cold-start when the VM tears down.
 */

type CategoryToken = "activity" | "reflection" | "life" | "emotional";
type SentimentBand = "positive" | "neutral" | "challenging";

type ApiTheme = {
  id: string;
  name: string;
  category: CategoryToken;
  mentionCount: number;
  meanMood: number;
  avgSentiment: number;
  sentimentBand: SentimentBand;
  firstMentionedAt: string;
  lastMentionedAt: string;
  lastEntryAt: string;
  firstMentionedDaysAgo: number;
  sparkline: number[];
  trendDescription: string;
  trend: { priorPeriodCount: number; ratio: number | null };
  entries: { id: string; timestamp: string; mood: number }[];
  coOccurrences: { themeName: string; count: number }[];
  recentEntries: {
    id: string;
    createdAt: string;
    sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
    excerpt: string;
  }[];
};

type ApiResponse = {
  themes: ApiTheme[];
  totalMentions: number;
  topTheme: string | null;
  topThemeName: string | null;
  periodLabel: string;
  periods: {
    today: { count: number; mood: number };
    week: { count: number; mood: number };
    month: { count: number; mood: number };
  };
  meta: {
    totalEntries: number;
    windowStart: string | null;
    windowEnd: string;
  };
};

// Reduced from 5 to 3 options (was overflowing at fontSize 13 + padding
// 18px each side on iPhone 16e 375pt). 3 options fits cleanly without
// scroll/clip.
type TimeWindow = "week" | "month" | "all";
const TIME_OPTIONS: { key: TimeWindow; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "all", label: "All time" },
];

const UNLOCK_THRESHOLD = 10;

// Module-scoped session flag. Lives for the lifetime of the JS bundle:
// auto-cleared on app cold-start (VM tear-down) but preserved across
// foreground/background cycles in the same session. First mount in a
// session plays the cosmos entrance; subsequent mounts snap.
let hasShownEntranceThisSession = false;

export default function ThemeMapScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { tokens, resolved } = useTheme();
  const isProLocked = isFreeTierUser(user);
  const [window_, setWindow] = useState<TimeWindow>("month");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calloutData, setCalloutData] =
    useState<PlanetCalloutData | null>(null);

  const [animateOnMount] = useState(() => {
    if (hasShownEntranceThisSession) return false;
    hasShownEntranceThisSession = true;
    return true;
  });

  const fetchData = useCallback(async (win: TimeWindow) => {
    setError(null);
    try {
      const json = await api.get<ApiResponse>(
        `/api/insights/theme-map?window=${encodeURIComponent(win)}`
      );
      setData(json);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't load your Theme Map."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData(window_);
  }, [window_, fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData(window_);
  }, [fetchData, window_]);

  const entryCount = data?.meta.totalEntries ?? 0;
  const locked = entryCount < UNLOCK_THRESHOLD;

  const orbitalThemes: OrbitalTheme[] = useMemo(() => {
    if (!data) return [];
    return [...data.themes]
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, 9)
      .map((t) => ({
        id: t.id,
        name: t.name,
        hue: hueForTheme(t.name),
        mentionCount: t.mentionCount,
        sentimentBand: t.sentimentBand,
        coOccurrences: t.coOccurrences,
        excerpt: t.recentEntries[0]?.excerpt ?? null,
      }));
  }, [data]);

  const screen = Dimensions.get("window");
  const orbitalSize = screen.width;

  // Center "you" initial — first letter of the user's name if known,
  // else a quiet bullet so the surface doesn't show a stale placeholder.
  const centerInitial = useMemo(() => {
    const name = user?.name?.trim();
    if (!name) return "•";
    return name.charAt(0).toUpperCase();
  }, [user?.name]);

  const handlePlanetTap = useCallback((theme: OrbitalTheme) => {
    setCalloutData({
      themeId: theme.id,
      themeName: theme.name,
      hue: theme.hue,
      mentionCount: theme.mentionCount,
      sentimentBand: theme.sentimentBand,
      coOccurrences: theme.coOccurrences,
      excerpt: theme.excerpt,
    });
  }, []);

  if (loading && !data) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: tokens.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
        edges={["top"]}
      >
        <ActivityIndicator color={tokens.primary} />
      </SafeAreaView>
    );
  }

  const starColor =
    resolved === "dark" ? "#FFFFFF" : "rgba(70, 60, 130, 0.85)";

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.bg }}
      edges={["top"]}
    >
      {/* Starfield — absolute-positioned full-screen background */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        <StarField
          width={screen.width}
          height={screen.height}
          color={starColor}
        />
      </View>

      <StickyBackButton
        onPress={() => router.back()}
        accessibilityLabel="Back to Insights"
      />

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.primary}
          />
        }
        contentContainerStyle={{ paddingBottom: 60, paddingTop: 64 }}
      >
        {/* Header — centered eyebrow + gradient-number title + subtitle */}
        <View style={{ paddingHorizontal: 24, alignItems: "center" }}>
          <Text
            style={{
              fontFamily: tokens.fontMono,
              fontSize: 10,
              letterSpacing: 1.4,
              fontWeight: "600",
              textTransform: "uppercase",
              color: tokens.textTer,
              marginBottom: 10,
            }}
          >
            What you think about
          </Text>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 28,
                fontWeight: "700",
                letterSpacing: -0.7,
                lineHeight: 32,
                color: tokens.primary,
              }}
            >
              {orbitalThemes.length}
            </Text>
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 28,
                fontWeight: "700",
                letterSpacing: -0.7,
                lineHeight: 32,
                color: tokens.text,
              }}
            >
              {" "}active themes
            </Text>
          </View>
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 13,
              color: tokens.textSec,
              marginTop: 8,
              letterSpacing: -0.1,
            }}
          >
            {entryCount} {entryCount === 1 ? "entry" : "entries"}
            {data?.periodLabel ? ` · ${data.periodLabel}` : ""}
          </Text>
        </View>

        {/* Time selector — 3 options (Week / Month / All time), fits
            iPhone 16e cleanly without scroll. */}
        {!error && !locked && !isProLocked && (
          <View
            style={{
              marginTop: 18,
              alignItems: "center",
              paddingHorizontal: 20,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                backgroundColor:
                  resolved === "dark"
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
                borderRadius: 999,
                padding: 4,
                borderWidth: 0.5,
                borderColor: tokens.line,
              }}
            >
              {TIME_OPTIONS.map((opt) => {
                const active = opt.key === window_;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setWindow(opt.key)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 18,
                      borderRadius: 999,
                      backgroundColor: active ? tokens.primary : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: tokens.fontSans,
                        fontSize: 12.5,
                        fontWeight: "600",
                        color: active ? "#FFFFFF" : tokens.textSec,
                        letterSpacing: -0.1,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {error && (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ color: tokens.textSec }}>{error}</Text>
          </View>
        )}

        {!error && isProLocked && (
          <View style={{ marginTop: 16, paddingHorizontal: 16 }}>
            <ProLockedCard surfaceId="theme_map_locked" />
          </View>
        )}

        {!error && !isProLocked && locked && (
          <LockedState count={entryCount} />
        )}

        {!error && !locked && data && orbitalThemes.length > 0 && (
          <>
            <View style={{ alignItems: "center", marginTop: 24 }}>
              <OrbitalCosmos
                themes={orbitalThemes}
                size={orbitalSize}
                onPlanetTap={handlePlanetTap}
                animateOnMount={animateOnMount}
                centerInitial={centerInitial}
              />
            </View>

            {/* Insight strip — glass-blur card, sparkle icon, two-line
                text per design spec lines 204-233 */}
            {data.topThemeName && (
              <View
                style={{
                  marginTop: 8,
                  marginHorizontal: 16,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 22,
                  borderWidth: 0.5,
                  borderColor: tokens.lineStrong,
                  backgroundColor:
                    resolved === "dark"
                      ? "rgba(22, 18, 38, 0.7)"
                      : "rgba(255, 255, 255, 0.75)",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: tokens.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontFamily: tokens.fontDisplay,
                      fontSize: 16,
                      fontWeight: "700",
                    }}
                  >
                    ✦
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      fontFamily: tokens.fontSans,
                      fontSize: 13,
                      fontWeight: "600",
                      color: tokens.text,
                      letterSpacing: -0.1,
                      lineHeight: 17,
                    }}
                    numberOfLines={2}
                  >
                    {data.topThemeName} has stayed close in your reflections.
                  </Text>
                  {data.themes[0]?.trendDescription && (
                    <Text
                      style={{
                        fontFamily: tokens.fontSans,
                        fontSize: 12,
                        color: tokens.textSec,
                        marginTop: 1,
                        lineHeight: 16,
                      }}
                      numberOfLines={2}
                    >
                      {data.themes[0].trendDescription}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </>
        )}

        {!error && !locked && data && orbitalThemes.length === 0 && (
          <View
            style={{
              marginHorizontal: 20,
              marginVertical: 40,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                textAlign: "center",
                color: tokens.textSec,
              }}
            >
              Not enough theme variety yet — record a few more sessions
              to see your patterns surface.
            </Text>
          </View>
        )}
      </ScrollView>

      {calloutData && (
        <PlanetCallout
          data={calloutData}
          onDismiss={() => setCalloutData(null)}
        />
      )}
    </SafeAreaView>
  );
}
