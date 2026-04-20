import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MOOD_EMOJI, MOOD_LABELS, type EntryDTO } from "@acuity/shared";

import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";

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

export default function DashboardTab() {
  const { user } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<EntryDTO[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ entries: EntryDTO[] }>("/api/entries");
      setEntries(data.entries ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh on every focus — a completed recording routes back here
  // via router.back() and the list should reflect the new entry
  // immediately rather than showing stale cache.
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const greeting = greetingFor(new Date());
  const weekCount = (entries ?? []).filter((e) => {
    return new Date(e.createdAt).getTime() > Date.now() - WEEK_MS;
  }).length;

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#1E1E2E] dark:bg-[#0B0B12]" edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Greeting */}
        <View className="mb-6">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {greeting}, {firstName}.
          </Text>
          <Text className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
            {weekCount === 0
              ? "No sessions this week yet."
              : `${weekCount} session${weekCount === 1 ? "" : "s"} this week.`}
          </Text>
        </View>

        <TrialBanner />


        {/* Primary record CTA */}
        <Pressable
          onPress={() => router.push("/record")}
          className="rounded-3xl bg-violet-600 py-8 items-center justify-center mb-10"
          style={({ pressed }) => ({
            opacity: pressed ? 0.85 : 1,
            shadowColor: "#7C3AED",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.4,
            shadowRadius: 20,
            elevation: 8,
          })}
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

        {/* Recent sessions */}
        <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-3">
          Recent sessions
        </Text>

        {loading ? (
          <View className="py-8 items-center">
            <ActivityIndicator color="#7C3AED" />
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
            {(entries ?? []).slice(0, 10).map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                onPress={() => router.push(`/entry/${entry.id}`)}
              />
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

function EntryRow({
  entry,
  onPress,
}: {
  entry: EntryDTO;
  onPress: () => void;
}) {
  const date = new Date(entry.createdAt);
  const dateLabel = formatShortDate(date);
  const isPartial = entry.status === "PARTIAL";
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#13131F] dark:bg-[#1E1E2E] px-4 py-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">{dateLabel}</Text>
            {entry.mood && (
              <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                · {MOOD_EMOJI[entry.mood] ?? ""} {MOOD_LABELS[entry.mood] ?? ""}
              </Text>
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
}

function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatShortDate(date: Date): string {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = now.getTime() - date.getTime();
  if (diff < dayMs) return "Today";
  if (diff < 2 * dayMs) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
