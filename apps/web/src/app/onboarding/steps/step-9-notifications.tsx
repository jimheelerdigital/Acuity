"use client";

import { useEffect, useState } from "react";

import { useOnboarding } from "../onboarding-context";

/**
 * Step 9 — Notifications / reminders.
 *
 * Captures three things: when to remind (HH:MM in user's local time),
 * which days to fire on, and whether the preference is actually on.
 * Web saves the preference; mobile (when we ship the parallel flow)
 * will also request OS-level notification permission here via
 * expo-notifications. For now the web flow is preference-only — the
 * backend dispatcher that actually sends emails / pushes from these
 * values is a follow-up shipped alongside the mobile onboarding.
 *
 * Skippable: "Not now" submits notificationsEnabled=false and advances
 * the same way as Continue. The shell's Skip button covers this too —
 * we call it out explicitly in copy so the user doesn't feel cornered.
 */

const DEFAULT_TIME = "21:00";
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

export function Step9Notifications() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  const [frequency, setFrequency] = useState<Frequency>("DAILY");
  const [time, setTime] = useState(DEFAULT_TIME);
  const [custom, setCustom] = useState<number[]>([1, 2, 3, 4, 5]); // default = weekdays
  const [enabled, setEnabled] = useState(true);

  const days =
    frequency === "DAILY"
      ? [0, 1, 2, 3, 4, 5, 6]
      : frequency === "WEEKDAYS"
        ? [1, 2, 3, 4, 5]
        : custom;

  useEffect(() => {
    setCanContinue(true);
    setCapturedData({
      notificationTime: time,
      notificationDays: enabled ? days : [],
      notificationsEnabled: enabled,
    });
  }, [time, frequency, custom, enabled, setCanContinue, setCapturedData, days]);

  const toggleCustomDay = (i: number) => {
    setCustom((prev) =>
      prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort()
    );
  };

  return (
    <div className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        When do you want to journal?
      </h1>
      <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        A gentle reminder at the time that fits your day. Turn it off
        anytime from Settings.
      </p>

      {/* Enabled master toggle */}
      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          aria-pressed={enabled}
          className={`relative h-7 w-12 rounded-full transition ${
            enabled ? "bg-violet-600" : "bg-zinc-300 dark:bg-white/10"
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

      {/* Time + frequency (only relevant when enabled) */}
      <div
        className={`mt-8 space-y-6 transition-opacity ${
          enabled ? "opacity-100" : "opacity-40 pointer-events-none"
        }`}
      >
        <section>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-3">
            Time
          </p>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value || DEFAULT_TIME)}
            className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-3 py-2 text-lg font-mono tabular-nums text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500"
          />
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            In your local timezone.
          </p>
        </section>

        <section>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-3">
            Frequency
          </p>
          <div className="flex gap-2">
            {(["DAILY", "WEEKDAYS", "CUSTOM"] as Frequency[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFrequency(f)}
                aria-pressed={frequency === f}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  frequency === f
                    ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-500"
                    : "border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20"
                }`}
              >
                {f === "DAILY" ? "Daily" : f === "WEEKDAYS" ? "Weekdays" : "Custom"}
              </button>
            ))}
          </div>

          {frequency === "CUSTOM" && (
            <div className="mt-4 flex gap-1.5">
              {DAYS.map((d) => {
                const on = custom.includes(d.i);
                return (
                  <button
                    key={d.i}
                    type="button"
                    onClick={() => toggleCustomDay(d.i)}
                    aria-pressed={on}
                    className={`h-9 w-9 rounded-full text-xs font-semibold transition ${
                      on
                        ? "bg-violet-600 text-white"
                        : "bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <p className="mt-8 text-xs text-zinc-400 dark:text-zinc-500">
        &ldquo;Not now&rdquo; is a fine answer too — nothing breaks if you skip.
      </p>
    </div>
  );
}
