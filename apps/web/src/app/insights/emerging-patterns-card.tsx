import { Card, ThemePill, themeKeyFor } from "@/components/acuity";
import {
  MIN_ENTRIES_FOR_PEEK,
  MIN_ENTRIES_PER_THEME,
  emergingPatternsCopy,
  selectEmergingThemes,
} from "@/lib/emerging-patterns";

/**
 * The early-peek card on /insights. Server component — the data is one
 * group-by away and the hub is already async, so there is no reason to
 * ship a client component and a fetch for it.
 *
 * Renders NOTHING (returns null) unless all of these hold:
 *   - the user has >= 2 entries
 *   - `progression.unlocked.themeMap` is still false
 *   - at least one theme has appeared in >= 2 distinct entries
 *
 * All three live in `selectEmergingThemes`; this file only draws. See
 * lib/emerging-patterns.ts for why there is deliberately no empty state.
 *
 * FREE users cannot reach this card by construction, which is why it
 * carries no separate entitlement check (and matches its sibling cards on
 * the hub, which gate on `progression.unlocked.*` only): themes come from
 * `recordThemesFromExtraction`, and the FREE branch returns a Haiku
 * summary and exits before extraction ever runs. No extraction, no
 * ThemeMention rows, no emerging themes.
 */

export async function EmergingPatternsCard({
  userId,
  entriesCount,
  themeMapUnlocked,
}: {
  userId: string;
  entriesCount: number;
  themeMapUnlocked: boolean;
}) {
  // Cheap short-circuits before touching the DB — the common cases for a
  // brand-new account and for an established one are both "no query".
  if (themeMapUnlocked || entriesCount < MIN_ENTRIES_FOR_PEEK) return null;

  const { prisma } = await import("@/lib/prisma");

  // ThemeMention is @@unique([themeId, entryId]), so this count is
  // "distinct entries containing the theme" — exactly what the card
  // claims — not a raw mention tally.
  const rows = await prisma.themeMention.groupBy({
    by: ["themeId"],
    where: { theme: { is: { userId } } },
    _count: { themeId: true },
    having: { themeId: { _count: { gte: MIN_ENTRIES_PER_THEME } } },
    orderBy: { _count: { themeId: "desc" } },
    take: 8,
  });

  if (rows.length === 0) return null;

  const themeRecords = await prisma.theme.findMany({
    where: { id: { in: rows.map((r) => r.themeId) }, userId },
    select: { id: true, name: true },
  });
  const nameById = new Map(themeRecords.map((t) => [t.id, t.name]));

  const emerging = selectEmergingThemes({
    entriesCount,
    themeMapUnlocked,
    themes: rows.map((r) => ({
      label: nameById.get(r.themeId) ?? "",
      entryCount: r._count?.themeId ?? 0,
    })),
  });

  const copy = emergingPatternsCopy(emerging);
  if (!copy) return null;

  return (
    <section className="mb-10" data-testid="emerging-patterns">
      <Card variant="tinted" radius="lg" padding={6}>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
          Early days
        </p>
        <h2 className="mt-2 font-display text-xl font-semibold text-acuity-text">
          Starting to notice
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {emerging.map((t) => (
            <ThemePill
              key={t.label}
              theme={themeKeyFor(t.label)}
              label={t.label}
              size="m"
            />
          ))}
        </div>
        <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-acuity-text-sec">
          {copy}
        </p>
      </Card>
    </section>
  );
}
