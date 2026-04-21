import type { Task, Goal } from "@prisma/client";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { pickDailyPrompt } from "@acuity/shared";

import { getAuthOptions } from "@/lib/auth";
import { TrackCompleteRegistration, TrackPurchase } from "@/components/meta-pixel-events";
import { WelcomeBackBanner } from "@/components/welcome-back-banner";
import { ProgressionChecklist } from "@/components/progression-checklist";
import { RecommendedActivity } from "@/components/recommended-activity";
import { computeProgressionState, type ProgressionState } from "@/lib/progression";
import { RecordButton } from "./record-button";
import { EntryCard } from "./entry-card";

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
  let goals: Goal[] = [];

  // Re-read user for streak + trial shape + progression state. Single
  // row read; cheap.
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      trialEndsAt: true,
      currentStreak: true,
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

  // Recommendation selector — mirrors /api/home's 3-tier logic. Inline
  // rather than fetch-self because this is server-rendered and the same
  // prisma instance is already in scope.
  const recommendation = await pickHomeRecommendation(userId);

  try {
    [entries, tasks, goals] = await Promise.all([
      fetchEntries(userId),
      prisma.task.findMany({
        where: { userId, status: { in: ["TODO", "IN_PROGRESS", "OPEN"] } },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 10,
      }),
      prisma.goal.findMany({
        where: { userId, status: { in: ["IN_PROGRESS", "NOT_STARTED"] } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);
  } catch (err) {
    console.error("[dashboard] Failed to load data:", err);
  }

  const greeting = getGreeting(session.user.name);

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

  return (
    <div className="min-h-screen">
      <TrackCompleteRegistration />
      <TrackPurchase />
      <main className="mx-auto max-w-5xl px-6 py-10 animate-fade-in">
        <WelcomeBackBanner reduced={reducedTrial} daysLeft={trialDaysLeft} />

        {/* Greeting */}
        <div className="mb-8 text-center sm:text-left">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{greeting}</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            {entries.length === 0
              ? "Record your first daily debrief to get started."
              : `${entries.length} session${entries.length === 1 ? "" : "s"} this week.`}
          </p>
          {currentStreak >= 2 && (
            <p className="mt-2 text-sm font-medium text-orange-600 dark:text-orange-400">
              🔥 {currentStreak}-day streak
            </p>
          )}
        </div>

        {/* Record button */}
        <div id="record" className="mb-10 mx-auto max-w-lg">
          <RecordButton />
        </div>

        {progression && (
          <ProgressionChecklist
            items={progression.items}
            completedCount={progression.completedCount}
            totalVisibleCount={progression.totalVisibleCount}
          />
        )}

        <RecommendedActivity
          prompt={recommendation.text}
          label={recommendation.label}
          goalId={recommendation.goalId}
        />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Recent entries — capped to 5 with "View all" link. Full list
              lives on /entries. */}
          <section className="lg:col-span-2">
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

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Tasks */}
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Open tasks
              </h2>
              {tasks.length === 0 ? (
                <EmptyState
                  icon="✅"
                  title="All clear"
                  description="No open tasks. Record a session to extract some."
                  compact
                />
              ) : (
                <div className="space-y-2">
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 dark:border-white/10 dark:bg-[#1E1E2E] dark:shadow-none dark:hover:bg-[#24243A]"
                    >
                      <p className="text-sm text-zinc-800 leading-snug dark:text-zinc-100">
                        {t.title ?? t.text}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                        {t.priority} · {t.status.replace("_", " ")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Goals */}
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Active goals
              </h2>
              {goals.length === 0 ? (
                <EmptyState
                  icon="🎯"
                  title="No goals"
                  description="Mention a goal in your daily debrief and we'll track it."
                  compact
                />
              ) : (
                <div className="space-y-2">
                  {goals.map((g) => (
                    <div
                      key={g.id}
                      className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 dark:border-white/10 dark:bg-[#1E1E2E] dark:shadow-none dark:hover:bg-[#24243A]"
                    >
                      <p className="text-sm text-zinc-800 leading-snug dark:text-zinc-100">
                        {g.title}
                      </p>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-100 dark:bg-white/10">
                        <div
                          className="h-1.5 rounded-full bg-violet-500 transition-all duration-700"
                          style={{ width: `${g.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
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

// ─── Sub-components ──────────────────────────────────────────────────────────

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

function getGreeting(name?: string | null): string {
  const hour = new Date().getHours();
  const firstName = name?.split(" ")[0] ?? "there";
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour < 17) return `Good afternoon, ${firstName}`;
  return `Good evening, ${firstName}`;
}

/**
 * Mirror of /api/home's tiered recommendation selector. Lives here so
 * the server-rendered dashboard doesn't need to HTTP-fetch its own
 * endpoint just to read prisma.
 *
 * Tier 1 — stalest active goal (≥7 days since lastMentionedAt).
 * Tier 2 — recurring theme in last 5 entries.
 * Tier 3 — library fallback.
 */
async function pickHomeRecommendation(userId: string): Promise<{
  tier: "GOAL" | "PATTERN" | "LIBRARY";
  label: string;
  text: string;
  goalId?: string;
}> {
  const { prisma } = await import("@/lib/prisma");
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  const staleGoal = await prisma.goal.findFirst({
    where: {
      userId,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      OR: [{ lastMentionedAt: null }, { lastMentionedAt: { lt: cutoff } }],
    },
    orderBy: [{ lastMentionedAt: "asc" }, { createdAt: "desc" }],
    select: { id: true, title: true, createdAt: true, lastMentionedAt: true },
  });

  if (staleGoal) {
    const sinceDate = staleGoal.lastMentionedAt ?? staleGoal.createdAt;
    const days = Math.max(
      1,
      Math.round((Date.now() - sinceDate.getTime()) / (24 * 60 * 60 * 1000))
    );
    return {
      tier: "GOAL",
      label: "Building on your goals",
      text: `You set "${staleGoal.title}" ${days} day${days === 1 ? "" : "s"} ago. What's one small thing you could do this week to get closer to it?`,
      goalId: staleGoal.id,
    };
  }

  const recentEntries = await prisma.entry.findMany({
    where: { userId, status: "COMPLETE" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { themes: true },
  });

  if (recentEntries.length >= 3) {
    const counts: Record<string, number> = {};
    for (const e of recentEntries) {
      const seen = new Set<string>();
      for (const t of e.themes ?? []) {
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    const recurring = Object.entries(counts)
      .filter(([, n]) => n >= 2)
      .sort(([, a], [, b]) => b - a);
    if (recurring.length > 0) {
      return {
        tier: "PATTERN",
        label: "Based on your recent themes",
        text: `You've mentioned "${recurring[0][0]}" a few times lately. What's underneath that?`,
      };
    }
  }

  return {
    tier: "LIBRARY",
    label: "Today's prompt",
    text: pickDailyPrompt(userId, new Date().toISOString().slice(0, 10)),
  };
}
