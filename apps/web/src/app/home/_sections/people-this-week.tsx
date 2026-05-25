import Link from "next/link";

import { Avatar, Card, SectionHeader } from "@/components/acuity";

/**
 * "People on your mind this week" — slice 6 v1.2 Anchor People.
 *
 * Top 3 Persons by mention count within the rolling 7-day window.
 * Server-rendered; returns null when there are zero recent mentions
 * so disconnected accounts and brand-new accounts don't see a
 * permanent empty slot.
 *
 * Each card links to /insights/people/[id]. We never characterize
 * the user's relationship with anyone surfaced here — just frequency.
 */

const TOP_N = 3;
const WINDOW_DAYS = 7;

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function PeopleThisWeekSection({ userId }: { userId: string }) {
  const { prisma } = await import("@/lib/prisma");
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 86400_000);

  const grouped = await prisma.entityMention.groupBy({
    by: ["personId"],
    where: {
      createdAt: { gte: windowStart },
      person: { is: { userId, archived: false } },
    },
    _count: { _all: true },
    orderBy: { _count: { personId: "desc" } },
    take: TOP_N,
  });

  if (grouped.length === 0) return null;

  const people = await prisma.person.findMany({
    where: { id: { in: grouped.map((g) => g.personId) }, userId },
    select: { id: true, displayName: true },
  });
  const byId = new Map(people.map((p) => [p.id, p.displayName]));

  const rows = grouped
    .map((g) => ({
      id: g.personId,
      displayName: byId.get(g.personId) ?? null,
      count: g._count._all,
    }))
    .filter((r): r is { id: string; displayName: string; count: number } =>
      r.displayName !== null
    );

  if (rows.length === 0) return null;

  return (
    <section className="mb-6">
      <SectionHeader label="People on your mind this week" />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/insights/people/${r.id}`}
            className="block transition hover:brightness-105"
          >
            <Card variant="default" radius="xl" padding={5}>
              <div className="flex items-center gap-3">
                <Avatar initials={initialsFor(r.displayName)} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[15px] font-semibold text-acuity-text">
                    {r.displayName}
                  </p>
                  <p className="mt-0.5 text-[12px] text-acuity-text-ter">
                    {r.count} {r.count === 1 ? "mention" : "mentions"} this week
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
