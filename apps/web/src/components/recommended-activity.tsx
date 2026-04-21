"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * "Try this today" card — shows a daily journal prompt picked by the
 * server. The prompt is tiered — goal-based > pattern-based > library
 * fallback — with the tier label shown above the prompt ("Building on
 * your goals" / "Based on your recent themes" / "Today's prompt").
 * Dismissible; dismiss persists for 24h in localStorage so the same
 * card doesn't reappear on reload.
 *
 * Back-compat: the older `prompt` prop-only shape still works; callers
 * that haven't migrated get the "Today's prompt" label by default.
 */

const DISMISS_KEY = "acuity_prompt_dismissed_until";

export function RecommendedActivity({
  prompt,
  label,
  goalId,
}: {
  prompt: string;
  /** Tier label e.g. "Building on your goals". Defaults to "Try this today". */
  label?: string;
  /** Tier-1 goal anchor — when present, the CTA deep-links into the goal's
   *  detail page so the user can record a reflection in context. */
  goalId?: string;
}) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      const until = window.localStorage.getItem(DISMISS_KEY);
      if (!until) {
        setHidden(false);
        return;
      }
      const untilMs = Number(until);
      if (Number.isFinite(untilMs) && untilMs > Date.now()) {
        setHidden(true);
      } else {
        window.localStorage.removeItem(DISMISS_KEY);
        setHidden(false);
      }
    } catch {
      setHidden(false);
    }
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    try {
      const until = Date.now() + 24 * 60 * 60 * 1000;
      window.localStorage.setItem(DISMISS_KEY, String(until));
    } catch {
      // ignore
    }
    setHidden(true);
  };

  const ctaHref = goalId ? `/goals/${goalId}` : "/dashboard#record";

  return (
    <section className="mb-8 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm dark:border-violet-900/30 dark:from-violet-950/20 dark:to-[#1E1E2E]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
            {label ?? "Try this today"}
          </h2>
          <p className="mt-2 text-base font-medium leading-snug text-zinc-900 dark:text-zinc-50">
            {prompt}
          </p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-white/5"
        >
          Not today
        </button>
      </div>
      <div className="mt-4">
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
          {goalId ? "Record about this goal" : "Record about this"}
        </Link>
      </div>
    </section>
  );
}
