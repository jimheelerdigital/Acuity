import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StickyBackButton } from "@/components/back-button";
import { ProLockedCard } from "@/components/pro-locked-card";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { isFreeTierUser } from "@/lib/free-tier";

/**
 * Calendar integrations screen — slice C5c (settings UI on the
 * connected branch), evolved from C5b's read-only placeholder.
 *
 * Three states (mirrors apps/web/src/app/account/integrations-section.tsx):
 *   1. FREE post-trial → ProLockedCard for `calendar_connect_locked`
 *   2. PRO/TRIAL/PAST_DUE not yet connected → "Coming in next update"
 *      placeholder. Real EventKit connect flow ships in slice C6.
 *   3. PRO/TRIAL/PAST_DUE already connected → live settings
 *      (autoSendTasks, defaultEventDuration, target calendar
 *      read-out) + disconnect button.
 *
 * State is fetched from `GET /api/integrations/calendar/settings`
 * on mount. The `connected: false` shape keeps the branching simple
 * for mobile — no 404 special-casing.
 */

type Duration = "ALL_DAY" | "TIMED";

interface CalendarState {
  provider: string;
  connectedAt: string | null;
  targetCalendarId: string | null;
  autoSendTasks: boolean;
  defaultEventDuration: Duration;
}

type FetchResult =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "not-connected" }
  | { kind: "connected"; calendar: CalendarState };

const PROVIDER_LABEL: Record<string, string> = {
  ios_eventkit: "Apple Calendar (iOS)",
  google: "Google Calendar",
  outlook: "Outlook / Microsoft 365",
};

export default function IntegrationsScreen() {
  const { user } = useAuth();
  const isProLocked = isFreeTierUser(user);

  return (
    <SafeAreaView
      className="flex-1 bg-white dark:bg-[#0B0B12]"
      edges={["top"]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <StickyBackButton accessibilityLabel="Back to Profile" />

        <View className="mb-6 mt-6">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Integrations
          </Text>
          <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Connect a calendar to send Acuity tasks where you already
            plan your day.
          </Text>
        </View>

        {isProLocked ? (
          <ProLockedCard surfaceId="calendar_connect_locked" />
        ) : (
          <ConnectedOrPlaceholder />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ConnectedOrPlaceholder() {
  const [state, setState] = useState<FetchResult>({ kind: "loading" });

  const fetchState = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await api.get<{
        connected: boolean;
        calendar: CalendarState | null;
      }>("/api/integrations/calendar/settings");
      if (!data.connected || !data.calendar) {
        setState({ kind: "not-connected" });
      } else {
        setState({ kind: "connected", calendar: data.calendar });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Load failed";
      setState({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  if (state.kind === "loading") {
    return (
      <View className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-[#1E1E2E]">
        <ActivityIndicator />
      </View>
    );
  }

  if (state.kind === "error") {
    return (
      <View className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/40 dark:bg-rose-900/20">
        <Text className="text-sm text-rose-700 dark:text-rose-300">
          Couldn&apos;t load calendar settings: {state.message}
        </Text>
        <Pressable
          onPress={fetchState}
          className="mt-3 self-start rounded-md bg-rose-600 px-3 py-1.5"
        >
          <Text className="text-xs font-semibold text-white">Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (state.kind === "not-connected") {
    return <ConnectPlaceholderCard />;
  }

  return (
    <ConnectedCard
      calendar={state.calendar}
      onUpdate={(next) => setState({ kind: "connected", calendar: next })}
      onDisconnect={() => setState({ kind: "not-connected" })}
    />
  );
}

function ConnectPlaceholderCard() {
  return (
    <View className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-[#1E1E2E]">
      <View className="flex-row items-start gap-3">
        <View className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
          <Ionicons name="calendar-outline" size={18} color="#7C3AED" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Apple Calendar
          </Text>
          <Text className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            Reads your iOS calendar (which already aggregates your
            Google and Outlook calendars) so Acuity can send tasks to
            your real calendar and reference your meeting load in
            reflections.
          </Text>
        </View>
      </View>

      <View className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400">
          Coming in next update
        </Text>
        <Text className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
          Calendar connect ships in the next mobile release. Acuity
          will request iOS calendar access only when you tap Connect
          here — never at app launch.
        </Text>
      </View>

      <Text className="mt-4 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
        Acuity reads only event titles, times, and attendee counts.
        Never location, notes, or attendee email addresses. Tasks
        you send to your calendar use the &ldquo;Acuity:&rdquo; title
        prefix so they&apos;re always identifiable.
      </Text>
    </View>
  );
}

function ConnectedCard({
  calendar,
  onUpdate,
  onDisconnect,
}: {
  calendar: CalendarState;
  onUpdate: (next: CalendarState) => void;
  onDisconnect: () => void;
}) {
  const providerLabel =
    PROVIDER_LABEL[calendar.provider] ?? calendar.provider;
  const [busy, setBusy] = useState<null | "autoSend" | "duration" | "disconnect">(
    null
  );

  async function patchSetting(body: Record<string, unknown>) {
    return api.patch<{ ok: boolean; calendar: CalendarState }>(
      "/api/integrations/calendar/settings",
      body
    );
  }

  async function handleAutoSendToggle(next: boolean) {
    if (busy) return;
    setBusy("autoSend");
    // Optimistic update — flip immediately, revert on failure.
    onUpdate({ ...calendar, autoSendTasks: next });
    try {
      const res = await patchSetting({ autoSendTasks: next });
      onUpdate({ ...calendar, ...res.calendar });
    } catch (err) {
      onUpdate({ ...calendar, autoSendTasks: !next });
      Alert.alert(
        "Couldn't save",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleDurationChange(next: Duration) {
    if (busy || next === calendar.defaultEventDuration) return;
    setBusy("duration");
    const prev = calendar.defaultEventDuration;
    onUpdate({ ...calendar, defaultEventDuration: next });
    try {
      const res = await patchSetting({ defaultEventDuration: next });
      onUpdate({ ...calendar, ...res.calendar });
    } catch (err) {
      onUpdate({ ...calendar, defaultEventDuration: prev });
      Alert.alert(
        "Couldn't save",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setBusy(null);
    }
  }

  function handleDisconnect() {
    Alert.alert(
      "Disconnect calendar?",
      "Acuity stops sending new tasks to your calendar. Events already created stay where they are. Your preferences are remembered if you reconnect.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setBusy("disconnect");
            try {
              await api.post<{ ok: boolean }>(
                "/api/integrations/calendar/disconnect",
                {}
              );
              onDisconnect();
            } catch (err) {
              Alert.alert(
                "Couldn't disconnect",
                err instanceof Error ? err.message : "Unknown error"
              );
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  }

  return (
    <View className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-[#1E1E2E]">
      {/* Header */}
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {providerLabel}
          </Text>
          {calendar.connectedAt && (
            <Text className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Connected{" "}
              {new Date(calendar.connectedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          )}
        </View>
        <View className="rounded-full bg-emerald-500/10 px-2.5 py-0.5">
          <Text className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            Connected
          </Text>
        </View>
      </View>

      {/* autoSendTasks toggle */}
      <View className="mt-5 flex-row items-start justify-between gap-4 border-t border-zinc-200 pt-4 dark:border-white/10">
        <View className="flex-1">
          <Text className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Auto-send tasks
          </Text>
          <Text className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            New tasks with due dates show up on your calendar
            automatically. When off, you tap &ldquo;Send to calendar&rdquo;
            on each task instead.
          </Text>
        </View>
        <Switch
          value={calendar.autoSendTasks}
          onValueChange={handleAutoSendToggle}
          disabled={busy !== null}
          trackColor={{ false: "#D4D4D8", true: "#8B5CF6" }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* defaultEventDuration radio */}
      <View className="mt-5 border-t border-zinc-200 pt-4 dark:border-white/10">
        <Text className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Default event duration
        </Text>
        <Text className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          How tasks land on your calendar when you don&apos;t specify
          a time. Override per-task as needed.
        </Text>
        <View className="mt-3 flex-row gap-2">
          <DurationOption
            value="TIMED"
            current={calendar.defaultEventDuration}
            label="Timed (1h)"
            description="Blocks an hour"
            onSelect={handleDurationChange}
            disabled={busy !== null}
          />
          <DurationOption
            value="ALL_DAY"
            current={calendar.defaultEventDuration}
            label="All-day"
            description="Whole-day banner"
            onSelect={handleDurationChange}
            disabled={busy !== null}
          />
        </View>
      </View>

      {/* targetCalendarId — read-only stub until C6 lands the EventKit list call */}
      <View className="mt-5 border-t border-zinc-200 pt-4 dark:border-white/10">
        <Text className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Target calendar
        </Text>
        <View className="mt-2 rounded-md bg-zinc-50 px-3 py-2 dark:bg-white/5">
          <Text className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Currently syncing to:
          </Text>
          <Text className="mt-0.5 font-mono text-xs text-zinc-700 dark:text-zinc-200">
            {calendar.targetCalendarId ?? "—"}
          </Text>
        </View>
        <Text className="mt-2 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
          Choose a different calendar in the next update, after Acuity
          reads your calendar list directly.
        </Text>
      </View>

      {/* Disconnect */}
      <View className="mt-5 border-t border-zinc-200 pt-4 dark:border-white/10">
        <Pressable
          onPress={handleDisconnect}
          disabled={busy !== null}
          className="self-start"
        >
          <Text
            className={`text-xs font-semibold ${
              busy === "disconnect"
                ? "text-zinc-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect calendar"}
          </Text>
        </Pressable>
        <Text className="mt-1 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
          Stops new sync. Existing events stay. Preferences remembered
          if you reconnect.
        </Text>
      </View>
    </View>
  );
}

function DurationOption({
  value,
  current,
  label,
  description,
  onSelect,
  disabled,
}: {
  value: Duration;
  current: Duration;
  label: string;
  description: string;
  onSelect: (v: Duration) => void;
  disabled: boolean;
}) {
  const checked = value === current;
  return (
    <Pressable
      onPress={() => onSelect(value)}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled }}
      className={`flex-1 rounded-lg border px-3 py-2.5 ${
        checked
          ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
          : "border-zinc-200 dark:border-white/10"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <Text
        className={`text-sm font-medium ${
          checked
            ? "text-violet-700 dark:text-violet-300"
            : "text-zinc-900 dark:text-zinc-50"
        }`}
      >
        {label}
      </Text>
      <Text className="mt-0.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        {description}
      </Text>
    </Pressable>
  );
}
