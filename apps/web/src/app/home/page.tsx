import type { Task } from "@prisma/client";
import { Flame } from "lucide-react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { TrackCompleteRegistration, TrackPurchase } from "@/components/meta-pixel-events";
import { WelcomeBackBanner } from "@/components/welcome-back-banner";
import { HomeFocusStack } from "@/components/home-focus-stack";
import { ProgressionChecklist } from "@/components/progression-checklist";
import { computeProgressionState, type ProgressionState } from "@/lib/progression";
import { getUserProgression } from "@/lib/userProgression";
import { PageContainer } from "@/components/page-container";
import { RecordButton } from "./record-button";
import { EntryCard } from "./entry-card";
import { Greeting } from "./greeting";
import { GoalsSnapshotCard, type SnapshotGoal } from "./goals-snapshot";
import { LifeMatrixSnapshot } from "./life-matrix-snapshot";
import { OpenTasksCard } from "./open-tasks-card";
import { WeeklyInsightCard } from "./weekly-insight-card";

const HOME_ENTRY_LIMIT = 5;

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");

  const userId = session.user.id;

  // Gate dashboard behind onboarding completion. New users (no row) or
  // anyone whose row has completedAt=null gets routed to step 1. Existing
  // users predating the 2026-04-19 onboarding rollout have no row either —
  // acceptable: they'll see onboarding once and finish it.
  {
    const { prisma } = await import("@/lib/prisma");
    const onboarding = await prisma.userOnboarding.findUnique({
      where: { userId },
      select: { completedAt: true, currentStep: true },
    });
    if (!onboarding || !onboarding.completedAt) {
      const step = onboarding?.currentStep ?? 1;
      redirect(`/onboarding?step=${step}`);
    }
  }

  type EntryWithCount = Awaited<ReturnType<typeof fetchEntries>>[number];
  let entries: EntryWithCount[] = [];
  let tasks: Task[] = [];

  // Re-read user for streak + trial shape + progression state. Single
  // row read; cheap.
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      trialEndsAt: true,
      currentStreak: true,
      subscriptionStatus: true,
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

  // Phase 2 Run 1 — focus card stack. HomeFocusStack early-returns null
  // when there's no celebration content, so a power user on day 30
  // sees the dashboard grid with zero stacked banners above it.
  const userProg = await getUserProgression(userId);

  // Recommendation selector for "Today's prompt" widget. Mirrors
  // /api/home's 3-tier logic. Inline rather than fetch-self because
  // this is server-rendered and prisma is already in scope.
  const recommendation = await pickHomeRecommendation(userId);

  // Dashboard data, all parallelized:
  //   - entries: 7 most recent for the Recent sessions widget
  //   - tasks: 10 open for the Open tasks widget
  //   - lifemap: 6 dimension scores for the Life Matrix snapshot
  //   - weeklyReport: most recent COMPLETE for the Weekly insight quote
  //   - totalEntryCount: drives empty-state progress bars on Life
  //     Matrix + Weekly insight widgets
  //
  // Goals widget removed in 2026-04-24 dashboard redesign — Goals
  // lives at /goals, no need to duplicate on /home.
  let lifemapAreas: { area: string; score: number }[] = [];
  let weeklyReport: Awaited<ReturnType<typeof fetchLatestWeeklyReport>> = null;
  let totalEntryCount = 0;
  let snapshotGoals: SnapshotGoal[] = [];
  try {
    [entries, tasks, lifemapAreas, weeklyReport, totalEntryCount, snapshotGoals] =
      await Promise.all([
        fetchEntries(userId),
        prisma.task.findMany({
          where: { userId, status: { in: ["TODO", "IN_PROGRESS", "OPEN"] } },
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          take: 10,
        }),
        prisma.lifeMapArea.findMany({
          where: { userId },
          select: { area: true, score: true },
          orderBy: { sortOrder: "asc" },
        }),
        fetchLatestWeeklyReport(userId),
        prisma.entry.count({ where: { userId } }),
        // Top 3 goals for the snapshot card under Weekly insight.
        // Status priority: IN_PROGRESS first, then NOT_STARTED, then
        // anything else. Skip ARCHIVED + COMPLETE entirely — they
        // belong in the goals page, not the dashboard glance.
        fetchSnapshotGoals(userId),
      ]);
  } catch (err) {
    console.error("[dashboard] Failed to load data:", err);
  }

  // Greeting word picked client-side from the user's local hour —
  // server-side `new Date().getHours()` returns the SERVER's hour
  // (Vercel runs UTC), which produces "Good morning" at midnight ET.
  // First name is server-known and stable; only the time-of-day
  // word is client-computed. See ./greeting.tsx.
  const firstName = session.user.name?.split(" ")[0] ?? "there";

  // Reduced-trial detection for the welcome-back banner (pentest T-07 fix):
  // if trialEndsAt is within 7 days of createdAt, the user got the
  // 3-day re-signup trial. 7 is a generous cutoff vs the 3-day actual —
  // room for clock skew without leaking the 14-day standard trial into
  // the banner.
  const trialWindowDays =
    user?.trialEndsAt && user?.createdAt
      ? Math.round(
          (user.trialEndsAt.getTime() - user.createdAt.getTime()) /
            (24 * 60 * 60 * 1000)
        )
      : 14;
  const reducedTrial = trialWindowDays <= 7;
  const trialDaysLeft =
    user?.trialEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (user.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
          )
        )
      : 0;
  const currentStreak = user?.currentStreak ?? 0;

  // Sessions-this-week tally for the Streak summary card. The
  // recent-sessions widget below caps at 7 entries already, so we can
  // reuse `entries` to count without an extra query — though the
  // count there is "of the last 7 records" not "this week" in calendar
  // sense. For the dashboard summary we want calendar-week.
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const sessionsThisWeek = entries.filter(
    (e) => Date.now() - e.createdAt.getTime() < oneWeekMs
  ).length;

  return (
    <div className="min-h-screen">
      <TrackCompleteRegistration />
      <TrackPurchase />
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
                Update your payment method to keep your subscription active. Nothing gets cut off right away — Stripe retries over the next couple of weeks.
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

        {/* Focus card stack — only renders when there's celebration
            content (recently unlocked feature, milestone, etc).
            Power users with quiet progression skip this block
            entirely and see the dashboard grid first. */}
        <div className="mb-8">
          <HomeFocusStack progression={userProg} />
        </div>

        {/* Greeting + mobile streak. On lg+ the streak number lives
            inside the StreakSummaryCard widget; on mobile the
            existing inline display is preserved. */}
        <div className="mb-6 text-center sm:text-left">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 lg:text-3xl">
            <Greeting firstName={firstName} />
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {entries.length === 0
              ? "Record your first daily debrief to get started."
              : `${entries.length} session${entries.length === 1 ? "" : "s"} this week.`}
          </p>
          {currentStreak >= 2 && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-orange-600 dark:text-orange-400 lg:hidden">
              <Flame className="h-4 w-4" aria-hidden="true" />
              {currentStreak}-day streak
            </p>
          )}
        </div>

        {/* Record card — MOBILE ONLY. The sidebar Record button
            is always visible at lg+, so this dashboard surface is
            redundant on desktop and was eating viewport above the
            actual signal-tier widgets. Mobile keeps the big
            centered-mic surface as the primary action.
            The id="record" anchor is kept on the wrapper so the
            sidebar Record link's #record hash still has a target
            on desktop (scroll-jumps to top of page, harmless). */}
        <div
          id="record"
          className="mb-8 mx-auto max-w-lg lg:hidden"
        >
          <RecordButton />
        </div>

        {progression && (
          <ProgressionChecklist
            items={progression.items}
            completedCount={progression.completedCount}
            totalVisibleCount={progression.totalVisibleCount}
          />
        )}

        {/* Dashboard grid — desktop only. Mobile (<lg) falls through
            to the old single-column stacking via the absence of
            lg:grid-cols utilities; each row's children stack
            naturally. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-6">
          {/* Row 2 — Today's prompt (8 cols) + Streak summary (4 cols) */}
          <TodaysPromptCard
            prompt={recommendation.text}
            label={recommendation.label}
            goalId={recommendation.goalId}
          />
          <StreakSummaryCard
            currentStreak={currentStreak}
            sessionsThisWeek={sessionsThisWeek}
            totalEntryCount={totalEntryCount}
          />

          {/* Row 3 — SIGNAL TIER. Life Matrix snapshot is the visual
              center of gravity (7 cols), Weekly insight to its right
              (5 cols). */}
          <div className="lg:col-span-7">
            <LifeMatrixSnapshot
              areas={lifemapAreas}
              entryCount={totalEntryCount}
              unlocked={userProg.unlocked.lifeMatrix}
            />
          </div>
          {/* Right column — Weekly insight (top, content-sized) +
              Goals snapshot (flex-1, stretches). `h-full` is the
              critical bit: CSS grid stretches the cell to row height,
              but the inner flex container only fills its content
              height by default — so flex-1 on Goals had nothing to
              grow into. With h-full the wrapper takes the full cell
              height and Goals stretches to fill remaining space,
              matching the bottom edge of LifeMatrixSnapshot on the
              left. */}
          <div className="flex h-full flex-col gap-6 lg:col-span-5">
            <WeeklyInsightCard
              report={weeklyReport}
              entryCount={totalEntryCount}
              unlocked={userProg.unlocked.weeklyReport}
            />
            <GoalsSnapshotCard goals={snapshotGoals} className="flex-1" />
          </div>

          {/* Row 4 — CONTEXT TIER. Recent sessions + Open tasks split
              50/50 (was 7/5). Equal cols so the two lists balance
              vertically — Open Tasks no longer leaves a hanging gap
              on the right when Recent Sessions has 5 entries. */}
          <section className="lg:col-span-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#1E1E2E]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Recent sessions
              </h2>
              {entries.length > HOME_ENTRY_LIMIT && (
                <Link
                  href="/entries"
                  className="text-xs font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400"
                >
                  View all →
                </Link>
              )}
            </div>
            {entries.length === 0 ? (
              <EmptyState
                icon="🎙️"
                title="No entries yet"
                description="Hit the record button and speak your mind."
              />
            ) : (
              <div className="space-y-3">
                {entries.slice(0, HOME_ENTRY_LIMIT).map((e) => (
                  <EntryCard
                    key={e.id}
                    entry={e}
                    taskCount={e._count.tasks}
                  />
                ))}
              </div>
            )}
          </section>

          <OpenTasksCard
            initialTasks={tasks.map((t) => ({
              id: t.id,
              title: t.title,
              text: t.text,
              status: t.status,
              priority: t.priority,
            }))}
          />
        </div>
      </PageContainer>
    </div>
  );
}

// ─── Data fetching ───────────────────────────────────────────────────────────

async function fetchEntries(userId: string) {
  const { prisma } = await import("@/lib/prisma");
  return prisma.entry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 7,
    include: {
      _count: { select: { tasks: true } },
    },
  });
}

async function fetchSnapshotGoals(userId: string): Promise<SnapshotGoal[]> {
  const { prisma } = await import("@/lib/prisma");
  // Pull the top 3 active goals — IN_PROGRESS first (the "you're
  // doing this" tier), NOT_STARTED next (extracted but not engaged
  // yet). Excludes COMPLETE, ON_HOLD, ARCHIVED — those don't belong
  // on the at-a-glance dashboard surface.
  const rows = await prisma.goal.findMany({
    where: { userId, status: { in: ["IN_PROGRESS", "NOT_STARTED"] } },
    orderBy: [{ status: "asc" }, { lastMentionedAt: "desc" }, { createdAt: "desc" }],
    take: 3,
    select: {
      id: true,
      title: true,
      status: true,
      progress: true,
      lifeArea: true,
    },
  });
  // Sort IN_PROGRESS before NOT_STARTED — Prisma's `asc` on the
  // string column gives I < N alphabetically which happens to match.
  return rows;
}

async function fetchLatestWeeklyReport(userId: string) {
  const { prisma } = await import("@/lib/prisma");
  return prisma.weeklyReport.findFirst({
    where: { userId, status: "COMPLETE" },
    orderBy: { weekStart: "desc" },
    select: {
      id: true,
      weekStart: true,
      weekEnd: true,
      insightBullets: true,
      narrative: true,
    },
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * Today's prompt card — widget #2. Wraps the existing recommendation
 * engine output (label + text + optional goalId) in a generous
 * quote-card. Always populated; the recommendation engine has a
 * 3-tier fallback so it never returns empty.
 */
function TodaysPromptCard({
  prompt,
  label,
  goalId,
}: {
  prompt: string;
  label: string | null;
  /** Optional — Recommendation.goalId is `string | undefined` (a
   *  field that exists for GOAL-tier recommendations only). Allow
   *  both undefined and null at the boundary so server data flows
   *  through without coercion. */
  goalId?: string | null;
}) {
  const recordHref = goalId
    ? `/home?goalId=${encodeURIComponent(goalId)}#record`
    : "/home#record";
  return (
    <section className="lg:col-span-8 rounded-2xl border border-zinc-200 bg-gradient-to-br from-violet-50/60 via-white to-white p-6 shadow-sm dark:border-white/10 dark:from-violet-950/20 dark:via-[#1E1E2E] dark:to-[#1E1E2E]">
      {label && (
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
          {label}
        </p>
      )}
      <p className="mt-2 text-base font-medium leading-relaxed text-zinc-800 dark:text-zinc-100 lg:text-lg">
        {prompt}
      </p>
      <Link
        href={recordHref}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-violet-600 transition hover:text-violet-500 dark:text-violet-400"
      >
        Record about this
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </Link>
    </section>
  );
}

/**
 * Streak + sessions-this-week summary — widget #3. Replaces the
 * "resting card" content that previously sat above the dashboard
 * inside HomeFocusStack. Always shows; copy adapts to streak === 0
 * vs ≥ 1 days.
 */
function StreakSummaryCard({
  currentStreak,
  sessionsThisWeek,
  totalEntryCount,
}: {
  currentStreak: number;
  sessionsThisWeek: number;
  totalEntryCount: number;
}) {
  const streakLabel =
    currentStreak === 0
      ? "0-day streak"
      : `${currentStreak}-day streak`;

  // Three-tier hint: brand-new user, has-been-recording, broke-streak.
  let hint: string;
  if (totalEntryCount === 0) {
    hint = "Record today to start the count.";
  } else if (currentStreak === 0) {
    hint = "One recording today restarts the streak.";
  } else {
    hint =
      sessionsThisWeek === 1
        ? "1 session this week so far. Keep it going."
        : `${sessionsThisWeek} sessions this week.`;
  }

  return (
    <section className="lg:col-span-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#1E1E2E]">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        Streak
      </h2>
      <div className="mt-2 flex items-center gap-2">
        <Flame
          className={`h-6 w-6 ${
            currentStreak >= 2
              ? "text-orange-500"
              : "text-zinc-300 dark:text-zinc-600"
          }`}
          aria-hidden="true"
        />
        <p className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {streakLabel}
        </p>
      </div>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{hint}</p>
    </section>
  );
}

function EmptyState({
  icon,
  title,
  description,
  compact = false,
}: {
  icon: string;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-zinc-300 text-center dark:border-white/10 ${compact ? "px-4 py-5" : "px-6 py-10"}`}
    >
      <div className={compact ? "text-2xl mb-1.5" : "text-3xl mb-2"}>
        {icon}
      </div>
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</p>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{description}</p>
    </div>
  );
}

/**
 * Delegates to the shared pickRecommendation helper so /api/home and
 * the server-rendered dashboard agree on the chosen prompt + tier.
 * Kept as a thin wrapper because the dashboard already has prisma in
 * scope — importing the helper keeps logic in one place.
 */
async function pickHomeRecommendation(userId: string) {
  const { prisma } = await import("@/lib/prisma");
  const { pickRecommendation } = await import("@/lib/recommendation");
  return pickRecommendation(prisma, userId);
}
