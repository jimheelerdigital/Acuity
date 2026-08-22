/**
 * Diagnose the most recent Entry row for jim@heelerdigital.com.
 * Read-only — pulls non-PII fields needed to triage broken extraction.
 *
 * Run:
 *   cd apps/web && unset DATABASE_URL DIRECT_URL && \
 *     npx tsx -r dotenv/config scripts/diag-recent-entry.ts \
 *       dotenv_config_path=.env.local
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "jim@heelerdigital.com" },
    select: {
      id: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      createdAt: true,
    },
  });
  if (!user) {
    console.log(JSON.stringify({ error: "user not found" }));
    return;
  }

  const recent = await prisma.entry.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      audioUrl: true,
      transcript: true,
      summary: true,
      themes: true,
      mood: true,
      moodScore: true,
      energy: true,
      duration: true,
      audioDuration: true,
      audioPath: true,
      partialReason: true,
      inngestRunId: true,
      rawAnalysis: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
      goalId: true,
      dimensionContext: true,
      // Use NOT NULL probe rather than dumping content
    },
  });

  const projected = recent.map((e) => ({
    id: e.id.slice(0, 12),
    status: e.status,
    audioUrl_set: !!e.audioUrl,
    audioUrl_starts: e.audioUrl ? e.audioUrl.slice(0, 80) : null,
    audioPath: e.audioPath ?? null,
    duration: e.duration,
    audioDuration: e.audioDuration,
    partialReason: e.partialReason ?? null,
    inngestRunId: e.inngestRunId ?? null,
    rawAnalysis_set: !!e.rawAnalysis,
    transcript_set: !!e.transcript,
    transcript_len: e.transcript?.length ?? 0,
    summary_set: !!e.summary,
    summary_len: e.summary?.length ?? 0,
    themes_count: e.themes?.length ?? 0,
    mood: e.mood,
    moodScore: e.moodScore,
    energy: e.energy,
    errorMessage: e.errorMessage ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    msFromCreateToUpdate:
      e.updatedAt.getTime() - e.createdAt.getTime(),
    goalId: e.goalId,
    dimensionContext: e.dimensionContext,
  }));

  console.log(
    JSON.stringify(
      {
        user: {
          id: user.id.slice(0, 12),
          subscriptionStatus: user.subscriptionStatus,
          trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
          createdAt: user.createdAt.toISOString(),
        },
        recentEntries: projected,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
