import type { UserProgression } from "@acuity/shared";

import { api } from "@/lib/api";

/**
 * Mobile fetch for UserProgression. Hits the shared web endpoint
 * (/api/user/progression) and rehydrates Date fields from their
 * ISO-string transport shape. The shared helper treats the returned
 * object as the single source of truth for every guided-experience
 * surface on mobile — focus card on Home, tip bubbles, locked empty
 * states, streak UI.
 *
 * Pair with useFocusEffect on screens that care about the current
 * state — progression can change after a recording completes, so a
 * refetch on focus keeps empty states honest.
 */
export async function fetchUserProgression(): Promise<UserProgression> {
  const raw = await api.get<SerializedProgression>("/api/user/progression");
  return {
    ...raw,
    trialEndsAt: new Date(raw.trialEndsAt),
    lastEntryAt: raw.lastEntryAt ? new Date(raw.lastEntryAt) : null,
  };
}

type SerializedProgression = Omit<
  UserProgression,
  "trialEndsAt" | "lastEntryAt"
> & {
  trialEndsAt: string;
  lastEntryAt: string | null;
};

export type { UserProgression };
