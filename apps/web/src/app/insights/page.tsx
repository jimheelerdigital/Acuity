import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { getUserEntitlement } from "@/lib/entitlements-fetch";
import { getUserProgression } from "@/lib/userProgression";
import { ComparisonsCard } from "@/components/comparisons-card";
import { HealthCorrelationsCard } from "@/components/health-correlations-card";
import { UserInsightsCard } from "@/components/user-insights-card";
import { LockedFeatureCard } from "@/components/locked-feature-card";
import { ProLockedCard } from "@/components/pro-locked-card";
import { PageContainer } from "@/components/page-container";

import { InsightsView } from "./insights-view";
import { RecentTimeline } from "./recent-timeline";
import { MetricsDrawer } from "./metrics-drawer";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");

  const progression = await getUserProgression(session.user.id);
  // §B.2.2 + §B.2.5 — FREE post-trial users see ProLockedCard
  // (billing gate) instead of either the link or the experiential
  // LockedFeatureCard. TRIAL/PRO users see existing behavior.
  const entitlement = await getUserEntitlement(session.user.id);
  const isProLocked = entitlement?.canExtractEntries === false;

  return (
    <div className="min-h-screen">
      <PageContainer mobileWidth="4xl">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
            Overview
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 lg:text-4xl">
            Insights
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400 lg:text-base">
            Everything Acuity has learned about you — explored by signal.
          </p>
        </header>

        {/* Featured destinations — Life Matrix and Theme Map get prime
            real estate since they're the signature views of the product. */}
        <div className="mb-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {isProLocked ? (
            <ProLockedCard surfaceId="life_matrix_locked" />
          ) : progression.unlocked.lifeMatrix ? (
            <Link
              href="/life-matrix"
              className="group block rounded-2xl border border-zinc-200 dark:border-white/10 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/30 dark:to-[#1E1E2E] p-6 transition hover:border-violet-300 dark:hover:border-violet-700/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
                    Flagship
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    Life Matrix
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Your scores across every life area, with trends and recurring
                    themes pulled from every debrief you&rsquo;ve recorded.
                  </p>
                </div>
                <span className="mt-1 text-zinc-400 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition">
                  →
                </span>
              </div>
            </Link>
          ) : (
            <LockedFeatureCard unlockKey="lifeMatrix" progression={progression} />
          )}

          {isProLocked ? (
            <ProLockedCard surfaceId="theme_map_locked" />
          ) : progression.unlocked.themeMap ? (
            <Link
              href="/insights/theme-map"
              className="group block rounded-2xl border border-zinc-200 dark:border-white/10 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/30 dark:to-[#1E1E2E] p-6 transition hover:border-indigo-300 dark:hover:border-indigo-700/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                    Explore
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    Theme Map
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    The patterns your debriefs keep circling back to —
                    sized by frequency, colored by tone.
                  </p>
                </div>
                <span className="mt-1 text-zinc-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                  →
                </span>
              </div>
            </Link>
          ) : (
            <LockedFeatureCard unlockKey="themeMap" progression={progression} />
          )}
        </div>

        {/* Timeline — recent activity */}
        <RecentTimeline />

        {/* Secondary destinations — Ask + State of Me */}
        <div className="mb-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Link
            href="/insights/ask"
            className="group block rounded-2xl border border-zinc-200 dark:border-white/10 bg-gradient-to-br from-indigo-50/60 to-white dark:from-indigo-950/20 dark:to-[#1E1E2E] p-6 transition hover:border-indigo-300 dark:hover:border-indigo-700/40"
          >
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
          </Link>

          <Link
            href="/insights/state-of-me"
            className="group block rounded-2xl border border-zinc-200 dark:border-white/10 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/20 dark:to-[#1E1E2E] p-6 transition hover:border-amber-300 dark:hover:border-amber-700/40"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
              Quarterly
            </p>
            <h2 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              State of Me
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Every 90 days, a long-form read across the quarter — themes,
              mood arc, patterns worth noticing.
            </p>
          </Link>
        </div>

        {/* Mood & weekly report */}
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Mood & Weekly Reports
          </h2>
          {progression.unlocked.weeklyReport ? (
            <InsightsView />
          ) : (
            <LockedFeatureCard unlockKey="weeklyReport" progression={progression} />
          )}
        </section>

        {/* Metrics drawer */}
        <MetricsDrawer>
          {progression.unlocked.patternInsights ? (
            <UserInsightsCard />
          ) : (
            <LockedFeatureCard
              unlockKey="patternInsights"
              progression={progression}
            />
          )}
          <HealthCorrelationsCard />
          <ComparisonsCard />
        </MetricsDrawer>
      </PageContainer>
    </div>
  );
}
