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
import {
  Card,
  HeroCard,
  SectionHeader,
} from "@/components/acuity";

import { InsightsView } from "./insights-view";
import { RecentTimeline } from "./recent-timeline";
import { MetricsDrawer } from "./metrics-drawer";

export const dynamic = "force-dynamic";

/**
 * /insights — hub for everything the product has learned about the
 * user. Two featured destinations (Life Matrix + Theme Map) get
 * HeroCard treatment; secondary destinations (Ask + State of Me) get
 * tinted Cards. Slice 12 (2026-05-22) composition refresh: canonical
 * primitives, atmospheric chrome, on the page root.
 */
export default async function InsightsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");

  const progression = await getUserProgression(session.user.id);
  const entitlement = await getUserEntitlement(session.user.id);
  const isProLocked = entitlement?.canExtractEntries === false;

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <PageContainer mobileWidth="4xl">
        <header className="acuity-fade-up mb-10">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            Overview
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight text-acuity-text lg:text-5xl">
            Insights
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-acuity-text-sec">
            Everything Acuity has learned about you — explored by signal.
          </p>
        </header>

        {/* Featured destinations — Life Matrix + Theme Map. HeroCard
            primary (coral) for Life Matrix, secondary (violet) for
            Theme Map. Gives a visual hierarchy that matches mobile's
            insights tab composition. */}
        <div className="acuity-stagger mb-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div data-stagger>
            {isProLocked ? (
              <ProLockedCard surfaceId="life_matrix_locked" />
            ) : progression.unlocked.lifeMatrix ? (
              <Link href="/life-matrix" className="group block">
                <HeroCard variant="primary" padding={6}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
                        Flagship
                      </p>
                      <h2 className="mt-3 font-display text-xl font-semibold text-acuity-text">
                        Life Matrix
                      </h2>
                      <p className="mt-1 text-sm leading-relaxed text-acuity-text-sec">
                        Your scores across every life area, with trends and
                        recurring themes pulled from every debrief.
                      </p>
                    </div>
                    <span className="mt-1 text-acuity-text-ter transition group-hover:text-acuity-primary">
                      →
                    </span>
                  </div>
                </HeroCard>
              </Link>
            ) : (
              <LockedFeatureCard unlockKey="lifeMatrix" progression={progression} />
            )}
          </div>

          <div data-stagger>
            {isProLocked ? (
              <ProLockedCard surfaceId="theme_map_locked" />
            ) : progression.unlocked.themeMap ? (
              <Link href="/insights/theme-map" className="group block">
                <HeroCard variant="secondary" padding={6}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
                        Explore
                      </p>
                      <h2 className="mt-3 font-display text-xl font-semibold text-acuity-text">
                        Theme Map
                      </h2>
                      <p className="mt-1 text-sm leading-relaxed text-acuity-text-sec">
                        The patterns your debriefs keep circling back to —
                        sized by frequency, colored by tone.
                      </p>
                    </div>
                    <span className="mt-1 text-acuity-text-ter transition group-hover:text-acuity-secondary">
                      →
                    </span>
                  </div>
                </HeroCard>
              </Link>
            ) : (
              <LockedFeatureCard unlockKey="themeMap" progression={progression} />
            )}
          </div>
        </div>

        {/* Timeline — recent activity */}
        <RecentTimeline />

        {/* Secondary destinations — Ask + State of Me */}
        <div className="acuity-stagger mb-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div data-stagger>
            <Link href="/insights/ask" className="group block">
              <Card variant="tinted" radius="xl" padding={6}>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
                  Ask
                </p>
                <h2 className="mt-3 font-display text-xl font-semibold text-acuity-text">
                  Ask your past self
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-acuity-text-sec">
                  Natural-language questions across your journal history —
                  answered in your own words.
                </p>
              </Card>
            </Link>
          </div>

          <div data-stagger>
            <Link href="/insights/state-of-me" className="group block">
              <Card variant="tinted" radius="xl" padding={6}>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
                  Quarterly
                </p>
                <h2 className="mt-3 font-display text-xl font-semibold text-acuity-text">
                  State of Me
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-acuity-text-sec">
                  Every 90 days, a long-form read across the quarter — themes,
                  mood arc, patterns worth noticing.
                </p>
              </Card>
            </Link>
          </div>
        </div>

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
