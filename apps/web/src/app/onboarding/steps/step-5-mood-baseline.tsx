"use client";

import { useEffect, useState } from "react";

import { MOOD_EMOJI, MOOD_LABELS, type Mood } from "@acuity/shared";

import { useOnboarding } from "../onboarding-context";

/**
 * Step 5 — Mood baseline.
 *
 * Seeds the Life Matrix so day-1 insights aren't drawing against a
 * neutral-for-everyone default. The answer here doesn't anchor a
 * diagnosis; it just gives the first week's narrative a reference
 * point — "relative to where you said you were" — instead of an
 * absolute scale.
 *
 * Skippable via the shell's Skip-this-step button (step 5 is in the
 * default skippableSteps). Continue is disabled until a mood is
 * picked so a user who doesn't want to answer makes that choice
 * explicitly rather than accidentally posting null via a stray click.
 *
 * Ordering: worst-to-best. Reading left-to-right matches the way most
 * charts plot improvement over time; reversing it (best-to-worst)
 * implies a decline you don't want to prime.
 */
const MOOD_ORDER: Mood[] = ["ROUGH", "LOW", "NEUTRAL", "GOOD", "GREAT"];

const MOOD_HINTS: Record<Mood, string> = {
  GREAT: "Things are clicking.",
  GOOD: "Mostly steady.",
  NEUTRAL: "Fine, nothing remarkable.",
  LOW: "A little heavy lately.",
  ROUGH: "Hard stretch.",
};

export function Step5MoodBaseline() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  const [selected, setSelected] = useState<Mood | null>(null);

  useEffect(() => {
    setCanContinue(selected !== null);
    setCapturedData(selected ? { moodBaseline: selected } : null);
  }, [selected, setCanContinue, setCapturedData]);

  return (
    <div className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
        How&rsquo;s your baseline lately?
      </h1>

      <p className="mt-4 text-base leading-relaxed text-zinc-600">
        Not today specifically. The average of the last couple of weeks.
        One answer. Refine it later if it shifts.
      </p>

      <div className="mt-10 grid grid-cols-5 gap-2">
        {MOOD_ORDER.map((mood) => {
          const isSelected = selected === mood;
          return (
            <button
              key={mood}
              onClick={() => setSelected(mood)}
              className={`flex flex-col items-center gap-2 rounded-2xl border bg-white p-3 transition ${
                isSelected
                  ? "border-[#7C5CFC] bg-[#F7F5FF] shadow-sm"
                  : "border-zinc-200 hover:border-zinc-300"
              }`}
              aria-pressed={isSelected}
            >
              <span className="text-2xl">{MOOD_EMOJI[mood]}</span>
              <span
                className={`text-xs font-medium ${
                  isSelected ? "text-[#5B3FD6]" : "text-zinc-600"
                }`}
              >
                {MOOD_LABELS[mood]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Hint below the selected button — shows what that mood
          typically sounds like. Keeps the buckets short and the
          elaboration on demand. */}
      <div className="mt-6 min-h-[20px]">
        {selected && (
          <p
            key={selected}
            className="animate-fade-in text-sm text-zinc-500"
          >
            {MOOD_HINTS[selected]}
          </p>
        )}
      </div>

      <p className="mt-8 text-xs text-zinc-400">
        No right answer. This shapes how we read your first week&rsquo;s
        entries against your own baseline instead of everyone else&rsquo;s.
      </p>
    </div>
  );
}
