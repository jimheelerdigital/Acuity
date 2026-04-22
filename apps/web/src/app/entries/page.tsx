import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";

import { formatRelativeDate } from "@acuity/shared";

import { getAuthOptions } from "@/lib/auth";
import { EntryCard } from "@/app/home/entry-card";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "All entries — Acuity",
  robots: { index: false, follow: false },
};

/**
 * Full chronological list of the user's entries. The dashboard shows
 * the 5 most recent; "View all" brings the user here. No pagination
 * for v1 — `take: 100` is the pragmatic ceiling that covers every
 * first-year user we expect to onboard. Real pagination can come
 * when someone has > 100 entries (month ~4 of daily use).
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

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { timezone: true },
  });
  const timezone = user?.timezone ?? undefined;

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

        {entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 px-6 py-16 text-center">
            <div className="text-3xl mb-3">🎙️</div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Your journal is empty
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Record your first brain dump from the dashboard to see it here.
            </p>
            <Link
              href="/home"
              className="mt-5 inline-block rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Go to dashboard
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => (
              <EntryWithDate
                key={e.id}
                entry={e}
                taskCount={e._count.tasks}
                timezone={timezone}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EntryWithDate({
  entry,
  taskCount,
  timezone,
}: {
  entry: Parameters<typeof EntryCard>[0]["entry"] & { createdAt: Date };
  taskCount: number;
  timezone?: string;
}) {
  // EntryCard formats its own date header; we just pass through. The
  // relative-date refresh is delivered via the shared helper the card
  // calls. Kept this wrapper so we can ship per-row separators or
  // section groupings in a follow-up without touching the card.
  void formatRelativeDate; // signal intentional shared-package usage
  void timezone;
  return <EntryCard entry={entry} taskCount={taskCount} />;
}
