"use client";

import { Flame } from "lucide-react";
import { useMemo } from "react";

import { milestoneTier, type MilestoneTier } from "@acuity/shared";

/**
 * Streak milestone celebration. Renders inside the FocusCardStack —
 * type: 'milestone' per the card API. Tier-aware:
 *   small   (3, 60)         — standard card, subtle
 *   medium  (7, 14, 30)     — bolder number, accent color
 *   big     (100)           — full-bleed gradient, confetti
 *   biggest (365)           — gold + sustained confetti
 *
 * Copy is Acuity voice — honest, direct, not cheerleader-y.
 */
export function MilestoneCard({ milestone }: { milestone: number }) {
  const tier = milestoneTier(milestone);
  const copy = MILESTONE_COPY[milestone] ?? MILESTONE_COPY_DEFAULT;

  if (tier === "small" || tier === "medium") {
    return <StandardMilestone milestone={milestone} tier={tier} copy={copy} />;
  }
  return <HeroMilestone milestone={milestone} tier={tier} copy={copy} />;
}

function StandardMilestone({
  milestone,
  tier,
  copy,
}: {
  milestone: number;
  tier: MilestoneTier;
  copy: { title: string; body: string };
}) {
  const accent =
    tier === "medium"
      ? "text-orange-600 dark:text-orange-400"
      : "text-zinc-700 dark:text-zinc-200";
  return (
    <div className="pr-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-orange-600 dark:text-orange-400">
        Streak milestone
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <Flame
          className={`h-7 w-7 ${tier === "medium" ? "text-orange-500" : "text-orange-400"}`}
          aria-hidden="true"
        />
        <span className={`text-3xl font-bold tabular-nums ${accent}`}>
          {milestone}
        </span>
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          {milestone === 1 ? "day" : "days"}
        </span>
      </div>
      <h3 className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        {copy.title}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        {copy.body}
      </p>
    </div>
  );
}

function HeroMilestone({
  milestone,
  tier,
  copy,
}: {
  milestone: number;
  tier: MilestoneTier;
  copy: { title: string; body: string };
}) {
  // Full-bleed treatment overrides the plain white card wrap. We
  // intentionally ignore the parent's p-5 so the gradient reaches the
  // card edges — the stack card already has rounded-2xl which we
  // match on an absolute overlay.
  const isBiggest = tier === "biggest";
  const gradient = isBiggest
    ? "from-amber-200 via-yellow-100 to-white dark:from-amber-900/40 dark:via-amber-900/20 dark:to-zinc-900/40"
    : "from-orange-200 via-rose-100 to-white dark:from-orange-900/40 dark:via-rose-900/20 dark:to-zinc-900/40";
  const numberColor = isBiggest
    ? "text-amber-700 dark:text-amber-300"
    : "text-orange-700 dark:text-orange-300";

  return (
    <div className="relative pr-6">
      <div
        className={`pointer-events-none absolute -inset-5 -z-10 rounded-2xl bg-gradient-to-br ${gradient}`}
        aria-hidden="true"
      />
      <Confetti sustained={isBiggest} />
      <p
        className={`text-xs font-semibold uppercase tracking-widest ${isBiggest ? "text-amber-700 dark:text-amber-300" : "text-orange-700 dark:text-orange-300"}`}
      >
        {isBiggest ? "One full year" : "Milestone"}
      </p>
      <div className="mt-2 flex items-baseline gap-3">
        <Flame
          className={`h-10 w-10 ${isBiggest ? "text-amber-500" : "text-orange-500"}`}
          aria-hidden="true"
        />
        <span className={`text-5xl font-black tabular-nums ${numberColor}`}>
          {milestone}
        </span>
        <span className="text-base font-semibold text-zinc-500 dark:text-zinc-400">
          days
        </span>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {copy.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
        {copy.body}
      </p>
    </div>
  );
}

// ─── Confetti ───────────────────────────────────────────────────
// 24 absolutely-positioned dots, staggered via CSS animation delay.
// `sustained` drops the delay randomness and runs 4× longer for the
// 365-day card. Keyframes defined inline via <style> so this file
// is self-contained and we don't pollute the global stylesheet.

function Confetti({ sustained }: { sustained: boolean }) {
  const particles = useMemo(() => {
    const count = sustained ? 40 : 24;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100, // %
      delay: (Math.random() * (sustained ? 2 : 0.8)).toFixed(2), // s
      dur: (sustained ? 3.5 : 2 + Math.random() * 1).toFixed(2), // s
      hue: Math.floor(Math.random() * 360),
      size: 6 + Math.floor(Math.random() * 6),
    }));
  }, [sustained]);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <style>{`
        @keyframes acuity-confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 0; }
          10%  { opacity: 1; }
          100% { transform: translateY(220px) rotate(540deg); opacity: 0; }
        }
      `}</style>
      {particles.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            backgroundColor: `hsl(${p.hue}, 85%, 65%)`,
            borderRadius: p.size > 9 ? "2px" : "50%",
            animation: `acuity-confetti-fall ${p.dur}s ease-out ${p.delay}s ${sustained ? "2" : "1"}`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}

// ─── Copy ───────────────────────────────────────────────────────
// Acuity voice: honest, direct, observational. Not "🎉 AMAZING JOB!"
// Not "You're a rockstar!" Just what this streak means.

const MILESTONE_COPY: Record<number, { title: string; body: string }> = {
  3: {
    title: "It's starting to stick.",
    body: "Three nights in a row. Momentum isn't magic — it's the third day looking like the first.",
  },
  7: {
    title: "A full week.",
    body: "You've shown up seven nights. Acuity has enough to start noticing things about you.",
  },
  14: {
    title: "Two weeks of showing up.",
    body: "This is where most people quit. You didn't. Your Day 14 Life Audit is ready whenever you are.",
  },
  30: {
    title: "A month of nightly debriefs.",
    body: "Thirty days of data is when patterns stop being noise. Acuity's Life Matrix is actually tracking your life now — not extrapolating.",
  },
  60: {
    title: "Two months in.",
    body: "The habit is yours, not ours. Keep going.",
  },
  100: {
    title: "One hundred days.",
    body: "Most apps never see a number like this from most users. The only person who built it is you.",
  },
  365: {
    title: "A full year of nightly reflections.",
    body: "Three hundred and sixty-five nights. Nobody can take that back. Your first annual review is already writing itself.",
  },
};

const MILESTONE_COPY_DEFAULT = {
  title: "Streak milestone",
  body: "Another day on the board. Acuity sees you.",
};
