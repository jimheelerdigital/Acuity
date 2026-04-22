import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { ComparisonsCard } from "@/components/comparisons-card";
import { HealthCorrelationsCard } from "@/components/health-correlations-card";
import { UserInsightsCard } from "@/components/user-insights-card";

import { InsightsView } from "./insights-view";
import { LifeMap } from "./life-map";
import { RecentTimeline } from "./recent-timeline";
import { MetricsDrawer } from "./metrics-drawer";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-4xl px-6 py-10 animate-fade-in">
        {/* ─── 1. LIFE MATRIX — hero ─────────────────────────────── */}
        <section className="mb-10">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">
            Life Matrix
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            Your life, decoded — across every area.
          </p>
          <LifeMap />
        </section>

        {/* ─── 2. TIMELINE / RECENT ACTIVITY ───────────────────── */}
        <RecentTimeline />

        {/* ─── 3. THEME MAP ────────────────────────────────────── */}
        <section className="mb-4">
          <Link
            href="/insights/theme-map"
            className="group block rounded-2xl border border-zinc-200 dark:border-white/10 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/20 dark:to-[#1E1E2E] p-6 transition hover:border-violet-300 dark:hover:border-violet-700/40"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
                  Explore
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

        {/* ─── 4. ASK YOUR PAST SELF ───────────────────────────── */}
        <section className="mb-4">
          <Link
            href="/insights/ask"
            className="group block rounded-2xl border border-zinc-200 dark:border-white/10 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-[#1E1E2E] p-6 transition hover:border-indigo-300 dark:hover:border-indigo-700/40"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                  Ask
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

        {/* ─── 5. STATE OF ME ──────────────────────────────────── */}
        <section className="mb-10">
          <Link
            href="/insights/state-of-me"
            className="group block rounded-2xl border border-zinc-200 dark:border-white/10 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-[#1E1E2E] p-6 transition hover:border-amber-300 dark:hover:border-amber-700/40"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
                  Quarterly
                </p>
                <h2 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  State of Me
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Every 90 days, a long-form read across the quarter —
                  themes, mood arc, patterns worth noticing.
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
                className="mt-1 text-zinc-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </Link>
        </section>

        {/* ─── 6. WEEKLY REPORT — below-fold ────────────────── */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
            Mood & Weekly Reports
          </h2>
          <InsightsView />
        </section>

        {/* ─── 7. METRICS & OBSERVATIONS — collapsible ──────── */}
        <MetricsDrawer>
          <UserInsightsCard />
          <HealthCorrelationsCard />
          <ComparisonsCard />
        </MetricsDrawer>
      </main>
    </div>
  );
}
