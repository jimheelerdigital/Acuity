"use client";

/**
 * Slice C5c — editable calendar settings panel rendered inside the
 * connected-state card. Surfaces:
 *   - autoSendTasks toggle
 *   - defaultEventDuration radio (All-day / Timed)
 *   - Target calendar (read-only display: "Currently syncing to: <id>")
 *     The full picker requires the EventKit list call (slice C6) and
 *     for now the user re-targets via the iOS app.
 *   - Disconnect button (calls /api/integrations/calendar/disconnect)
 *
 * Optimistic update on the toggle/radio — write locally, fire the
 * PATCH, revert on error. Disconnect uses a confirm dialog because
 * it blows away the connection state entirely (preferences are
 * preserved server-side per the disconnect route's contract).
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Duration = "ALL_DAY" | "TIMED";

interface Props {
  initialAutoSendTasks: boolean;
  initialDefaultEventDuration: Duration;
  targetCalendarId: string | null;
}

export function IntegrationsSettings({
  initialAutoSendTasks,
  initialDefaultEventDuration,
  targetCalendarId,
}: Props) {
  const router = useRouter();
  const [autoSend, setAutoSend] = useState(initialAutoSendTasks);
  const [duration, setDuration] = useState<Duration>(
    initialDefaultEventDuration
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  async function patchSetting(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/api/integrations/calendar/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? "Save failed");
      return false;
    }
    return true;
  }

  function handleAutoSendToggle() {
    const next = !autoSend;
    setAutoSend(next);
    setError(null);
    startTransition(async () => {
      const ok = await patchSetting({ autoSendTasks: next });
      if (!ok) setAutoSend(!next); // revert on error
    });
  }

  function handleDurationChange(next: Duration) {
    if (next === duration) return;
    const prev = duration;
    setDuration(next);
    setError(null);
    startTransition(async () => {
      const ok = await patchSetting({ defaultEventDuration: next });
      if (!ok) setDuration(prev);
    });
  }

  async function handleDisconnect() {
    const ok = window.confirm(
      "Disconnect your calendar? Acuity stops sending new tasks to your calendar. Events already created stay where they are. Your preferences are remembered if you reconnect."
    );
    if (!ok) return;
    setIsDisconnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/calendar/disconnect", {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Disconnect failed");
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setIsDisconnecting(false);
    }
  }

  return (
    <div className="mt-4 space-y-5">
      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
          {error}
        </p>
      )}

      {/* autoSendTasks */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Auto-send tasks
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            When on, new tasks with due dates show up on your calendar
            automatically. When off, you tap &ldquo;Send to calendar&rdquo;
            on each task instead.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={autoSend}
          onClick={handleAutoSendToggle}
          disabled={isPending}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            autoSend ? "bg-violet-500" : "bg-zinc-300 dark:bg-zinc-600"
          } ${isPending ? "opacity-60" : ""}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              autoSend ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* defaultEventDuration */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Default event duration
        </legend>
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          How tasks land on your calendar when you don&apos;t specify a
          time. You can override per-task on iOS.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <DurationRadio
            value="TIMED"
            current={duration}
            label="Timed (1h)"
            description="Blocks an hour on your day"
            onSelect={handleDurationChange}
            disabled={isPending}
          />
          <DurationRadio
            value="ALL_DAY"
            current={duration}
            label="All-day"
            description="Banner across the whole day"
            onSelect={handleDurationChange}
            disabled={isPending}
          />
        </div>
      </fieldset>

      {/* targetCalendarId — read-only stub until C6 lands the EventKit list call */}
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Target calendar
        </p>
        <div className="mt-2 rounded-md bg-zinc-50 dark:bg-white/5 px-3 py-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Currently syncing to:
          </p>
          <p className="mt-0.5 font-mono text-xs text-zinc-700 dark:text-zinc-200">
            {targetCalendarId ?? "—"}
          </p>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
          Choose a different calendar from the iOS app today. The web
          picker ships once Acuity reads your calendar list directly.
        </p>
      </div>

      {/* Disconnect */}
      <div className="border-t border-zinc-200 pt-4 dark:border-white/10">
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={isDisconnecting}
          className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400"
        >
          {isDisconnecting ? "Disconnecting…" : "Disconnect calendar"}
        </button>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
          Stops new sync. Existing calendar events stay where they
          are. Your preferences are remembered if you reconnect.
        </p>
      </div>
    </div>
  );
}

function DurationRadio({
  value,
  current,
  label,
  description,
  onSelect,
  disabled,
}: {
  value: Duration;
  current: Duration;
  label: string;
  description: string;
  onSelect: (v: Duration) => void;
  disabled: boolean;
}) {
  const checked = value === current;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={() => onSelect(value)}
      disabled={disabled}
      className={`rounded-lg border px-3 py-2.5 text-left transition ${
        checked
          ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
          : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <p
        className={`text-sm font-medium ${
          checked
            ? "text-violet-700 dark:text-violet-300"
            : "text-zinc-900 dark:text-zinc-50"
        }`}
      >
        {label}
      </p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
    </button>
  );
}
