import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
 * Time picker (2026-04-25 redesign):
 *   - 12-hour HH : MM with AM/PM segmented toggle (was: 24-hour HH:MM)
 *   - Display 1-12 hours / 0-55 minutes (5-min step). Stored on the
 *     server as 24-hour `HH:MM` strings via to24h() / from24h().
 *   - All controls scaled up significantly for Pro Max viewports —
 *     numbers at ~64pt, taps at ≥48pt, day toggles at 56pt, save
 *     button full-width at 56pt height.
 *   - Form vertically centered on the viewport so it feels intentional
 *     instead of left-aligned-and-floating.
 *   - "24-hour clock" subtext replaced with the user's actual local
 *     timezone (e.g. "Eastern Time").
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

/**
 * 24-hour internal → 12-hour display.
 */
function from24h(h24: number): { hour12: number; period: "AM" | "PM" } {
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  let hour12 = h24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, period };
}

/**
 * 12-hour display → 24-hour internal.
 */
function to24h(hour12: number, period: "AM" | "PM"): number {
  if (period === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

/**
 * Friendly label for the user's local timezone (e.g. "Eastern Time").
 * Falls back to the raw IANA name ("America/New_York") if Intl can't
 * supply a long form. Last-resort fallback is "your local timezone".
 */
function useLocalTimezoneLabel(): string {
  return useMemo(() => {
    try {
      const ianaName = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Try for the human-friendly long-form name via timeZoneName.
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: ianaName,
        timeZoneName: "long",
      }).formatToParts(new Date());
      const longName = parts.find((p) => p.type === "timeZoneName")?.value;
      if (longName) {
        // "Eastern Standard Time" / "Eastern Daylight Time" → "Eastern Time".
        // The standard/daylight distinction is noise to the user; the
        // OS handles DST transitions automatically.
        return longName
          .replace(/\bStandard\s+/i, "")
          .replace(/\bDaylight\s+/i, "");
      }
      // Last fallback: pretty-print the IANA name.
      return ianaName.replace(/_/g, " ");
    } catch {
      return "your local timezone";
    }
  }, []);
}

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

  // Hour bumping operates on the 12-hour display. We compute the new
  // 12h value, hold the period, then re-derive the 24h state.
  const bumpHour = (delta: number) => {
    setHour((h24) => {
      const { hour12, period } = from24h(h24);
      const next12 = ((hour12 - 1 + delta + 12) % 12) + 1; // cycle 1-12
      return to24h(next12, period);
    });
  };
  const bumpMinute = (delta: number) =>
    setMinute((m) => (m + delta + 60) % 60);
  const setPeriod = (period: "AM" | "PM") => {
    setHour((h24) => {
      const { hour12 } = from24h(h24);
      return to24h(hour12, period);
    });
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

  const { hour12, period } = from24h(hour);

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

          <View className="flex-row items-center justify-center" style={{ gap: 16 }}>
            <Stepper
              value={hour12}
              onDecrement={() => bumpHour(-1)}
              onIncrement={() => bumpHour(1)}
            />
            <Text
              className="text-zinc-400 dark:text-zinc-500"
              style={{ fontSize: 56, fontWeight: "700", lineHeight: 64 }}
            >
              :
            </Text>
            <Stepper
              value={minute}
              onDecrement={() => bumpMinute(-5)}
              onIncrement={() => bumpMinute(5)}
            />

            <View
              className="ml-2 rounded-full bg-zinc-100 dark:bg-white/10 flex-col"
              style={{ padding: 4, gap: 4 }}
            >
              <PeriodPill
                label="AM"
                active={period === "AM"}
                onPress={() => setPeriod("AM")}
              />
              <PeriodPill
                label="PM"
                active={period === "PM"}
                onPress={() => setPeriod("PM")}
              />
            </View>
          </View>

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

/**
 * Larger HH / MM stepper. 48pt tap targets, 64pt numerals.
 * Removed the "MM · step 5" implementation-detail subtext that the
 * original component leaked — the user doesn't need to know the
 * minute step is 5; it's an internal choice.
 */
function Stepper({
  value,
  onIncrement,
  onDecrement,
}: {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <View className="items-center" style={{ gap: 6 }}>
      <Pressable
        onPress={onIncrement}
        hitSlop={8}
        className="rounded-full border border-zinc-300 dark:border-white/15 items-center justify-center"
        style={{ height: 36, width: 48 }}
      >
        <Ionicons name="chevron-up" size={20} color="#A1A1AA" />
      </Pressable>
      <Text
        className="font-mono tabular-nums text-zinc-900 dark:text-zinc-50"
        style={{
          fontSize: 56,
          fontWeight: "700",
          lineHeight: 64,
          minWidth: 84,
          textAlign: "center",
        }}
      >
        {String(value).padStart(2, "0")}
      </Text>
      <Pressable
        onPress={onDecrement}
        hitSlop={8}
        className="rounded-full border border-zinc-300 dark:border-white/15 items-center justify-center"
        style={{ height: 36, width: 48 }}
      >
        <Ionicons name="chevron-down" size={20} color="#A1A1AA" />
      </Pressable>
    </View>
  );
}

function PeriodPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full items-center justify-center ${
        active ? "bg-violet-600" : "bg-transparent"
      }`}
      style={{ paddingHorizontal: 14, paddingVertical: 6, minWidth: 44 }}
    >
      <Text
        className={
          active ? "text-white" : "text-zinc-500 dark:text-zinc-400"
        }
        style={{ fontSize: 13, fontWeight: "700", letterSpacing: 0.5 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
