import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { useFocusEffect, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { AttachStep } from "react-native-spotlight-tour";

import { TOUR_STEP_INDEX } from "@/components/tour/steps";
import { SafeAreaView } from "react-native-safe-area-context";

import { GradientText, HeroCard } from "@/components/acuity";

import {
  MOOD_LABELS,
  type EntryDTO,
  formatRelativeDate,
  type ProgressionItemKey,
  type UserProgression,
} from "@acuity/shared";

import { HomeFocusStack } from "@/components/home-focus-stack";
import { IdentityHero } from "@/components/home/identity-hero";
import { LastNightCard } from "@/components/home/last-night-card";
import { PeopleThisWeek } from "@/components/home/people-this-week";
import { RecentThemesRow } from "@/components/home/recent-themes-row";
import { TodayStatsRow } from "@/components/home/today-stats-row";
import { TonightCTA } from "@/components/home/tonight-cta";
import { WeeklyInsightCard } from "@/components/home/weekly-insight-card";
import { MoodIcon } from "@/components/mood-icon";
import { ProgressionChecklist } from "@/components/progression-checklist";
import { Skeleton, SkeletonCard } from "@/components/skeleton";
import { ProLockedCard } from "@/components/pro-locked-card";
import { RecommendedActivity } from "@/components/recommended-activity";
import { TourTarget } from "@/components/tour/TourTarget";
import { useTourTrigger } from "@/hooks/use-tour-trigger";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { isFreeTierUser } from "@/lib/free-tier";
import { api } from "@/lib/api";
import { cachedGet, getCached, isStale } from "@/lib/cache";
import { fetchUserProgression } from "@/lib/userProgression";

const HOME_ENTRY_LIMIT = 5;

interface HomePayload {
  progression:
    | {
        items: Array<{
          key: ProgressionItemKey;
          title: string;
          description: string;
          href: string;
          completed: boolean;
        }>;
        completedCount: number;
        totalVisibleCount: number;
      }
    | null;
  dailyPrompt: string;
  recommendation?: {
    tier: "GOAL" | "PATTERN" | "LIBRARY";
    label: string;
    text: string;
    goalId?: string;
  };
}

/**
 * Home tab — Dashboard variant (Slice Q4, visual refresh v2,
 * 2026-05-20). Composes Q3 primitives (RingProgress, Sparkbar,
 * ThemePill, TierPill, HeroCard, GradientText) into the dashboard
 * layout from _design/design_handoff_acuity_v2/screen-home.jsx.
 *
 * All data hooks preserved from the pre-Q4 Home: useAuth, three
 * api.get calls (entries / home / progression), cache-then-revalidate
 * via getCached + setCached + isStale, no new endpoints. Where the
 * design assumes data not in our payload (Life Matrix overall score,
 * achievements detail, server-side tier), we either derive (TierPill
 * from currentStreak) or omit (the dedicated Matrix hero card —
 * lands in Q7 with the Insights tab refresh).
 *
 * Existing surfaces preserved in-place with new styling:
 *   - TrialBanner — restyled to use tokens.
 *   - HomeFocusStack — kept as-is (its own visual language refreshes
 *     in a later slice if needed; doesn't block Q4 from shipping).
 *   - ProgressionChecklist / RecommendedActivity / ProLockedCard —
 *     unchanged; their existing internals will refresh slice-by-slice.
 *   - Recent sessions list — restyled minimal entry rows.
 *
 * Animations wired:
 *   - Motion #3 (stat count-up, 850ms easeOutCubic) on streak +
 *     minutes via useCountUp.
 *   - Motion #6 (streak +1 floater + ring fill, 520ms easeStandard)
 *     when currentStreak ticks vs. the previous render.
 *   - Motion #4 (achievement unlock bounce + shimmer) skipped for
 *     Q4 — detection requires a tier crossing comparison that adds
 *     complexity beyond the slice budget; surfacing as TODO for a
 *     follow-up.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const HOME_ENTRIES_KEY = "/api/entries";
const HOME_DATA_KEY = "/api/home";
const HOME_PROGRESSION_KEY = "/api/user/progression";

export default function DashboardTab() {
  const { user } = useAuth();
  const { tokens } = useTheme();
  const router = useRouter();
  // v1.3.x — auto-fire the first-login product tour when the user
  // lands here for the first time post-onboarding. Internal gates
  // skip the trigger for users who've already recorded an entry or
  // already completed / skipped the tour.
  useTourTrigger();
  const [entries, setEntries] = useState<EntryDTO[] | null>(
    () =>
      getCached<{ entries: EntryDTO[] }>(HOME_ENTRIES_KEY)?.entries ?? null
  );
  const [homeData, setHomeData] = useState<HomePayload | null>(
    () => getCached<HomePayload>(HOME_DATA_KEY) ?? null
  );
  const [progression, setProgression] = useState<UserProgression | null>(
    () => getCached<UserProgression>(HOME_PROGRESSION_KEY) ?? null
  );
  const [loading, setLoading] = useState(
    () => !getCached<{ entries: EntryDTO[] }>(HOME_ENTRIES_KEY)
  );
  const loadInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    try {
      // Shared cache + in-flight dedupe across screens: /api/entries is
      // also fetched by the Entries tab and /api/user/progression by the
      // Goals tab — cachedGet/fetchUserProgression collapse the concurrent
      // post-login loads into one request each (and reuse fresh cache).
      const [entriesData, home, prog] = await Promise.all([
        cachedGet<{ entries: EntryDTO[] }>(HOME_ENTRIES_KEY),
        cachedGet<HomePayload>(HOME_DATA_KEY).catch(() => null),
        fetchUserProgression().catch(() => null),
      ]);
      setEntries(entriesData.entries ?? []);
      setHomeData(home);
      setProgression(prog);
    } catch {
      // Keep any cached state on failure — don't blank the UI.
      setEntries((prev) => prev ?? []);
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  }, []);

  // Revalidate silently on focus, but only if cache is stale.
  useFocusEffect(
    useCallback(() => {
      if (isStale(HOME_ENTRIES_KEY) || isStale(HOME_DATA_KEY)) {
        load();
      }
    }, [load])
  );

  useEffect(() => {
    if (entries === null) load();
  }, [entries, load]);

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const initials = useMemo(() => {
    const name = user?.name ?? firstName;
    return name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [user?.name, firstName]);
  const greeting = useMemo(() => greetingFor(new Date()), []);

  // Derive the 7-day entry counts (oldest → newest) for the sparkbar.
  // Bucket entries by floor((now - createdAt) / day) and clamp to the
  // last 7 days.
  const weekBars = useMemo(() => {
    const bars = [0, 0, 0, 0, 0, 0, 0];
    const now = Date.now();
    for (const e of entries ?? []) {
      const age = now - new Date(e.createdAt).getTime();
      const day = Math.floor(age / (24 * 60 * 60 * 1000));
      if (day < 0 || day > 6) continue;
      // Index 0 = oldest, 6 = today.
      bars[6 - day] += 1;
    }
    return bars;
  }, [entries]);

  const weekCount = useMemo(
    () =>
      (entries ?? []).filter(
        (e) => new Date(e.createdAt).getTime() > Date.now() - WEEK_MS
      ).length,
    [entries]
  );

  // Total minutes recorded across all entries in scope (the /entries
  // payload). audioDuration is seconds; convert to minutes for display.
  const minutesRecorded = useMemo(() => {
    let secs = 0;
    for (const e of entries ?? []) {
      if (typeof e.audioDuration === "number" && Number.isFinite(e.audioDuration)) {
        secs += e.audioDuration;
      }
    }
    return Math.round(secs / 60);
  }, [entries]);

  // Recent themes — flatten + dedupe (first-seen order) from entries.
  // Pre-sort by createdAt desc so most-recent themes win the dedupe.
  const recentThemes = useMemo(() => {
    const sorted = [...(entries ?? [])].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted.flatMap((e) => e.themes ?? []);
  }, [entries]);

  const latestEntry = useMemo(() => {
    if (!entries || entries.length === 0) return null;
    return [...entries].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
  }, [entries]);

  const openEntry = useCallback(
    (entryId: string) => router.push(`/entry/${entryId}`),
    [router]
  );

  const handleSettingsPress = useCallback(
    () => router.push("/(tabs)/profile"),
    [router]
  );

  const handleRecordPress = useCallback(
    () => router.push("/record"),
    [router]
  );

  const handleWeeklyInsightPress = useCallback(
    () => router.push("/insights/state-of-me"),
    [router]
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.bg }}
      edges={["top"]}
    >
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Identity hero — avatar + greeting + name + tier pill.
            Tour step 2 (dashboard): attached by index; the tour explains
            the dashboard right after the mic step. */}
        <AttachStep index={TOUR_STEP_INDEX.dashboard}>
          <TourTarget>
            <IdentityHero
              initials={initials}
              greeting={greeting}
              firstName={firstName}
              currentStreak={user?.currentStreak ?? 0}
              onSettingsPress={handleSettingsPress}
            />
          </TourTarget>
        </AttachStep>

        <View style={{ height: 16 }} />
        <TrialBanner />

        {/* Tonight CTA — gradient mic card, → /record */}
        <TonightCTA
          title="Record what's on your mind"
          helper={
            weekCount === 0
              ? "Start your first session of the week."
              : `${weekCount} session${weekCount === 1 ? "" : "s"} this week.`
          }
          onPress={handleRecordPress}
        />

        <View style={{ height: 16 }} />

        {/* Today stats — streak ring + entries sparkbar + minutes */}
        <TodayStatsRow
          currentStreak={user?.currentStreak ?? 0}
          longestStreak={user?.longestStreak ?? 0}
          weekBars={weekBars}
          minutesRecorded={minutesRecorded}
          minutesLabel={minutesRecorded === 1 ? "minute" : "minutes"}
        />

        <View style={{ height: 20 }} />

        {/* Focus card stack — Phase 2 Run 1 cards preserved. */}
        <HomeFocusStack progression={progression} />

        {/* Recent themes — only renders if there are canonical themes. */}
        {recentThemes.length > 0 && (
          <>
            <View style={{ height: 20 }} />
            <RecentThemesRow themes={recentThemes} />
          </>
        )}

        {/* Slice 8 v1.2 Anchor People — top 3 named people this week.
            Self-fetches; renders null on empty so the home screen
            stays clean for new/disconnected accounts. */}
        <PeopleThisWeek />

        {/* Progression checklist (preserved) */}
        {homeData?.progression && (
          <>
            <View style={{ height: 20 }} />
            <ProgressionChecklist
              items={homeData.progression.items}
              completedCount={homeData.progression.completedCount}
              totalVisibleCount={homeData.progression.totalVisibleCount}
            />
          </>
        )}

        {/* Recommendation / daily prompt (preserved) */}
        {(homeData?.recommendation?.text ?? homeData?.dailyPrompt) && (
          <>
            <View style={{ height: 20 }} />
            <RecommendedActivity
              prompt={
                homeData?.recommendation?.text ??
                (homeData?.dailyPrompt as string)
              }
              label={homeData?.recommendation?.label}
              goalId={homeData?.recommendation?.goalId}
            />
          </>
        )}

        {/* Weekly insight teaser. Always shown if any preview text is
            available (uses dailyPrompt as a fallback so the surface
            never collapses on a payload that has a prompt but no
            recommendation). */}
        {(homeData?.recommendation?.text ?? homeData?.dailyPrompt) && (
          <>
            <View style={{ height: 20 }} />
            <WeeklyInsightCard
              preview={
                homeData?.recommendation?.text ?? (homeData?.dailyPrompt as string)
              }
              whenLabel="Open insights"
              isPro={user?.subscriptionStatus === "PRO"}
              onPress={handleWeeklyInsightPress}
            />
          </>
        )}

        {/* §B.2.1 Pro pulse — free-tier post-trial paywall surface. */}
        {isFreeTierUser(user) && (
          <>
            <View style={{ height: 20 }} />
            <ProLockedCard surfaceId="pro_pulse_home" />
          </>
        )}

        {/* Last night pull-quote card */}
        {latestEntry?.summary && (
          <>
            <View style={{ height: 20 }} />
            <LastNightCard
              summary={latestEntry.summary}
              whenLabel={formatRelativeDate(latestEntry.createdAt)}
              durationLabel={
                latestEntry.audioDuration
                  ? formatDuration(latestEntry.audioDuration)
                  : undefined
              }
              themes={latestEntry.themes ?? []}
              onPress={() => openEntry(latestEntry.id)}
            />
          </>
        )}

        {/* Recent sessions — restyled minimal entry rows. */}
        <View style={{ height: 20 }} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 4,
            marginBottom: 10,
          }}
        >
          <Text
            style={{
              fontFamily: tokens.fontMono,
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: tokens.textTer,
            }}
          >
            Recent sessions
          </Text>
          {entries && entries.length > HOME_ENTRY_LIMIT && (
            <Pressable onPress={() => router.push("/(tabs)/entries")} hitSlop={8}>
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 12,
                  fontWeight: "600",
                  color: tokens.primary,
                }}
              >
                View all →
              </Text>
            </Pressable>
          )}
        </View>

        {loading ? (
          <View style={{ gap: 10 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <Skeleton width={100} height={12} />
                  <Skeleton width={40} height={12} />
                </View>
                <Skeleton width="90%" height={14} />
                <Skeleton
                  width="70%"
                  height={14}
                  style={{ marginTop: 6 }}
                />
              </SkeletonCard>
            ))}
          </View>
        ) : entries && entries.length === 0 ? (
          <View
            style={{
              padding: 24,
              borderRadius: tokens.radius.lg,
              borderWidth: 1,
              borderColor: tokens.line,
              borderStyle: "dashed",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 28, marginBottom: 8 }}>🎙️</Text>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 14,
                color: tokens.textTer,
              }}
            >
              No entries yet.
            </Text>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 12,
                color: tokens.textQuiet,
                marginTop: 4,
              }}
            >
              Tap the record button above to start.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {(entries ?? []).slice(0, HOME_ENTRY_LIMIT).map((entry) => (
              <EntryRow key={entry.id} entry={entry} onPress={openEntry} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * TrialBanner — atmospheric trial countdown / post-expiry hero banner.
 *
 * Slice 7 (2026-05-25): the quiet "N days left" pill became a HeroCard
 * with eyebrow, large countdown (warn-tinted at 1-3d, gradient at 4-7d),
 * stats row (entries · streak · themes when available), and a
 * Continue-on-web CTA. Apple Option-C compliant — opens Safari, no
 * prices, no "Subscribe" copy in-app.
 *
 * Gate (renders nothing otherwise):
 *   - TRIAL with daysRemaining 1-7
 *   - FREE with trialExpiredAt within the past 14 days
 *
 * `currentStreak` and `totalRecordings` come from the auth context's
 * user object; themesSurfaced is not exposed there so we omit it on
 * mobile (the web banner shows the full row server-side).
 */
function TrialBanner() {
  const { user } = useAuth();
  const { tokens } = useTheme();
  if (!user) return null;

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const POST_EXPIRY_DAYS = 14;
  const now = Date.now();

  let mode: "trial-warning" | "trial-urgent" | "post-expiry" | null = null;
  let daysLeft = 0;

  if (user.subscriptionStatus === "TRIAL" && user.trialEndsAt) {
    const msLeft = new Date(user.trialEndsAt).getTime() - now;
    daysLeft = Math.max(0, Math.ceil(msLeft / MS_PER_DAY));
    if (daysLeft <= 0) mode = "post-expiry";
    else if (daysLeft <= 3) mode = "trial-urgent";
    else if (daysLeft <= 7) mode = "trial-warning";
  } else if (
    user.subscriptionStatus === "FREE" &&
    user.trialExpiredAt
  ) {
    const daysSince =
      (now - new Date(user.trialExpiredAt).getTime()) / MS_PER_DAY;
    if (daysSince >= 0 && daysSince <= POST_EXPIRY_DAYS) {
      mode = "post-expiry";
    }
  }

  if (!mode) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <TrialHeroCard
        mode={mode}
        daysLeft={daysLeft}
        currentStreak={user.currentStreak ?? 0}
      />
    </View>
  );
}

function TrialHeroCard({
  mode,
  daysLeft,
  currentStreak,
}: {
  mode: "trial-warning" | "trial-urgent" | "post-expiry";
  daysLeft: number;
  currentStreak: number;
}) {
  const { tokens } = useTheme();
  const isUrgent = mode === "trial-urgent";
  const isPostExpiry = mode === "post-expiry";

  return (
    <HeroCard variant="primary" padding={20}>
      <Text
        style={{
          fontFamily: tokens.fontMono,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.4,
          color: tokens.textTer,
          textTransform: "uppercase",
        }}
      >
        {isPostExpiry ? "Trial ended" : "Trial"}
      </Text>

      {isPostExpiry ? (
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 24,
            fontWeight: "700",
            color: tokens.text,
            marginTop: 8,
          }}
        >
          Your insights are paused
        </Text>
      ) : isUrgent ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 32,
              fontWeight: "700",
              color: tokens.bad,
              fontVariant: ["tabular-nums"],
            }}
          >
            {daysLeft} {daysLeft === 1 ? "day" : "days"}
          </Text>
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 32,
              fontWeight: "700",
              color: tokens.text,
            }}
          >
            {" left"}
          </Text>
        </View>
      ) : (
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          <GradientText
            colors={tokens.gradMix.colors as unknown as readonly [string, string, ...string[]]}
            start={tokens.gradMix.start}
            end={tokens.gradMix.end}
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 32,
              fontWeight: "700",
              fontVariant: ["tabular-nums"],
            }}
          >
            {daysLeft} {daysLeft === 1 ? "day" : "days"}
          </GradientText>
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 32,
              fontWeight: "700",
              color: tokens.text,
            }}
          >
            {" left"}
          </Text>
        </View>
      )}

      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 14,
          lineHeight: 21,
          color: tokens.textSec,
          marginTop: 10,
        }}
      >
        {isPostExpiry
          ? "Recording stays yours. Life Matrix, Theme Map, and weekly insights are saved exactly where you left them — continue on web to bring them back."
          : isUrgent
          ? "After your trial ends, recording stays free. Life Matrix and Theme Map lock until you continue on web."
          : "After your trial, recording stays yours. Life Matrix, Theme Map, and weekly insights move to Pro."}
      </Text>

      {currentStreak >= 2 && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: 6,
            marginTop: 14,
          }}
        >
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 18,
              fontWeight: "700",
              color: tokens.text,
              fontVariant: ["tabular-nums"],
            }}
          >
            {currentStreak}
          </Text>
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 13,
              color: tokens.textTer,
            }}
          >
            day streak
          </Text>
        </View>
      )}

      <View style={{ marginTop: 16 }}>
        <Pressable
          onPress={openContinueOnWeb}
          style={{
            alignSelf: "flex-start",
            borderRadius: tokens.radius.pill,
            backgroundColor: tokens.cardBgTint,
            borderWidth: 0.5,
            borderColor: tokens.cardBorder,
            paddingHorizontal: 16,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 14,
              fontWeight: "600",
              color: tokens.text,
            }}
          >
            Continue on web
          </Text>
          <Text style={{ fontSize: 14, color: tokens.text }}>→</Text>
        </Pressable>
      </View>
    </HeroCard>
  );
}

const EntryRow = memo(function EntryRow({
  entry,
  onPress,
}: {
  entry: EntryDTO;
  onPress: (entryId: string) => void;
}) {
  const { tokens } = useTheme();
  const dateLabel = formatRelativeDate(entry.createdAt);
  const isPartial = entry.status === "PARTIAL";
  const handlePress = useCallback(() => onPress(entry.id), [onPress, entry.id]);
  return (
    <Pressable
      onPress={handlePress}
      style={{
        borderRadius: tokens.radius.lg,
        backgroundColor: tokens.cardBg,
        borderWidth: 0.5,
        borderColor: tokens.line,
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            style={{
              fontFamily: tokens.fontMono,
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 1.0,
              textTransform: "uppercase",
              color: tokens.textTer,
            }}
          >
            {dateLabel}
          </Text>
          {entry.mood && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Text style={{ color: tokens.textQuiet, fontSize: 10 }}>·</Text>
              <MoodIcon mood={entry.mood} size={11} color={tokens.textTer} />
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 11,
                  color: tokens.textTer,
                }}
              >
                {MOOD_LABELS[entry.mood] ?? ""}
              </Text>
            </View>
          )}
          {isPartial && (
            <View
              style={{
                paddingVertical: 2,
                paddingHorizontal: 6,
                borderRadius: 999,
                backgroundColor: `${tokens.bad}33`,
              }}
            >
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 9,
                  fontWeight: "700",
                  color: tokens.bad,
                  letterSpacing: 0.4,
                }}
              >
                PARTIAL
              </Text>
            </View>
          )}
        </View>
        <Text
          numberOfLines={2}
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 14,
            lineHeight: 19,
            color: tokens.text,
          }}
        >
          {entry.summary ?? entry.transcript ?? "(no summary)"}
        </Text>
      </View>
    </Pressable>
  );
});

function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function apiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as
    | { apiUrl?: string }
    | undefined;
  return (
    process.env.EXPO_PUBLIC_API_URL ??
    extra?.apiUrl ??
    "https://getacuity.io"
  );
}

function openContinueOnWeb() {
  const url = `${apiBaseUrl()}/upgrade?src=mobile_home_banner`;
  void Linking.openURL(url);
}
