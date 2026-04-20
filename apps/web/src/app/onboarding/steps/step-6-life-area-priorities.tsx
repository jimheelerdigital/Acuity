"use client";

import { useEffect, useMemo, useState } from "react";

import { DEFAULT_LIFE_AREAS, type LifeArea } from "@acuity/shared";

import { useOnboarding } from "../onboarding-context";

/**
 * Step 6 — Life area priorities.
 *
 * Tap-to-select top-3-of-6 ranking. First tap assigns rank 1, second
 * tap assigns rank 2, third assigns rank 3. Tapping a selected card
 * deselects it and compacts the remaining ranks (so a 1-3-4 picks
 * shifts to 1-2 after you deselect #2). Tapping an unselected card
 * when three are already picked is a no-op — the user must deselect
 * first. That's stricter than "replace the last one" but makes the
 * interaction predictable.
 *
 * Persistence: { [LifeArea]: 1|2|3 } written to
 * UserOnboarding.lifeAreaPriorities as Json. The weekly report + Day
 * 14 Life Audit read this to bias narrative weight toward the areas
 * the user said matter most, without over-indexing (see scaffold
 * note — product call pending from copywriter).
 *
 * Forced step: Continue is disabled until exactly 3 areas are
 * selected. No skip button for this step (not in the default
 * skippableSteps list); the top-right "Skip for now" link is still
 * available if the user really wants out.
 */
const REQUIRED_PICKS = 3;

type Picks = Partial<Record<LifeArea, number>>;

export function Step6LifeAreaPriorities() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  const [picks, setPicks] = useState<Picks>({});

  const count = useMemo(() => Object.keys(picks).length, [picks]);
  const isReady = count === REQUIRED_PICKS;

  useEffect(() => {
    setCanContinue(isReady);
    setCapturedData(isReady ? { lifeAreaPriorities: picks } : null);
  }, [isReady, picks, setCanContinue, setCapturedData]);

  function toggle(area: LifeArea) {
    setPicks((prev) => {
      const existing = prev[area];
      if (existing !== undefined) {
        // Deselect + compact the remaining ranks so they stay 1..n.
        const next: Picks = {};
        Object.entries(prev)
          .filter(([k]) => k !== area)
          .sort(([, a], [, b]) => (a ?? 0) - (b ?? 0))
          .forEach(([k], i) => {
            next[k as LifeArea] = i + 1;
          });
        return next;
      }
      // Adding a new pick. No-op if we're already at the cap.
      if (Object.keys(prev).length >= REQUIRED_PICKS) return prev;
      return { ...prev, [area]: Object.keys(prev).length + 1 };
    });
  }

  return (
    <div className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        What matters most right now?
      </h1>

      <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Pick three. In the order they matter. Your weekly reports
        lean on this to decide which threads to pull at first.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {DEFAULT_LIFE_AREAS.map((area) => {
          const rank = picks[area.enum];
          const isPicked = rank !== undefined;
          const isFull = count >= REQUIRED_PICKS && !isPicked;
          return (
            <button
              key={area.enum}
              onClick={() => toggle(area.enum)}
              disabled={isFull}
              aria-pressed={isPicked}
              className={`relative flex flex-col items-start rounded-2xl border p-4 text-left transition ${
                isPicked
                  ? "border-[#7C5CFC] bg-[#F7F5FF] shadow-sm"
                  : isFull
                    ? "cursor-not-allowed border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#13131F] opacity-50"
                    : "border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] hover:border-zinc-300 dark:hover:border-white/20 hover:shadow-sm"
              }`}
            >
              {/* Rank badge in the top-right corner */}
              {isPicked && (
                <span className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#7C5CFC] text-xs font-bold text-white">
                  {rank}
                </span>
              )}
              <div
                className="mb-2 h-2 w-6 rounded-full"
                style={{ backgroundColor: area.color }}
              />
              <p
                className={`text-sm font-semibold ${
                  isPicked ? "text-[#5B3FD6]" : "text-zinc-900 dark:text-zinc-50"
                }`}
              >
                {area.name}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {AREA_SUBTITLE[area.enum]}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {count} of {REQUIRED_PICKS} picked
          {count > 0 && count < REQUIRED_PICKS && " — one more"}
          {count === REQUIRED_PICKS && " — you\u2019re set."}
        </p>
        {count > 0 && (
          <button
            onClick={() => setPicks({})}
            className="text-xs text-zinc-400 dark:text-zinc-500 underline-offset-2 hover:underline"
          >
            Start over
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Short subtitle per area — one plain phrase each, no jargon. The
 * tone here has to match the landing page's "your own words" framing;
 * "personal development" or "physical wellness" would feel like a
 * corporate training module.
 */
const AREA_SUBTITLE: Record<LifeArea, string> = {
  CAREER: "work, craft, ambition",
  HEALTH: "body, sleep, energy",
  RELATIONSHIPS: "partner, family, friends",
  FINANCES: "money in, money out",
  PERSONAL: "self, meaning, growth",
  OTHER: "whatever doesn\u2019t fit above",
};
