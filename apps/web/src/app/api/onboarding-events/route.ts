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
  // Web onboarding funnel (/start)
  "funnel_pain_hook_viewed",
  // Diagnostic screen viewed events (fire on mount, before user selects an answer)
  "funnel_diagnostic_loop_viewed",
  "funnel_diagnostic_duration_viewed",
  "funnel_diagnostic_attempts_viewed",
  "funnel_diagnostic_cost_viewed",
  "funnel_diagnostic_desire_viewed",
  // Diagnostic answer events (fire when user selects an option)
  "funnel_diagnostic_loop",
  "funnel_diagnostic_duration",
  "funnel_diagnostic_attempts",
  "funnel_diagnostic_cost",
  "funnel_diagnostic_desire",
  "funnel_mirror_viewed",
  "funnel_bridge_viewed",
  "funnel_failed_solution_viewed",
  "funnel_promise_viewed",
  "funnel_commitment_viewed",
  "funnel_commitment_started",
  "funnel_commitment_completed",
  "funnel_commitment_abandoned",
  "funnel_extraction_viewed",
  "funnel_mock_extraction_viewed",
  "funnel_processing_viewed",
  "funnel_timeline_viewed",
  "funnel_journey_viewed",
  "funnel_signup_viewed",
  "funnel_signup_started",
  "funnel_signup_attempted",
  "funnel_signup_completed",
  "funnel_signup_failed",
  "funnel_paywall_viewed",
  "funnel_trial_started",
  "funnel_paywall_dismissed",
  "funnel_checkout_started",
  "funnel_payment_completed",
  "funnel_download_viewed",
  "funnel_download_screen_viewed",
  "funnel_app_store_clicked",
  // Legacy (kept for historical queries)
  "funnel_diagnostic_1_completed",
  "funnel_diagnostic_2_completed",
  "funnel_diagnostic_3_completed",
  "funnel_recording_started",
  "funnel_recording_completed",
  "funnel_inapp_browser_detected",
]);

const BOT_PATTERNS = /facebookexternalhit|Facebot|FacebookBot|WhatsApp|Twitterbot|LinkedInBot|Googlebot|bingbot|Bytespider|Amazonbot|prefetch|prerender|HeadlessChrome|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|Exabot|ia_archiver|MJ12bot|AhrefsBot|SemrushBot|DotBot|PetalBot|bot\/|crawler|spider/i;

export async function POST(req: NextRequest) {
  let body: {
    event?: string; sessionToken?: string; userId?: string; value?: string;
    utmSource?: string; utmMedium?: string; utmCampaign?: string;
    utmContent?: string; utmTerm?: string; fbclid?: string;
    browser?: string;
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
    await prisma.onboardingEvent.create({
      data: {
        userId,
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
      },
    });
  } catch (err) {
    console.error("[onboarding-events] Failed to log event:", err);
  }

  return new Response(null, { status: 204 });
}
