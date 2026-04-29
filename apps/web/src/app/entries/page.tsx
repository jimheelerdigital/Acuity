import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { BackButton } from "@/components/back-button";

import { EntriesList } from "./entries-list";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "All entries — Acuity",
  robots: { index: false, follow: false },
};

/**
 * Full chronological list of the user's entries with client-side search
 * and mood filter. Dashboard shows the 5 most recent; "View all" lands
 * here. `take: 100` is the pragmatic ceiling for v1 — filtering happens
 * client-side against the pre-fetched list, matching mobile's journal tab.
 */
export default async function EntriesPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/entries");

  const { prisma } = await import("@/lib/prisma");
  // Explicit select drops `embedding` (1536-float array, ~6KB/row) and
  // `rawAnalysis` (Json) which the list never reads. Transcript stays
  // because EntriesList's search filter scans transcript text. For 100
  // rows, this saves roughly 600KB-1MB on every /entries load.
  const entries = await prisma.entry.findMany({
    where: { userId: session.user.id },
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
    <div className="min-h-screen">
      <main className="mx-auto max-w-3xl px-6 py-10 animate-fade-in">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <BackButton className="mb-4" ariaLabel="Back to Home" />
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              All entries
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {entries.length === 0
                ? "No entries yet."
                : `${entries.length} entr${entries.length === 1 ? "y" : "ies"} — newest first.`}
            </p>
          </div>
        </div>

        <EntriesList entries={entries} taskCounts={taskCounts} />
      </main>
    </div>
  );
}
