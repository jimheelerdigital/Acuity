import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { getUserProgression } from "@/lib/userProgression";
import { ComparisonsCard } from "@/components/comparisons-card";
import { HealthCorrelationsCard } from "@/components/health-correlations-card";
import { UserInsightsCard } from "@/components/user-insights-card";
import { LockedFeatureCard } from "@/components/locked-feature-card";
import { PageContainer } from "@/components/page-container";
import { HeroCard, SectionHeader } from "@/components/acuity";

import { InsightsView } from "./insights-view";
import { RecentTimeline } from "./recent-timeline";
import { MetricsDrawer } from "./metrics-drawer";

export const dynamic = "force-dynamic";

/**
 * /insights — hub for SECONDARY analytical features.
 *
 * Post bug-5 follow-up (2026-05-24): Life Matrix and Theme Map are
 * sidebar-primary now, so this page no longer duplicates them as
 * featured cards. Instead, /insights is the index for the long
 * tail of analytical surfaces:
 *
 *   - Ask Your Past Self
 *   - State of Me (quarterly)
 *   - Mood + Weekly Reports
 *   - Metrics drawer: pattern insights, health correlations,
 *     comparisons
 *
 * Future Anchor People, Goal Velocity, etc. land here when they
 * ship. Daily users who want the marquee viz hit the sidebar
 * directly; reflective users who want the long-tail features come
 * to /insights.
 */
export default async function InsightsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");

  const progression = await getUserProgression(session.user.id);

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <PageContainer mobileWidth="4xl">
        <header className="acuity-fade-up mb-10">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            Insights
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight text-acuity-text lg:text-5xl">
            Insights
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-acuity-text-sec">
            Explore your reflections beyond the basics.
          </p>
        </header>

        {/* Featured destinations — the long-tail analytical features.
            Ask + State of Me get HeroCard treatment (primary + secondary
            variants) so the corner blob differentiates the two without
            them feeling like duplicates. Life Matrix + Theme Map are
            sidebar-primary now; not duplicated here. */}
        <div className="acuity-stagger mb-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div data-stagger>
            <Link href="/insights/ask" className="group block">
              <HeroCard variant="primary" padding={6}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
                      Ask
                    </p>
                    <h2 className="mt-3 font-display text-xl font-semibold text-acuity-text">
                      Ask your past self
                    </h2>
                    <p className="mt-1 text-[15px] leading-relaxed text-acuity-text-sec">
                      Natural-language questions across your journal
                      history — answered in your own words.
                    </p>
                  </div>
                  <span className="mt-1 text-acuity-text-ter transition group-hover:text-acuity-primary">
                    →
                  </span>
                </div>
              </HeroCard>
            </Link>
          </div>

          <div data-stagger>
            <Link href="/insights/state-of-me" className="group block">
              <HeroCard variant="secondary" padding={6}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
                      Quarterly
                    </p>
                    <h2 className="mt-3 font-display text-xl font-semibold text-acuity-text">
                      State of Me
                    </h2>
                    <p className="mt-1 text-[15px] leading-relaxed text-acuity-text-sec">
                      Every 90 days, a long-form read across the
                      quarter — themes, mood arc, patterns worth
                      noticing.
                    </p>
                  </div>
                  <span className="mt-1 text-acuity-text-ter transition group-hover:text-acuity-secondary">
                    →
                  </span>
                </div>
              </HeroCard>
            </Link>
          </div>
        </div>

        {/* Timeline — recent activity. Lightweight chrome; not a
            destination card, more a reading surface. */}
        <RecentTimeline />

        <section className="mb-10">
          <SectionHeader label="Mood & weekly reports" className="mb-4" />
          {progression.unlocked.weeklyReport ? (
            <InsightsView />
          ) : (
            <LockedFeatureCard unlockKey="weeklyReport" progression={progression} />
          )}
        </section>

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
