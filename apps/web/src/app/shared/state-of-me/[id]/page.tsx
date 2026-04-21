import { notFound } from "next/navigation";

import type { StateOfMeContent } from "@acuity/shared";

import { StateOfMeReader } from "@/components/state-of-me-reader";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    title: "State of Me · Acuity",
    description: "A quarterly reflection shared by its author.",
    robots: { index: false, follow: false },
    other: { "X-Robots-Tag": "noindex, nofollow" },
  };
}

export default async function SharedStateOfMePage({
  params,
}: {
  params: { id: string };
}) {
  const { prisma } = await import("@/lib/prisma");
  const report = await prisma.stateOfMeReport.findFirst({
    where: { publicShareId: params.id },
  });

  if (!report) notFound();

  const expired =
    report.publicShareExpiresAt &&
    report.publicShareExpiresAt.getTime() < Date.now();
  if (expired || report.status !== "COMPLETE") {
    return <ExpiredState />;
  }

  void prisma.stateOfMeReport
    .update({
      where: { id: report.id },
      data: { publicShareViewCount: { increment: 1 } },
    })
    .catch(() => {});

  return (
    <div className="min-h-screen bg-[#FAFAF7] dark:bg-[#0B0B12]">
      <main className="mx-auto max-w-3xl px-6 py-16">
        <StateOfMeReader
          periodStart={report.periodStart.toISOString()}
          periodEnd={report.periodEnd.toISOString()}
          content={report.content as unknown as StateOfMeContent}
        />

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
          to write your own quarterly reflection.
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
