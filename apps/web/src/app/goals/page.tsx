import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { getUserEntitlement } from "@/lib/entitlements-fetch";
import { getUserProgression } from "@/lib/userProgression";
import { LockedFeatureCard } from "@/components/locked-feature-card";
import { ProLockedCard } from "@/components/pro-locked-card";
import { PageContainer } from "@/components/page-container";
import { GoalList } from "./goal-list";
import type { GoalRailDetail } from "./_components/goal-detail-rail";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");

  const userId = session.user.id;
  const progression = await getUserProgression(userId);
  // §B.2.3 — FREE post-trial users see ProLockedCard for goals
  // suggestions (the AI sub-goal flagging is the gated feature).
  // TRIAL/PRO with low data still see the experiential
  // LockedFeatureCard until the goalSuggestions threshold is hit.
  const entitlement = await getUserEntitlement(userId);
  const isProLocked = entitlement?.canExtractEntries === false;

  // ── Server-side focus-goal computation ───────────────────────────
  // 2xl: rail needs a default goal so the first paint isn't a
  // skeleton. Pick the goal with the freshest signal of user attention:
  //   • most recent task completion that's anchored to a goal, OR
  //   • most recent entry mention (Goal.lastMentionedAt).
  // Whichever is newer wins. Fall back to the first non-archived root
  // when neither signal exists. Returns null + null detail if the user
  // has no goals at all — list will render empty state and rail stays
  // hidden via the empty-state copy.
  const { prisma } = await import("@/lib/prisma");

  const [latestCompletedTask, latestMentionedGoal, firstRootGoal] =
    await Promise.all([
      prisma.task.findFirst({
        where: {
          userId,
          status: "DONE",
          goalId: { not: null },
          completedAt: { not: null },
        },
        orderBy: { completedAt: "desc" },
        select: { goalId: true, completedAt: true },
      }),
      prisma.goal.findFirst({
        where: {
          userId,
          lastMentionedAt: { not: null },
          status: { not: "ARCHIVED" },
        },
        orderBy: { lastMentionedAt: "desc" },
        select: { id: true, lastMentionedAt: true },
      }),
      prisma.goal.findFirst({
        where: { userId, parentGoalId: null, status: { not: "ARCHIVED" } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }),
    ]);

  const taskTime = latestCompletedTask?.completedAt?.getTime() ?? 0;
  const mentionTime = latestMentionedGoal?.lastMentionedAt?.getTime() ?? 0;

  let focusGoalId: string | null = null;
  if (taskTime > 0 || mentionTime > 0) {
    focusGoalId =
      taskTime >= mentionTime
        ? (latestCompletedTask?.goalId ?? latestMentionedGoal?.id ?? null)
        : (latestMentionedGoal?.id ?? latestCompletedTask?.goalId ?? null);
  }
  focusGoalId = focusGoalId ?? firstRootGoal?.id ?? null;

  // Fetch the initial focus goal's full detail so the rail paints
  // synchronously on first load. Mirrors the GET /api/goals/[id]
  // shape so the client cache key matches what subsequent client
  // fetches will populate.
  let initialFocusDetail: GoalRailDetail | null = null;
  if (focusGoalId) {
    const goal = await prisma.goal.findFirst({
      where: { id: focusGoalId, userId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        lifeArea: true,
        progress: true,
        lastMentionedAt: true,
        progressNotes: true,
        entryRefs: true,
        tasks: {
          select: {
            id: true,
            title: true,
            text: true,
            status: true,
            priority: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (goal) {
      const refs = Array.isArray(goal.entryRefs) ? goal.entryRefs.slice(0, 1) : [];
      const sourceEntry = await prisma.entry.findFirst({
        where: {
          userId,
          OR: [
            { goalId: goal.id },
            ...(refs.length > 0 ? [{ id: { in: refs } }] : []),
          ],
        },
        select: { id: true, summary: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });

      initialFocusDetail = {
        id: goal.id,
        title: goal.title,
        description: goal.description,
        status: goal.status,
        lifeArea: goal.lifeArea,
        manualProgress: goal.progress,
        calculatedProgress: goal.progress,
        lastMentionedAt: goal.lastMentionedAt
          ? goal.lastMentionedAt.toISOString()
          : null,
        tasks: goal.tasks,
        progressNotes: Array.isArray(goal.progressNotes)
          ? (goal.progressNotes as GoalRailDetail["progressNotes"])
          : [],
        sourceEntry: sourceEntry
          ? {
              id: sourceEntry.id,
              summary: sourceEntry.summary,
              createdAt: sourceEntry.createdAt.toISOString(),
            }
          : null,
      };
    }
  }

  return (
    <div className="min-h-screen">
      <PageContainer mobileWidth="3xl" className="animate-fade-in">
        {isProLocked ? (
          <div className="mb-6">
            <ProLockedCard surfaceId="goals_suggestions_locked" />
          </div>
        ) : (
          !progression.unlocked.goalSuggestions && (
            <div className="mb-6">
              <LockedFeatureCard
                unlockKey="goalSuggestions"
                progression={progression}
              />
            </div>
          )
        )}
        <GoalList
          initialFocusGoalId={focusGoalId}
          initialFocusDetail={initialFocusDetail}
        />
      </PageContainer>
    </div>
  );
}
