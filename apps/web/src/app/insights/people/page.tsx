import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Avatar, Card, SectionHeader } from "@/components/acuity";
import { BackButton } from "@/components/back-button";
import { getAuthOptions } from "@/lib/auth";

import { PeopleSearchFilter } from "./_components/people-search-filter";

/**
 * /insights/people — directory of named people surfaced from the
 * user's reflections. Slice 4 v1.2 Anchor People.
 *
 * Sorted by mentionCount desc so the people the user talks about
 * most show first. Each row links to /insights/people/[id] for the
 * detail surface (slice 5). Search box at top filters by displayName
 * client-side (the list is small — a single user rarely surfaces >50
 * named people).
 *
 * Empty state matches the workstream's care/awareness framing —
 * the page never characterizes the user's relationships, just
 * surfaces frequency.
 */

const MAX_ROWS = 200;

export const dynamic = "force-dynamic";

export const metadata = {
  title: "People — Insights — Ripple",
  robots: { index: false, follow: false },
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

export default async function PeopleInsightsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/insights/people");
  }
  const userId = session.user.id;

  const { prisma } = await import("@/lib/prisma");

  // Recent mention timestamp per person — single GROUP BY in raw SQL
  // would be cleanest, but Prisma's groupBy on EntityMention by
  // personId returns the last createdAt cheaply enough.
  const people = await prisma.person.findMany({
    where: { userId, archived: false },
    orderBy: [{ mentionCount: "desc" }, { displayName: "asc" }],
    take: MAX_ROWS,
    select: {
      id: true,
      displayName: true,
      mentionCount: true,
      firstMentionedAt: true,
    },
  });

  // Last-mentioned lookup via a one-shot groupBy. For users with
  // thousands of mentions this is a single scan of EntityMention
  // by personId — indexed, sub-100ms typical.
  const lastMentionedMap = new Map<string, Date>();
  if (people.length > 0) {
    const ids = people.map((p) => p.id);
    const grouped = await prisma.entityMention.groupBy({
      by: ["personId"],
      where: { personId: { in: ids } },
      _max: { createdAt: true },
    });
    for (const g of grouped) {
      if (g._max.createdAt) lastMentionedMap.set(g.personId, g._max.createdAt);
    }
  }

  const rows = people.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    initials: initialsFor(p.displayName),
    mentionCount: p.mentionCount,
    lastMentioned: lastMentionedMap.get(p.id) ?? p.firstMentionedAt,
  }));

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <main className="acuity-fade-up mx-auto max-w-2xl px-6 py-10">
        <BackButton className="mb-6" ariaLabel="Back to Insights" />
        <header className="mb-8">
          <SectionHeader label="People" />
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-acuity-text">
            Who you think about, anchored over time
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-acuity-text-sec">
            Names that come up in your reflections. Frequency, not
            judgment — just what you&apos;re carrying.
          </p>
        </header>

        {rows.length === 0 ? (
          <Card variant="default" radius="xl" padding={6}>
            <p className="text-[15px] leading-relaxed text-acuity-text-sec">
              Ripple hasn&apos;t surfaced anyone yet. People show up
              here once you&apos;ve mentioned them across a few entries.
            </p>
          </Card>
        ) : (
          <PeopleSearchFilter>
            {rows.map((p) => (
              <Link
                key={p.id}
                href={`/insights/people/${p.id}`}
                data-name={p.displayName.toLowerCase()}
                className="acuity-people-row block transition hover:brightness-105"
              >
                <Card variant="tinted" radius="lg" padding={4}>
                  <div className="flex items-center gap-3">
                    <Avatar initials={p.initials} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[15px] font-semibold text-acuity-text">
                        {p.displayName}
                      </p>
                      <p className="mt-0.5 text-[12px] text-acuity-text-ter">
                        Mentioned {p.mentionCount}{" "}
                        {p.mentionCount === 1 ? "time" : "times"} · last{" "}
                        {relativeTime(p.lastMentioned)}
                      </p>
                    </div>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-acuity-text-ter"
                    >
                      →
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </PeopleSearchFilter>
        )}
      </main>
    </div>
  );
}
