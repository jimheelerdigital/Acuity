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

import { api } from "@/lib/api";
import {
  applyReminderSchedule,
  getPermissionStatus,
  requestNotificationPermission,
  type PermissionStatus,
} from "@/lib/notifications";

/**
 * Mobile reminder preferences. Saves notificationTime / Days / Enabled
 * to the server via POST /api/account/notifications. OS-level local
 * notifications are queued by a follow-up once expo-notifications is
 * added to the mobile build (requires a native module, so it lands on
 * the next EAS build, not a JS-only OTA update).
 *
 * Time input: a simple native time-style picker on Android doesn't ship
 * with Expo out of the box either — so both platforms get a tap-to-edit
 * HH / MM stepper. Ugly but shippable; a proper DateTimePicker can come
 * in the same PR that wires expo-notifications.
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

type Me = {
  notificationTime: string;
  notificationDays: number[];
  notificationsEnabled: boolean;
};

export default function RemindersScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [hour, setHour] = useState(21);
  const [minute, setMinute] = useState(0);
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] =
    useState<PermissionStatus>("undetermined");

  const load = useCallback(async () => {
    try {
      const [me, perm] = await Promise.all([
        api.get<{ user: Me }>("/api/user/me"),
        getPermissionStatus(),
      ]);
      const u = me.user;
      const [h, m] = (u.notificationTime ?? "21:00").split(":").map(Number);
      if (Number.isFinite(h)) setHour(h);
      if (Number.isFinite(m)) setMinute(m);
      setDays(u.notificationDays ?? [0, 1, 2, 3, 4, 5, 6]);
      setEnabled(!!u.notificationsEnabled);
      setPermission(perm);
    } catch {
      // silent — server defaults already populated via useState
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDay = (i: number) => {
    setDays((prev) =>
      prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort()
    );
  };

  const bumpHour = (delta: number) =>
    setHour((h) => (h + delta + 24) % 24);
  const bumpMinute = (delta: number) =>
    setMinute((m) => (m + delta + 60) % 60);

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
      const hh = String(hour).padStart(2, "0");
      const mm = String(minute).padStart(2, "0");
      const time = `${hh}:${mm}`;
      await api.post("/api/account/notifications", {
        notificationTime: time,
        notificationDays: days,
        notificationsEnabled: enabled,
      });
      // OS-level schedule. Cancel-then-reschedule handles both the
      // "change time" and "toggle off" paths idempotently.
      await applyReminderSchedule({ enabled, time, days });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      Alert.alert("Couldn't save", "Please try again.");
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
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} className="mb-4 self-start">
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">← Profile</Text>
        </Pressable>

        <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Reminders
        </Text>
        <Text className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
          When we nudge you to journal. Turn off anytime.
        </Text>

        {/* Master toggle */}
        <View className="mt-6 flex-row items-center gap-3">
          <Pressable
            onPress={() => setEnabled((v) => !v)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className={`h-7 w-12 rounded-full justify-center ${
              enabled ? "bg-violet-600" : "bg-zinc-300 dark:bg-white/10"
            }`}
          >
            <View
              className="h-6 w-6 rounded-full bg-white"
              style={{
                transform: [{ translateX: enabled ? 22 : 2 }],
              }}
            />
          </Pressable>
          <Text className="text-sm text-zinc-700 dark:text-zinc-200">
            {enabled ? "Reminders on" : "Reminders off"}
          </Text>
        </View>

        <View style={{ opacity: enabled ? 1 : 0.4 }} pointerEvents={enabled ? "auto" : "none"}>
          {/* Time */}
          <View className="mt-6">
            <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
              Time
            </Text>
            <View className="flex-row items-center gap-4">
              <Stepper
                value={hour}
                label="HH"
                onDecrement={() => bumpHour(-1)}
                onIncrement={() => bumpHour(1)}
              />
              <Text className="text-3xl font-bold text-zinc-400 dark:text-zinc-500">:</Text>
              <Stepper
                value={minute}
                label="MM"
                step={5}
                onDecrement={() => bumpMinute(-5)}
                onIncrement={() => bumpMinute(5)}
              />
            </View>
            <Text className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              24-hour clock · your local timezone
            </Text>
          </View>

          {/* Days */}
          <View className="mt-6">
            <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
              Days
            </Text>
            <View className="flex-row gap-2">
              {DAY_LABELS.map((d) => {
                const on = days.includes(d.i);
                return (
                  <Pressable
                    key={d.i}
                    onPress={() => toggleDay(d.i)}
                    className={`h-10 w-10 rounded-full items-center justify-center ${
                      on ? "bg-violet-600" : "bg-zinc-100 dark:bg-white/5"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        on ? "text-white" : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      {d.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <View className="mt-8 flex-row items-center gap-3">
          <Pressable
            disabled={saving}
            onPress={save}
            className="rounded-full bg-violet-600 px-4 py-2"
            style={({ pressed }) => ({ opacity: saving || pressed ? 0.7 : 1 })}
          >
            <Text className="text-white font-semibold text-sm">
              {saving ? "Saving…" : "Save"}
            </Text>
          </Pressable>
          {saved && (
            <Text className="text-xs text-emerald-500 dark:text-emerald-400">
              Saved ✓
            </Text>
          )}
        </View>

        {enabled && permission !== "granted" && (
          <View className="mt-8 rounded-xl border border-violet-900/30 bg-violet-950/20 px-4 py-3">
            <Text className="text-xs text-violet-300 leading-5">
              <Ionicons name="information-circle-outline" size={13} />{" "}
              {permission === "denied"
                ? "Notifications are off in iOS Settings. Your preference is saved — we'll start firing as soon as you enable them."
                : "Allow notifications to get reminders at the time above."}
            </Text>
            <Pressable
              onPress={permission === "denied" ? openSettings : askPermission}
              className="mt-2 self-start rounded-full bg-violet-600 px-3 py-1.5"
            >
              <Text className="text-xs font-semibold text-white">
                {permission === "denied" ? "Open Settings" : "Allow notifications"}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stepper({
  value,
  label,
  step = 1,
  onIncrement,
  onDecrement,
}: {
  value: number;
  label: string;
  step?: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <View className="items-center">
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={onDecrement}
          className="h-9 w-9 rounded-full border border-zinc-300 dark:border-white/15 items-center justify-center"
        >
          <Ionicons name="remove" size={18} color="#A1A1AA" />
        </Pressable>
        <Text className="text-3xl font-mono font-bold tabular-nums w-14 text-center text-zinc-900 dark:text-zinc-50">
          {String(value).padStart(2, "0")}
        </Text>
        <Pressable
          onPress={onIncrement}
          className="h-9 w-9 rounded-full border border-zinc-300 dark:border-white/15 items-center justify-center"
        >
          <Ionicons name="add" size={18} color="#A1A1AA" />
        </Pressable>
      </View>
      <Text className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
        {label}
        {step !== 1 && <> · step {step}</>}
      </Text>
    </View>
  );
}
