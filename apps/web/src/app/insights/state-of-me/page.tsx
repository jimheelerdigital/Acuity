import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { BackButton } from "@/components/back-button";
import { getAuthOptions } from "@/lib/auth";
import { formatRelativeDate } from "@acuity/shared";

import { StateOfMeGenerateButton } from "./generate-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "State of Me — Acuity",
  robots: { index: false, follow: false },
};

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function StateOfMeListPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/insights/state-of-me");
  }

  const { prisma } = await import("@/lib/prisma");
  const reports = await prisma.stateOfMeReport.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      degraded: true,
      createdAt: true,
      content: true,
    },
  });

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const latest = reports[0];
  const cooldownUntil = latest
    ? new Date(latest.createdAt.getTime() + THIRTY_DAYS_MS)
    : null;
  const canGenerate = !cooldownUntil || cooldownUntil.getTime() < Date.now();

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-2xl px-6 py-10">
        <BackButton className="mb-4" ariaLabel="Back to Insights" />
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          State of Me
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Quarterly reflections on what&apos;s shifted across 90 days of
          entries. Delivered automatically; you can also request one
          manually (once every 30 days).
        </p>

        <div className="mt-5">
          <StateOfMeGenerateButton
            canGenerate={canGenerate}
            cooldownUntil={cooldownUntil?.toISOString() ?? null}
          />
        </div>

        <section className="mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Past reports
          </h2>
          {reports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 px-6 py-12 text-center">
              <p className="text-3xl mb-2">📓</p>
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                No reports yet.
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Your first State of Me arrives automatically 90 days
                after signup.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => {
                const content = (r.content as Record<string, unknown>) ?? {};
                const headline =
                  typeof content.headline === "string"
                    ? content.headline
                    : r.status === "COMPLETE"
                      ? "Your quarter"
                      : "Generating…";
                return (
                  <Link
                    key={r.id}
                    href={`/insights/state-of-me/${r.id}`}
                    className="block rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-5 hover:border-violet-300 dark:hover:border-violet-700/40 transition shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] dark:shadow-none dark:ring-1 dark:ring-white/5"
                  >
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">
                      {fmtDate(r.periodStart)} — {fmtDate(r.periodEnd)}
                    </p>
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                      {headline}
                    </h3>
                    <div className="mt-2 flex items-center gap-2 text-[11px]">
                      <StatusPill status={r.status} degraded={r.degraded} />
                      <span className="text-zinc-400 dark:text-zinc-500">
                        {formatRelativeDate(r.createdAt.toISOString())}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatusPill({ status, degraded }: { status: string; degraded: boolean }) {
  if (status === "COMPLETE") {
    return (
      <span
        className={`rounded-full px-2 py-0.5 ${
          degraded
            ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        }`}
      >
        {degraded ? "Lightweight" : "Complete"}
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="rounded-full px-2 py-0.5 bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
        Failed
      </span>
    );
  }
  return (
    <span className="rounded-full px-2 py-0.5 bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400">
      Generating
    </span>
  );
}
