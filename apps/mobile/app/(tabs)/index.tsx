import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Flame } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  MOOD_LABELS,
  type EntryDTO,
  formatRelativeDate,
  type ProgressionItemKey,
  type UserProgression,
} from "@acuity/shared";

import { HomeFocusStack } from "@/components/home-focus-stack";
import { MoodIcon } from "@/components/mood-icon";
import { ProgressionChecklist } from "@/components/progression-checklist";
import { Skeleton, SkeletonCard } from "@/components/skeleton";
import { RecommendedActivity } from "@/components/recommended-activity";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { getCached, isStale, setCached } from "@/lib/cache";
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
 * Home tab — the dashboard. Record button is the primary action.
 * Tapping it opens /record as a modal (see app/_layout.tsx stack
 * config). Recent sessions below are tap-to-open-detail.
 *
 * Prior to this task, index.tsx held the full recording flow. That
 * was confusing on two axes: (1) users had no landing surface to
 * orient themselves after sign-in — the app dropped them straight
 * onto a record button; (2) we had two recording screens in the
 * tree (app/record.tsx + app/(tabs)/index.tsx) with duplicated
 * state-machine code. Consolidating into one /record modal + a
 * proper dashboard fixes both.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const HOME_ENTRIES_KEY = "/api/entries";
const HOME_DATA_KEY = "/api/home";
const HOME_PROGRESSION_KEY = "/api/user/progression";

export default function DashboardTab() {
  const { user } = useAuth();
  const router = useRouter();
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
      const [entriesData, home, prog] = await Promise.all([
        api.get<{ entries: EntryDTO[] }>(HOME_ENTRIES_KEY),
        api.get<HomePayload>(HOME_DATA_KEY).catch(() => null),
        fetchUserProgression().catch(() => null),
      ]);
      setCached(HOME_ENTRIES_KEY, entriesData);
      if (home) setCached(HOME_DATA_KEY, home);
      if (prog) setCached(HOME_PROGRESSION_KEY, prog);
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

  // Revalidate silently on focus, but only if the cache is stale.
  // Cached content stays rendered — no spinner flash on tab switches.
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
  // Greeting is fixed for the session — avoids a fresh `new Date()`
  // allocation on every render.
  const greeting = useMemo(() => greetingFor(new Date()), []);
  // Filter is O(n) over entries; memoize so it doesn't re-run when
  // unrelated state (home focus stack dismissals, etc.) triggers a
  // parent re-render.
  const weekCount = useMemo(
    () =>
      (entries ?? []).filter(
        (e) => new Date(e.createdAt).getTime() > Date.now() - WEEK_MS
      ).length,
    [entries]
  );

  const openEntry = useCallback(
    (entryId: string) => router.push(`/entry/${entryId}`),
    [router]
  );

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#1E1E2E] dark:bg-[#0B0B12]" edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Greeting row — profile icon top-right replaces the Profile
            tab slot (which moved out of the bar when Entries was added). */}
        <View className="mb-6 flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-4xl font-bold text-zinc-900 dark:text-zinc-50">
              {greeting}, {firstName}.
            </Text>
            <Text className="text-lg text-zinc-400 dark:text-zinc-500 mt-1">
              {weekCount === 0
                ? "No sessions this week yet."
                : `${weekCount} session${weekCount === 1 ? "" : "s"} this week.`}
            </Text>
            {(user?.currentStreak ?? 0) >= 2 && (
              <View className="mt-2 flex-row items-center gap-1.5">
                <Flame size={14} color="#F97316" />
                <Text className="text-sm font-semibold text-orange-500 dark:text-orange-400">
                  {user?.currentStreak}-day streak
                </Text>
              </View>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={() => router.push("/(tabs)/profile")}
            hitSlop={12}
            className="h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white dark:border-white/10 dark:bg-[#1E1E2E]"
          >
            <Ionicons name="settings-outline" size={18} color="#71717A" />
          </Pressable>
        </View>

        <TrialBanner />

        {/* Focus card stack — Phase 2 Run 1. Unlock cards + resting
            card above the record CTA so celebrations are the first
            thing a returning user sees. */}
        <View className="mb-6">
          <HomeFocusStack progression={progression} />
        </View>

        {/* Primary record CTA */}
        <Pressable
          onPress={() => router.push("/record")}
          className="rounded-3xl bg-violet-600 py-8 items-center justify-center mb-10"
          style={{
            shadowColor: "#7C3AED",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.4,
            shadowRadius: 20,
            elevation: 8,
          }}
        >
          <View className="h-16 w-16 rounded-full bg-violet-500 items-center justify-center mb-3">
            <Ionicons name="mic" size={32} color="#fff" />
          </View>
          <Text className="text-white font-semibold text-base">
            Record your brain dump
          </Text>
          <Text className="text-violet-200 text-xs mt-1">
            Up to 2 minutes
          </Text>
        </Pressable>

        {homeData?.progression && (
          <ProgressionChecklist
            items={homeData.progression.items}
            completedCount={homeData.progression.completedCount}
            totalVisibleCount={homeData.progression.totalVisibleCount}
          />
        )}

        {(homeData?.recommendation?.text ?? homeData?.dailyPrompt) && (
          <RecommendedActivity
            prompt={
              homeData?.recommendation?.text ?? (homeData?.dailyPrompt as string)
            }
            label={homeData?.recommendation?.label}
            goalId={homeData?.recommendation?.goalId}
          />
        )}

        {/* Recent sessions */}
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Recent sessions
          </Text>
          {entries && entries.length > HOME_ENTRY_LIMIT && (
            <Pressable onPress={() => router.push("/(tabs)/entries")} hitSlop={8}>
              <Text className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                View all →
              </Text>
            </Pressable>
          )}
        </View>

        {loading ? (
          // Skeleton entry rows — match the loaded card footprint.
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
          <View className="rounded-2xl border border-dashed border-zinc-200 dark:border-white/10 p-6 items-center">
            <Text className="text-3xl mb-2">🎙️</Text>
            <Text className="text-sm text-zinc-400 dark:text-zinc-500">No entries yet.</Text>
            <Text className="text-xs text-zinc-600 dark:text-zinc-300 mt-1">
              Tap the record button to start.
            </Text>
          </View>
        ) : (
          <View className="gap-2">
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
 * Shows a gentle banner when the user's 14-day trial is inside its
 * last 7 days. No CTA, no urgency language — spec §3 asks for a
 * quiet countdown, not a pressure tactic. Renders nothing for
 * users on PRO, FREE (post-trial-but-not-subscribed — they see the
 * paywall on attempted write), or with no trial date.
 */
function TrialBanner() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.subscriptionStatus !== "TRIAL") return null;
  if (!user.trialEndsAt) return null;

  const msLeft = new Date(user.trialEndsAt).getTime() - Date.now();
  if (msLeft <= 0) return null; // expired — paywall handles
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  if (daysLeft > 7) return null; // only surface in the final week

  return (
    <View className="rounded-2xl border border-violet-600/30 bg-violet-900/20 px-4 py-3 mb-6 flex-row items-center gap-3">
      <Ionicons name="time-outline" size={18} color="#A78BFA" />
      <View className="flex-1">
        <Text className="text-sm text-violet-200">
          {daysLeft === 1
            ? "Last day of your trial."
            : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your trial.`}
        </Text>
        <Text className="text-xs text-violet-400/80 mt-0.5">
          Your Day 14 Life Audit is coming. Nothing disappears after.
        </Text>
      </View>
    </View>
  );
}

const EntryRow = memo(function EntryRow({
  entry,
  onPress,
}: {
  entry: EntryDTO;
  onPress: (entryId: string) => void;
}) {
  const dateLabel = formatRelativeDate(entry.createdAt);
  const isPartial = entry.status === "PARTIAL";
  const handlePress = useCallback(() => onPress(entry.id), [onPress, entry.id]);
  return (
    <Pressable
      onPress={handlePress}
      className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#13131F] dark:bg-[#1E1E2E] px-4 py-3"
    >
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">{dateLabel}</Text>
            {entry.mood && (
              <View className="flex-row items-center gap-1">
                <Text className="text-xs text-zinc-400 dark:text-zinc-500">·</Text>
                <MoodIcon mood={entry.mood} size={11} color="#A1A1AA" />
                <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                  {MOOD_LABELS[entry.mood] ?? ""}
                </Text>
              </View>
            )}
            {isPartial && (
              <View className="rounded-full bg-amber-900/40 px-2 py-0.5">
                <Text className="text-[10px] font-semibold text-amber-300">
                  PARTIAL
                </Text>
              </View>
            )}
          </View>
          <Text
            className="text-sm text-zinc-700 dark:text-zinc-200 mt-1"
            numberOfLines={2}
          >
            {entry.summary ?? entry.transcript ?? "(no summary)"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#52525B" />
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
