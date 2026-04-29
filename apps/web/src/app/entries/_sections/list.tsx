import { EntriesList } from "../entries-list";

/**
 * /entries list section. Owns its own data fetch so the route shell
 * (BackButton + "All entries" heading) can render instantly while
 * this 100-row read streams in via Suspense. Same pattern as /home's
 * per-card sections.
 *
 * Explicit `select:` drops `embedding` (1536-float array, ~6KB/row)
 * and `rawAnalysis` (Json) which the list never reads. `transcript`
 * stays because EntriesList's search filter scans transcript text.
 * For 100 rows the projection saves ~600KB-1MB on every load.
 */
export async function EntriesListSection({ userId }: { userId: string }) {
  const { prisma } = await import("@/lib/prisma");

  const entries = await prisma.entry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      summary: true,
      transcript: true,
      themes: true,
      // wins + blockers required by the EntryCard prop type. Cheap
      // (small string arrays); keep until EntryCardProps is narrowed.
      wins: true,
      blockers: true,
      mood: true,
      moodScore: true,
      energy: true,
      status: true,
      duration: true,
      audioDuration: true,
      createdAt: true,
      entryDate: true,
      _count: { select: { tasks: true } },
    },
  });

  const taskCounts = Object.fromEntries(
    entries.map((e) => [e.id, e._count.tasks])
  );

  return (
    <>
      <p className="-mt-4 mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        {entries.length === 0
          ? "No entries yet."
          : `${entries.length} entr${entries.length === 1 ? "y" : "ies"} — newest first.`}
      </p>
      <EntriesList entries={entries} taskCounts={taskCounts} />
    </>
  );
}
