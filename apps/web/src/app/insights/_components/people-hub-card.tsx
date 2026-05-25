import Link from "next/link";

import { HeroCard } from "@/components/acuity";

/**
 * People hub featured card — slice 6 v1.2 Anchor People. Lives in
 * the /insights featured-destination grid alongside Ask + State of
 * Me. Shows a tiny preview of the user's three most-mentioned
 * people (initials chips) as a hint of what's inside.
 *
 * Server-rendered. When the user has no Persons yet the card still
 * renders — the destination matters for new users even with no
 * preview — but with copy that invites rather than counts. The
 * preview chips collapse to "" in that case.
 */

const PREVIEW_N = 3;

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function PeopleHubCard({ userId }: { userId: string }) {
  const { prisma } = await import("@/lib/prisma");
  const people = await prisma.person.findMany({
    where: { userId, archived: false },
    orderBy: { mentionCount: "desc" },
    take: PREVIEW_N,
    select: { id: true, displayName: true },
  });

  return (
    <Link href="/insights/people" className="group block">
      <HeroCard variant="primary" padding={6}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
              People
            </p>
            <h2 className="mt-3 font-display text-xl font-semibold text-acuity-text">
              Anchored over time
            </h2>
            <p className="mt-1 text-[15px] leading-relaxed text-acuity-text-sec">
              Who comes up across your reflections, and when.
              Frequency, not judgment.
            </p>
            {people.length > 0 && (
              <p className="mt-3 text-[13px] text-acuity-text-ter">
                {people.map((p) => p.displayName).join(" · ")}
                {people.length === PREVIEW_N && " · …"}
              </p>
            )}
          </div>
          <span className="mt-1 text-acuity-text-ter transition group-hover:text-acuity-primary">
            →
          </span>
        </div>
      </HeroCard>
    </Link>
  );
}
