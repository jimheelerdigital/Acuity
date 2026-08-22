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
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { isFreeTierUser } from "@/lib/free-tier";
import type { AcuityTokens } from "@/lib/theme/tokens";
import { WARN_AMBER } from "@/lib/tone-colors";

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
  const { tokens } = useTheme();
  const { user } = useAuth();
  const isProLocked = isFreeTierUser(user);

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: tokens.bg }}
      edges={["top"]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <StickyBackButton accessibilityLabel="Back to Profile" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 80,
          paddingBottom: 40,
        }}
      >
        <View className="mb-6">
          <Text
            className="text-2xl font-bold"
            style={{ color: tokens.text }}
          >
            Integrations
          </Text>
          <Text
            className="mt-1 text-sm"
            style={{ color: tokens.textTer }}
          >
            Connect a calendar to send Ripple tasks where you already
            plan your day.
          </Text>
        </View>

        {isProLocked ? (
          <ProLockedCard surfaceId="calendar_connect_locked" />
        ) : (
          <ConnectedOrPlaceholder tokens={tokens} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ConnectedOrPlaceholder({ tokens }: { tokens: AcuityTokens }) {
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
      <View
        className="rounded-2xl border p-5"
        style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  if (state.kind === "error") {
    return (
      <View
        className="rounded-2xl border p-5"
        style={{
          borderColor: `${tokens.bad}55`,
          backgroundColor: `${tokens.bad}14`,
        }}
      >
        <Text className="text-sm" style={{ color: tokens.bad }}>
          Couldn&apos;t load calendar settings: {state.message}
        </Text>
        <Pressable
          onPress={fetchState}
          className="mt-3 self-start rounded-md px-3 py-1.5"
          style={{ backgroundColor: tokens.bad }}
        >
          <Text
            className="text-xs font-semibold"
            style={{ color: "#FFFFFF" }}
          >
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  if (state.kind === "not-connected") {
    return <ConnectPlaceholderCard tokens={tokens} />;
  }

  return (
    <ConnectedCard
      calendar={state.calendar}
      tokens={tokens}
      onUpdate={(next) => setState({ kind: "connected", calendar: next })}
      onDisconnect={() => setState({ kind: "not-connected" })}
    />
  );
}

function ConnectPlaceholderCard({ tokens }: { tokens: AcuityTokens }) {
  return (
    <View
      className="rounded-2xl border p-5"
      style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
    >
      <View className="flex-row items-start gap-3">
        <View
          className="h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${tokens.primary}1A` }}
        >
          <Ionicons name="calendar-outline" size={18} color={tokens.primary} />
        </View>
        <View className="flex-1">
          <Text
            className="text-base font-semibold"
            style={{ color: tokens.text }}
          >
            Apple Calendar
          </Text>
          <Text
            className="mt-1.5 text-sm leading-relaxed"
            style={{ color: tokens.textSec }}
          >
            Reads your iOS calendar (which already aggregates your
            Google and Outlook calendars) so Ripple can send tasks to
            your real calendar and reference your meeting load in
            reflections.
          </Text>
        </View>
      </View>

      <View
        className="mt-4 rounded-lg px-3 py-2"
        style={{ backgroundColor: `${WARN_AMBER}1a` }}
      >
        <Text
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: WARN_AMBER }}
        >
          Coming in next update
        </Text>
        <Text
          className="mt-1 text-xs leading-relaxed"
          style={{ color: tokens.textSec }}
        >
          Calendar connect ships in the next mobile release. Ripple
          will request iOS calendar access only when you tap Connect
          here — never at app launch.
        </Text>
      </View>

      {/* v1.3.x device-calendars hint. iOS Calendar already aggregates
          Google + Outlook when the user adds those accounts in
          system Settings — once the EventKit connect ships, those
          calendars surface automatically without a separate OAuth
          per provider. */}
      <View
        className="mt-3 rounded-lg px-3 py-2"
        style={{ backgroundColor: tokens.bgInset }}
      >
        <Text
          className="text-[11px] leading-relaxed"
          style={{ color: tokens.textSec }}
        >
          <Text style={{ fontWeight: "600", color: tokens.text }}>
            Using Google Calendar?
          </Text>{" "}
          Add it in iOS Settings &rarr; Calendar &rarr; Accounts. Once
          Apple Calendar is connected here, your Google events surface
          automatically alongside iCloud.
        </Text>
      </View>

      <Text
        className="mt-4 text-[11px] leading-relaxed"
        style={{ color: tokens.textQuiet }}
      >
        Ripple reads only event titles, times, and attendee counts.
        Never location, notes, or attendee email addresses. Tasks
        you send to your calendar use the &ldquo;Ripple:&rdquo; title
        prefix so they&apos;re always identifiable.
      </Text>
    </View>
  );
}

function ConnectedCard({
  calendar,
  tokens,
  onUpdate,
  onDisconnect,
}: {
  calendar: CalendarState;
  tokens: AcuityTokens;
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
      "Ripple stops sending new tasks to your calendar. Events already created stay where they are. Your preferences are remembered if you reconnect.",
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
    <View
      className="rounded-2xl border p-5"
      style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text
            className="text-base font-semibold"
            style={{ color: tokens.text }}
          >
            {providerLabel}
          </Text>
          {calendar.connectedAt && (
            <Text
              className="mt-0.5 text-xs"
              style={{ color: tokens.textTer }}
            >
              Connected{" "}
              {new Date(calendar.connectedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          )}
        </View>
        <View
          className="rounded-full px-2.5 py-0.5"
          style={{ backgroundColor: `${tokens.good}1A` }}
        >
          <Text
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: tokens.good }}
          >
            Connected
          </Text>
        </View>
      </View>

      {/* autoSendTasks toggle */}
      <View
        className="mt-5 flex-row items-start justify-between gap-4 border-t pt-4"
        style={{ borderColor: tokens.line }}
      >
        <View className="flex-1">
          <Text
            className="text-sm font-medium"
            style={{ color: tokens.text }}
          >
            Auto-send tasks
          </Text>
          <Text
            className="mt-1 text-xs leading-relaxed"
            style={{ color: tokens.textTer }}
          >
            New tasks with due dates show up on your calendar
            automatically. When off, you tap &ldquo;Send to calendar&rdquo;
            on each task instead.
          </Text>
        </View>
        <Switch
          value={calendar.autoSendTasks}
          onValueChange={handleAutoSendToggle}
          disabled={busy !== null}
          trackColor={{ false: tokens.bgInset, true: tokens.primary }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* defaultEventDuration radio */}
      <View
        className="mt-5 border-t pt-4"
        style={{ borderColor: tokens.line }}
      >
        <Text
          className="text-sm font-medium"
          style={{ color: tokens.text }}
        >
          Default event duration
        </Text>
        <Text
          className="mt-1 text-xs leading-relaxed"
          style={{ color: tokens.textTer }}
        >
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
            tokens={tokens}
          />
          <DurationOption
            value="ALL_DAY"
            current={calendar.defaultEventDuration}
            label="All-day"
            description="Whole-day banner"
            onSelect={handleDurationChange}
            disabled={busy !== null}
            tokens={tokens}
          />
        </View>
      </View>

      {/* targetCalendarId — read-only stub until C6 lands the EventKit list call */}
      <View
        className="mt-5 border-t pt-4"
        style={{ borderColor: tokens.line }}
      >
        <Text
          className="text-sm font-medium"
          style={{ color: tokens.text }}
        >
          Target calendar
        </Text>
        <View
          className="mt-2 rounded-md px-3 py-2"
          style={{ backgroundColor: tokens.bgInset }}
        >
          <Text className="text-[10px]" style={{ color: tokens.textTer }}>
            Currently syncing to:
          </Text>
          <Text
            className="mt-0.5 font-mono text-xs"
            style={{ color: tokens.text, fontFamily: tokens.fontMono }}
          >
            {calendar.targetCalendarId ?? "—"}
          </Text>
        </View>
        <Text
          className="mt-2 text-[11px] leading-relaxed"
          style={{ color: tokens.textQuiet }}
        >
          Choose a different calendar in the next update, after Ripple
          reads your calendar list directly.
        </Text>
      </View>

      {/* Disconnect */}
      <View
        className="mt-5 border-t pt-4"
        style={{ borderColor: tokens.line }}
      >
        <Pressable
          onPress={handleDisconnect}
          disabled={busy !== null}
          className="self-start"
        >
          <Text
            className="text-xs font-semibold"
            style={{
              color: busy === "disconnect" ? tokens.textQuiet : tokens.bad,
            }}
          >
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect calendar"}
          </Text>
        </Pressable>
        <Text
          className="mt-1 text-[11px] leading-relaxed"
          style={{ color: tokens.textQuiet }}
        >
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
  tokens,
}: {
  value: Duration;
  current: Duration;
  label: string;
  description: string;
  onSelect: (v: Duration) => void;
  disabled: boolean;
  tokens: AcuityTokens;
}) {
  const checked = value === current;
  return (
    <Pressable
      onPress={() => onSelect(value)}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled }}
      className="flex-1 rounded-lg border px-3 py-2.5"
      style={{
        borderColor: checked ? tokens.primary : tokens.line,
        backgroundColor: checked ? `${tokens.primary}1A` : "transparent",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text
        className="text-sm font-medium"
        style={{ color: checked ? tokens.primary : tokens.text }}
      >
        {label}
      </Text>
      <Text
        className="mt-0.5 text-[11px] leading-relaxed"
        style={{ color: tokens.textTer }}
      >
        {description}
      </Text>
    </Pressable>
  );
}
