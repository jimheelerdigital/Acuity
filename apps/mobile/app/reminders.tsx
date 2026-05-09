import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StickyBackButton } from "@/components/back-button";
import {
  ReminderTimePicker,
  useLocalTimezoneLabel,
} from "@/components/reminders/time-picker";
import { api } from "@/lib/api";
import {
  applyMultiReminderSchedule,
  getPermissionStatus,
  requestNotificationPermission,
  type PermissionStatus,
} from "@/lib/notifications";

/**
 * Mobile reminder preferences. Multi-reminder list (Slice C,
 * 2026-05-09).
 *
 * Each row is one reminder: time picker + per-row day toggles +
 * per-row enable + delete. "+ Add reminder" appends a new row
 * defaulted to 09:00 daily; server-enforced cap is 5 reminders, so
 * the button hides once 5 rows exist. Master toggle at top still
 * controls notificationsEnabled (cuts everything).
 *
 * Save:
 *   1. PUT /api/account/reminders with the full list (atomic
 *      replace-list on the server; legacy User.notificationTime/
 *      Days/Enabled also kept in sync via dual-write so old clients
 *      keep working until they cycle out).
 *   2. Cancel all OS-scheduled reminders, then schedule N triggers
 *      per active reminder per active day.
 *
 * Onboarding step 9 still uses the single-time legacy endpoint —
 * server-side dual-write upserts the corresponding UserReminder row.
 * Multiple reminders is a settings-screen power feature.
 */

const DAY_LABELS: Array<{ i: number; label: string }> = [
  { i: 0, label: "S" },
  { i: 1, label: "M" },
  { i: 2, label: "T" },
  { i: 3, label: "W" },
  { i: 4, label: "T" },
  { i: 5, label: "F" },
  { i: 6, label: "S" },
];

const MAX_REMINDERS = 5;

type ServerReminder = {
  id: string;
  time: string;
  daysActive: number[];
  enabled: boolean;
  sortOrder: number;
};

// Local row state — mirrors ServerReminder but adds an isDraft flag
// for rows the user added since the last save. Drafts get a synthetic
// id (the server assigns the real one on PUT response) so React keys
// stay stable while editing.
type LocalReminder = {
  id: string;
  isDraft: boolean;
  time: string; // HH:MM
  daysActive: number[];
  enabled: boolean;
  sortOrder: number;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function reminderFromServer(s: ServerReminder): LocalReminder {
  return {
    id: s.id,
    isDraft: false,
    time: s.time,
    daysActive: s.daysActive,
    enabled: s.enabled,
    sortOrder: s.sortOrder,
  };
}

function defaultReminder(sortOrder: number): LocalReminder {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    isDraft: true,
    time: "09:00",
    daysActive: [0, 1, 2, 3, 4, 5, 6],
    enabled: true,
    sortOrder,
  };
}

export default function RemindersScreen() {
  void useRouter(); // back-nav handled via StickyBackButton

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [masterEnabled, setMasterEnabled] = useState(false);
  const [reminders, setReminders] = useState<LocalReminder[]>([]);
  const [permission, setPermission] =
    useState<PermissionStatus>("undetermined");

  const tzLabel = useLocalTimezoneLabel();

  const load = useCallback(async () => {
    try {
      const [me, list, perm] = await Promise.all([
        api.get<{
          user: { notificationsEnabled?: boolean };
        }>("/api/user/me"),
        api.get<{ reminders: ServerReminder[] }>("/api/account/reminders"),
        getPermissionStatus(),
      ]);
      setMasterEnabled(!!me.user?.notificationsEnabled);
      const fromServer = (list.reminders ?? []).map(reminderFromServer);
      // If the user has zero reminders configured, seed one default
      // row so the screen has something to edit. Marked isDraft so
      // it's only persisted if the user explicitly saves.
      setReminders(
        fromServer.length > 0 ? fromServer : [defaultReminder(0)]
      );
      setPermission(perm);
    } catch {
      // silent — defaults already populated via useState
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateReminder = (
    id: string,
    patch: Partial<Omit<LocalReminder, "id">>
  ) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const toggleDay = (id: string, dayIndex: number) => {
    setReminders((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              daysActive: r.daysActive.includes(dayIndex)
                ? r.daysActive.filter((d) => d !== dayIndex)
                : [...r.daysActive, dayIndex].sort(),
            }
          : r
      )
    );
  };

  const removeReminder = (id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  const addReminder = () => {
    if (reminders.length >= MAX_REMINDERS) return;
    setReminders((prev) => [...prev, defaultReminder(prev.length)]);
  };

  const askPermission = async () => {
    const next = await requestNotificationPermission();
    setPermission(next);
    if (next === "denied") {
      Alert.alert(
        "Notifications off",
        Platform.OS === "ios"
          ? "Enable in iOS Settings to get reminders."
          : "Enable notifications in system settings to get reminders."
      );
    }
  };

  const openSettings = () => {
    if (Platform.OS === "ios") Linking.openURL("app-settings:").catch(() => {});
    else Linking.openSettings().catch(() => {});
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      // PUT replace-list, then update master toggle separately via
      // the legacy /api/account/notifications endpoint (which
      // dual-writes back to the primary UserReminder — symmetric).
      const putBody = reminders.map((r, i) => ({
        time: r.time,
        daysActive: r.daysActive,
        enabled: r.enabled,
        sortOrder: i,
      }));
      const res = await api.put<{ reminders: ServerReminder[] }>(
        "/api/account/reminders",
        { reminders: putBody }
      );
      // Keep master enabled separate — the multi-reminder PUT only
      // touches per-reminder enabled. notificationsEnabled lives on
      // User and gates the whole list.
      await api.post("/api/account/notifications", {
        notificationsEnabled: masterEnabled,
      });

      // Reflect server-assigned ids back into local state so future
      // edits target the real ids, not draft placeholders.
      const fromServer = (res.reminders ?? []).map(reminderFromServer);
      if (fromServer.length > 0) setReminders(fromServer);

      // OS-level: schedule the multi-reminder list. Cancel-then-
      // reschedule covers the "remove a reminder" path idempotently.
      await applyMultiReminderSchedule({
        masterEnabled,
        reminders: fromServer.map((r) => ({
          id: r.id,
          time: r.time,
          daysActive: r.daysActive,
          enabled: r.enabled,
        })),
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      const code = (err as { status?: number; message?: string }).status;
      if (code === 400) {
        Alert.alert(
          "Couldn't save",
          (err as { message?: string }).message ??
            "Check your reminders and try again."
        );
      } else {
        Alert.alert("Couldn't save", "Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-[#0B0B12] items-center justify-center">
        <ActivityIndicator color="#7C3AED" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-white dark:bg-[#0B0B12]">
      <StickyBackButton accessibilityLabel="Back to Profile" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: 80,
          paddingBottom: 40,
          paddingHorizontal: 24,
        }}
      >
        <Text
          className="text-zinc-900 dark:text-zinc-50"
          style={{ fontSize: 34, fontWeight: "700", letterSpacing: -0.6 }}
        >
          Reminders
        </Text>
        <Text
          className="text-zinc-500 dark:text-zinc-400"
          style={{ fontSize: 17, marginTop: 6, lineHeight: 24 }}
        >
          When we nudge you to journal. Add up to {MAX_REMINDERS}.
        </Text>

        {/* Master toggle */}
        <View className="mt-8 flex-row items-center" style={{ gap: 14 }}>
          <Pressable
            onPress={() => setMasterEnabled((v) => !v)}
            className={`rounded-full justify-center ${
              masterEnabled ? "bg-violet-600" : "bg-zinc-300 dark:bg-white/10"
            }`}
            style={{ height: 32, width: 56 }}
          >
            <View
              className="rounded-full bg-white"
              style={{
                height: 28,
                width: 28,
                transform: [{ translateX: masterEnabled ? 26 : 2 }],
              }}
            />
          </Pressable>
          <Text
            className="text-zinc-700 dark:text-zinc-200"
            style={{ fontSize: 17 }}
          >
            {masterEnabled ? "Reminders on" : "Reminders off"}
          </Text>
        </View>

        <Text
          className="text-zinc-400 dark:text-zinc-500"
          style={{ fontSize: 13, marginTop: 14 }}
        >
          {tzLabel}
        </Text>

        <View
          style={{ opacity: masterEnabled ? 1 : 0.4, marginTop: 28 }}
          pointerEvents={masterEnabled ? "auto" : "none"}
        >
          {reminders.map((reminder, idx) => (
            <ReminderRow
              key={reminder.id}
              reminder={reminder}
              index={idx}
              canDelete={reminders.length > 1}
              onChangeTime={(time) => updateReminder(reminder.id, { time })}
              onToggleDay={(dayIndex) => toggleDay(reminder.id, dayIndex)}
              onToggleEnabled={() =>
                updateReminder(reminder.id, { enabled: !reminder.enabled })
              }
              onDelete={() => removeReminder(reminder.id)}
            />
          ))}

          {reminders.length < MAX_REMINDERS && (
            <Pressable
              onPress={addReminder}
              className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 items-center justify-center flex-row"
              style={{ marginTop: 16, paddingVertical: 16, gap: 8 }}
            >
              <Ionicons name="add-circle-outline" size={20} color="#A78BFA" />
              <Text
                className="text-violet-500 dark:text-violet-300"
                style={{ fontSize: 15, fontWeight: "600" }}
              >
                Add reminder
              </Text>
            </Pressable>
          )}
        </View>

        <Pressable
          disabled={saving}
          onPress={save}
          className="rounded-2xl bg-violet-600 items-center justify-center"
          style={{
            marginTop: 36,
            height: 56,
            opacity: saving ? 0.7 : 1,
          }}
        >
          <Text
            className="text-white"
            style={{ fontSize: 18, fontWeight: "600" }}
          >
            {saving ? "Saving…" : "Save"}
          </Text>
        </Pressable>
        {saved && (
          <Text
            className="text-emerald-500 dark:text-emerald-400 text-center"
            style={{ fontSize: 13, marginTop: 10 }}
          >
            Saved ✓
          </Text>
        )}

        {masterEnabled && permission !== "granted" && (
          <View
            className="rounded-2xl border border-violet-900/30 bg-violet-950/20"
            style={{ padding: 16, marginTop: 24 }}
          >
            <Text
              className="text-violet-300"
              style={{ fontSize: 14, lineHeight: 20 }}
            >
              <Ionicons name="information-circle-outline" size={14} />{" "}
              {permission === "denied"
                ? "Notifications are off in iOS Settings. Your preferences are saved — we'll start firing as soon as you enable them."
                : "Allow notifications to get reminders at the times above."}
            </Text>
            <Pressable
              onPress={permission === "denied" ? openSettings : askPermission}
              className="self-start rounded-full bg-violet-600"
              style={{ marginTop: 10, paddingHorizontal: 14, paddingVertical: 8 }}
            >
              <Text
                className="text-white"
                style={{ fontSize: 14, fontWeight: "600" }}
              >
                {permission === "denied" ? "Open Settings" : "Allow notifications"}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReminderRow({
  reminder,
  index,
  canDelete,
  onChangeTime,
  onToggleDay,
  onToggleEnabled,
  onDelete,
}: {
  reminder: LocalReminder;
  index: number;
  canDelete: boolean;
  onChangeTime: (time: string) => void;
  onToggleDay: (dayIndex: number) => void;
  onToggleEnabled: () => void;
  onDelete: () => void;
}) {
  const [hourStr, minuteStr] = reminder.time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const validHour = Number.isFinite(hour) ? hour : 9;
  const validMinute = Number.isFinite(minute) ? minute : 0;

  const setHour = (h: number) => {
    onChangeTime(`${pad(h)}:${pad(validMinute)}`);
  };
  const setMinute = (m: number) => {
    onChangeTime(`${pad(validHour)}:${pad(m)}`);
  };

  return (
    <View
      className={`rounded-2xl ${
        reminder.enabled
          ? "bg-zinc-50 dark:bg-white/5"
          : "bg-zinc-50/50 dark:bg-white/[0.02]"
      }`}
      style={{
        padding: 16,
        marginTop: index === 0 ? 0 : 16,
        opacity: reminder.enabled ? 1 : 0.55,
      }}
    >
      <View
        className="flex-row items-center justify-between"
        style={{ marginBottom: 12 }}
      >
        <Pressable
          onPress={onToggleEnabled}
          className={`rounded-full justify-center ${
            reminder.enabled
              ? "bg-violet-600"
              : "bg-zinc-300 dark:bg-white/10"
          }`}
          style={{ height: 28, width: 48 }}
        >
          <View
            className="rounded-full bg-white"
            style={{
              height: 24,
              width: 24,
              transform: [{ translateX: reminder.enabled ? 22 : 2 }],
            }}
          />
        </Pressable>
        {canDelete && (
          <Pressable onPress={onDelete} hitSlop={12}>
            <Ionicons name="trash-outline" size={20} color="#A1A1AA" />
          </Pressable>
        )}
      </View>

      <View
        style={{ opacity: reminder.enabled ? 1 : 0.7 }}
        pointerEvents={reminder.enabled ? "auto" : "none"}
      >
        <ReminderTimePicker
          hour24={validHour}
          minute={validMinute}
          onChangeHour24={setHour}
          onChangeMinute={setMinute}
          size="md"
        />

        <View
          className="flex-row justify-center"
          style={{ gap: 8, marginTop: 16 }}
        >
          {DAY_LABELS.map((d) => {
            const on = reminder.daysActive.includes(d.i);
            return (
              <Pressable
                key={d.i}
                onPress={() => onToggleDay(d.i)}
                className={`rounded-full items-center justify-center ${
                  on ? "bg-violet-600" : "bg-zinc-100 dark:bg-white/5"
                }`}
                style={{ height: 40, width: 40 }}
              >
                <Text
                  className={
                    on ? "text-white" : "text-zinc-500 dark:text-zinc-400"
                  }
                  style={{ fontSize: 14, fontWeight: "600" }}
                >
                  {d.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
