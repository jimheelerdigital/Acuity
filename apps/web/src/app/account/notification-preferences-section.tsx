"use client";

import { useEffect, useState } from "react";

import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_GROUPS,
  NOTIFICATION_TONES,
  defaultNotificationPreferences,
  type NotificationCategory,
  type NotificationPreferences,
  type NotificationTone,
} from "@acuity/shared";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Notifications settings — web surface (email channel only).
 *
 * Web has no push, so this renders a single "Email notifications"
 * master toggle plus per-category opt-ins, a tone selector, quiet
 * hours, and a 7-day snooze. Every change persists immediately via
 * PUT to /api/account/notification-preferences with an optimistic
 * local update (revert-on-failure).
 *
 * Voice: mirror, not coach. No fixed-time language, no recording-
 * duration claims — copy mirrors the shared category descriptions.
 */
export function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/account/notification-preferences", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.preferences) setPrefs(d.preferences as NotificationPreferences);
        else setPrefs(defaultNotificationPreferences());
        setLoaded(true);
      })
      .catch(() => {
        setPrefs(defaultNotificationPreferences());
        setLoaded(true);
      });
  }, []);

  /**
   * Optimistically apply `patch` locally, then PUT the changed
   * field(s). On failure, revert to the prior snapshot.
   */
  async function persist(patch: Partial<NotificationPreferences>) {
    if (!prefs) return;
    const prior = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    try {
      const res = await fetch("/api/account/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        setPrefs(prior);
      } else {
        const d = await res.json().catch(() => null);
        if (d?.preferences) setPrefs(d.preferences as NotificationPreferences);
      }
    } catch {
      setPrefs(prior);
    } finally {
      setSaving(false);
    }
  }

  function toggleCategory(key: NotificationCategory, on: boolean) {
    if (!prefs) return;
    const set = new Set(prefs.enabledCategories);
    if (on) set.add(key);
    else set.delete(key);
    void persist({ enabledCategories: Array.from(set) });
  }

  function pauseSevenDays() {
    void persist({ pausedUntil: new Date(Date.now() + SEVEN_DAYS_MS).toISOString() });
  }

  function resume() {
    void persist({ pausedUntil: null });
  }

  if (!loaded || !prefs) {
    return (
      <section className="mt-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-acuity-card-bg p-6">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Notifications
        </h2>
        <div className="mt-4 h-4 w-32 rounded bg-zinc-100 dark:bg-white/5 animate-pulse" />
      </section>
    );
  }

  const emailOn = prefs.emailEnabled;
  // When email is off, the only channel on web is off — dim the rest.
  const dimmed = !emailOn ? "opacity-40 pointer-events-none" : "opacity-100";

  const pausedUntilDate = prefs.pausedUntil ? new Date(prefs.pausedUntil) : null;
  const isPaused =
    pausedUntilDate !== null && pausedUntilDate.getTime() > Date.now();

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-acuity-card-bg p-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Notifications
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Choose what Ripple reaches out about, and when. Everything here is
        optional and easy to turn off.
      </p>

      {/* Master email toggle — the only channel on web. */}
      <div className="mt-5">
        <ToggleRow
          label="Email notifications"
          sub="The only channel on the web. Turn off to mute everything here."
          checked={emailOn}
          disabled={saving}
          onChange={(v) => void persist({ emailEnabled: v })}
        />
      </div>

      {/* Category groups */}
      <div className={`mt-6 space-y-7 transition-opacity ${dimmed}`}>
        {NOTIFICATION_GROUPS.map((g) => {
          const cats = NOTIFICATION_CATEGORIES.filter((c) => c.group === g.key);
          return (
            <div key={g.key}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {g.heading}
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {g.subheading}
              </p>
              <div className="mt-3 space-y-4">
                {cats.map((c) => (
                  <ToggleRow
                    key={c.key}
                    label={c.label}
                    sub={c.description}
                    checked={prefs.enabledCategories.includes(c.key)}
                    disabled={saving || !emailOn}
                    onChange={(v) => toggleCategory(c.key, v)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Tone */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Tone
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            How these messages read.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {NOTIFICATION_TONES.map((t) => {
              const active = prefs.tone === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={saving || !emailOn}
                  onClick={() => void persist({ tone: t.value as NotificationTone })}
                  className={
                    "rounded-full px-4 py-1.5 text-xs font-medium transition disabled:opacity-40 " +
                    (active
                      ? "bg-acuity-primary text-white"
                      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-acuity-card-bg dark:text-zinc-200 dark:hover:bg-white/5")
                  }
                  title={t.description}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quiet hours */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Quiet hours
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            We won&apos;t send anything during these hours.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                From
              </label>
              <input
                type="time"
                value={prefs.quietHoursStart}
                disabled={saving || !emailOn}
                onChange={(e) =>
                  void persist({ quietHoursStart: e.target.value || prefs.quietHoursStart })
                }
                className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#13131F] px-3 py-1.5 text-sm font-mono text-zinc-900 dark:text-zinc-100 outline-none focus:border-acuity-primary disabled:opacity-40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                Until
              </label>
              <input
                type="time"
                value={prefs.quietHoursEnd}
                disabled={saving || !emailOn}
                onChange={(e) =>
                  void persist({ quietHoursEnd: e.target.value || prefs.quietHoursEnd })
                }
                className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#13131F] px-3 py-1.5 text-sm font-mono text-zinc-900 dark:text-zinc-100 outline-none focus:border-acuity-primary disabled:opacity-40"
              />
            </div>
          </div>
        </div>

        {/* Snooze */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Pause
          </h3>
          {isPaused && pausedUntilDate ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-sm text-zinc-600 dark:text-zinc-300">
                Paused until{" "}
                {pausedUntilDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <button
                type="button"
                disabled={saving || !emailOn}
                onClick={resume}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-acuity-card-bg dark:text-zinc-200 dark:hover:bg-white/5 disabled:opacity-40"
              >
                Resume
              </button>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Take a break without changing your settings.
              </p>
              <button
                type="button"
                disabled={saving || !emailOn}
                onClick={pauseSevenDays}
                className="mt-3 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-acuity-card-bg dark:text-zinc-200 dark:hover:bg-white/5 disabled:opacity-40"
              >
                Pause for 7 days
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Reusable toggle row — mirrors the PrefRow in account-client.tsx so
 * the switch visual language matches the Email digests section exactly.
 */
function ToggleRow({
  label,
  sub,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {label}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${
          checked ? "bg-acuity-primary" : "bg-zinc-300 dark:bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
