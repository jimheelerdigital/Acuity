/**
 * "Getting to know Acuity" 14-day discovery checklist. Surfaces as a
 * small card on Home for new users. Items unlock progressively (by
 * days-since-signup) — cheap-to-detect items auto-complete from
 * server state; the rest require a manual tap to mark.
 *
 * Items are NOT feature gates. A user who never touches the checklist
 * gets everything that's in it anyway; this is discovery, not onboarding.
 */

export type ProgressionItemKey =
  | "day1"
  | "day2"
  | "day3"
  | "day5"
  | "day7"
  | "day10"
  | "day14";

export interface ProgressionItem {
  key: ProgressionItemKey;
  unlockAfterDays: number;
  title: string;
  description: string;
  /** Route to navigate to when user taps. Relative path. */
  href: string;
  /** True if state alone tells us it's done (entry exists, report exists, etc.). */
  autoComplete: "entry-exists" | "weekly-report-exists" | "life-audit-exists" | null;
}

export const PROGRESSION_ITEMS: ProgressionItem[] = [
  {
    key: "day1",
    unlockAfterDays: 0,
    title: "Record your first brain dump",
    description: "Tap the mic. Talk for sixty seconds.",
    href: "/record",
    autoComplete: "entry-exists",
  },
  {
    key: "day2",
    unlockAfterDays: 1,
    title: "Review your first transcript",
    description: "See what Acuity pulled from your words.",
    href: "/entries",
    autoComplete: null,
  },
  {
    key: "day3",
    unlockAfterDays: 2,
    title: "Check your Life Matrix",
    description: "Six areas, scored from your own words.",
    href: "/insights",
    autoComplete: null,
  },
  {
    key: "day5",
    unlockAfterDays: 4,
    title: "Set your first goal",
    description: "Something you'd like Acuity to help you track.",
    href: "/goals",
    autoComplete: null,
  },
  {
    key: "day7",
    unlockAfterDays: 6,
    title: "Read your first weekly report",
    description: "The pattern of your first week.",
    href: "/insights",
    autoComplete: "weekly-report-exists",
  },
  {
    key: "day10",
    unlockAfterDays: 9,
    title: "Explore a theme",
    description: "Click a recurring theme on Insights.",
    href: "/insights",
    autoComplete: null,
  },
  {
    key: "day14",
    unlockAfterDays: 13,
    title: "Take your Life Audit",
    description: "A long-form letter from your own entries.",
    href: "/insights",
    autoComplete: "life-audit-exists",
  },
];

export const PROGRESSION_HIDE_AFTER_DAYS = 14;

/** Stored JSON shape on UserOnboarding.progressionChecklist. */
export interface ProgressionState {
  dismissedAt: string | null;
  items: Partial<Record<ProgressionItemKey, string | null>>;
}

/** Items visible (unlocked) as of the given date. */
export function visibleProgressionItems(
  createdAt: Date,
  now: Date = new Date()
): ProgressionItem[] {
  const ageDays = Math.floor(
    (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000)
  );
  return PROGRESSION_ITEMS.filter((item) => ageDays >= item.unlockAfterDays);
}

/** True once we should stop rendering the checklist entirely. */
export function progressionChecklistExpired(
  createdAt: Date,
  now: Date = new Date()
): boolean {
  const ageDays = Math.floor(
    (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000)
  );
  return ageDays >= PROGRESSION_HIDE_AFTER_DAYS;
}
