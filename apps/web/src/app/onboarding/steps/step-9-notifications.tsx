"use client";

import { useEffect, useState } from "react";

import { useOnboarding } from "../onboarding-context";

/**
 * Reminders step — web parity with iOS
 * (apps/mobile/components/onboarding/step-9-reminders.tsx).
 *
 * iOS ships ONE decision in onboarding: "yes I want reminders / no I
 * don't" — a single master toggle (default OFF), no time picker, no
 * cadence picker. The backend sends two pushes/day (9 AM + 8 PM in the
 * user's timezone) to everyone with notificationsEnabled = true; time +
 * cadence customization lives in Settings, post-onboarding. We mirror
 * that here. Toggling ON requests the browser Notification permission
 * (the web equivalent of iOS's OS prompt — fired only on the explicit
 * toggle, never pre-triggered). Continue is always enabled (the user can
 * proceed with reminders off); there's no Skip.
 *
 * Persists exactly what iOS persists: notificationsEnabled + timezone.
 * It does NOT write notificationTime / notificationDays (those keep their
 * DB defaults and are only set if the user customizes in Settings).
 *
 * NOTE: the web reminders dispatcher is a v1.4 follow-up. To honor the
 * "two nudges a day" copy it must fan out 9 AM + 8 PM from
 * (notificationsEnabled + timezone) like the iOS `notifications-twice-
 * daily` cron — not the single notificationTime the Settings picker
 * still exposes. Flagged for that slice.
 */
export function Step9Notifications() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  // Default OFF — matches iOS. We only flip ON after the browser grants
  // notification permission, so "on" never drifts from what can deliver.
  const [enabled, setEnabled] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const requestAndEnable = async () => {
    setPermissionError(null);
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      // No Notification API (SSR / unsupported browser) — flip the
      // preference on; the email fallback still applies.
      setEnabled(true);
      return;
    }
    if (Notification.permission === "granted") {
      setEnabled(true);
      return;
    }
    if (Notification.permission === "denied") {
      setPermissionError(
        "Notifications are blocked in your browser. Turn them on in your browser settings, then toggle this back on."
      );
      return;
    }
    try {
      const result = await Notification.requestPermission();
      if (result === "granted") {
        setEnabled(true);
      } else {
        setPermissionError(
          "No problem — we can't send reminders without permission. Toggle this back on anytime."
        );
      }
    } catch {
      setPermissionError(
        "Couldn't request notification permission. Your browser may not support reminders here."
      );
    }
  };

  useEffect(() => {
    setCanContinue(true);
    // Capture the device timezone so the (v1.4) backend knows which UTC
    // hour maps to the user's 9 AM / 8 PM — same as iOS.
    let timezone: string | undefined;
    try {
      timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
      /* server default applies if Intl misfires */
    }
    setCapturedData({
      notificationsEnabled: enabled,
      ...(timezone ? { timezone } : {}),
    });
  }, [enabled, setCanContinue, setCapturedData]);

  return (
    <div className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        Two gentle nudges a day
      </h1>
      <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        We&rsquo;ll send a check-in at 9 AM and a wind-down at 8 PM in your
        local time zone. You can change the timing, or turn them off,
        anytime in Settings.
      </p>

      {/* Master toggle — the only control. Default off; toggling on
          requests browser notification permission. */}
      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (enabled) {
              setEnabled(false);
              setPermissionError(null);
            } else {
              void requestAndEnable();
            }
          }}
          role="switch"
          aria-checked={enabled}
          className={`relative h-7 w-12 rounded-full transition ${
            enabled ? "bg-acuity-primary" : "bg-zinc-300 dark:bg-white/10"
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${
              enabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
        <span className="text-sm text-zinc-700 dark:text-zinc-200">
          {enabled ? "Reminders on" : "Reminders off"}
        </span>
      </div>

      {permissionError && (
        <p
          role="alert"
          className="mt-3 text-xs text-amber-700 dark:text-amber-300"
        >
          {permissionError}
        </p>
      )}

      <p className="mt-8 text-xs text-zinc-400 dark:text-zinc-500">
        Need a different time, more nudges, or quiet weekends? Adjust them
        in Settings after onboarding.
      </p>
    </div>
  );
}
