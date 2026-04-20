"use client";

// TODO: wire to persist UserOnboarding.moodBaseline (one of the 5
// canonical Mood values). Seeds the Life Matrix starting baseline so
// day-1 insights aren't drawing against a zero (which currently shows
// "thriving" for everyone because the default score is 5/10).
//
// Consider: a 7-point slider instead of 5 buckets. Product spec
// reviewers should decide — the Mood enum is 5-bucket, but the
// baseline question could accept finer-grained input and bucket
// later. Keeping simple for now.
import { useState } from "react";

import { MOOD_EMOJI, MOOD_LABELS, type Mood } from "@acuity/shared";

const MOOD_ORDER: Mood[] = ["ROUGH", "LOW", "NEUTRAL", "GOOD", "GREAT"];

export function Step5MoodBaseline() {
  const [selected, setSelected] = useState<Mood | null>(null);

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
        How&rsquo;s your baseline lately?
      </h1>
      <p className="mt-3 text-base text-zinc-500">
        Not today specifically. The average of the last couple of weeks.
        Don&rsquo;t overthink it — you can always refine later.
      </p>

      <div className="mt-10 flex justify-between gap-2">
        {MOOD_ORDER.map((mood) => (
          <button
            key={mood}
            onClick={() => setSelected(mood)}
            className={`flex flex-1 flex-col items-center gap-2 rounded-xl border p-4 transition ${
              selected === mood
                ? "border-violet-500 bg-violet-50"
                : "border-zinc-200 bg-white hover:border-zinc-300"
            }`}
          >
            <span className="text-3xl">{MOOD_EMOJI[mood]}</span>
            <span className="text-xs font-medium text-zinc-700">
              {MOOD_LABELS[mood]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
