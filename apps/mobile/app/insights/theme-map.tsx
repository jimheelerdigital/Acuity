import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

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
 * Phase E polish 1 (2026-05-21) — orbital cosmos with filtered themes.
 *
 * Theme filter pipeline:
 *   1. mentionCount >= 2 — drops single-mention noise
 *   2. Sort by mentionCount DESC
 *   3. Slice to top 6 — keeps the cosmos breathing
 *
 * If post-filter count is 0 or 1, we show a "patterns emerging" empty
 * state rather than a degenerate single-planet orbital.
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
    /** Window the user asked for. */
    requestedWindow?: string;
    /** Echoes requestedWindow now — fix 2 (2026-05-24) removed
     *  silent server-side widening. Kept for back-compat. */
    appliedWindow?: string;
    /** Always false now; kept for back-compat. */
    widened?: boolean;
    /** Fix 2: narrowest wider window with >= 3 themes (if any).
     *  Drives the empty-state "Try the last 3 months?" CTA. */
    suggestedWindow?: string;
  };
};

const REQUESTED_WINDOW_LABEL: Record<string, string> = {
  week: "your last week",
  month: "your last month",
  "3months": "your last 3 months",
  "6months": "your last 6 months",
  year: "your last year",
  all: "your entries",
};

type TimeWindow = "week" | "month" | "3months" | "all";
const TIME_OPTIONS: { key: TimeWindow; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "3months", label: "3 months" },
  { key: "all", label: "All time" },
];

const UNLOCK_THRESHOLD = 10;
const MIN_MENTIONS = 2;
const MAX_THEMES = 6;

// Module-scoped session flag. Cleared on JS VM tear-down (cold start).
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
  const [calloutData, setCalloutData] = useState<PlanetCalloutData | null>(
    null
  );
  const [showInfo, setShowInfo] = useState(false);
  const insets = useSafeAreaInsets();

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

  // Filter: mentionCount >= 2, sort by count DESC, cap at 6.
  // Single-mention themes are noise (e.g. one-off topic from a single
  // entry). Recurring themes are the signal worth visualizing.
  const orbitalThemes: OrbitalTheme[] = useMemo(() => {
    if (!data) return [];
    return [...data.themes]
      .filter((t) => t.mentionCount >= MIN_MENTIONS)
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, MAX_THEMES)
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

  // "Patterns emerging" empty state: unlocked + has entries but
  // 0-1 themes survive the mentionCount >= 2 filter.
  const tooFewRecurring = !locked && orbitalThemes.length < 2;

  const screen = Dimensions.get("window");
  const orbitalSize = screen.width;

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

      {/* Info icon — mirror of StickyBackButton in the top-right.
          Uses the same insets-based positioning + same 40×40 chrome
          treatment so both icons sit at identical y-coordinates and
          read as a balanced header row. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: insets.top + 8,
          right: 16,
          zIndex: 100,
          elevation: 100,
        }}
      >
        <Pressable
          onPress={() => setShowInfo(true)}
          accessibilityRole="button"
          accessibilityLabel="About your theme map"
          hitSlop={8}
          style={{
            height: 40,
            width: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.1)",
            backgroundColor: "rgba(11,11,18,0.88)",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 6,
          }}
        >
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={tokens.textSec}
          />
        </Pressable>
      </View>

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
              {orbitalThemes.length === 1 ? " active theme" : " active themes"}
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

        {/* Bug 3 (2026-05-24): chips visible whenever the page
            renders, not gated on `!tooFewRecurring`. Previously the
            chips disappeared when the current window had < 2 themes
            — trapping the user with no themes and no way to widen
            the window. Bug 1's server cascade makes this rare, but
            the user should always be able to re-narrow if they want. */}
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

        {/* Empty state (2026-05-24 follow-up): the actionable
            "Try the last X" CTA was redundant with the time chips
            already at the top of the page. Now: soft textTer
            acknowledgment, centered where the orbital would have
            been. Server still returns `suggestedWindow` in meta
            for any future consumer; the screen no longer renders a
            CTA. */}
        {!error && !isProLocked && !locked && tooFewRecurring && (
          <Text
            style={{
              marginTop: 64,
              marginHorizontal: 24,
              fontFamily: tokens.fontSans,
              fontSize: 14,
              color: tokens.textTer,
              textAlign: "center",
            }}
          >
            No themes in{" "}
            {REQUESTED_WINDOW_LABEL[window_] ?? "this window"} yet.
          </Text>
        )}

        {!error && !locked && !isProLocked && !tooFewRecurring && data && (
          <>
            {/* Fix 2 (2026-05-24): the widened banner is gone.
                Server no longer auto-cascades; the toggle + subhead
                + rendered themes all reference the same time span
                now. When the user picks a window with no themes,
                the empty state above offers a CTA to widen. */}
            <View style={{ alignItems: "center", marginTop: 24 }}>
              <OrbitalCosmos
                themes={orbitalThemes}
                size={orbitalSize}
                onPlanetTap={handlePlanetTap}
                animateOnMount={animateOnMount}
                centerInitial={centerInitial}
              />
            </View>

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
      </ScrollView>

      {/* Info modal — explains what the orbital represents. */}
      <Modal
        visible={showInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfo(false)}
      >
        <Pressable
          onPress={() => setShowInfo(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 24,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: "100%",
              maxWidth: 340,
              borderRadius: 22,
              borderWidth: 0.5,
              borderColor: tokens.lineStrong,
              backgroundColor: tokens.cardBg,
              padding: 22,
            }}
          >
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 18,
                fontWeight: "700",
                letterSpacing: -0.3,
                color: tokens.text,
                marginBottom: 14,
              }}
            >
              About your theme map
            </Text>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 13,
                lineHeight: 19,
                color: tokens.textSec,
                marginBottom: 12,
              }}
            >
              Your most-mentioned themes appear closer to the center. Less
              frequent themes orbit further out.
            </Text>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 13,
                lineHeight: 19,
                color: tokens.textSec,
                marginBottom: 12,
              }}
            >
              Planet size and ring distance both reflect how often the
              theme has appeared in your reflections during the selected
              time window.
            </Text>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 13,
                lineHeight: 19,
                color: tokens.textSec,
                marginBottom: 18,
              }}
            >
              We only show themes mentioned 2+ times to filter out one-off
              topics.
            </Text>
            <Pressable
              onPress={() => setShowInfo(false)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 0.5,
                borderColor: tokens.lineStrong,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  color: tokens.text,
                }}
              >
                Got it
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {calloutData && (
        <PlanetCallout
          data={calloutData}
          onDismiss={() => setCalloutData(null)}
        />
      )}
    </SafeAreaView>
  );
}
