import Link from "next/link";
import { EntryCard } from "../entry-card";

const HOME_ENTRY_LIMIT = 5;

/**
 * Recent sessions section — context-tier card on row 4. Pulls the 7
 * most recent entries (slice to 5 in render; 6th+ surface a "View
 * all" link). Explicit Prisma select to avoid pulling unbounded
 * transcript / 1536-float embedding / rawAnalysis JSON on every
 * dashboard load.
 */
export async function RecentSessionsSection({ userId }: { userId: string }) {
  const entries = await fetchEntries(userId);

  return (
    <section className="flex h-full flex-col lg:col-span-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 lg:p-7 dark:border-white/10 dark:bg-[#1E1E2E]">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2
            className="font-semibold uppercase text-zinc-400 dark:text-zinc-500"
            style={{ fontSize: 13, letterSpacing: "0.18em" }}
          >
            Recent sessions
          </h2>
          <p className="mt-2 text-xl font-semibold tracking-tight md:text-2xl text-zinc-900 dark:text-zinc-50">
            {entries.length === 0
              ? "Nothing recorded yet"
              : entries.length === 1
                ? "1 entry this week"
                : `${entries.length} entries this week`}
          </p>
        </div>
        {entries.length > HOME_ENTRY_LIMIT && (
          <Link
            href="/entries"
            className="shrink-0 text-[15px] font-semibold text-violet-600 hover:text-violet-500 dark:text-violet-400"
          >
            View all →
          </Link>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon="🎙️"
            title="No entries yet"
            description="Hit the record button and speak your mind."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {entries.slice(0, HOME_ENTRY_LIMIT).map((e) => (
            <EntryCard key={e.id} entry={e} taskCount={e._count.tasks} />
          ))}
        </div>
      )}
    </section>
  );
}

async function fetchEntries(userId: string) {
  const { prisma } = await import("@/lib/prisma");
  return prisma.entry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 7,
    select: {
      id: true,
      summary: true,
      createdAt: true,
      themes: true,
      wins: true,
      blockers: true,
      mood: true,
      energy: true,
      status: true,
      _count: { select: { tasks: true } },
    },
  });
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-white/10">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</p>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{description}</p>
    </div>
  );
}
