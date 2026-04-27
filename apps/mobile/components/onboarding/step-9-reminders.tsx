import { useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, Text, View } from "react-native";

import {
  ReminderTimePicker,
  useLocalTimezoneLabel,
} from "@/components/reminders/time-picker";
import {
  applyReminderSchedule,
  getPermissionStatus,
  requestNotificationPermission,
  type PermissionStatus,
} from "@/lib/notifications";

import { useOnboarding } from "./context";

/**
 * Step 9 — Reminders. Captures notificationTime (HH:MM), frequency
 * (daily / weekdays / custom), and notificationsEnabled (master
 * toggle).
 *
 * Time picker is the shared 12-hour ReminderTimePicker — same
 * component as /reminders settings. Single source of truth so the
 * format never drifts between onboarding and the settings screen.
 * Internal state stays 24-hour (`hour` 0-23) for backend symmetry.
 */

const DEFAULT_HOUR = 21;
const DEFAULT_MINUTE = 0;

const DAYS: Array<{ i: number; label: string }> = [
  { i: 0, label: "S" },
  { i: 1, label: "M" },
  { i: 2, label: "T" },
  { i: 3, label: "W" },
  { i: 4, label: "T" },
  { i: 5, label: "F" },
  { i: 6, label: "S" },
];

type Frequency = "DAILY" | "WEEKDAYS" | "CUSTOM";

export function Step9Reminders() {
  const { step, setCanContinue, setCapturedData, getCapturedData } =
    useOnboarding();

  // Rehydrate from prior captured state on remount (back-nav).
  const prior = getCapturedData(step) as
    | {
        notificationsEnabled?: boolean;
        notificationTime?: string;
        notificationDays?: number[];
      }
    | null;
  const priorTime = (() => {
    if (!prior?.notificationTime) return null;
    const [h, m] = prior.notificationTime.split(":").map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) return { h, m };
    return null;
  })();
  const priorFrequency: Frequency = (() => {
    const days = prior?.notificationDays;
    if (!days || days.length === 0) return "DAILY";
    if (days.length === 7) return "DAILY";
    if (
      days.length === 5 &&
      [1, 2, 3, 4, 5].every((d) => days.includes(d))
    )
      return "WEEKDAYS";
    return "CUSTOM";
  })();

  // Default OFF — flipping the toggle triggers the OS permission
  // prompt. Ensures the stored preference never claims "enabled"
  // while the OS refuses to deliver notifications.
  const [enabled, setEnabled] = useState(
    () => prior?.notificationsEnabled ?? false
  );
  const [hour, setHour] = useState(() => priorTime?.h ?? DEFAULT_HOUR);
  const [minute, setMinute] = useState(() => priorTime?.m ?? DEFAULT_MINUTE);
  const [frequency, setFrequency] = useState<Frequency>(() => priorFrequency);
  const [custom, setCustom] = useState<number[]>(
    () => prior?.notificationDays ?? [1, 2, 3, 4, 5]
  );
  const [permission, setPermission] =
    useState<PermissionStatus>("undetermined");

  // Read current permission on mount so we can show the right affordance
  // (Grant / Open Settings / nothing).
  useEffect(() => {
    getPermissionStatus().then(setPermission).catch(() => {});
  }, []);

  const days =
    frequency === "DAILY"
      ? [0, 1, 2, 3, 4, 5, 6]
      : frequency === "WEEKDAYS"
        ? [1, 2, 3, 4, 5]
        : custom;

  useEffect(() => {
    setCanContinue(true);
    // Captured data is persisted by the shell on Continue. The OS-level
    // scheduling (if permission granted) also happens on Continue — see
    // onBeforeContinue via the useEffect below; we inform the shell of
    // our intent here and fire the schedule call in an effect that runs
    // when captured-data changes.
    setCapturedData({
      notificationTime: `${String(hour).padStart(2, "0")}:${String(
        minute
      ).padStart(2, "0")}`,
      notificationDays: enabled ? days : [],
      notificationsEnabled: enabled,
    });
  }, [hour, minute, frequency, custom, enabled, setCanContinue, setCapturedData, days]);

  const askPermission = async () => {
    const next = await requestNotificationPermission();
    setPermission(next);
    if (next === "granted") {
      // Preview schedule immediately so the user sees reminders start
      // working without waiting for the Continue tap. The shell will
      // also re-apply on Continue with the persisted server values;
      // this is idempotent (cancel-then-reschedule).
      const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      applyReminderSchedule({ enabled, time, days }).catch(() => {});
      return true;
    }
    if (next === "denied") {
      Alert.alert(
        "Notifications off",
        Platform.OS === "ios"
          ? "Acuity can't send reminders without notification permission. Enable it in iOS Settings, then toggle this back on."
          : "Acuity can't send reminders without notification permission. Enable it in system settings, then toggle this back on."
      );
    }
    return false;
  };

  /** Flip master toggle with permission-aware semantics: turning ON
   *  requests permission first; denied permission flips back to OFF
   *  so the preference never drifts from what the OS will deliver. */
  const toggleEnabled = async () => {
    if (enabled) {
      setEnabled(false);
      return;
    }
    // Going OFF → ON. Permission must be granted before we flip.
    if (permission === "granted") {
      setEnabled(true);
      return;
    }
    const granted = await askPermission();
    if (granted) setEnabled(true);
    // else: stays off. User sees the Alert or can tap the Open
    // Settings affordance below.
  };

  const openSettings = () => {
    if (Platform.OS === "ios") {
      Linking.openURL("app-settings:").catch(() => {});
    } else {
      Linking.openSettings().catch(() => {});
    }
  };

  const tzLabel = useLocalTimezoneLabel();

  const toggleCustomDay = (i: number) =>
    setCustom((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort()
    );

  return (
    <View className="flex-1">
      <Text className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        When do you want to journal?
      </Text>
      <Text className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        A gentle nudge at the time that fits your day. You can turn
        this off anytime in Profile → Reminders.
      </Text>

      {/* Master toggle */}
      <View className="mt-6 flex-row items-center gap-3">
        <Pressable
          onPress={() => {
            void toggleEnabled();
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: enabled }}
          className={`h-7 w-12 rounded-full justify-center ${
            enabled ? "bg-violet-600" : "bg-zinc-300 dark:bg-white/10"
          }`}
        >
          <View
            className="h-6 w-6 rounded-full bg-white"
            style={{ transform: [{ translateX: enabled ? 22 : 2 }] }}
          />
        </Pressable>
        <Text className="text-sm text-zinc-700 dark:text-zinc-200">
          {enabled ? "Reminders on" : "Reminders off"}
        </Text>
      </View>

      <View
        style={{ opacity: enabled ? 1 : 0.4 }}
        pointerEvents={enabled ? "auto" : "none"}
      >
        {/* Time — shared 12-hour picker (matches /reminders settings) */}
        <View className="mt-6">
          <Text className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-3">
            Time
          </Text>
          <ReminderTimePicker
            hour24={hour}
            minute={minute}
            onChangeHour24={setHour}
            onChangeMinute={setMinute}
            size="md"
          />
          <Text className="mt-3 text-center text-xs text-zinc-400 dark:text-zinc-500">
            {tzLabel}
          </Text>
        </View>

        {/* Frequency */}
        <View className="mt-6">
          <Text className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-2">
            Frequency
          </Text>
          <View className="flex-row gap-2">
            {(["DAILY", "WEEKDAYS", "CUSTOM"] as Frequency[]).map((f) => (
              <Pressable
                key={f}
                onPress={() => setFrequency(f)}
                accessibilityRole="button"
                accessibilityState={{ selected: frequency === f }}
                className={`rounded-full border px-3 py-1.5 ${
                  frequency === f
                    ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                    : "border-zinc-200 dark:border-white/10"
                }`}
              >
                <Text
                  className={`text-sm ${
                    frequency === f
                      ? "text-violet-700 dark:text-violet-300 font-semibold"
                      : "text-zinc-600 dark:text-zinc-300"
                  }`}
                >
                  {f === "DAILY" ? "Daily" : f === "WEEKDAYS" ? "Weekdays" : "Custom"}
                </Text>
              </Pressable>
            ))}
          </View>

          {frequency === "CUSTOM" && (
            <View className="mt-3 flex-row gap-1.5">
              {DAYS.map((d) => {
                const on = custom.includes(d.i);
                return (
                  <Pressable
                    key={d.i}
                    onPress={() => toggleCustomDay(d.i)}
                    className={`h-9 w-9 rounded-full items-center justify-center ${
                      on
                        ? "bg-violet-600"
                        : "bg-zinc-100 dark:bg-white/5"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        on
                          ? "text-white"
                          : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      {d.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </View>

      {/* Permission affordance — shows when enabled=true and OS
          permission isn't granted yet. Hidden when the user has
          explicitly turned reminders off. */}
      {enabled && permission !== "granted" && (
        <View className="mt-6 rounded-xl border border-violet-900/30 bg-violet-950/20 px-4 py-3">
          <Text className="text-sm text-violet-300">
            {permission === "denied"
              ? "Notifications are off in iOS Settings. Turn them on to get reminders."
              : "Let Acuity send you a reminder at the time above."}
          </Text>
          <Pressable
            onPress={permission === "denied" ? openSettings : askPermission}
            className="mt-2 self-start rounded-full bg-violet-600 px-4 py-2"
          >
            <Text className="text-xs font-semibold text-white">
              {permission === "denied" ? "Open Settings" : "Allow notifications"}
            </Text>
          </Pressable>
        </View>
      )}

      <Text className="mt-8 text-xs text-zinc-400 dark:text-zinc-500">
        &ldquo;Not now&rdquo; is a fine answer — the Skip link covers
        that.
      </Text>
    </View>
  );
}

