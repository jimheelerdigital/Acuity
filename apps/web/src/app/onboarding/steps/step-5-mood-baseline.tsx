"use client";

import { useEffect, useState } from "react";

import { moodBucketFromScore } from "@acuity/shared";

import { MoodSlider } from "@/components/mood-slider";

import { useOnboarding } from "../onboarding-context";

/**
 * Step 5 — Mood baseline.
 *
 * Seeds the Life Matrix so day-1 insights aren't drawing against a
 * neutral-for-everyone default. The answer is a 1-10 self-rating —
 * therapy-app style — stored as moodBaselineNumeric on UserOnboarding,
 * with the bucketed string (GREAT/GOOD/NEUTRAL/LOW/ROUGH) written to
 * moodBaseline for legacy consumers (Life Audit prompt, memory).
 *
 * Skippable via the shell's Skip-this-step button. Continue is
 * disabled until the user touches the slider — no default post.
 */
export function Step5MoodBaseline() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    setCanContinue(value !== null);
    setCapturedData(
      value !== null
        ? {
            moodBaselineNumeric: value,
            moodBaseline: moodBucketFromScore(value),
          }
        : null
    );
  }, [value, setCanContinue, setCapturedData]);

  return (
    <div className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        How&rsquo;s your baseline lately?
      </h1>

      <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Not today specifically — the average of the last couple of
        weeks. One rating. Refine it later if it shifts.
      </p>

      <div className="mt-10">
        <MoodSlider
          value={value}
          onChange={(v) => setValue(v)}
          label="Mood baseline"
        />
      </div>

      <p className="mt-10 text-xs text-zinc-400 dark:text-zinc-500">
        No right answer. This shapes how Acuity reads your first
        week&rsquo;s entries against your own baseline instead of
        everyone else&rsquo;s.
      </p>
    </div>
  );
}
