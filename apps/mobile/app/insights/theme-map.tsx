import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StickyBackButton } from "@/components/back-button";
import { ProLockedCard } from "@/components/pro-locked-card";
import { LockedState } from "@/components/theme-map/LockedState";
import {
  TimeChips,
  type TimeWindow,
} from "@/components/theme-map/TimeChips";
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
 * Phase E — orbital cosmos Theme Map (replaces the legacy list/cards
 * dashboard). Per design spec _design/design_handoff_acuity_v2/
 * screen-thememap.jsx.
 *
 * Layout (top → bottom):
 *   - StarField (full-screen background, absolutely positioned, 70 stars)
 *   - StickyBackButton
 *   - Header: eyebrow + title + entry count
 *   - TimeChips (week/month/quarter — reshuffles the orbital)
 *   - OrbitalCosmos (9 planets across 4 ring guides, 6.0s entrance)
 *   - Persistent insight strip (topThemeName + trendDescription)
 *
 * Tap a planet → PlanetCallout glass-blur overlay appears in-place.
 * Tap outside the callout dismisses. "See full detail" CTA inside the
 * callout navigates to /insights/theme/[id] for deep drill-down.
 *
 * Animation skip: the 6.0s cosmos entrance only plays the FIRST time
 * the user opens the Theme Map within a session. Subsequent loads in
 * the same session snap to final state. Flag is kept in AsyncStorage
 * (cleared on app cold-start so the next session gets the cosmos
 * entrance again).
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

const UNLOCK_THRESHOLD = 10;

// Module-scoped session flag. Lives for the lifetime of the JS bundle:
// auto-cleared on app cold-start (when the JS VM tears down) but
// preserved across foreground/background cycles in the same session.
// First mount in a session plays the 6.0s cosmos entrance; subsequent
// mounts within the same session snap to final state. No AsyncStorage
// round-trip, no app-launch reset hook needed.
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
  // Capture the animate flag synchronously at first render: if this is
  // the first orbital mount this session, animate and mark the flag;
  // any subsequent mount snaps to final state. Captured into useState
  // so the value is stable across re-renders even though the module
  // flag flips immediately.
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

  // Sort themes by mentionCount DESC, take top 9, map to OrbitalTheme.
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

  // Screen dimensions for the starfield + orbital sizing.
  const screen = Dimensions.get("window");
  const orbitalSize = screen.width; // SVG matches screen width

  const handlePlanetTap = useCallback(
    (theme: OrbitalTheme) => {
      setCalloutData({
        themeId: theme.id,
        themeName: theme.name,
        hue: theme.hue,
        mentionCount: theme.mentionCount,
        sentimentBand: theme.sentimentBand,
        coOccurrences: theme.coOccurrences,
        excerpt: theme.excerpt,
      });
    },
    []
  );

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
      {/* Starfield — absolute-positioned full-screen background. Lives
          BEHIND the scroll content so the entire screen reads as
          cosmos, not just the orbital block. */}
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
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 56 }}
      >
        <View style={{ paddingHorizontal: 20 }}>
          <Text
            style={{
              fontFamily: tokens.fontMono,
              fontSize: 10,
              letterSpacing: 1.6,
              fontWeight: "700",
              textTransform: "uppercase",
              color: tokens.textTer,
              marginBottom: 8,
              textAlign: "center",
            }}
          >
            Insights · Theme Map
          </Text>
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 28,
              fontWeight: "700",
              letterSpacing: -0.7,
              lineHeight: 32,
              color: tokens.text,
              textAlign: "center",
            }}
          >
            <Text style={{ color: tokens.primary }}>
              {orbitalThemes.length}
            </Text>
            <Text>{" "}active themes</Text>
          </Text>
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 13,
              color: tokens.textSec,
              marginTop: 6,
              textAlign: "center",
            }}
          >
            {entryCount} {entryCount === 1 ? "entry" : "entries"} ·{" "}
            {data?.periodLabel ?? "last 30 days"}
          </Text>
        </View>

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

        {!error && !locked && data && (
          <>
            <View style={{ marginTop: 14, marginBottom: 6 }}>
              <TimeChips value={window_} onChange={setWindow} />
            </View>

            {orbitalThemes.length > 0 ? (
              <>
                <View style={{ alignItems: "center", marginTop: 16 }}>
                  <OrbitalCosmos
                    themes={orbitalThemes}
                    size={orbitalSize}
                    onPlanetTap={handlePlanetTap}
                    animateOnMount={animateOnMount}
                  />
                </View>

                {/* Persistent insight strip — single rotating line of
                    observation from the API. Uses topThemeName +
                    trendDescription. Per design spec — sits below the
                    orbital, glass-blur card, sparkle icon left of text. */}
                {data.topThemeName && (
                  <View
                    style={{
                      marginTop: 20,
                      marginHorizontal: 16,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 18,
                      borderWidth: 0.5,
                      borderColor: tokens.lineStrong,
                      backgroundColor:
                        resolved === "dark"
                          ? "rgba(22, 18, 38, 0.55)"
                          : "rgba(255, 255, 255, 0.7)",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: tokens.primary,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontFamily: tokens.fontDisplay,
                          fontSize: 14,
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
                      >
                        {data.topThemeName} is your most-mentioned theme.
                      </Text>
                      {data.themes[0]?.trendDescription && (
                        <Text
                          style={{
                            fontFamily: tokens.fontSans,
                            fontSize: 12,
                            color: tokens.textSec,
                            marginTop: 2,
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
            ) : (
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
          </>
        )}
      </ScrollView>

      {/* Planet tap callout — rendered above the scroll content as an
          overlay. PlanetCallout owns its own backdrop + dismiss. */}
      {calloutData && (
        <PlanetCallout
          data={calloutData}
          onDismiss={() => setCalloutData(null)}
        />
      )}
    </SafeAreaView>
  );
}
