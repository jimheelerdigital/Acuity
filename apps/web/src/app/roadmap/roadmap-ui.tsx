"use client";

import {
  ArrowUp,
  Flame,
  LayoutGrid,
  ListChecks,
  Map as MapIcon,
  NotebookPen,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  ROADMAP_CATEGORY_META,
  ROADMAP_DEFAULT_BANNER,
  ROADMAP_STATUS_META,
  type RoadmapCategory,
  type RoadmapStatus,
} from "@acuity/shared";

/**
 * Shared pieces for /roadmap and /roadmap/[id] (2026-10-19): the category
 * banner, the status pill and the vote button, so the board and the
 * detail page look and behave the same.
 */

const CATEGORY_ICON: Record<RoadmapCategory, LucideIcon> = {
  journaling: NotebookPen,
  tasks: ListChecks,
  habits: Flame,
  insights: Sparkles,
  widgets: LayoutGrid,
  account: UserRound,
};

export function CategoryBanner({
  category,
  size = "card",
}: {
  category: RoadmapCategory | null;
  size?: "card" | "hero";
}) {
  const colors = category ? ROADMAP_CATEGORY_META[category] : ROADMAP_DEFAULT_BANNER;
  const Icon = category ? CATEGORY_ICON[category] : MapIcon;
  const hero = size === "hero";
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${hero ? "h-40 rounded-3xl sm:h-48" : "h-24 rounded-t-2xl"}`}
      style={{ background: `linear-gradient(135deg, ${colors.from}, ${colors.to})` }}
      aria-hidden
    >
      <Icon className={hero ? "h-14 w-14 text-white/90" : "h-9 w-9 text-white/90"} strokeWidth={1.6} />
    </div>
  );
}

const PILL: Record<RoadmapStatus, string> = {
  building: "bg-acuity-primary-soft text-acuity-primary",
  planned: "bg-acuity-card-border text-acuity-text",
  considering: "bg-acuity-card-border text-acuity-text-sec",
  shipped: "bg-acuity-good/15 text-acuity-good",
};

export function StatusPill({ status }: { status: RoadmapStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[status]}`}>
      {ROADMAP_STATUS_META[status].label}
    </span>
  );
}

type VoteState = { id: string; title: string; votes: number; votedByMe: boolean };

/**
 * Optimistic upvote toggle. Signed-out visitors get a sign-in link that
 * returns them to `returnTo`.
 */
export function VoteButton({
  item,
  signedIn,
  returnTo,
  size = "compact",
  onChange,
}: {
  item: VoteState;
  signedIn: boolean;
  returnTo: string;
  size?: "compact" | "large";
  onChange?: (next: { votes: number; votedByMe: boolean }) => void;
}) {
  const [state, setState] = useState({ votes: item.votes, votedByMe: item.votedByMe });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError(null);
    const before = state;
    const optimistic = { votedByMe: !state.votedByMe, votes: state.votes + (state.votedByMe ? -1 : 1) };
    setState(optimistic);
    try {
      const res = await fetch(`/api/roadmap/${item.id}/vote`, { method: "POST" });
      if (!res.ok) throw new Error(res.status === 429 ? "Slow down a little. Try again in a bit." : "Couldn't save your vote.");
      const body = (await res.json()) as { voted: boolean; votes: number };
      const next = { votedByMe: body.voted, votes: body.votes };
      setState(next);
      onChange?.(next);
    } catch (e) {
      setState(before);
      setError(e instanceof Error ? e.message : "Couldn't save your vote.");
    } finally {
      setPending(false);
    }
  }

  const on = state.votedByMe;
  const tone = on
    ? "border-acuity-primary bg-acuity-primary-soft text-acuity-primary"
    : "border-acuity-card-border text-acuity-text-sec hover:border-acuity-primary hover:text-acuity-text";
  const shape =
    size === "large"
      ? "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold"
      : "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold";
  const label = size === "large" ? (on ? "You want this" : "I want this") : null;
  const body = (
    <>
      <ArrowUp className={size === "large" ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />
      {label ? <span>{label}</span> : null}
      <span className="tabular-nums">{state.votes}</span>
    </>
  );

  if (!signedIn) {
    return (
      <Link
        href={`/auth/signin?callbackUrl=${encodeURIComponent(returnTo)}`}
        className={`${shape} ${tone} transition`}
        aria-label={`Sign in to vote for ${item.title}`}
      >
        {body}
      </Link>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={pending}
        aria-pressed={on}
        aria-label={`${on ? "Remove vote for" : "Vote for"} ${item.title}`}
        className={`${shape} ${tone} transition disabled:opacity-60`}
      >
        {body}
      </button>
      {error ? <span className="text-xs text-acuity-bad">{error}</span> : null}
    </span>
  );
}
