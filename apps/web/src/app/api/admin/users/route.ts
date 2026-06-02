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

  // Total count for the summary card (only on first page load, not paginated requests)
  const totalCount = !cursor ? await prisma.user.count({ where }) : undefined;

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
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      trialEndsAt: true,
      devicePlatform: true,
      appVersion: true,
      appFirstOpenedAt: true,
      signupUtmSource: true,
      signupUtmMedium: true,
      signupLandingPath: true,
      onboarding: { select: { completedAt: true, currentStep: true } },
      _count: { select: { entries: { where: { status: "COMPLETE" } } } },
    },
  });

  const hasMore = users.length > limit;
  const page = hasMore ? users.slice(0, limit) : users;

  // Batch-fetch onboarding + funnel events per user for the status column
  const userIds = page.map((u) => u.id);
  let eventsByUser: Record<string, string[]> = {};
  try {
    const events = await prisma.onboardingEvent.findMany({
      where: { userId: { in: userIds }, isBot: false },
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
        u.onboarding?.completedAt ?? null,
        u.subscriptionStatus,
        u.stripeSubscriptionId
      ),
      paymentStatus: computePaymentStatus(u.subscriptionStatus, u.stripeCustomerId, u.stripeSubscriptionId, u.trialEndsAt),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    ...(totalCount !== undefined ? { totalCount } : {}),
  });
}

function computeOnboardingStatus(
  events: string[],
  appFirstOpenedAt: Date | null,
  legacyCompletedAt: Date | null,
  subscriptionStatus: string | null,
  stripeSubscriptionId: string | null
): string {
  const has = (e: string) => events.includes(e);
  // Most advanced state wins — check both old onboarding_* and new funnel_* events
  if (appFirstOpenedAt || has("onboarding_app_store_clicked") || has("funnel_app_store_clicked")) return "Downloaded app";
  if (has("onboarding_continue_browser_clicked")) return "Using browser";
  if (has("onboarding_download_screen_viewed") || has("funnel_download_viewed")) return "Reached download";

  // Payment status — check actual Stripe state, not just events
  if (subscriptionStatus === "PRO" || subscriptionStatus === "TRIALING") return "Paid";
  if (stripeSubscriptionId && subscriptionStatus !== "PRO" && subscriptionStatus !== "TRIALING") return "Payment failed";
  // v3 account-first flow statuses
  if (has("funnel_savings_locked_in") || has("funnel_payment_completed")) return "Paid";
  if (has("funnel_trial_continued")) return "Trial (skipped payment)";
  if (has("funnel_account_created")) return "Account created";
  if (has("funnel_create_account_viewed")) return "Reached signup";
  // v2 legacy compat
  if (has("funnel_checkout_started") && !stripeSubscriptionId) return "Checkout abandoned";
  if (has("funnel_signup_completed") && !has("funnel_checkout_started")) return "Signed up (no checkout)";
  if (has("funnel_paywall_viewed")) return "Reached paywall";
  if (has("onboarding_extraction_viewed")) return "Saw extraction";
  if (has("onboarding_recording_completed")) return "Recorded";
  if (has("onboarding_recording_started")) return "Started recording";
  if (has("onboarding_skipped")) return "Skipped recording";
  if (has("onboarding_recording_screen_viewed")) return "Saw recording screen";
  if (has("funnel_mirror_viewed")) return "Funnel: mirror";
  if (has("funnel_entry_selected")) return "Funnel: started quiz";
  if (has("funnel_entry_viewed")) return "Funnel: page loaded";
  // Fallback to legacy if no new events
  if (legacyCompletedAt) return "Downloaded app";
  return "Not started";
}

function computePaymentStatus(
  subscriptionStatus: string | null,
  stripeCustomerId: string | null,
  stripeSubscriptionId: string | null,
  trialEndsAt: Date | null
): string {
  if (subscriptionStatus === "PRO") return "Active";
  if (subscriptionStatus === "PAST_DUE") return "Past Due";
  // Had a Stripe subscription that was cancelled or expired
  if (stripeSubscriptionId && subscriptionStatus === "FREE") return "Churned";
  if (stripeCustomerId && !stripeSubscriptionId && subscriptionStatus === "FREE") return "Churned";
  // Trial status
  if (subscriptionStatus === "TRIAL") {
    if (trialEndsAt && new Date(trialEndsAt) < new Date()) return "Expired";
    return "Trial";
  }
  if (subscriptionStatus === "FREE") {
    if (trialEndsAt) return "Expired";
    return "None";
  }
  return "None";
}
