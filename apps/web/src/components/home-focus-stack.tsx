"use client";

import { useMemo, useState } from "react";

import {
  type UnlockKey,
  type UserProgression,
} from "@acuity/shared";

import { FocusCardStack, type FocusCard } from "./focus-card-stack";

/**
 * Home-page card stack. Takes the UserProgression snapshot fetched by
 * the server, builds an ordered queue — one "unlock" card per
 * recentlyUnlocked key, ending with a "resting" card — and hands it
 * to FocusCardStack.
 *
 * Local state only tracks which cards the user has dismissed in this
 * session. Run 1 doesn't persist dismissals to the server: the
 * progression endpoint diffs from the stored snapshot, so on the
 * next mount recentlyUnlocked is already empty (snapshot was written
 * on the previous fetch). That gives us natural one-shot semantics
 * without a dismissal column.
 */
export function HomeFocusStack({ progression }: { progression: UserProgression }) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const cards = useMemo<FocusCard[]>(() => {
    const out: FocusCard[] = [];
    for (const key of progression.recentlyUnlocked) {
      const id = `unlock:${key}`;
      if (dismissedIds.has(id)) continue;
      out.push({
        id,
        type: "unlock",
        dismissible: true,
        render: () => <UnlockCard unlockKey={key} />,
      });
    }
    // Resting card always at the end. Run 2 will own this surface
    // (streak chip + focus copy); Run 1 renders a minimal placeholder.
    out.push({
      id: "resting",
      type: "resting",
      dismissible: false,
      render: () => <RestingCard progression={progression} />,
    });
    return out;
  }, [progression, dismissedIds]);

  return (
    <FocusCardStack
      cards={cards}
      onDismiss={(card) =>
        setDismissedIds((prev) => {
          if (prev.has(card.id)) return prev;
          const next = new Set(prev);
          next.add(card.id);
          return next;
        })
      }
    />
  );
}

const UNLOCK_TITLES: Record<UnlockKey, string> = {
  lifeMatrix: "Your Life Matrix just unlocked",
  goalSuggestions: "Goal Suggestions are live",
  patternInsights: "Pattern Insights unlocked",
  themeMap: "Your Theme Map is ready",
  weeklyReport: "Your first Weekly Report is queued",
  lifeAudit: "Your Day 14 Life Audit is ready",
};

const UNLOCK_BODIES: Record<UnlockKey, string> = {
  lifeMatrix: "Acuity now has enough entries across enough life areas to show meaningful scores. Swipe to acknowledge.",
  goalSuggestions: "Acuity will propose goals from your recordings. Review them on the Goals page.",
  patternInsights: "Acuity starts calling out patterns it sees across your entries. Find them on the Insights page.",
  themeMap: "Your recurring themes now render as a constellation. Open the Theme Map from Insights.",
  weeklyReport: "A week of entries + day 7 means your first report is on the way.",
  lifeAudit: "Two weeks in. Acuity has generated a long-form letter from your own entries.",
};

const UNLOCK_HREFS: Record<UnlockKey, string> = {
  lifeMatrix: "/insights",
  goalSuggestions: "/goals",
  patternInsights: "/insights",
  themeMap: "/insights/theme-map",
  weeklyReport: "/insights",
  lifeAudit: "/insights",
};

function UnlockCard({ unlockKey }: { unlockKey: UnlockKey }) {
  return (
    <div className="pr-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
        Unlocked
      </p>
      <h3 className="mt-1.5 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {UNLOCK_TITLES[unlockKey]}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        {UNLOCK_BODIES[unlockKey]}
      </p>
      <a
        href={UNLOCK_HREFS[unlockKey]}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-500"
      >
        Take a look
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </a>
    </div>
  );
}

function RestingCard({ progression }: { progression: UserProgression }) {
  // Minimal placeholder — Run 2 fills in streak chip, focus copy,
  // tip bubbles. Intentionally spare for now so Run 2's design has
  // room without fighting this run's commit.
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        Day {progression.dayOfTrial} of your trial
      </p>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        {progression.isInTrial
          ? "Keep going — one recording a day is all Acuity needs."
          : "Your trial has wrapped. Acuity keeps working on what you've built."}
      </p>
    </div>
  );
}
