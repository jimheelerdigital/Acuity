/**
 * POST /api/onboarding-events
 *
 * Logs onboarding funnel events for both the post-signup flow (authenticated)
 * and the try-it-now flow (unauthenticated, uses sessionToken).
 *
 * Body: { event: string, sessionToken?: string }
 *
 * Authenticated callers: userId from session. No sessionToken needed.
 * Unauthenticated callers: must provide sessionToken for try-flow events.
 * Fire-and-forget from the client — 204 on success, no response body.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_EVENTS = new Set([
  // Post-signup onboarding
  "onboarding_recording_screen_viewed",
  "onboarding_recording_started",
  "onboarding_recording_completed",
  "onboarding_extraction_viewed",
  "onboarding_download_screen_viewed",
  "onboarding_app_store_clicked",
  "onboarding_continue_browser_clicked",
  "onboarding_skipped",
  // Try flow
  "try_recording_screen_viewed",
  "try_recording_started",
  "try_recording_completed",
  "try_extraction_viewed",
  "try_signup_started",
  "try_signup_completed",
  "try_expired",
  "try_mic_failed",
  // ─── Web onboarding funnel v2 (/start) ───
  // Entry question (Screen 1)
  "funnel_entry_viewed",
  "funnel_entry_selected",
  // Branch questions (Screens 2-4)
  "funnel_branch_q2_viewed",
  "funnel_branch_q2_selected",
  "funnel_branch_q3_viewed",
  "funnel_branch_q3_selected",
  "funnel_branch_q4_viewed",
  "funnel_branch_q4_selected",
  // Shared questions (Screens 5-9)
  "funnel_shared_q5_viewed",
  "funnel_shared_q5_selected",
  "funnel_shared_q6_viewed",
  "funnel_shared_q6_selected",
  "funnel_shared_q7_viewed",
  "funnel_shared_q7_selected",
  "funnel_shared_q8_viewed",
  "funnel_shared_q8_selected",
  "funnel_shared_q9_viewed",
  "funnel_shared_q9_selected",
  // Mirror + Mechanism + Commit
  "funnel_mirror_viewed",
  "funnel_mechanism_viewed",
  "funnel_commit_viewed",
  "funnel_commit_completed",
  "funnel_commit_abandoned",
  // Processing + Snapshot + Timeline
  "funnel_processing_viewed",
  "funnel_snapshot_viewed",
  "funnel_timeline_viewed",
  // Paywall + Signup + Payment + Download (v2 — kept for legacy data)
  "funnel_paywall_viewed",
  "funnel_signup_attempted",
  "funnel_signup_completed",
  "funnel_signup_failed",
  "funnel_checkout_started",
  "funnel_payment_completed",
  "funnel_download_viewed",
  "funnel_app_store_clicked",
  // ─── Web onboarding funnel v3 (account-first flow) ───
  "funnel_create_account_viewed",
  "funnel_account_created",
  "funnel_savings_viewed",
  "funnel_savings_locked_in",
  "funnel_trial_continued",
  "funnel_download_screen_viewed",
  // ─── Legacy v1 events (kept for historical queries) ───
  "funnel_pain_hook_viewed",
  "funnel_diagnostic_loop_viewed",
  "funnel_diagnostic_duration_viewed",
  "funnel_diagnostic_attempts_viewed",
  "funnel_diagnostic_cost_viewed",
  "funnel_diagnostic_desire_viewed",
  "funnel_diagnostic_loop",
  "funnel_diagnostic_duration",
  "funnel_diagnostic_attempts",
  "funnel_diagnostic_cost",
  "funnel_diagnostic_desire",
  "funnel_bridge_viewed",
  "funnel_failed_solution_viewed",
  "funnel_promise_viewed",
  "funnel_commitment_viewed",
  "funnel_commitment_started",
  "funnel_commitment_completed",
  "funnel_commitment_abandoned",
  "funnel_extraction_viewed",
  "funnel_mock_extraction_viewed",
  "funnel_journey_viewed",
  "funnel_signup_viewed",
  "funnel_signup_started",
  "funnel_trial_started",
  "funnel_paywall_dismissed",
  "funnel_download_screen_viewed",
  "funnel_diagnostic_1_completed",
  "funnel_diagnostic_2_completed",
  "funnel_diagnostic_3_completed",
  "funnel_recording_started",
  "funnel_recording_completed",
  "funnel_inapp_browser_detected",
]);

const BOT_PATTERNS = /facebookexternalhit|Facebot|FacebookBot|WhatsApp|Twitterbot|LinkedInBot|Googlebot|AdsBot-Google|AdsBot|Google-Ads|Google-Safety|Mediapartners-Google|APIs-Google|FeedFetcher-Google|Google-Read-Aloud|DuplexWeb-Google|Storebot-Google|bingbot|Bytespider|Amazonbot|prefetch|prerender|HeadlessChrome|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|Exabot|ia_archiver|MJ12bot|AhrefsBot|SemrushBot|DotBot|PetalBot|bot\/|crawler|spider/i;

export async function POST(req: NextRequest) {
  let body: {
    event?: string; sessionToken?: string; userId?: string; value?: string;
    utmSource?: string; utmMedium?: string; utmCampaign?: string;
    utmContent?: string; utmTerm?: string; fbclid?: string;
    browser?: string; flowVersion?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const event = body.event;
  if (!event || !VALID_EVENTS.has(event)) {
    return new Response(null, { status: 400 });
  }

  // Capture user-agent from request headers (always available, unlike body.browser which is optional)
  const ua = req.headers.get("user-agent") ?? body.browser ?? null;
  const isBot = ua ? BOT_PATTERNS.test(ua) : false;

  // Drop bot events entirely — they inflate funnel metrics and waste DB space
  if (isBot) {
    return new Response(null, { status: 204 });
  }

  let userId = await getAnySessionUserId(req).catch(() => null);
  if (!userId && body.userId) {
    userId = body.userId;
  }
  const sessionToken = body.sessionToken ?? null;

  try {
    const { prisma } = await import("@/lib/prisma");
    // Verify userId exists in User table to avoid FK constraint violation
    // (stale sessions can reference deleted/non-existent users)
    let verifiedUserId = userId;
    if (verifiedUserId) {
      const userExists = await prisma.user.findUnique({
        where: { id: verifiedUserId },
        select: { id: true },
      });
      if (!userExists) verifiedUserId = null;
    }
    await prisma.onboardingEvent.create({
      data: {
        userId: verifiedUserId,
        sessionToken,
        event,
        value: body.value ?? null,
        utmSource: body.utmSource ?? null,
        utmMedium: body.utmMedium ?? null,
        utmCampaign: body.utmCampaign ?? null,
        utmContent: body.utmContent ?? null,
        utmTerm: body.utmTerm ?? null,
        fbclid: body.fbclid ?? null,
        browser: ua,
        isBot: false,
        flowVersion: body.flowVersion ?? null,
      },
    });
  } catch (err) {
    console.error("[onboarding-events] Failed to log event:", err);
  }

  return new Response(null, { status: 204 });
}
