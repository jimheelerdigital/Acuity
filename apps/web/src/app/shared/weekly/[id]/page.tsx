import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Public read-only weekly report page. Served from a share link the
 * owner generated (/insights/weekly/[id] → POST share). No auth
 * required. Unbranded-but-attributed — the footer credits Acuity
 * without making the page feel like a product landing.
 *
 * Indexing: robots=noindex + X-Robots-Tag header. A therapist or
 * coach opening this link shouldn't accidentally surface their
 * client's reflections in search results.
 *
 * Expired links: render a friendly "This share link has expired"
 * state instead of 404, so the recipient knows to ask the owner
 * for a fresh link rather than thinking the page never existed.
 */

type Params = { params: { id: string } };

export async function generateMetadata({ params }: Params) {
  // Minimal metadata — we don't want OG cards to leak content.
  return {
    title: "Weekly reflection · Acuity",
    description: "A weekly reflection shared by its author.",
    robots: { index: false, follow: false },
    other: {
      "X-Robots-Tag": "noindex, nofollow",
    },
  };
}

export default async function SharedWeeklyPage({ params }: Params) {
  const { prisma } = await import("@/lib/prisma");

  const report = await prisma.weeklyReport.findFirst({
    where: { publicShareId: params.id },
    select: {
      id: true,
      weekStart: true,
      weekEnd: true,
      narrative: true,
      insightBullets: true,
      moodArc: true,
      topThemes: true,
      tasksOpened: true,
      tasksClosed: true,
      entryCount: true,
      status: true,
      publicShareExpiresAt: true,
    },
  });

  if (!report) notFound();

  // Expired → render a distinct "link expired" state (not 404).
  const now = Date.now();
  const expired =
    report.publicShareExpiresAt &&
    report.publicShareExpiresAt.getTime() < now;
  if (expired) {
    return <ExpiredState />;
  }

  // Only COMPLETE reports render substantive content. A mis-generated
  // report shouldn't surface "FAILED" state publicly.
  if (report.status !== "COMPLETE") {
    return <ExpiredState />;
  }

  // Fire-and-forget view counter increment. Doesn't block the render.
  void prisma.weeklyReport
    .update({
      where: { id: report.id },
      data: { publicShareViewCount: { increment: 1 } },
    })
    .catch(() => {});

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="min-h-screen bg-[#FAFAF7] dark:bg-[#0B0B12]">
      <main className="mx-auto max-w-2xl px-6 py-16">
        <header className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
            Shared weekly reflection
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">
            {fmt(report.weekStart)} – {fmt(report.weekEnd)}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {report.entryCount} entr{report.entryCount === 1 ? "y" : "ies"} ·{" "}
            {report.tasksOpened} task{report.tasksOpened === 1 ? "" : "s"} opened ·{" "}
            {report.tasksClosed} closed
          </p>
        </header>

        {report.moodArc && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
              Mood arc
            </h2>
            <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-200 italic">
              &ldquo;{report.moodArc}&rdquo;
            </p>
          </section>
        )}

        {report.narrative && (
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
              This week
            </h2>
            <div className="prose prose-zinc dark:prose-invert max-w-none">
              {report.narrative.split(/\n\n+/).map((para, i) => (
                <p
                  key={i}
                  className="mt-4 text-base leading-relaxed text-zinc-700 dark:text-zinc-200"
                >
                  {para}
                </p>
              ))}
            </div>
          </section>
        )}

        {report.insightBullets.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
              Noticed
            </h2>
            <ul className="space-y-3">
              {report.insightBullets.map((b, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-base text-zinc-700 dark:text-zinc-200"
                >
                  <span className="mt-1 text-violet-500 shrink-0">→</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {report.topThemes.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
              Themes
            </h2>
            <div className="flex flex-wrap gap-2">
              {report.topThemes.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-zinc-100 dark:bg-white/5 px-3 py-1 text-sm text-zinc-700 dark:text-zinc-200"
                >
                  {t}
                </span>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-16 pt-8 border-t border-zinc-200 dark:border-white/10 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Made with{" "}
            <a
              href="/"
              className="font-medium text-violet-600 dark:text-violet-400 hover:text-violet-500"
            >
              Acuity
            </a>
            {" — notice patterns across your own words."}
          </p>
        </footer>
      </main>
    </div>
  );
}

function ExpiredState() {
  return (
    <div className="min-h-screen bg-[#FAFAF7] dark:bg-[#0B0B12] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          This share link has expired.
        </h1>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          Ask the person who sent it for a fresh link, or visit Acuity
          to start your own weekly reflections.
        </p>
        <a
          href="/"
          className="mt-6 inline-block rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Visit Acuity
        </a>
      </div>
    </div>
  );
}
