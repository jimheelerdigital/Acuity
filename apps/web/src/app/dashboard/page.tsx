import type { Task, Goal } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { TrackCompleteRegistration, TrackPurchase } from "@/components/meta-pixel-events";
import { WelcomeBackBanner } from "@/components/welcome-back-banner";
import { RecordButton } from "./record-button";
import { EntryCard } from "./entry-card";

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

  // Re-read user for streak + trial shape. Cheap single-row read.
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      trialEndsAt: true,
      currentStreak: true,
    },
  });

  try {
    [entries, tasks, goals] = await Promise.all([
      fetchEntries(userId),
      prisma.task.findMany({
        where: { userId, status: { in: ["TODO", "IN_PROGRESS", "OPEN"] } },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 10,
      }),
      prisma.goal.findMany({
        where: { userId, status: "ACTIVE" },
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
        <div className="mb-12 mx-auto max-w-lg">
          <RecordButton />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Recent entries */}
          <section className="lg:col-span-2">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Recent sessions
            </h2>
            {entries.length === 0 ? (
              <EmptyState
                icon="🎙️"
                title="No entries yet"
                description="Hit the record button and speak your mind."
              />
            ) : (
              <div className="space-y-3">
                {entries.map((e) => (
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
