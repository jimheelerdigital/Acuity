"use client";

// TODO: wire to persist UserOnboarding.lifeAreaPriorities as
//   { CAREER: 3, HEALTH: 5, ... } on a 1-5 scale.
//
// Feeds the Life Matrix insight prompts: the weekly report weighting
// can bias toward high-priority areas (if CAREER=5 and HEALTH=2, the
// narrative should spend more words on career observations when both
// show signal). Ask a copywriter before implementing the weighting —
// it's easy to over-index on stated priorities and under-serve the
// user's actual needs.
//
// UX: one row per area, each a 5-dot radio strip. No "Not important"
// — every area is at least 1. Defaults to 3 ("neutral/interested")
// for all areas; user drags the dots they care about.
import { useState } from "react";

import {
  DEFAULT_LIFE_AREAS,
  type LifeArea,
} from "@acuity/shared";

const LEVELS = [1, 2, 3, 4, 5] as const;

export function Step6LifeAreaPriorities() {
  const [priorities, setPriorities] = useState<Record<string, number>>(() => {
    // Default every area to "interested" (3)
    const initial: Record<string, number> = {};
    for (const a of DEFAULT_LIFE_AREAS) initial[a.enum] = 3;
    return initial;
  });

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
        Which of these matter most to you?
      </h1>
      <p className="mt-3 text-base text-zinc-500">
        One dot means &ldquo;background attention&rdquo;. Five means &ldquo;this
        is what I&rsquo;m here to work on&rdquo;.
      </p>

      <div className="mt-8 space-y-4">
        {DEFAULT_LIFE_AREAS.map((area) => {
          const current = priorities[area.enum] ?? 3;
          return (
            <div
              key={area.enum}
              className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4"
            >
              <div className="flex-1">
                <p className="text-sm font-semibold text-zinc-900">
                  {area.name}
                </p>
              </div>
              <div className="flex gap-1.5">
                {LEVELS.map((level) => (
                  <button
                    key={level}
                    onClick={() =>
                      setPriorities((prev) => ({
                        ...prev,
                        [area.enum]: level,
                      }))
                    }
                    className={`h-3 w-3 rounded-full transition ${
                      current >= level
                        ? "bg-violet-500"
                        : "bg-zinc-200 hover:bg-zinc-300"
                    }`}
                    aria-label={`Set ${area.name} priority to ${level}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
