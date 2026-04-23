import "server-only";

import {
  userProgression,
  type UserProgression,
} from "@acuity/shared";

/**
 * Server wrapper around the pure `userProgression()` helper. Fetches
 * the four data inputs (user, entries, themes, goals) in parallel
 * via Prisma, loads the stored snapshot for diff, computes the new
 * progression, and writes the snapshot back.
 *
 * Safe for server components and API routes — single Prisma trip,
 * no external IO, ~5ms on a warm user.
 */
export async function getUserProgression(userId: string): Promise<UserProgression> {
  const { prisma } = await import("@/lib/prisma");

  const [user, entries, themes, goals] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        createdAt: true,
        timezone: true,
        progressionSnapshot: true,
      },
    }),
    prisma.entry.findMany({
      where: { userId },
      select: {
        id: true,
        createdAt: true,
        dimensionContext: true,
      },
    }),
    prisma.theme.findMany({
      where: { userId },
      select: { id: true },
    }),
    prisma.goal.findMany({
      where: { userId },
      select: { id: true },
    }),
  ]);

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  const previousProgression = deserializeSnapshot(user.progressionSnapshot);

  const progression = userProgression({
    user: { id: user.id, createdAt: user.createdAt },
    entries: entries.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      // `dimensionContext` is the lowercase life-area key ("career",
      // "health", etc.) set when the user records "about" a specific
      // dimension. Nullable. The shared helper counts distinct non-
      // null values as `dimensionsCovered`.
      dimensionId: e.dimensionContext ?? null,
    })),
    themes,
    goals,
    previousProgression,
    timezone: user.timezone,
  });

  // Write back the snapshot — fire-and-forget would be nicer but we
  // want the diff to be accurate on the next call, so we await.
  // Cheap single-row update.
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        progressionSnapshot: serializeSnapshot(progression) as never,
      },
    });
  } catch (err) {
    // Don't fail the whole request if the snapshot write fails —
    // next call will just show no recentlyUnlocked until the write
    // succeeds. Log for observability.
    console.warn("[userProgression] snapshot write failed:", err);
  }

  return progression;
}

// ─── Serialization ──────────────────────────────────────────────
// UserProgression contains Date objects; JSON doesn't. Serialize to
// ISO strings on write, hydrate on read.

function serializeSnapshot(p: UserProgression): unknown {
  return {
    ...p,
    trialEndsAt: p.trialEndsAt.toISOString(),
    lastEntryAt: p.lastEntryAt?.toISOString() ?? null,
  };
}

function deserializeSnapshot(raw: unknown): UserProgression | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // Minimal safety — defensive in case an older schema shape is in
  // the DB. Only the `unlocked` map is load-bearing for the diff.
  if (!r.unlocked || typeof r.unlocked !== "object") return null;
  try {
    return {
      dayOfTrial: Number(r.dayOfTrial ?? 1),
      trialEndsAt: new Date(String(r.trialEndsAt ?? new Date().toISOString())),
      isInTrial: Boolean(r.isInTrial),
      entriesCount: Number(r.entriesCount ?? 0),
      entriesInLast7Days: Number(r.entriesInLast7Days ?? 0),
      dimensionsCovered: Number(r.dimensionsCovered ?? 0),
      goalsSet: Number(r.goalsSet ?? 0),
      themesDetected: Number(r.themesDetected ?? 0),
      currentStreak: Number(r.currentStreak ?? 0),
      longestStreak: Number(r.longestStreak ?? 0),
      lastEntryAt: r.lastEntryAt ? new Date(String(r.lastEntryAt)) : null,
      streakAtRisk: Boolean(r.streakAtRisk),
      unlocked: r.unlocked as UserProgression["unlocked"],
      nextUnlock: (r.nextUnlock as UserProgression["nextUnlock"]) ?? null,
      recentlyUnlocked: Array.isArray(r.recentlyUnlocked)
        ? (r.recentlyUnlocked as UserProgression["recentlyUnlocked"])
        : [],
    };
  } catch {
    return null;
  }
}
