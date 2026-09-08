/**
 * Screen 8 reminder slots.
 *
 * Dependency-free so the slot table and its copy can be asserted by a test
 * without pulling in the mobile module graph.
 *
 * ── The wording rule this table enforces ─────────────────────────────
 * Spec §1: "No bedtime / nightly / morning-routine / ritual framing of the
 * mechanism." Positioning is the same: Ripple records any time of day, and
 * anything implying a fixed time makes the product sound like a habit to
 * maintain rather than a place to put things down.
 *
 * So the labels name a PART OF THE DAY the user picks, which is a
 * preference, not a prescription. "Late" rather than "Bedtime"; "Morning"
 * as a window rather than "Morning routine".
 */

export type ReminderSlot = "morning" | "midday" | "after_work" | "late" | "none";

export interface ReminderSlotConfig {
  key: ReminderSlot;
  label: string;
  /** Local time the daily push fires. Null for "none". */
  localTime: string | null;
}

export const REMINDER_SLOTS: readonly ReminderSlotConfig[] = [
  { key: "morning", label: "Morning", localTime: "08:00" },
  { key: "midday", label: "Midday", localTime: "12:30" },
  { key: "after_work", label: "After work", localTime: "17:30" },
  { key: "late", label: "Late", localTime: "21:00" },
  { key: "none", label: "No reminders", localTime: null },
];

/**
 * Shown after a slot is picked and BEFORE the OS permission prompt.
 *
 * The primer exists because the OS prompt is one-shot per install: if a
 * user denies it, we cannot ask again, and the only recovery is a trip to
 * Settings that almost nobody makes. Asking in-app first means the OS
 * prompt is only ever shown to someone who has already said yes to the
 * idea.
 *
 * "No guilt, no streaks" is doing real work — the audience is people
 * already carrying too much. A reminder that reads as an obligation is a
 * reason to delete the app.
 */
export const REMINDER_PRIMER =
  "Want Ripple to nudge you then? No guilt, no streaks — just a tap when it helps.";

export function headlineFor(name: string | null): string {
  const who = name?.trim();
  return who
    ? `${who}, when do you usually want to think out loud?`
    : "When do you usually want to think out loud?";
}

/**
 * Whether picking this slot should trigger the OS permission prompt.
 *
 * Spec §9 acceptance: "'No reminders' never fires it." A user who has just
 * said they don't want reminders must not then be asked by the OS for
 * permission to send them.
 */
export function shouldPromptForPush(slot: ReminderSlot): boolean {
  return slot !== "none";
}

export function localTimeFor(slot: ReminderSlot): string | null {
  return REMINDER_SLOTS.find((s) => s.key === slot)?.localTime ?? null;
}
