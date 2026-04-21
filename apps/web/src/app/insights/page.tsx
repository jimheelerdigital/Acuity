import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { ComparisonsCard } from "@/components/comparisons-card";
import { HealthCorrelationsCard } from "@/components/health-correlations-card";
import { UserInsightsCard } from "@/components/user-insights-card";

import { InsightsView } from "./insights-view";
import { LifeMap } from "./life-map";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-4xl px-6 py-10 animate-fade-in">
        {/* Auto-flagged observations — top of the page so the user reads
            "here's what we noticed this week" before the full charts. */}
        <UserInsightsCard />

        <HealthCorrelationsCard />

        <ComparisonsCard />

        {/* Life Matrix */}
        <section className="mb-12">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">Life Matrix</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            Your life, decoded — across every area.
          </p>
          <LifeMap />
        </section>

        {/* Theme Map entry point — links to the dedicated force-graph page. */}
        <section className="mb-6">
          <Link
            href="/insights/theme-map"
            className="group block rounded-2xl border border-zinc-200 dark:border-white/10 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/20 dark:to-[#1E1E2E] p-6 transition hover:border-violet-300 dark:hover:border-violet-700/40"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
                  New
                </p>
                <h2 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  Theme Map
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  See the patterns your debriefs keep circling back to —
                  sized by how often, colored by how they feel.
                </p>
              </div>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="mt-1 text-zinc-400 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </Link>
        </section>

        {/* Ask your past self — semantic search over the user's own entries. */}
        <section className="mb-12">
          <Link
            href="/insights/ask"
            className="group block rounded-2xl border border-zinc-200 dark:border-white/10 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-[#1E1E2E] p-6 transition hover:border-indigo-300 dark:hover:border-indigo-700/40"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                  New
                </p>
                <h2 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  Ask your past self
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Natural-language questions across your own journal history —
                  answered in your own words.
                </p>
              </div>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="mt-1 text-zinc-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </Link>
        </section>

        {/* Mood & Weekly Reports */}
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
            Mood & Weekly Reports
          </h2>
          <InsightsView />
        </section>
      </main>
    </div>
  );
}
