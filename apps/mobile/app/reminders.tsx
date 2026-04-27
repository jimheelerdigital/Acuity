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
  applyReminderSchedule,
  getPermissionStatus,
  requestNotificationPermission,
  type PermissionStatus,
} from "@/lib/notifications";

/**
 * Mobile reminder preferences. Saves notificationTime / Days / Enabled
 * to the server via POST /api/account/notifications, then schedules
 * OS-level local notifications via expo-notifications.
 *
 * Time picker is the shared <ReminderTimePicker /> — same component
 * onboarding step 9 uses, so the format never drifts.
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
  // router import retained for future use; expo-router auto-handles nav
  // back via StickyBackButton above. eslint-disable not needed because
  // useRouter has zero side effects.
  void useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Internal: store hour as 24-hour for backend symmetry; expose 12h
  // via from24h() at render time.
  const [hour, setHour] = useState(21);
  const [minute, setMinute] = useState(0);
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] =
    useState<PermissionStatus>("undetermined");

  const tzLabel = useLocalTimezoneLabel();

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
      <StickyBackButton accessibilityLabel="Back to Profile" />
      {/* Vertically-centered scroll. flexGrow on the contentContainer
          + justifyContent ensures the form sits in the middle of the
          viewport on tall screens while still scrolling on shorter
          ones (smaller iPhones, landscape). */}
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
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
          When we nudge you to journal. Turn off anytime.
        </Text>

        {/* Master toggle */}
        <View className="mt-8 flex-row items-center" style={{ gap: 14 }}>
          <Pressable
            onPress={() => setEnabled((v) => !v)}
            className={`rounded-full justify-center ${
              enabled ? "bg-violet-600" : "bg-zinc-300 dark:bg-white/10"
            }`}
            style={{ height: 32, width: 56 }}
          >
            <View
              className="rounded-full bg-white"
              style={{
                height: 28,
                width: 28,
                transform: [{ translateX: enabled ? 26 : 2 }],
              }}
            />
          </Pressable>
          <Text
            className="text-zinc-700 dark:text-zinc-200"
            style={{ fontSize: 17 }}
          >
            {enabled ? "Reminders on" : "Reminders off"}
          </Text>
        </View>

        <View
          style={{ opacity: enabled ? 1 : 0.4, marginTop: 36 }}
          pointerEvents={enabled ? "auto" : "none"}
        >
          {/* Time — 12h with AM/PM segmented toggle */}
          <Text
            className="text-zinc-400 dark:text-zinc-500"
            style={{
              fontSize: 12,
              fontWeight: "600",
              letterSpacing: 1.6,
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Time
          </Text>

          <ReminderTimePicker
            hour24={hour}
            minute={minute}
            onChangeHour24={setHour}
            onChangeMinute={setMinute}
            size="lg"
          />

          <Text
            className="text-zinc-400 dark:text-zinc-500 text-center"
            style={{ fontSize: 13, marginTop: 14 }}
          >
            {tzLabel}
          </Text>

          {/* Days */}
          <Text
            className="text-zinc-400 dark:text-zinc-500"
            style={{
              fontSize: 12,
              fontWeight: "600",
              letterSpacing: 1.6,
              textTransform: "uppercase",
              marginTop: 32,
              marginBottom: 14,
            }}
          >
            Days
          </Text>
          <View className="flex-row justify-center" style={{ gap: 10 }}>
            {DAY_LABELS.map((d) => {
              const on = days.includes(d.i);
              return (
                <Pressable
                  key={d.i}
                  onPress={() => toggleDay(d.i)}
                  className={`rounded-full items-center justify-center ${
                    on ? "bg-violet-600" : "bg-zinc-100 dark:bg-white/5"
                  }`}
                  style={{ height: 52, width: 52 }}
                >
                  <Text
                    className={
                      on ? "text-white" : "text-zinc-500 dark:text-zinc-400"
                    }
                    style={{ fontSize: 16, fontWeight: "600" }}
                  >
                    {d.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Save — full-width at 56pt */}
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

        {enabled && permission !== "granted" && (
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
                ? "Notifications are off in iOS Settings. Your preference is saved — we'll start firing as soon as you enable them."
                : "Allow notifications to get reminders at the time above."}
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

