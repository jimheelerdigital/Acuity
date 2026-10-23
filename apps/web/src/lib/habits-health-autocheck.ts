/**
 * Apple Health → habit auto-check (1.9.6).
 *
 * Runs right after POST /api/health/snapshots upserts a batch of days. For
 * each active habit with an autoRule, and each uploaded day the habit is
 * expected on, a day whose totals meet the rule gets a HabitCheck with
 * source "HEALTH".
 *
 *   - Additive only: never deletes a check (a later, lower revision of a
 *     day leaves the check in place).
 *   - Never overwrites provenance: the (habitId, localDate) upsert's update
 *     is empty, so an existing MANUAL / DEBRIEF check stays as it is.
 *   - Snapshot days are the user's local days (the phone sends YYYY-MM-DD),
 *     the same contract HabitCheck.localDate uses.
 *
 * No cron: Health data only arrives through that upload, so evaluating on
 * upload sees every new day. Best-effort — the caller must not fail the
 * upload because of this.
 */
import type { PrismaClient } from "@prisma/client";
import {
  dayOfWeek,
  healthRuleMet,
  parseHealthRule,
  type HealthDayTotals,
} from "@acuity/shared";

export type HealthDay = HealthDayTotals & { date: string };

type RuledHabit = { id: string; daysActive: number[]; autoRule: unknown };

/** Pure: which (habit, day) pairs should be checked. */
export function healthChecksToWrite(
  habits: readonly RuledHabit[],
  days: readonly HealthDay[]
): { habitId: string; localDate: string }[] {
  const out: { habitId: string; localDate: string }[] = [];
  for (const h of habits) {
    const rule = parseHealthRule(h.autoRule);
    if (!rule) continue;
    for (const d of days) {
      // Same rule as isExpectedOn (@acuity/shared): only scheduled days.
      const dow = dayOfWeek(d.date);
      if (dow < 0 || !h.daysActive.includes(dow)) continue;
      if (healthRuleMet(rule, d)) out.push({ habitId: h.id, localDate: d.date });
    }
  }
  return out;
}

export async function applyHealthHabitChecks(
  prisma: PrismaClient,
  userId: string,
  days: readonly HealthDay[]
): Promise<number> {
  if (days.length === 0) return 0;
  const habits = await prisma.habit.findMany({
    // A user has a handful of habits; rules are filtered in JS
    // (parseHealthRule) rather than with a JSON-null filter.
    where: { userId, archivedAt: null, type: "standard" },
    select: { id: true, daysActive: true, autoRule: true },
  });
  const writes = healthChecksToWrite(habits, days);
  for (const w of writes) {
    await prisma.habitCheck.upsert({
      where: { habitId_localDate: { habitId: w.habitId, localDate: w.localDate } },
      create: { habitId: w.habitId, userId, localDate: w.localDate, source: "HEALTH" },
      update: {},
    });
  }
  return writes.length;
}
