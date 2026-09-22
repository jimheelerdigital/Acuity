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
  | "habit_nudge"
  | "surprise_checkin"
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
    key: "habit_nudge",
    label: "Habit nudges",
    description: "A nudge for a habit you're tracking, at the time you chose.",
    // Activity-based (a habit you added yourself), not inferred from speech —
    // so it lives in stay_on_track and stays on by default, matching how habit
    // reminders already behaved before this system owned them.
    defaultOn: true,
    group: "stay_on_track",
  },
  {
    key: "surprise_checkin",
    label: "Surprise check-ins",
    description: "An occasional unprompted nudge to capture a moment.",
    // Off by default: an unpredictable nudge is more intrusive than a
    // reminder the user scheduled, so it's opt-in even though it's
    // activity-based (nothing here is inferred from what you said).
    defaultOn: false,
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
    // references something Ripple inferred from your speech. Single rule —
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
      "Gentle nudges based on how you use Ripple — never on what you talked about.",
  },
  {
    key: "personalized",
    heading: "Personalized from your entries — off by default",
    subheading:
      "Anything Ripple picked up from what you said — goals, tasks, themes, life areas. Always your choice to turn on.",
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


// ─── Delivery-decision helpers (server-owned reminders, 2026-09) ─────────────
//
// Pure functions the server reminder dispatcher composes to decide whether a
// given reminder should fire on a given cron tick. Kept here (not in the cron)
// so they're unit-testable in isolation and can't drift from the category
// model above. No I/O, no Date.now() — the caller passes "now".

/** Minutes since local midnight for "HH:MM". null if malformed. */
export function hhmmToMinutes(hhmm: string): number | null {
  if (!isValidHHMM(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Is `nowHHMM` inside the quiet-hours window [start, end)? The window wraps
 * midnight when end <= start (e.g. 21:00 → 09:00 covers the night). Equal
 * start/end is treated as "no quiet hours" (never suppresses) rather than
 * "always quiet", which would silence everything and read as a bug.
 */
export function isWithinQuietHours(
  nowHHMM: string,
  start: string,
  end: string
): boolean {
  const now = hhmmToMinutes(nowHHMM);
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  if (now === null || s === null || e === null) return false;
  if (s === e) return false; // empty window
  return s < e ? now >= s && now < e : now >= s || now < e; // wrap midnight
}

/** True if `category` is switched on in the user's saved set. */
export function isCategoryEnabled(
  enabledCategories: readonly string[] | null | undefined,
  category: NotificationCategory
): boolean {
  return !!enabledCategories && enabledCategories.includes(category);
}

// ─── App-version gate for server-owned reminders ─────────────────────────────
//
// The migration from on-device scheduling to server push is version-gated so a
// user is served by exactly ONE system and never gets a double reminder:
//   - app >= MIN_SERVER_REMINDER_VERSION  → on-device scheduling removed;
//     the SERVER owns delivery (this gate returns true).
//   - older app / unknown version         → the installed app still schedules
//     locally, so the server must NOT also send (returns false).
// Unknown/unparseable versions fail CLOSED (false) — never risk a double-send.
export const MIN_SERVER_REMINDER_VERSION = "1.6.0";

/** Parse "1.6.0" / "1.6" / "1.6.0-beta.2" → [major, minor, patch]. null if unparseable. */
export function parseSemver(
  v: string | null | undefined
): [number, number, number] | null {
  if (!v) return null;
  const core = v.trim().split(/[-+]/)[0]; // drop pre-release / build metadata
  const parts = core.split(".");
  if (parts.length === 0) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0];
}

/** a >= b for [major,minor,patch] tuples. */
export function semverGte(
  a: [number, number, number],
  b: [number, number, number]
): boolean {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

/**
 * Does the server own reminder delivery for a user on this app version?
 * Fails closed (false) on unknown/old versions so the on-device app that's
 * still scheduling locally is never doubled up by a server push.
 */
export function serverOwnsReminders(
  appVersion: string | null | undefined
): boolean {
  const parsed = parseSemver(appVersion);
  const min = parseSemver(MIN_SERVER_REMINDER_VERSION);
  if (!parsed || !min) return false;
  return semverGte(parsed, min);
}

/** The reminder-kind → notification-category mapping (server-owned reminders). */
export function categoryForReminderKind(
  kind: "debrief" | "habit"
): NotificationCategory {
  return kind === "habit" ? "habit_nudge" : "habit_reminder";
}


// ─── Cron tick matching (server reminder dispatcher) ─────────────────────────
//
// The dispatcher runs every REMINDER_TICK_MINUTES. A reminder set to any minute
// (e.g. 09:07) fires exactly once/day: in the tick bucket its time falls into.
// Pure so the "is this reminder due right now" decision is unit-testable without
// a cron or a clock.

/** How often the reminder dispatcher cron runs, in minutes. */
export const REMINDER_TICK_MINUTES = 15;

/** Start minute of the tick bucket containing `nowMinutes` (local mins since midnight). */
export function floorToTick(
  nowMinutes: number,
  tickMinutes: number = REMINDER_TICK_MINUTES
): number {
  return Math.floor(nowMinutes / tickMinutes) * tickMinutes;
}

/** Is `timeHHMM` inside the tick bucket [bucketStartMin, bucketStartMin+tick)? */
export function isTimeInTick(
  timeHHMM: string,
  bucketStartMin: number,
  tickMinutes: number = REMINDER_TICK_MINUTES
): boolean {
  const t = hhmmToMinutes(timeHHMM);
  if (t === null) return false;
  return t >= bucketStartMin && t < bucketStartMin + tickMinutes;
}

/**
 * Whole "is this reminder due on this tick" decision, minus category/dedup/
 * skip-if-done (which need I/O). True when the reminder is active on the local
 * weekday AND its time lands in the current tick bucket.
 */
export function isReminderDueOnTick(
  reminder: { time: string; daysActive: readonly number[]; enabled: boolean },
  localWeekday: number,
  nowMinutes: number,
  tickMinutes: number = REMINDER_TICK_MINUTES
): boolean {
  if (!reminder.enabled) return false;
  if (!reminder.daysActive.includes(localWeekday)) return false;
  return isTimeInTick(reminder.time, floorToTick(nowMinutes, tickMinutes), tickMinutes);
}
