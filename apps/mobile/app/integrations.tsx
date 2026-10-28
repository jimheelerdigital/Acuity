import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";

import { BackButton } from "@/components/back-button";
import { CalendarPicker } from "@/components/calendar/calendar-picker";
import { ProLockedCard } from "@/components/pro-locked-card";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { runCalendarSync } from "@/lib/calendar-sync-client";
import {
  calendarPermission,
  DEVICE_PROVIDER,
  deviceCalendarAvailable,
  requestCalendarPermission,
  writableCalendars,
  type DeviceCalendar,
} from "@/lib/device-calendar";
import { isFreeTierUser } from "@/lib/free-tier";
import type { AcuityTokens } from "@/lib/theme/tokens";
import { WARN_AMBER } from "@/lib/tone-colors";

/**
 * Calendar integrations screen — slice C5c (settings UI on the
 * connected branch), evolved from C5b's read-only placeholder.
 *
 * Three states (mirrors apps/web/src/app/account/integrations-section.tsx):
 *   1. FREE post-trial → ProLockedCard for `calendar_connect_locked`
 *   2. PRO/TRIAL/PAST_DUE not yet connected → Connect: ask for calendar
 *      access, pick a calendar, choose auto-add (2026-10-23, "option a").
 *      Builds without expo-calendar say "Update Ripple to connect".
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

/** Google Calendar direct sign-in (2026-10-28), from GET /settings. */
type GoogleDirect = {
  available: boolean;
  connection: { email: string | null; status: "connected" | "needs_reconnect" } | null;
};

type FetchResult =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "not-connected"; google: GoogleDirect }
  | { kind: "connected"; calendar: CalendarState; google: GoogleDirect };

const NO_GOOGLE: GoogleDirect = { available: false, connection: null };
/** The callback sends the auth sheet back here (app.json scheme "acuity"). */
const GOOGLE_RETURN_URL = "acuity://integrations";

const GOOGLE_RESULT_MESSAGE: Record<string, string> = {
  denied: "Access was declined, so Google Calendar wasn't connected.",
  scope: "Ripple needs permission to add events. Connect again and leave calendar access ticked.",
  no_token: "Google didn't finish the connection. Please try again.",
  in_use: "That Google account is already connected to a different Ripple account.",
  unavailable: "Google Calendar connect isn't available on your account yet.",
  error: "Something went wrong connecting Google Calendar. Please try again.",
};

/**
 * Google Calendar direct sign-in: the server hands back Google's consent
 * URL (the app's bearer never enters the browser; a signed state carries
 * the person's id), the auth sheet opens it, and the callback redirects to
 * acuity://integrations?gcal=<status>, which closes the sheet.
 * Returns the status, or null if the person closed the sheet.
 */
async function connectGoogleCalendar(): Promise<string | null> {
  const { url } = await api.get<{ url: string }>(
    "/api/integrations/calendar/google/start?format=json&return=app"
  );
  const result = await WebBrowser.openAuthSessionAsync(url, GOOGLE_RETURN_URL);
  if (result.type !== "success") return null;
  const match = /[?&]gcal=([a-z_]+)/.exec(result.url);
  return match ? match[1] : "error";
}

const PROVIDER_LABEL: Record<string, string> = {
  ios_eventkit: "Apple Calendar",
  android_calendar: "Phone calendar",
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
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 40,
        }}
      >
        {/* Inline, not the floating sticky button (2026-10-25): this screen
            can open inside a sheet, where the safe-area inset the sticky
            button positions itself by is wrong and it landed on the title. */}
        <View style={{ marginBottom: 16 }}>
          <BackButton accessibilityLabel="Back to Profile" />
        </View>
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
        googleDirectAvailable?: boolean;
        google?: GoogleDirect["connection"];
      }>("/api/integrations/calendar/settings");
      const google: GoogleDirect = {
        available: data.googleDirectAvailable === true,
        connection: data.google ?? null,
      };
      if (!data.connected || !data.calendar) {
        setState({ kind: "not-connected", google });
      } else {
        setState({ kind: "connected", calendar: data.calendar, google });
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
    const google = state.google;
    return (
      <View className="gap-4">
        {google.available ? (
          <GoogleConnectCard
            tokens={tokens}
            needsReconnect={google.connection?.status === "needs_reconnect"}
            onDone={fetchState}
          />
        ) : null}
        <ConnectCard
          tokens={tokens}
          onConnected={(calendar) => setState({ kind: "connected", calendar, google })}
        />
      </View>
    );
  }

  const google = state.google;
  return (
    <ConnectedCard
      calendar={state.calendar}
      googleEmail={google.connection?.email ?? null}
      tokens={tokens}
      onUpdate={(next) => setState({ kind: "connected", calendar: next, google })}
      onDisconnect={() => void fetchState()}
    />
  );
}

function GoogleConnectCard({
  tokens,
  needsReconnect,
  onDone,
}: {
  tokens: AcuityTokens;
  needsReconnect: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      const status = await connectGoogleCalendar();
      if (status && status !== "connected") {
        Alert.alert("Google Calendar", GOOGLE_RESULT_MESSAGE[status] ?? GOOGLE_RESULT_MESSAGE.error);
      }
      onDone();
    } catch (err) {
      Alert.alert("Couldn't open Google", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

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
          <Ionicons name="logo-google" size={18} color={tokens.primary} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold" style={{ color: tokens.text }}>
            Google Calendar
          </Text>
          <Text className="mt-1.5 text-sm leading-relaxed" style={{ color: tokens.textSec }}>
            Sign in with Google and Ripple adds your tasks with due dates straight to your Google
            Calendar, from any device. Ripple only adds, changes and removes its own events.
          </Text>
        </View>
      </View>
      {needsReconnect ? (
        <View className="mt-4 rounded-lg px-3 py-2" style={{ backgroundColor: `${WARN_AMBER}1a` }}>
          <Text className="text-xs leading-relaxed" style={{ color: tokens.textSec }}>
            Google stopped Ripple&apos;s access, so tasks aren&apos;t being added. Reconnect to pick up
            where you left off.
          </Text>
        </View>
      ) : null}
      <Pressable
        onPress={start}
        disabled={busy}
        accessibilityRole="button"
        className="mt-4 items-center rounded-xl py-3"
        style={{ backgroundColor: tokens.primary, opacity: busy ? 0.6 : 1 }}
      >
        <Text className="text-sm font-semibold" style={{ color: "#FFFFFF" }}>
          {busy ? "Opening Google…" : needsReconnect ? "Reconnect Google Calendar" : "Connect Google Calendar"}
        </Text>
      </Pressable>
    </View>
  );
}

function ConnectCard({
  tokens,
  onConnected,
}: {
  tokens: AcuityTokens;
  onConnected: (calendar: CalendarState) => void;
}) {
  const available = deviceCalendarAvailable();
  const [step, setStep] = useState<"intro" | "pick">("intro");
  const [calendars, setCalendars] = useState<DeviceCalendar[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [autoSend, setAutoSend] = useState(true);
  const [busy, setBusy] = useState(false);
  const phoneName = Platform.OS === "ios" ? "Apple Calendar" : "your phone's calendar";

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await requestCalendarPermission();
      if (perm !== "granted") {
        Alert.alert(
          "Calendar access is off",
          "Turn on calendar access for Ripple in Settings, then tap Connect again.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      const list = await writableCalendars();
      setCalendars(list);
      setSelected(list[0]?.id ?? null);
      setStep("pick");
    } catch (err) {
      Alert.alert("Couldn't read your calendars", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const res = await api.post<{ ok?: boolean; calendar?: CalendarState }>(
        "/api/integrations/calendar/connect",
        { provider: DEVICE_PROVIDER, targetCalendarId: selected, autoSendTasks: autoSend }
      );
      void runCalendarSync({ forceEvents: true });
      onConnected(
        res.calendar ?? {
          provider: DEVICE_PROVIDER,
          connectedAt: new Date().toISOString(),
          targetCalendarId: selected,
          autoSendTasks: autoSend,
          defaultEventDuration: "TIMED",
        }
      );
    } catch (err) {
      Alert.alert("Couldn't connect", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

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
          <Text className="text-base font-semibold" style={{ color: tokens.text }}>
            {Platform.OS === "ios" ? "Apple Calendar" : "Calendar"}
          </Text>
          <Text className="mt-1.5 text-sm leading-relaxed" style={{ color: tokens.textSec }}>
            Ripple puts your tasks on your calendar, and your entries can reference what your day actually
            looked like. Works with any calendar on this phone, including Google and Outlook.
          </Text>
        </View>
      </View>

      {!available ? (
        <View className="mt-4 rounded-lg px-3 py-2" style={{ backgroundColor: `${WARN_AMBER}1a` }}>
          <Text className="text-xs font-semibold uppercase tracking-widest" style={{ color: WARN_AMBER }}>
            Update Ripple to connect
          </Text>
          <Text className="mt-1 text-xs leading-relaxed" style={{ color: tokens.textSec }}>
            Calendar connect needs the latest version of Ripple from the App Store.
          </Text>
        </View>
      ) : step === "intro" ? (
        <Pressable
          onPress={start}
          disabled={busy}
          accessibilityRole="button"
          className="mt-4 items-center rounded-xl py-3"
          style={{ backgroundColor: tokens.primary, opacity: busy ? 0.6 : 1 }}
        >
          <Text className="text-sm font-semibold" style={{ color: "#FFFFFF" }}>
            {busy ? "Opening…" : `Connect ${phoneName}`}
          </Text>
        </Pressable>
      ) : (
        <View className="mt-5 gap-4">
          <View>
            <Text className="mb-2 text-sm font-medium" style={{ color: tokens.text }}>
              Which calendar should Ripple add to?
            </Text>
            <CalendarPicker calendars={calendars} selectedId={selected} onSelect={setSelected} tokens={tokens} />
          </View>
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="text-sm font-medium" style={{ color: tokens.text }}>
                Add tasks with due dates automatically
              </Text>
              <Text className="mt-1 text-xs leading-relaxed" style={{ color: tokens.textTer }}>
                Includes your open tasks that are due today or later.
              </Text>
            </View>
            <Switch
              value={autoSend}
              onValueChange={setAutoSend}
              trackColor={{ false: tokens.bgInset, true: tokens.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Pressable
            onPress={connect}
            disabled={busy || !selected}
            accessibilityRole="button"
            className="items-center rounded-xl py-3"
            style={{ backgroundColor: tokens.primary, opacity: busy || !selected ? 0.6 : 1 }}
          >
            <Text className="text-sm font-semibold" style={{ color: "#FFFFFF" }}>
              {busy ? "Connecting…" : "Connect"}
            </Text>
          </Pressable>
        </View>
      )}

      <Text className="mt-4 text-[11px] leading-relaxed" style={{ color: tokens.textQuiet }}>
        Ripple reads only event titles and times, never notes, locations or who&apos;s invited. Events Ripple
        adds start with &ldquo;Ripple:&rdquo; so you can always spot them.
      </Text>
    </View>
  );
}

/** Target calendar row on the connected card: shows its name, lets you switch. */
function TargetCalendarSection({
  calendar,
  tokens,
  onChanged,
}: {
  calendar: CalendarState;
  tokens: AcuityTokens;
  onChanged: (next: CalendarState) => void;
}) {
  const [calendars, setCalendars] = useState<DeviceCalendar[] | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const canRead = deviceCalendarAvailable() && calendar.provider === DEVICE_PROVIDER;

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    void calendarPermission().then(async (p) => {
      if (p !== "granted" || cancelled) return;
      const list = await writableCalendars().catch(() => []);
      if (!cancelled) setCalendars(list);
    });
    return () => {
      cancelled = true;
    };
  }, [canRead]);

  const current = calendars?.find((c) => c.id === calendar.targetCalendarId);

  async function choose(id: string) {
    if (id === calendar.targetCalendarId || saving) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch<{ ok: boolean; calendar: CalendarState }>(
        "/api/integrations/calendar/settings",
        { targetCalendarId: id }
      );
      onChanged({ ...calendar, ...res.calendar });
      setOpen(false);
    } catch (err) {
      Alert.alert("Couldn't save", err instanceof Error ? err.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="mt-5 border-t pt-4" style={{ borderColor: tokens.line }}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium" style={{ color: tokens.text }}>
          Adds to
        </Text>
        {calendars && calendars.length > 0 ? (
          <Pressable onPress={() => setOpen((o) => !o)} hitSlop={8} accessibilityRole="button">
            <Text className="text-xs font-semibold" style={{ color: tokens.primary }}>
              {open ? "Done" : "Change"}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text className="mt-1 text-sm" style={{ color: tokens.textSec }}>
        {calendar.provider === "google"
          ? "Your primary Google Calendar"
          : current
            ? `${current.title}${current.source ? ` · ${current.source}` : ""}`
            : canRead
              ? "Your chosen calendar"
              : "—"}
      </Text>
      {open && calendars ? (
        <View className="mt-3">
          <CalendarPicker
            calendars={calendars}
            selectedId={calendar.targetCalendarId}
            onSelect={choose}
            tokens={tokens}
          />
          <Text className="mt-2 text-[11px] leading-relaxed" style={{ color: tokens.textQuiet }}>
            New events go to the new calendar. Events already added stay where they are.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ConnectedCard({
  calendar,
  googleEmail,
  tokens,
  onUpdate,
  onDisconnect,
}: {
  calendar: CalendarState;
  googleEmail: string | null;
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
              {calendar.provider === "google" && googleEmail ? ` as ${googleEmail}` : ""}
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

      <TargetCalendarSection calendar={calendar} tokens={tokens} onChanged={onUpdate} />

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
