import type { NotificationCategory } from "@acuity/shared";

/**
 * Smart-notifications scheduler constants (PR 2). See
 * docs/specs/smart-notifications-pr2-spec.md.
 */

/**
 * Categories that actually SEND in PR 2: the default-ON activity signals,
 * which reference no inferred/extracted content and therefore need no safety
 * filter. The four opt-in categories (goal/task/theme/life-area) reference
 * content Acuity inferred from speech and stay dark until PR 3 ships the
 * 3-layer safety filter.
 */
export const PR2_LIVE_CATEGORIES: readonly NotificationCategory[] = [
  "milestone_celebration",
  "streak_preservation",
  "habit_reminder",
];

/**
 * Candidate priority when more than one category fires for a user in a tick
 * (earlier = higher). Full 7-category order so PR 3 slots in without changes;
 * PR 2 only ever picks from the three live categories above.
 *  - milestone: fresh win, decays fast → celebrate first
 *  - streak: expires tonight → save it next
 *  - task/goal: specific user items
 *  - theme/life-area: inferred patterns
 *  - habit: contentless fallback, lowest value
 */
export const NOTIFICATION_PRIORITY: readonly NotificationCategory[] = [
  "milestone_celebration",
  "streak_preservation",
  "task_reminder",
  "goal_nudge",
  "theme_followup",
  "life_area_check",
  "habit_reminder",
];

/** Default send hour (user-local) when we can't derive a preferred hour. */
export const FALLBACK_HOUR_LOCAL = 19; // 7pm — most journaling is evening

/** Below this many entries in 30d, don't trust a derived "preferred hour". */
export const MIN_ENTRIES_FOR_SMART_TIMING = 5;

/** streak_preservation: only nudge a streak of at least this length. */
export const STREAK_MIN = 3;

/** streak_preservation evening window (user-local hours, inclusive). */
export const STREAK_EVENING_START_HOUR = 18;
export const STREAK_EVENING_END_HOUR = 20;

/** milestone_celebration: only celebrate unlocks newer than this. */
export const MILESTONE_RECENCY_HOURS = 24;

/** Fallback timezone when neither prefs nor User carry one. */
export const DEFAULT_TIMEZONE = "America/Chicago";
