import { Suspense } from "react";
import { Flame } from "lucide-react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { TrackCompleteRegistration, TrackSubscribe } from "@/components/meta-pixel-events";
import { WelcomeBackBanner } from "@/components/welcome-back-banner";
import { HomeFocusStack } from "@/components/home-focus-stack";
import { ProgressionChecklist } from "@/components/progression-checklist";
import { Prisma } from "@prisma/client";

import { entitlementsFor } from "@/lib/entitlements";
import { backfillWindowCutoff } from "@/lib/backfill-extractions";
import { computeProgressionState, type ProgressionState } from "@/lib/progression";
import { getUserProgression } from "@/lib/userProgression";
import { BackfillBanner } from "@/components/backfill-banner";
import { PageContainer } from "@/components/page-container";
import { ProLockedCard } from "@/components/pro-locked-card";
import { RecordButton } from "./record-button";
import { Greeting } from "./greeting";

import { TodaysPromptSection } from "./_sections/todays-prompt";
import { StreakSummarySection } from "./_sections/streak-summary";
import { LifeMatrixSection } from "./_sections/life-matrix";
import { WeeklyInsightSection } from "./_sections/weekly-insight";
import { GoalsSnapshotSection } from "./_sections/goals-snapshot";
import { RecentSessionsSection } from "./_sections/recent-sessions";
import { OpenTasksSection } from "./_sections/open-tasks";
import {
  TodaysPromptSkeleton,
  StreakSummarySkeleton,
  LifeMatrixSkeleton,
  WeeklyInsightSkeleton,
  GoalsSnapshotSkeleton,
  RecentSessionsSkeleton,
  OpenTasksSkeleton,
} from "./_sections/skeletons";

export const dynamic = "force-dynamic";

/**
 * /home — dashboard shell.
 *
 * This page is intentionally thin. It runs only the synchronous
 * gates (auth, onboarding, trial banner, progression checklist),
 * then renders the dashboard grid where each card is its own
 * <Suspense> boundary. Slow queries on one card no longer gate
 * the rest of the page; React streams each section in as its
 * data resolves.
 *
 * Per-section data fetches live in ./_sections/*. Per-section
 * skeletons live in ./_sections/skeletons.tsx. The route-level
 * loading.tsx renders during route transitions (e.g. /tasks →
 * /home); the in-page Suspense boundaries handle hard reloads.
 */
export default async function DashboardPage() {
  // ── Gate 1: auth ──────────────────────────────────────────────
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");
  const userId = session.user.id;

  // ── Gate 2: onboarding ────────────────────────────────────────
  const { prisma } = await import("@/lib/prisma");
  const onboarding = await prisma.userOnboarding.findUnique({
    where: { userId },
    select: { completedAt: true, currentStep: true },
  });
  if (!onboarding || !onboarding.completedAt) {
    const step = onboarding?.currentStep ?? 1;
    redirect(`/onboarding?step=${step}`);
  }

  // ── Shell-level reads (cheap, drive shell chrome) ─────────────
  // currentStreak: mobile streak chip above the grid
  // trialEndsAt + createdAt: WelcomeBackBanner reduced-trial detect
  // subscriptionStatus: PAST_DUE banner
  // onboarding.progressionChecklist: ProgressionChecklist state
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      trialEndsAt: true,
      currentStreak: true,
      subscriptionStatus: true,
      // v1.1 slice 5 — drives the backfill banner. backfillStartedAt
      // distinguishes "in flight" vs "never asked"; banner renders
      // only when both are null AND user is PRO-side AND there's at
      // least one eligible entry (counted below).
      backfillPromptDismissedAt: true,
      backfillStartedAt: true,
      onboarding: { select: { progressionChecklist: true } },
    },
  });

  const progression = user?.createdAt
    ? await computeProgressionState({
        userId,
        createdAt: user.createdAt,
        storedState:
          (user.onboarding?.progressionChecklist as ProgressionState | null) ??
          null,
      })
    : null;

  const userProg = await getUserProgression(userId);

  // v1.1 slice 5 — backfill banner gating. PRO-side users with
  // un-extracted entries in the 60d window who haven't dismissed
  // the prompt see the banner. Single Prisma count, runs in
  // parallel with the rest of the dashboard reads.
  const showBackfillPrompt =
    user &&
    !user.backfillPromptDismissedAt &&
    !user.backfillStartedAt &&
    entitlementsFor({
      subscriptionStatus: user.subscriptionStatus,
      trialEndsAt: user.trialEndsAt,
    }).canExtractEntries;

  const cutoffRecent = backfillWindowCutoff("recent");
  const cutoffOlder = backfillWindowCutoff("older");
  const [recentCount, olderCount] = showBackfillPrompt
    ? await Promise.all([
        prisma.entry.count({
          where: {
            userId,
            extracted: false,
            rawAnalysis: { equals: Prisma.DbNull },
            status: "COMPLETE",
            transcript: { not: null },
            createdAt: { gt: cutoffRecent.gt! },
          },
        }),
        prisma.entry.count({
          where: {
            userId,
            extracted: false,
            rawAnalysis: { equals: Prisma.DbNull },
            status: "COMPLETE",
            transcript: { not: null },
            createdAt: { lte: cutoffOlder.lte! },
          },
        }),
      ])
    : [0, 0];

  const renderBackfillBanner = showBackfillPrompt && recentCount > 0;

  // §B.2.1 — FREE post-trial users see a Pro pulse teaser card
  // alongside today's prompt. The user row already has the fields
  // entitlementsFor needs; no extra DB round-trip.
  const isProLocked = user
    ? entitlementsFor({
        subscriptionStatus: user.subscriptionStatus,
        trialEndsAt: user.trialEndsAt,
      }).canExtractEntries === false
    : false;

  const firstName = session.user.name?.split(" ")[0] ?? "there";
  const currentStreak = user?.currentStreak ?? 0;

  // Reduced-trial detection (pentest T-07): trial ≤ 7d → 3-day re-signup
  const trialWindowDays =
    user?.trialEndsAt && user?.createdAt
      ? Math.round(
          (user.trialEndsAt.getTime() - user.createdAt.getTime()) /
            (24 * 60 * 60 * 1000)
        )
      : 14;
  const reducedTrial = trialWindowDays <= 7;
  const trialDaysLeft = user?.trialEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (user.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        )
      )
    : 0;

  return (
    <div className="min-h-screen">
      <TrackCompleteRegistration />
      <TrackSubscribe />
      <PageContainer mobileWidth="5xl" className="animate-fade-in">
        <WelcomeBackBanner reduced={reducedTrial} daysLeft={trialDaysLeft} />

        {user?.subscriptionStatus === "PAST_DUE" && (
          <section className="mb-6 rounded-2xl border border-amber-300 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 px-5 py-4 flex items-start gap-3">
            <span className="text-lg leading-none">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Stripe couldn&apos;t charge your card
              </p>
              <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">
                Update your payment method to keep your subscription active.
                Nothing gets cut off right away — Stripe retries over the next
                couple of weeks.
              </p>
              <a
                href="/account"
                className="mt-2 inline-block text-xs font-semibold text-amber-900 dark:text-amber-100 underline"
              >
                Update in Account settings →
              </a>
            </div>
          </section>
        )}

        <div className="mb-8">
          <HomeFocusStack progression={userProg} />
        </div>

        <div className="mb-6 text-center sm:text-left">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            <Greeting firstName={firstName} />
          </h1>
          {currentStreak >= 2 && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-orange-600 dark:text-orange-400 lg:hidden">
              <Flame className="h-4 w-4" aria-hidden="true" />
              {currentStreak}-day streak
            </p>
          )}
        </div>

        {/* Mobile-only record card. Desktop has the persistent
            sidebar Record button. The id="record" anchor is kept
            on the wrapper so the sidebar #record hash still has
            a target on desktop (scroll-jumps to top, harmless). */}
        <div id="record" className="mb-8 mx-auto max-w-lg lg:hidden">
          <RecordButton />
        </div>

        {progression && (
          <ProgressionChecklist
            items={progression.items}
            completedCount={progression.completedCount}
            totalVisibleCount={progression.totalVisibleCount}
          />
        )}

        {/* v1.1 slice 5 — "Process my history" backfill banner.
            Shown above the dashboard grid for newly-PRO users who
            still have un-extracted FREE-tier entries. Server-
            computed gate; client component owns the dispatch +
            dismiss side effects. */}
        {renderBackfillBanner && (
          <BackfillBanner
            recentCount={recentCount}
            olderCount={olderCount}
          />
        )}

        {/* Dashboard rows — each row is its own grid. The previous
            single-grid implementation broke at wide widths because
            position:sticky inside a CSS grid escapes its row: a
            sticky child's containing block is the nearest scrollport,
            not its grid cell, so the row-3 right rail kept following
            the user's scroll past row 3 and visually overlapped row
            4's Open Tasks card. Per-row grids put the rail back
            inside a row-scoped containing block (the row's own grid
            wrapper) so its sticky stop is the bottom of that row.
            min-w-0 on the row-3 wrappers prevents intrinsic min-
            content from any descendant (notably the radar SVG) from
            forcing a column to widen. space-y-6 = the prior gap-6. */}
        <div className="space-y-6">
          {/* Row 2 — Today's prompt + Streak */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <Suspense fallback={<TodaysPromptSkeleton />}>
              <TodaysPromptSection userId={userId} />
            </Suspense>
            <Suspense fallback={<StreakSummarySkeleton />}>
              <StreakSummarySection userId={userId} />
            </Suspense>
          </div>

          {/* §B.2.1 Pro pulse — alongside today's prompt for FREE
              post-trial users. Renders a smaller teaser card with
              the locked Pro prompt example below the main prompt
              row so it reads as a "preview of what Pro adds"
              rather than a paywall blocking the main content. */}
          {isProLocked && (
            <div className="lg:col-span-12">
              <ProLockedCard surfaceId="pro_pulse_home" />
            </div>
          )}

          {/* Row 3 — Life Matrix + (Weekly insight stacked over Goals).
              `lg:items-start` so the rail column doesn't stretch to
              row height (stretching defeats sticky — the column
              would fill the row, leaving sticky no room to travel). */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
            <Suspense fallback={<LifeMatrixSkeleton />}>
              <LifeMatrixSection userId={userId} />
            </Suspense>
            <div className="min-w-0 flex flex-col gap-6 lg:col-span-5 2xl:sticky 2xl:top-6">
              <Suspense fallback={<WeeklyInsightSkeleton />}>
                <WeeklyInsightSection userId={userId} />
              </Suspense>
              <Suspense fallback={<GoalsSnapshotSkeleton />}>
                <GoalsSnapshotSection userId={userId} />
              </Suspense>
            </div>
          </div>

          {/* Row 4 — Recent sessions + Open tasks */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <Suspense fallback={<RecentSessionsSkeleton />}>
              <RecentSessionsSection userId={userId} />
            </Suspense>
            <Suspense fallback={<OpenTasksSkeleton />}>
              <OpenTasksSection userId={userId} />
            </Suspense>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
