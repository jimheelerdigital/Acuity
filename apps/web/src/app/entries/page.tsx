import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";

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
  const entries = await prisma.entry.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
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
            <Link
              href="/home"
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition"
            >
              ← Home
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
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
