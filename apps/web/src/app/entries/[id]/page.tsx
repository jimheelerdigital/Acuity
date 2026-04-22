import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MOOD_EMOJI, MOOD_LABELS, PRIORITY_LABELS } from "@acuity/shared";
import type { Mood } from "@acuity/shared";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Entry — Acuity",
  robots: { index: false, follow: false },
};

export default async function EntryDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/entries/${params.id}`);
  }

  const { prisma } = await import("@/lib/prisma");
  const entry = await prisma.entry.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      tasks: {
        select: {
          id: true,
          title: true,
          text: true,
          description: true,
          priority: true,
          status: true,
          groupId: true,
          dueDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!entry) notFound();

  const date = new Date(entry.createdAt).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const moodKey = entry.mood as Mood | null;

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-3xl px-6 py-10 animate-fade-in">
        <Link
          href="/entries"
          className="mb-4 inline-block text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition"
        >
          ← All entries
        </Link>

        <header className="mb-8">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">{date}</p>
          <div className="flex items-center gap-3 flex-wrap">
            {moodKey && (
              <span className="text-lg text-zinc-800 dark:text-zinc-100">
                {MOOD_EMOJI[moodKey]} {MOOD_LABELS[moodKey]}
              </span>
            )}
            {entry.energy !== null && entry.energy !== undefined && (
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Energy {entry.energy}/10
              </span>
            )}
          </div>
        </header>

        <div className="space-y-8">
          {entry.summary && (
            <Section title="Summary">
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap">
                {entry.summary}
              </p>
            </Section>
          )}

          {entry.themes.length > 0 && (
            <Section title="Themes">
              <div className="flex flex-wrap gap-2">
                {entry.themes.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-zinc-100 dark:bg-white/10 px-3 py-1 text-xs text-zinc-600 dark:text-zinc-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {entry.wins.length > 0 && (
            <Section title="Wins">
              <ul className="space-y-1.5">
                {entry.wins.map((w, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-200"
                  >
                    <span className="text-emerald-500 shrink-0">✓</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {entry.blockers.length > 0 && (
            <Section title="Blockers">
              <ul className="space-y-1.5">
                {entry.blockers.map((b, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-200"
                  >
                    <span className="text-red-400 shrink-0">↳</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {entry.tasks.length > 0 && (
            <Section title={`Tasks (${entry.tasks.length})`}>
              <div className="space-y-2">
                {entry.tasks.map((t) => {
                  const label = t.title ?? t.text ?? "Untitled task";
                  const statusLabel = t.status.replace(/_/g, " ").toLowerCase();
                  return (
                    <div
                      key={t.id}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-[#13131F] px-4 py-3"
                    >
                      <p className="text-sm text-zinc-800 dark:text-zinc-100">
                        {label}
                      </p>
                      {t.description && (
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          {t.description}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {PRIORITY_LABELS[t.priority] ?? t.priority} · {statusLabel}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {entry.transcript && (
            <Section title="Transcript">
              <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap">
                {entry.transcript}
              </p>
            </Section>
          )}
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        {title}
      </h2>
      {children}
    </section>
  );
}
