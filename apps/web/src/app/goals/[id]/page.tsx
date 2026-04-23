import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { BackButton } from "@/components/back-button";
import { getAuthOptions } from "@/lib/auth";

import { GoalDetail } from "./goal-detail";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Goal — Acuity",
  robots: { index: false, follow: false },
};

/**
 * Goal detail view. Loads the goal + linked entries server-side, hands
 * off to a client component for inline editing (title/description/status/
 * progress/notes), "Add reflection" CTA, and the linked-entries list.
 *
 * Auth: cookie session only — mobile hits /api/goals/[id] directly and
 * renders its own native screen, it never lands on this HTML page.
 */
export default async function GoalDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect(`/auth/signin?callbackUrl=/goals/${params.id}`);

  const { prisma } = await import("@/lib/prisma");
  const goal = await prisma.goal.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!goal) notFound();

  // Linked entries come from TWO sources, unioned:
  //   1. Entry.goalId — explicit link set when the user tapped "Add a
  //      reflection" and the recorder forwarded goalId.
  //   2. Goal.entryRefs — fuzzy match written by the extraction pipeline
  //      when a transcript references an existing goal by title.
  // Keep in sync with /api/goals/[id]/route.ts which does the same union.
  const refs = Array.isArray(goal.entryRefs) ? goal.entryRefs.slice(0, 20) : [];
  const linkedEntries = await prisma.entry.findMany({
    where: {
      userId: session.user.id,
      OR: [
        { goalId: goal.id },
        ...(refs.length > 0 ? [{ id: { in: refs } }] : []),
      ],
    },
    select: {
      id: true,
      summary: true,
      createdAt: true,
      mood: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-3xl px-6 py-10 animate-fade-in">
        <BackButton className="mb-6" ariaLabel="Back to Goals" />
        <GoalDetail
          initialGoal={{
            id: goal.id,
            title: goal.title,
            description: goal.description,
            lifeArea: goal.lifeArea,
            status: goal.status,
            progress: goal.progress,
            notes: goal.notes,
            targetDate: goal.targetDate?.toISOString() ?? null,
            lastMentionedAt: goal.lastMentionedAt?.toISOString() ?? null,
            createdAt: goal.createdAt.toISOString(),
          }}
          linkedEntries={linkedEntries.map((e) => ({
            id: e.id,
            summary: e.summary,
            mood: e.mood,
            createdAt: e.createdAt.toISOString(),
          }))}
        />
      </main>
    </div>
  );
}
