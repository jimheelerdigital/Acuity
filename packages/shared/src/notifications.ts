// ─── Smart notifications — shared categories, defaults & prefs shape ──────────
//
// Single source of truth for the engagement-notification system, consumed by
// web (email v1), iOS, and Android (push deferred to a later slice). Category
// keys, copy, and defaults MUST live here so the three surfaces can't drift —
// see docs/specs/smart-notifications-spec.md.
//
// Voice: mirror, not coach. Reflect, don't advise. No fixed-time language
// ("nightly", "before bed") and no recording-duration claims — see
// docs/acuity-positioning.md.

/** Stable category keys. Persisted in UserNotificationPreferences.enabledCategories. */
export type NotificationCategory =
  | "streak_preservation"
  | "habit_reminder"
  | "milestone_celebration"
  | "goal_nudge"
  | "task_reminder"
  | "theme_followup"
  | "life_area_check";

/** Voice of the copy the engine generates. Not "playful" — see spec §Locked. */
export type NotificationTone = "caring" | "direct";

/**
 * Grouping for the settings UI — the grouping IS the privacy rule, made
 * visible to the user via the group headings (NOTIFICATION_GROUPS):
 *  - "stay_on_track" → activity signals (default ON; nothing inferred from speech)
 *  - "personalized"  → inferred/extracted from entries (opt-in globally; safety filter applies)
 */
export type NotificationCategoryGroup = "stay_on_track" | "personalized";

export interface NotificationCategoryDef {
  key: NotificationCategory;
  /** Settings-row title. */
  label: string;
  /** Settings-row helper text — what the user will receive. */
  description: string;
  /** Whether this category is on for a brand-new user. */
  defaultOn: boolean;
  group: NotificationCategoryGroup;
}

/**
 * Ordered for display. default-ON = activity signals only
 * (streak/habit/milestone); opt-in = everything inferred or extracted from
 * entries (goal/task/theme/life-area). Single rule: inferred from speech => opt-in.
 */
export const NOTIFICATION_CATEGORIES: readonly NotificationCategoryDef[] = [
  {
    key: "streak_preservation",
    label: "Streak reminders",
    description: "A nudge when your recording streak is about to slip.",
    defaultOn: true,
    group: "stay_on_track",
  },
  {
    key: "habit_reminder",
    label: "Gentle reminders",
    description: "A reminder to debrief around when you usually do.",
    defaultOn: true,
    group: "stay_on_track",
  },
  {
    key: "milestone_celebration",
    label: "Milestones",
    description: "A note when you reach a meaningful milestone.",
    defaultOn: true,
    group: "stay_on_track",
  },
  {
    key: "goal_nudge",
    label: "Goal check-ins",
    description: "An occasional check-in on a goal you've set.",
    // Opt-in: goals are auto-created from voice entries, so a goal check-in
    // references something Acuity inferred from your speech. Single rule —
    // anything inferred from speech is opt-in. See the spec.
    defaultOn: false,
    group: "personalized",
  },
  {
    key: "task_reminder",
    label: "Task reminders",
    description: "A reminder about a task you've been meaning to get to.",
    // Opt-in: tasks are AI-extracted from voice (not typed), so quoting a
    // specific extracted task back to the user is opt-in. See the spec.
    defaultOn: false,
    group: "personalized",
  },
  {
    key: "theme_followup",
    label: "Theme follow-ups",
    description: "A follow-up on something that's been on your mind lately.",
    defaultOn: false,
    group: "personalized",
  },
  {
    key: "life_area_check",
    label: "Life-area check-ins",
    description: "A check-in when an area of your life seems to be slipping.",
    defaultOn: false,
    group: "personalized",
  },
];

export interface NotificationGroupDef {
  key: NotificationCategoryGroup;
  /** Section heading — written so the privacy rule is self-explanatory. */
  heading: string;
  /** One-line plain-language reinforcement under the heading. */
  subheading: string;
}

/**
 * Settings-screen sections, in display order. The headings carry the privacy
 * rule in plain language so no help link is needed — the opt-in group's
 * heading literally says "off by default". Web + mobile both render from this
 * so the copy can't drift.
 */
export const NOTIFICATION_GROUPS: readonly NotificationGroupDef[] = [
  {
    key: "stay_on_track",
    heading: "Stay on track",
    subheading:
      "Gentle nudges based on how you use Acuity — never on what you talked about.",
  },
  {
    key: "personalized",
    heading: "Personalized from your entries — off by default",
    subheading:
      "Anything Acuity picked up from what you said — goals, tasks, themes, life areas. Always your choice to turn on.",
  },
];

/** Keys that are on for a new user. */
export const DEFAULT_ENABLED_CATEGORIES: NotificationCategory[] =
  NOTIFICATION_CATEGORIES.filter((c) => c.defaultOn).map((c) => c.key);

const VALID_CATEGORY_KEYS: ReadonlySet<string> = new Set(
  NOTIFICATION_CATEGORIES.map((c) => c.key)
);

/** True if `key` is a known category. Use to filter untrusted client input. */
export function isNotificationCategory(
  key: string
): key is NotificationCategory {
  return VALID_CATEGORY_KEYS.has(key);
}

export const NOTIFICATION_TONES: ReadonlyArray<{
  value: NotificationTone;
  label: string;
  description: string;
}> = [
  {
    value: "caring",
    label: "Caring",
    description: "Warm and gentle.",
  },
  {
    value: "direct",
    label: "Direct",
    description: "Short and to the point.",
  },
];

// ─── Frequency caps ───────────────────────────────────────────────────────────
// Enforced by the scheduler against subscriptionStatus: free users get at most
// NOTIFICATION_FREE_MAX_PER_WEEK; Pro users get up to NOTIFICATION_PRO_MAX_PER_DAY.
export const NOTIFICATION_FREE_MAX_PER_WEEK = 1;
export const NOTIFICATION_PRO_MAX_PER_DAY = 1;

/** Hard floor between any two engagement notifications, any category. */
export const NOTIFICATION_MIN_GAP_HOURS = 18;

// ─── Quiet hours defaults (user-local time, "HH:MM") ─────────────────────────
export const DEFAULT_QUIET_HOURS_START = "21:00";
export const DEFAULT_QUIET_HOURS_END = "09:00";

/** "HH:MM" 24h validator for quiet-hours / time fields. */
export function isValidHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Client-facing preferences shape. Mirrors the persisted
 * UserNotificationPreferences row, minus server-only fields
 * (lastNotifiedAt, behavioralConsent, ids/timestamps).
 */
export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  enabledCategories: NotificationCategory[];
  tone: NotificationTone;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string | null;
  maxPerDay: number;
  maxPerWeek: number;
  /** ISO instant; notifications are paused until then. null = active. */
  pausedUntil: string | null;
}

/** Defaults for a brand-new user (email-only v1; push off until registered). */
export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    pushEnabled: false,
    emailEnabled: true,
    enabledCategories: [...DEFAULT_ENABLED_CATEGORIES],
    tone: "caring",
    quietHoursStart: DEFAULT_QUIET_HOURS_START,
    quietHoursEnd: DEFAULT_QUIET_HOURS_END,
    timezone: null,
    maxPerDay: NOTIFICATION_PRO_MAX_PER_DAY,
    maxPerWeek: NOTIFICATION_FREE_MAX_PER_WEEK,
    pausedUntil: null,
  };
}
