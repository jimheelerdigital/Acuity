import { useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import {
  getPermissionStatus,
  requestNotificationPermission,
  type PermissionStatus,
} from "@/lib/notifications";

import { useOnboarding } from "./context";

/**
 * Reminders step — v1.3 (2026-06-03) rewrite. Single "Enable
 * notifications" toggle. No time picker. No cadence picker. The
 * backend `notifications-twice-daily` Inngest cron sends two pushes
 * per day (9 AM and 8 PM in User.timezone) to every user with
 * notificationsEnabled = true.
 *
 * Time + cadence customization moved to Profile → Reminders
 * ("Advanced") post-onboarding. Onboarding ships a single decision:
 * "yes I want reminders" / "no I don't".
 *
 * Apple-compliance posture: the OS notification permission prompt
 * fires only when the user explicitly toggles ON. We don't pre-
 * trigger it. Skip is impossible — the shell footer's Continue is
 * always enabled here (user can ship without notifications).
 */
export function Step9Reminders() {
  const { tokens } = useTheme();
  const { step, setCanContinue, setCapturedData, getCapturedData } =
    useOnboarding();

  // Rehydrate from prior captured state on remount (back-nav).
  const prior = getCapturedData(step) as
    | { notificationsEnabled?: boolean }
    | null;

  const [enabled, setEnabled] = useState(
    () => prior?.notificationsEnabled ?? false
  );
  const [permission, setPermission] =
    useState<PermissionStatus>("undetermined");

  // Read current permission on mount so we can show the right affordance.
  useEffect(() => {
    getPermissionStatus().then(setPermission).catch(() => {});
  }, []);

  useEffect(() => {
    setCanContinue(true);
    // The post-onboarding backend cron uses User.notificationsEnabled
    // + User.timezone to fan out 9 AM / 8 PM pushes. We persist intent
    // here and also the device's current timezone so the cron knows
    // which UTC hour maps to the user's 9 AM / 8 PM. Intl.DateTime-
    // Format is built into Hermes / V8 on RN — no extra dep needed.
    let timezone: string | undefined;
    try {
      timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
      // Falls back to the server-side User.timezone default
      // ("America/Chicago") if Intl ever misfires on a device.
    }
    setCapturedData({
      notificationsEnabled: enabled,
      ...(timezone ? { timezone } : {}),
    });
  }, [enabled, setCanContinue, setCapturedData]);

  const askPermission = async () => {
    const next = await requestNotificationPermission();
    setPermission(next);
    if (next === "granted") return true;
    if (next === "denied") {
      Alert.alert(
        "Notifications off",
        Platform.OS === "ios"
          ? "Ripple can't send reminders without notification permission. Enable it in iOS Settings, then toggle this back on."
          : "Ripple can't send reminders without notification permission. Enable it in system settings, then toggle this back on."
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
    if (permission === "granted") {
      setEnabled(true);
      return;
    }
    const granted = await askPermission();
    if (granted) setEnabled(true);
  };

  const openSettings = () => {
    if (Platform.OS === "ios") {
      Linking.openURL("app-settings:").catch(() => {});
    } else {
      Linking.openSettings().catch(() => {});
    }
  };

  return (
    <View className="flex-1">
      <Text
        className="text-3xl font-semibold tracking-tight"
        style={{ color: tokens.text }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        Two gentle nudges a day
      </Text>
      <Text
        className="mt-3 text-base leading-relaxed"
        style={{ color: tokens.textSec }}
      >
        We&rsquo;ll send a check-in at 9 AM and a wind-down at 8 PM
        in your local time zone. You can change the timing later in
        Profile &rarr; Reminders.
      </Text>

      {/* Master toggle */}
      <View className="mt-8 flex-row items-center gap-3">
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

      {/* Permission affordance — shows when the OS permission is
          denied so the user can recover via Settings. */}
      {enabled && permission === "denied" && (
        <View
          className="mt-6 rounded-xl border px-4 py-3"
          style={{
            borderColor: `${tokens.primary}55`,
            backgroundColor: `${tokens.primary}14`,
          }}
        >
          <Text className="text-sm" style={{ color: tokens.primary }}>
            Notifications are off in iOS Settings. Turn them on to get
            reminders.
          </Text>
          <Pressable
            onPress={openSettings}
            className="mt-2 self-start rounded-full px-4 py-2"
            style={{ backgroundColor: tokens.primary }}
          >
            <Text className="text-xs font-semibold" style={{ color: "#FFFFFF" }}>
              Open Settings
            </Text>
          </Pressable>
        </View>
      )}

      <Text
        className="mt-8 text-xs"
        style={{ color: tokens.textQuiet }}
      >
        Need a different time, more nudges, or quiet weekends? Tune
        them in Profile &rarr; Reminders after onboarding.
      </Text>
    </View>
  );
}
