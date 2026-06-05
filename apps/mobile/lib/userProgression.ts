import type { UserProgression } from "@acuity/shared";

import { dedupedGet, getCached, isStale, setCached } from "@/lib/cache";

const PROGRESSION_KEY = "/api/user/progression";

/**
 * Mobile fetch for UserProgression. Hits the shared web endpoint
 * (/api/user/progression) and rehydrates Date fields from their
 * ISO-string transport shape. The shared helper treats the returned
 * object as the single source of truth for every guided-experience
 * surface on mobile — focus card on Home, tip bubbles, locked empty
 * states, streak UI.
 *
 * Stale-while-revalidate + cross-screen dedupe: Home and Goals both
 * call this on focus; routing through the shared cache means a fresh
 * result is reused (no network) and concurrent calls share one request
 * — previously this fired /api/user/progression twice on every login.
 * The rehydrated (Date) object is cached under the path key, so screens
 * reading getCached("/api/user/progression") get the same shape.
 *
 * Pass `force: true` for pull-to-refresh.
 */
export async function fetchUserProgression(
  { force = false }: { force?: boolean } = {}
): Promise<UserProgression> {
  if (!force && !isStale(PROGRESSION_KEY)) {
    const cached = getCached<UserProgression>(PROGRESSION_KEY);
    if (cached) return cached;
  }
  const raw = await dedupedGet<SerializedProgression>(PROGRESSION_KEY);
  const result: UserProgression = {
    ...raw,
    trialEndsAt: new Date(raw.trialEndsAt),
    lastEntryAt: raw.lastEntryAt ? new Date(raw.lastEntryAt) : null,
  };
  setCached(PROGRESSION_KEY, result);
  return result;
}

type SerializedProgression = Omit<
  UserProgression,
  "trialEndsAt" | "lastEntryAt"
> & {
  trialEndsAt: string;
  lastEntryAt: string | null;
};

export type { UserProgression };
