/**
 * GET /api/admin/users
 *   ?q=<substring>      optional — matches email (case-insensitive)
 *   ?cursor=<userId>    optional — keyset pagination cursor
 *   ?limit=<1..100>     default 50
 *
 * METADATA ONLY. No entries, transcripts, goals, tasks, audio, or
 * observations. Entry count is a bare integer.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Math.min(Math.max(isFinite(limitRaw) ? limitRaw : 50, 1), 100);

  const where = q
    ? { email: { contains: q, mode: "insensitive" as const } }
    : {};

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      email: true,
      createdAt: true,
      lastSeenAt: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      devicePlatform: true,
      appVersion: true,
      appFirstOpenedAt: true,
      signupUtmSource: true,
      signupUtmMedium: true,
      signupLandingPath: true,
      onboarding: { select: { completedAt: true, currentStep: true } },
      _count: { select: { entries: true } },
    },
  });

  const hasMore = users.length > limit;
  const page = hasMore ? users.slice(0, limit) : users;

  // Batch-fetch latest onboarding event per user for the status column
  const userIds = page.map((u) => u.id);
  let eventsByUser: Record<string, string[]> = {};
  try {
    const events = await prisma.onboardingEvent.findMany({
      where: { userId: { in: userIds }, event: { startsWith: "onboarding_" } },
      select: { userId: true, event: true },
    });
    for (const e of events) {
      if (!e.userId) continue;
      if (!eventsByUser[e.userId]) eventsByUser[e.userId] = [];
      eventsByUser[e.userId].push(e.event);
    }
  } catch {
    // OnboardingEvent table may not exist yet
  }

  return NextResponse.json({
    users: page.map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.createdAt,
      lastSeenAt: u.lastSeenAt,
      subscriptionStatus: u.subscriptionStatus,
      trialEndsAt: u.trialEndsAt,
      entryCount: u._count.entries,
      devicePlatform: u.devicePlatform,
      appVersion: u.appVersion,
      appFirstOpenedAt: u.appFirstOpenedAt,
      signupUtmSource: u.signupUtmSource,
      signupUtmMedium: u.signupUtmMedium,
      signupLandingPath: u.signupLandingPath,
      onboardingStatus: computeOnboardingStatus(
        eventsByUser[u.id] ?? [],
        u.appFirstOpenedAt,
        u.onboarding?.completedAt ?? null
      ),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}

function computeOnboardingStatus(
  events: string[],
  appFirstOpenedAt: Date | null,
  legacyCompletedAt: Date | null
): string {
  const has = (e: string) => events.includes(e);
  // Most advanced state wins
  if (appFirstOpenedAt || has("onboarding_app_store_clicked")) return "Downloaded app";
  if (has("onboarding_continue_browser_clicked")) return "Using browser";
  if (has("onboarding_download_screen_viewed")) return "Reached download";
  if (has("onboarding_extraction_viewed")) return "Saw extraction";
  if (has("onboarding_recording_completed")) return "Recorded";
  if (has("onboarding_recording_started")) return "Started recording";
  if (has("onboarding_skipped")) return "Skipped recording";
  if (has("onboarding_recording_screen_viewed")) return "Saw recording screen";
  // Fallback to legacy if no new events
  if (legacyCompletedAt) return "Downloaded app";
  return "Not started";
}
