import { prisma } from "@/lib/prisma";

import { FALLBACK_HOUR_LOCAL, MIN_ENTRIES_FOR_SMART_TIMING } from "./constants";

/**
 * Smart timing — the user's "typical engagement hour" (0–23, user-local) =
 * the modal hour of Entry.createdAt over the last 30 days, converted to the
 * user's timezone in SQL (Prisma can't express AT TIME ZONE cleanly).
 *
 * Returns null when there isn't enough signal (< MIN_ENTRIES_FOR_SMART_TIMING
 * entries in 30d) — the caller then falls back to FALLBACK_HOUR_LOCAL (19:00).
 * Don't derive a "preferred hour" from a handful of noisy data points.
 */
export async function computePreferredHourLocal(
  userId: string,
  tz: string
): Promise<number | null> {
  const rows = await prisma.$queryRaw<Array<{ hr: number; n: bigint }>>`
    SELECT EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE ${tz}))::int AS hr,
           COUNT(*)::bigint AS n
    FROM "Entry"
    WHERE "userId" = ${userId}
      AND "createdAt" >= NOW() - INTERVAL '30 days'
    GROUP BY hr
    ORDER BY n DESC, hr DESC
  `;
  const total = rows.reduce((sum, r) => sum + Number(r.n), 0);
  if (total < MIN_ENTRIES_FOR_SMART_TIMING) return null;
  return rows.length > 0 ? rows[0].hr : null;
}

/** Cached preferred hour, or the global evening fallback. */
export function resolvePreferredHour(cached: number | null | undefined): number {
  return cached ?? FALLBACK_HOUR_LOCAL;
}
