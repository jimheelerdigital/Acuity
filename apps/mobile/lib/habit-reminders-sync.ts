import { api } from "@/lib/api";
import {
  applyMultiReminderSchedule,
  type MultiReminderInput,
} from "@/lib/notifications";

/**
 * Habit nudges reuse the same on-device scheduler as debrief reminders
 * (see notifications.ts). Because applyMultiReminderSchedule is a single
 * cancel-then-reschedule over ALL `acuity:reminder:*` triggers, habit
 * nudges MUST be scheduled in the same call as the debrief reminders —
 * otherwise whichever runs last wipes the other's triggers.
 *
 * These helpers fetch the habit-kind reminders and expose a single
 * "reschedule everything from the server" entry point that the habit
 * detail screen, the settings save path, and the boot self-heal all use.
 */

type ServerHabitReminder = {
  id: string;
  time: string;
  daysActive: number[];
  enabled: boolean;
  habitId: string | null;
};

/** Habit-kind reminders as scheduler inputs, with the habit name for copy. */
export async function fetchHabitReminderInputs(): Promise<MultiReminderInput[]> {
  const [remRes, habRes] = await Promise.all([
    api
      .get<{ reminders: ServerHabitReminder[] }>("/api/habits/reminders")
      .catch(() => null),
    api
      .get<{ habits: Array<{ id: string; name: string }> }>("/api/habits")
      .catch(() => null),
  ]);
  const names = new Map(
    (habRes?.habits ?? []).map((h) => [h.id, h.name] as const)
  );
  return (remRes?.reminders ?? []).map((r) => ({
    id: r.id,
    time: r.time,
    daysActive: r.daysActive,
    enabled: r.enabled,
    kind: "habit" as const,
    habitName: r.habitId ? names.get(r.habitId) ?? null : null,
  }));
}

type ServerReminder = {
  id: string;
  time: string;
  daysActive: number[];
  enabled: boolean;
};

/**
 * Reschedule debrief + habit reminders together from authoritative server
 * state. Call after any habit-reminder change so the new nudge is scheduled
 * without dropping the user's debrief reminders.
 */
export async function resyncAllReminders(): Promise<void> {
  const [meRes, debriefRes, habitInputs] = await Promise.all([
    api
      .get<{ user: { notificationsEnabled?: boolean } }>("/api/user/me")
      .catch(() => null),
    api
      .get<{ reminders: ServerReminder[] }>("/api/account/reminders")
      .catch(() => null),
    fetchHabitReminderInputs(),
  ]);
  const masterEnabled = !!meRes?.user?.notificationsEnabled;
  const debrief: MultiReminderInput[] = (debriefRes?.reminders ?? []).map(
    (r) => ({
      id: r.id,
      time: r.time,
      daysActive: r.daysActive,
      enabled: r.enabled,
    })
  );
  await applyMultiReminderSchedule({
    masterEnabled,
    reminders: [...debrief, ...habitInputs],
  });
}
