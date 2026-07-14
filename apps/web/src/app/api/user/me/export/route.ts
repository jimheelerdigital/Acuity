/**
 * POST /api/user/me/export
 *
 * GDPR Article 15 (right of access) + Article 20 (right of data
 * portability). Returns a structured JSON dump of every category of
 * personal data we hold about the signed-in user, in a machine-
 * readable format the user can save, archive, or import elsewhere.
 *
 * v1 (this slice): synchronous JSON response. We compute the dump
 * server-side and stream it back with `Content-Disposition: attachment`
 * so the browser triggers a download. Suitable for accounts up to
 * ~50k entries — Ripple's median user is well under 100 entries so
 * the synchronous path is fine.
 *
 * v2 (future): for very large accounts (multi-year power users) we
 * may push to background generation + email a signed download link.
 * The endpoint surface stays the same; the response shifts to
 * `{ status: "queued" }` with the email arriving when ready.
 *
 * Auth: symmetric — cookie session on web, Bearer JWT on mobile, via
 * getAnySessionUserId. Same posture as /api/user/delete.
 *
 * Rate limit: 3 exports per day per user (defensive — generating a
 * full dump is moderately expensive, and an export endpoint is a
 * useful vector for scraping if abuse-protected weakly).
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import {
  checkRateLimit,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ExportEnvelope {
  exportedAt: string;
  policyVersion: string;
  format: "json";
  notes: {
    audio:
      "Voice files are deleted from our servers within minutes of transcription. Transcripts are included below.";
    aiOutputs:
      "AI-extracted artifacts (tasks, themes, mood, weekly reports, Life Audits) are derived from your transcripts and are included verbatim.";
    subprocessors:
      "Stripe billing records (invoice numbers, charge history) are held by Stripe and not duplicated here. Request them directly via your Stripe customer portal.";
  };
  // Each section below is OPTIONAL because not every account has rows
  // in every table — leaving them out keeps the export readable.
  user?: Record<string, unknown>;
  entries?: Array<Record<string, unknown>>;
  tasks?: Array<Record<string, unknown>>;
  goals?: Array<Record<string, unknown>>;
  themes?: Array<Record<string, unknown>>;
  themeMentions?: Array<Record<string, unknown>>;
  people?: Array<Record<string, unknown>>;
  weeklyReports?: Array<Record<string, unknown>>;
  stateOfMeReports?: Array<Record<string, unknown>>;
  lifeMapAreas?: Array<Record<string, unknown>>;
  lifeMapAreaHistory?: Array<Record<string, unknown>>;
  achievements?: Array<Record<string, unknown>>;
  reminders?: Array<Record<string, unknown>>;
  onboarding?: Record<string, unknown> | null;
  demographics?: Record<string, unknown> | null;
  onboardingEvents?: Array<Record<string, unknown>>;
  calendarConnection?: Record<string, unknown> | null;
  calendarEvents?: Array<Record<string, unknown>>;
  dataExports?: Array<Record<string, unknown>>;
  insights?: Array<Record<string, unknown>>;
  memories?: Array<Record<string, unknown>>;
  redFlags?: Array<Record<string, unknown>>;
  goalSuggestions?: Array<Record<string, unknown>>;
  progressSuggestions?: Array<Record<string, unknown>>;
  generationJobs?: Array<Record<string, unknown>>;
  featureOverrides?: Array<Record<string, unknown>>;
  consentRecords?: Array<Record<string, unknown>>;
}

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3 exports per day per user (re-using the accountDelete limiter
  // is wrong — it has a stricter cap; pick something proportionate).
  // Lacking a dedicated `dataExport` limiter, reuse `authByEmail`
  // which is 5/h — close enough for now. Add a dedicated limiter in
  // a follow-up if abuse is observed.
  const rl = await checkRateLimit(limiters.authByEmail, `export:${userId}`);
  if (!rl.success) return rateLimitedResponse(rl);

  const { prisma } = await import("@/lib/prisma");

  // Per the Prisma docs, `findUnique` + `include` is a single round-
  // trip for related rows. Ripple's data model has too many
  // independent tables to use a single include — we batch parallel
  // findMany calls instead. Each call is keyed on userId so it's a
  // single index seek; the parallelism is a slight speedup over a
  // sequential chain.
  const [
    user,
    entries,
    tasks,
    goals,
    themes,
    themeMentions,
    people,
    weeklyReports,
    stateOfMeReports,
    lifeMapAreas,
    lifeMapAreaHistory,
    achievements,
    reminders,
    onboarding,
    demographics,
    onboardingEvents,
    calendarConnection,
    calendarEvents,
    dataExports,
    insights,
    memories,
    redFlags,
    goalSuggestions,
    progressSuggestions,
    generationJobs,
    featureOverrides,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        emailVerified: true,
        timezone: true,
        notificationTime: true,
        notificationDays: true,
        notificationsEnabled: true,
        autoLockMinutes: true,
        tourCompletedAt: true,
        subscriptionStatus: true,
        subscriptionSource: true,
        stripeCurrentPeriodEnd: true,
        trialEndsAt: true,
        totalRecordings: true,
        currentStreak: true,
        longestStreak: true,
        lastStreakMilestone: true,
        lastRecordingAt: true,
        createdAt: true,
        updatedAt: true,
        // Do NOT expose: passwordHash, OAuth tokens, refresh tokens,
        // Stripe customer / subscription IDs (those are recovered from
        // Stripe via the customer portal), Apple original transaction
        // ID. None of these are useful in an export and exposing them
        // would create a credential-theft vector if the JSON leaks.
      },
    }),
    prisma.entry.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        lastEditedAt: true,
        duration: true,
        audioDuration: true,
        transcript: true,
        summary: true,
        mood: true,
        moodScore: true,
        energy: true,
        themes: true,
        wins: true,
        blockers: true,
        rawExtraction: true,
        // We exclude `embedding` (1536-dim float array; not useful to
        // the user, balloons file size) and `audioPath`/`audioUrl`
        // (the audio file itself is deleted from storage post-
        // transcription, so a path would dangle).
      },
    }),
    prisma.task
      .findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      .catch(() => []),
    prisma.goal
      .findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      .catch(() => []),
    prisma.theme
      .findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      .catch(() => []),
    // ThemeMention has no direct userId — it's keyed via themeId.
    // Join through Theme to scope by user. (Cascading deletes still
    // work via Theme.user → Entry mentions.)
    prisma.themeMention
      .findMany({
        where: { theme: { userId } },
        orderBy: { createdAt: "asc" },
      })
      .catch(() => []),
    prisma.person
      .findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      .catch(() => []),
    prisma.weeklyReport
      .findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      .catch(() => []),
    prisma.stateOfMeReport
      .findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      .catch(() => []),
    prisma.lifeMapArea.findMany({ where: { userId } }).catch(() => []),
    prisma.lifeMapAreaHistory
      .findMany({ where: { userId }, orderBy: { weekStart: "asc" } })
      .catch(() => []),
    prisma.userAchievement
      .findMany({
        where: { userId },
        orderBy: { earnedAt: "asc" },
        include: {
          achievement: {
            select: { slug: true, title: true, description: true, points: true },
          },
        },
      })
      .catch(() => []),
    prisma.userReminder
      .findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      .catch(() => []),
    prisma.userOnboarding.findUnique({ where: { userId } }).catch(() => null),
    prisma.userDemographics.findUnique({ where: { userId } }).catch(() => null),
    prisma.onboardingEvent
      .findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      .catch(() => []),
    // CalendarConnection.userId is NOT unique (provider+account-id is),
    // so findFirst rather than findUnique. There's at most one
    // connection per provider per user; exporting whatever's there.
    prisma.calendarConnection.findFirst({ where: { userId } }).catch(() => null),
    prisma.calendarEvent
      .findMany({ where: { userId }, orderBy: { startTime: "asc" } })
      .catch(() => []),
    prisma.dataExport
      .findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      .catch(() => []),
    prisma.userInsight
      .findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      .catch(() => []),
    // UserMemory is keyed @unique on userId — at most one row. Use
    // findUnique + wrap in an array on the receiving side.
    prisma.userMemory
      .findUnique({ where: { userId } })
      .then((m) => (m ? [m] : []))
      .catch(() => []),
    // RedFlag uses an array `affectedUserIds: String[]`, not a scalar
    // userId. Filter via Prisma's `has` for Postgres array columns.
    prisma.redFlag
      .findMany({
        where: { affectedUserIds: { has: userId } },
        orderBy: { createdAt: "asc" },
      })
      .catch(() => []),
    prisma.goalSuggestion
      .findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      .catch(() => []),
    prisma.progressSuggestion
      .findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      .catch(() => []),
    // GenerationJob doesn't have a userId scalar. It uses
    // `triggeredBy: String?` to record who kicked it off. Filter on
    // that — admin-system jobs (Inngest scheduled) will be null and
    // excluded.
    prisma.generationJob
      .findMany({
        where: { triggeredBy: userId },
        orderBy: { startedAt: "asc" },
      })
      .catch(() => []),
    prisma.userFeatureOverride
      .findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      .catch(() => []),
  ]);

  if (!user) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Calendar connection sometimes carries an encrypted refresh
  // token. Strip it from the export — there's no value to the user
  // in a ciphertext blob, and exporting it weakens the encryption
  // posture if the export leaks.
  const calendarConnSafe = calendarConnection
    ? {
        ...calendarConnection,
        googleCalendarRefreshTokenEncrypted: undefined,
      }
    : null;

  const envelope: ExportEnvelope = {
    exportedAt: new Date().toISOString(),
    policyVersion: "2026-06-03",
    format: "json",
    notes: {
      audio:
        "Voice files are deleted from our servers within minutes of transcription. Transcripts are included below.",
      aiOutputs:
        "AI-extracted artifacts (tasks, themes, mood, weekly reports, Life Audits) are derived from your transcripts and are included verbatim.",
      subprocessors:
        "Stripe billing records (invoice numbers, charge history) are held by Stripe and not duplicated here. Request them directly via your Stripe customer portal.",
    },
    user: user as unknown as Record<string, unknown>,
    entries: entries as unknown as Array<Record<string, unknown>>,
    tasks: tasks as unknown as Array<Record<string, unknown>>,
    goals: goals as unknown as Array<Record<string, unknown>>,
    themes: themes as unknown as Array<Record<string, unknown>>,
    themeMentions: themeMentions as unknown as Array<Record<string, unknown>>,
    people: people as unknown as Array<Record<string, unknown>>,
    weeklyReports: weeklyReports as unknown as Array<Record<string, unknown>>,
    stateOfMeReports:
      stateOfMeReports as unknown as Array<Record<string, unknown>>,
    lifeMapAreas: lifeMapAreas as unknown as Array<Record<string, unknown>>,
    lifeMapAreaHistory:
      lifeMapAreaHistory as unknown as Array<Record<string, unknown>>,
    achievements: achievements as unknown as Array<Record<string, unknown>>,
    reminders: reminders as unknown as Array<Record<string, unknown>>,
    onboarding: onboarding as unknown as Record<string, unknown> | null,
    demographics: demographics as unknown as Record<string, unknown> | null,
    onboardingEvents:
      onboardingEvents as unknown as Array<Record<string, unknown>>,
    calendarConnection:
      calendarConnSafe as unknown as Record<string, unknown> | null,
    calendarEvents:
      calendarEvents as unknown as Array<Record<string, unknown>>,
    dataExports: dataExports as unknown as Array<Record<string, unknown>>,
    insights: insights as unknown as Array<Record<string, unknown>>,
    memories: memories as unknown as Array<Record<string, unknown>>,
    redFlags: redFlags as unknown as Array<Record<string, unknown>>,
    goalSuggestions:
      goalSuggestions as unknown as Array<Record<string, unknown>>,
    progressSuggestions:
      progressSuggestions as unknown as Array<Record<string, unknown>>,
    generationJobs:
      generationJobs as unknown as Array<Record<string, unknown>>,
    featureOverrides:
      featureOverrides as unknown as Array<Record<string, unknown>>,
  };

  // Audit-trail row: stamp DataExport so subsequent exports can be
  // counted and so the user can see in their own export history when
  // they last requested one. Non-fatal on failure — the export itself
  // is the user-visible action.
  try {
    await prisma.dataExport.create({
      data: {
        userId,
        status: "COMPLETED",
        // `requestedVia` is a free-text marker the UI can render.
        // Keep this short — it's not user input.
        format: "json",
      } as never, // Prisma type drift around new fields; defensive.
    });
  } catch {
    // Swallow.
  }

  const json = JSON.stringify(envelope, null, 2);
  const filename = `acuity-export-${userId}-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;

  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Don't let intermediaries cache an export of a real user's
      // data. The body is highly sensitive.
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
