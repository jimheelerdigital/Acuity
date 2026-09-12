/**
 * Debrief → habit auto-check-off.
 *
 * When a nightly debrief evidences that the user did one of their tracked
 * habits, the extraction pipeline records a HabitCheck for that habit on
 * the user's LOCAL day, tagged source="DEBRIEF" and linked to the entry.
 * The user can still tap habits by hand (source="MANUAL"); the two collapse
 * to a single row per (habit, day) via the unique constraint, so a day is
 * simply "done" regardless of how it got checked.
 *
 * Everything here is gated by ENABLE_HABITS and is strictly best-effort:
 * a failure to auto-check must NEVER fail entry processing. The debrief is
 * the product; the habit tick is a convenience layered on top.
 */
import type { PrismaClient } from "@prisma/client";
import type { HabitCompletionMatch } from "@acuity/shared";

/** Server-side habits flag. Matches the gate on the habit API routes. */
export function habitsEnabled(): boolean {
  return process.env.ENABLE_HABITS === "1";
}

export type ActiveHabit = { id: string; name: string };

/** Active (non-archived) habits — for the prompt and name reconciliation. */
export async function fetchActiveHabits(
  prisma: PrismaClient,
  userId: string
): Promise<ActiveHabit[]> {
  return prisma.habit.findMany({
    where: { userId, archivedAt: null },
    select: { id: true, name: true },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * The user's local calendar date as YYYY-MM-DD. Same contract as the
 * client's localDate on the manual check route: a check belongs to the
 * user's own day, not UTC. Falls back to the app default timezone when
 * the stored one is missing or invalid.
 */
export function localDateForTimezone(
  timezone: string | null | undefined,
  now: Date = new Date()
): string {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  try {
    return fmt(timezone || "America/Chicago");
  } catch {
    return fmt("America/Chicago");
  }
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Upsert DEBRIEF-sourced checks for the habits the extractor matched.
 * Returns the number of habits newly reconciled (matched to a real habit).
 *
 * Idempotent and non-destructive:
 *   - Matching is by NAME, case-insensitive, against the user's own active
 *     habits — an unmatched name is ignored (the model can't invent a check).
 *   - The (habitId, localDate) unique constraint means a habit already
 *     checked today stays one row; upsert.update is a no-op, so a pre-existing
 *     MANUAL check is never downgraded to DEBRIEF.
 */
export async function persistDebriefHabitChecks(params: {
  prisma: PrismaClient;
  userId: string;
  entryId: string;
  timezone: string | null | undefined;
  matches: HabitCompletionMatch[] | undefined;
  habits: ActiveHabit[];
  now?: Date;
}): Promise<number> {
  const { prisma, userId, entryId, timezone, matches, habits } = params;
  if (!matches || matches.length === 0 || habits.length === 0) return 0;

  const idByName = new Map<string, string>();
  for (const h of habits) idByName.set(normalizeName(h.name), h.id);

  const localDate = localDateForTimezone(timezone, params.now);
  const seen = new Set<string>();
  let checked = 0;

  for (const m of matches) {
    if (!m || typeof m.habitName !== "string") continue;
    const habitId = idByName.get(normalizeName(m.habitName));
    if (!habitId || seen.has(habitId)) continue;
    seen.add(habitId);
    await prisma.habitCheck.upsert({
      where: { habitId_localDate: { habitId, localDate } },
      create: { habitId, userId, localDate, source: "DEBRIEF", entryId },
      update: {},
    });
    checked++;
  }
  return checked;
}
