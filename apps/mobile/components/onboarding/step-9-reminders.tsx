import { useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, Text, View } from "react-native";

import {
  ReminderTimePicker,
  useLocalTimezoneLabel,
} from "@/components/reminders/time-picker";
import { useTheme } from "@/contexts/theme-context";
import {
  applyReminderSchedule,
  getPermissionStatus,
  requestNotificationPermission,
  type PermissionStatus,
} from "@/lib/notifications";

import { useOnboarding } from "./context";

/**
 * Reminders step — captures notificationTime (HH:MM) and
 * notificationsEnabled. Frequency was DAILY/WEEKDAYS/CUSTOM until
 * 2026-05-15 (Slice E): the selector was removed from onboarding to
 * cut density. All new users default to DAILY at the chosen time.
 * Users wanting different cadences can edit them in Profile →
 * Reminders, which still supports the full week-day picker.
 *
 * Time picker is the shared 12-hour ReminderTimePicker — same
 * component as /reminders settings. Single source of truth so the
 * format never drifts between onboarding and the settings screen.
 * Internal state stays 24-hour (`hour` 0-23) for backend symmetry.
 */

const DEFAULT_HOUR = 21;
const DEFAULT_MINUTE = 0;
// Daily — all seven weekdays. The Settings screen offers a fuller
// picker; onboarding stays simple.
const DAILY_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function Step9Reminders() {
  const { tokens } = useTheme();
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

  // Default OFF — flipping the toggle triggers the OS permission
  // prompt. Ensures the stored preference never claims "enabled"
  // while the OS refuses to deliver notifications.
  const [enabled, setEnabled] = useState(
    () => prior?.notificationsEnabled ?? false
  );
  const [hour, setHour] = useState(() => priorTime?.h ?? DEFAULT_HOUR);
  const [minute, setMinute] = useState(() => priorTime?.m ?? DEFAULT_MINUTE);
  const [permission, setPermission] =
    useState<PermissionStatus>("undetermined");

  // Read current permission on mount so we can show the right affordance
  // (Grant / Open Settings / nothing).
  useEffect(() => {
    getPermissionStatus().then(setPermission).catch(() => {});
  }, []);

  // Onboarding always sets daily reminders. Users wanting a different
  // cadence (weekdays only / custom days) edit in Profile → Reminders
  // post-onboarding.
  const days = DAILY_DAYS;

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
  }, [hour, minute, enabled, setCanContinue, setCapturedData, days]);

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

  return (
    <View className="flex-1">
      <Text
        className="text-3xl font-semibold tracking-tight"
        style={{ color: tokens.text }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        When do you want to journal?
      </Text>
      <Text
        className="mt-3 text-base leading-relaxed"
        style={{ color: tokens.textSec }}
      >
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
          className="h-7 w-12 rounded-full justify-center"
          style={{
            backgroundColor: enabled ? tokens.primary : tokens.bgInset,
          }}
        >
          <View
            className="h-6 w-6 rounded-full"
            style={{
              backgroundColor: "#FFFFFF",
              transform: [{ translateX: enabled ? 22 : 2 }],
            }}
          />
        </Pressable>
        <Text className="text-sm" style={{ color: tokens.text }}>
          {enabled ? "Reminders on" : "Reminders off"}
        </Text>
      </View>

      <View
        style={{ opacity: enabled ? 1 : 0.4 }}
        pointerEvents={enabled ? "auto" : "none"}
      >
        {/* Time — shared 12-hour picker (matches /reminders settings) */}
        <View className="mt-6">
          <Text
            className="text-sm font-semibold mb-3"
            style={{ color: tokens.text }}
          >
            Time
          </Text>
          <ReminderTimePicker
            hour24={hour}
            minute={minute}
            onChangeHour24={setHour}
            onChangeMinute={setMinute}
            size="md"
          />
          <Text
            className="mt-3 text-center text-xs"
            style={{ color: tokens.textQuiet }}
          >
            {tzLabel}
          </Text>
        </View>

      </View>

      {/* Permission affordance — shows when enabled=true and OS
          permission isn't granted yet. Hidden when the user has
          explicitly turned reminders off. */}
      {enabled && permission !== "granted" && (
        <View
          className="mt-6 rounded-xl border px-4 py-3"
          style={{
            borderColor: `${tokens.primary}55`,
            backgroundColor: `${tokens.primary}14`,
          }}
        >
          <Text className="text-sm" style={{ color: tokens.primary }}>
            {permission === "denied"
              ? "Notifications are off in iOS Settings. Turn them on to get reminders."
              : "Let Acuity send you a reminder at the time above."}
          </Text>
          <Pressable
            onPress={permission === "denied" ? openSettings : askPermission}
            className="mt-2 self-start rounded-full px-4 py-2"
            style={{ backgroundColor: tokens.primary }}
          >
            <Text className="text-xs font-semibold" style={{ color: "#FFFFFF" }}>
              {permission === "denied" ? "Open Settings" : "Allow notifications"}
            </Text>
          </Pressable>
        </View>
      )}

      <Text
        className="mt-8 text-xs"
        style={{ color: tokens.textQuiet }}
      >
        Want a different cadence or more than one reminder? Add them
        from Profile → Reminders after onboarding.
      </Text>
    </View>
  );
}

