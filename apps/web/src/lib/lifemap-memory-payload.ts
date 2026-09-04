import { GOAL_GROUPS } from "@acuity/shared";

/**
 * The `memory` block of the `/api/lifemap` response.
 *
 * Extracted from the route so the payload SHAPE is unit-testable without
 * standing up Prisma + a session. The route is a thin caller; this is where
 * the contract lives.
 *
 * ── Backward compatibility is load-bearing ───────────────────────────
 * `life-map.tsx` and the mobile client both read this block. Fields are
 * only ever ADDED here — removing or renaming one silently blanks a
 * section on a client that is already in the App Store and cannot be
 * updated in step with the server. The V1 legacy mention counts
 * (health/relationships/finances/personal/other) are kept for exactly
 * that reason even though the canonical 10-axis counts supersede them.
 */

/** The ten canonical axes, in the order DESIGN_SYSTEM.md §2.9 fixes. */
export const MEMORY_AXES = [
  "career",
  "money",
  "romance",
  "family",
  "friends",
  "physicalHealth",
  "mentalHealth",
  "growth",
  "fun",
  "purpose",
] as const;

export type MemoryAxis = (typeof MEMORY_AXES)[number];

/** `career` → `CAREER`, `physicalHealth` → `PHYSICAL_HEALTH`. */
export function axisToLifeArea(axis: MemoryAxis): string {
  return axis.replace(/([A-Z])/g, "_$1").toUpperCase();
}

/** Canonical label + chart color for an axis, from the shared source. */
export function axisMeta(axis: MemoryAxis): { label: string; color: string } {
  const area = axisToLifeArea(axis);
  const group = GOAL_GROUPS.find((g) => g.id === area);
  return {
    label: group?.label ?? axis,
    color: group?.color ?? "#6366F1",
  };
}

export interface RecurringTheme {
  area: string;
  theme: string;
  firstSeen: string;
  count: number;
  lastSeen: string;
}

export interface RecurringPerson {
  name: string;
  area: string;
  sentiment: string;
  mentionCount: number;
}

export interface RecurringGoal {
  goal: string;
  area: string;
  firstMentioned: string;
  status: string;
  mentionCount: number;
}

export type MemoryPayload = {
  totalEntries: number;
  firstEntryDate: Date | string | null;
  recurringThemes: unknown;
  recurringPeople: unknown;
  recurringGoals: unknown;
} & Record<`${MemoryAxis}Summary`, string | null> &
  Record<`${MemoryAxis}Mentions`, number> & {
    // V1 legacy counts — kept for clients that still read them.
    healthMentions: number;
    relationshipsMentions: number;
    financesMentions: number;
    personalMentions: number;
    otherMentions: number;
  };

/** The subset of `UserMemory` this payload reads. */
export type MemorySource = {
  totalEntries: number;
  firstEntryDate: Date | null;
  recurringThemes: unknown;
  recurringPeople: unknown;
  recurringGoals: unknown;
} & Partial<Record<`${MemoryAxis}Summary`, string | null>> &
  Partial<Record<`${MemoryAxis}Mentions`, number>> &
  Partial<{
    healthMentions: number;
    relationshipsMentions: number;
    financesMentions: number;
    personalMentions: number;
    otherMentions: number;
  }>;

/**
 * Build the `memory` block. Summaries default to null and counts to 0 so a
 * freshly-created UserMemory row produces a complete, well-typed payload
 * rather than a sparse object the client has to guard every field of.
 */
export function buildMemoryPayload(memory: MemorySource): MemoryPayload {
  const summaries = {} as Record<`${MemoryAxis}Summary`, string | null>;
  const mentions = {} as Record<`${MemoryAxis}Mentions`, number>;

  for (const axis of MEMORY_AXES) {
    summaries[`${axis}Summary`] = memory[`${axis}Summary`] ?? null;
    mentions[`${axis}Mentions`] = memory[`${axis}Mentions`] ?? 0;
  }

  return {
    totalEntries: memory.totalEntries,
    firstEntryDate: memory.firstEntryDate,
    recurringThemes: memory.recurringThemes,
    recurringPeople: memory.recurringPeople,
    recurringGoals: memory.recurringGoals,
    ...summaries,
    ...mentions,
    // V1 legacy — see the header note.
    healthMentions: memory.healthMentions ?? 0,
    relationshipsMentions: memory.relationshipsMentions ?? 0,
    financesMentions: memory.financesMentions ?? 0,
    personalMentions: memory.personalMentions ?? 0,
    otherMentions: memory.otherMentions ?? 0,
  };
}

/**
 * Whole days between the first entry and now, floored at 0.
 *
 * Same-day is "1 day" rather than "0 days" — a file that has been open for
 * a few hours has still been open for a day, and "learning about you for 0
 * days" reads as broken.
 */
export function daysSince(
  firstEntryDate: Date | string | null,
  now: Date = new Date()
): number | null {
  if (!firstEntryDate) return null;
  const start = new Date(firstEntryDate);
  if (Number.isNaN(start.getTime())) return null;
  const ms = now.getTime() - start.getTime();
  if (ms < 0) return 1;
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}
