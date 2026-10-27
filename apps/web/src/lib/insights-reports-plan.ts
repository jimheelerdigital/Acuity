/**
 * Pure helpers for the Insights v2 reports on the web /insights page
 * (2026-10-27). They mirror the iPhone cards' rules exactly, so the two
 * surfaces always agree about when a card shows:
 *
 *   - Your first read: only while Pattern Insights is still locked.
 *   - Lifts & drains: only once Pattern Insights unlocks AND the user has
 *     the Pro/trial entitlement (`canExtractEntries`), like the API route.
 *   - Follow-through, Open loops, How you talk: no gate; each hides itself
 *     below its own minimum-data threshold (rules in each report's lib).
 *
 * The unlock thresholds themselves come from the user's progression
 * (packages/shared/src/userProgression.ts), never hard-coded here.
 */
import {
  wrappedPeriodForCard,
  type WrappedPeriod,
  type WrappedSummary,
} from "@acuity/shared";

import type { FollowThroughReport } from "@/lib/follow-through";
import type { HowYouTalk } from "@/lib/how-you-talk";
import type { LiftsDrainsResult } from "@/lib/lifts-drains";
import type { OpenLoop } from "@/lib/open-loops";

export type ReportsPlan = {
  firstRead: boolean;
  liftsDrains: boolean;
  followThrough: boolean;
  openLoops: boolean;
  howYouTalk: boolean;
};

export function reportsPlan(input: {
  patternInsightsUnlocked: boolean;
  hasProEntitlement: boolean;
}): ReportsPlan {
  return {
    firstRead: !input.patternInsightsUnlocked,
    liftsDrains: input.patternInsightsUnlocked && input.hasProEntitlement,
    followThrough: true,
    openLoops: true,
    howYouTalk: true,
  };
}

/**
 * Resolve a loader, or null on any error. One card's failure must never
 * break the page; `onError` gets the label for logging.
 */
export async function failSoft<T>(
  load: () => Promise<T>,
  label: string,
  onError: (label: string, err: unknown) => void = () => {}
): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    onError(label, err);
    return null;
  }
}

// ── "Does this card render?" — same conditions as the mobile cards ────

export function showFollowThrough(r: FollowThroughReport | null | undefined): r is FollowThroughReport {
  return !!r;
}

export function showOpenLoops(loops: OpenLoop[] | null | undefined): loops is OpenLoop[] {
  return Array.isArray(loops) && loops.length > 0;
}

export function showLiftsDrains(d: LiftsDrainsResult | null | undefined): d is LiftsDrainsResult {
  return !!d && (d.lifts.length > 0 || d.drains.length > 0);
}

export function showHowYouTalk(d: HowYouTalk | null | undefined): d is HowYouTalk {
  return !!d && d.enoughData && d.shifts.length > 0;
}

export function showWrapped(w: WrappedSummary | null | undefined): w is WrappedSummary {
  return !!w && w.eligible;
}

// ── Copy helpers shared by the cards ──────────────────────────────────

/** "same day" / "1 day" / "4 days" — the follow-through finish times. */
export function finishTimeLabel(days: number): string {
  if (days < 1) return "same day";
  const r = Math.round(days);
  return `${r} day${r === 1 ? "" : "s"}`;
}

/** Whole numbers stay whole; otherwise one decimal ("6.5"). */
export function formatAverage(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Title + one-line summary for the Wrapped entry card (as in the app). */
export function wrappedCardCopy(w: WrappedSummary): { title: string; sub: string } {
  const title =
    w.period.kind === "year"
      ? `${w.period.label}, wrapped`
      : `Your ${w.period.label.split(" ")[0]}, wrapped`;
  const sub = [
    `${w.entries} debriefs`,
    w.topThemes[0] ? `mostly ${w.topThemes[0].theme.toLowerCase()}` : null,
    w.habitStreak ? `${w.habitStreak.days}-day streak` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { title, sub };
}

/**
 * Which recap /insights/wrapped shows with no `period` in the URL: the one
 * the Insights card would offer today, otherwise last month.
 */
export function defaultWrappedPeriod(today: string): WrappedPeriod {
  const offered = wrappedPeriodForCard(today);
  if (offered) return offered;
  const [y, m] = today.split("-").map(Number);
  return m === 1 ? { kind: "month", year: y - 1, month: 12 } : { kind: "month", year: y, month: m - 1 };
}
