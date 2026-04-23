"use client";

import { useEffect, useState } from "react";

import { moodLabelForScore } from "@acuity/shared";

/**
 * 10-point mood slider. Therapy-app style — muted red → amber → soft
 * green gradient. The current value renders prominently above the
 * thumb as "N/10" with a short label ("Good", "Okay", etc.).
 *
 * Replaces the legacy 5-emoji button row. Callers receive the
 * numeric 1-10 value; consumers that need the enum form call
 * moodBucketFromScore() from @acuity/shared.
 *
 * Accessibility: standard HTML range input, arrow keys work natively,
 * aria-valuenow + aria-valuetext populated for screen readers.
 */
export function MoodSlider({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (v: number) => void;
  /** Screen-reader label describing what this slider is measuring
   *  (e.g. "Mood baseline"). Rendered sr-only. */
  label?: string;
}) {
  // Local state mirrors the prop so the thumb can move smoothly while
  // dragging without round-tripping through the parent.
  const [local, setLocal] = useState<number>(value ?? 5);

  useEffect(() => {
    if (value != null) setLocal(value);
  }, [value]);

  const committed = value != null;
  const displayValue = committed ? local : 5;

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-2">
        <span
          className={`text-3xl font-bold tabular-nums ${committed ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-400 dark:text-zinc-600"}`}
          aria-hidden="true"
        >
          {displayValue}
          <span className="text-lg font-medium text-zinc-400 dark:text-zinc-500">
            /10
          </span>
        </span>
        <span
          className={`text-sm font-medium ${committed ? "text-zinc-600 dark:text-zinc-300" : "text-zinc-400 dark:text-zinc-600"}`}
        >
          {committed ? moodLabelForScore(local) : "Slide to set"}
        </span>
      </div>

      {/* Gradient track lives behind the native range input — the
          input's track is set transparent so the gradient shows
          through. */}
      <div className="relative">
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-gradient-to-r from-rose-300 via-amber-200 to-emerald-300 dark:from-rose-400/40 dark:via-amber-300/40 dark:to-emerald-400/40"
          aria-hidden="true"
        />
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={displayValue}
          onChange={(e) => {
            const n = Number(e.target.value);
            setLocal(n);
            onChange(n);
          }}
          aria-label={label ?? "Mood"}
          aria-valuenow={displayValue}
          aria-valuetext={`${displayValue} out of 10 — ${moodLabelForScore(displayValue)}`}
          className="relative z-10 w-full h-11 bg-transparent appearance-none cursor-pointer [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-zinc-900 dark:[&::-webkit-slider-thumb]:bg-zinc-100 dark:[&::-webkit-slider-thumb]:border-zinc-200 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:mt-[-11px] [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-zinc-900 [&::-moz-range-thumb]:shadow-md focus:outline-none focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-violet-500"
        />
      </div>

      <div className="mt-2 flex justify-between text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        <span>Rough</span>
        <span>Okay</span>
        <span>Strong</span>
      </div>
    </div>
  );
}
