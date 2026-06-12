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

// ── Event validation ────────────────────────────────────────────────────────
// Funnel events (funnel_*) are accepted via prefix rule so new funnel steps
// and events never need a manual allowlist update. The regex enforces
// lowercase alphanumeric + underscores only — no special chars.
// Non-funnel events still require explicit listing below.
const FUNNEL_EVENT_RE = /^funnel_[a-z0-9_]+$/;

const VALID_NON_FUNNEL_EVENTS = new Set([
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
  // Review gate (v1.3.3 Issue B)
  "review_gate_shown",
  "review_gate_confirmed",
  "review_gate_dismissed",
  "backstop_committed",
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
  if (!event || (!FUNNEL_EVENT_RE.test(event) && !VALID_NON_FUNNEL_EVENTS.has(event))) {
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
    // (stale sessions can reference deleted/non-existent users), and
    // honor the per-user product-analytics opt-out (v1.4 GDPR slice).
    let verifiedUserId = userId;
    if (verifiedUserId) {
      const userRow = await prisma.user.findUnique({
        where: { id: verifiedUserId },
        select: { id: true, productAnalyticsEnabled: true },
      });
      if (!userRow) {
        verifiedUserId = null;
      } else if (userRow.productAnalyticsEnabled === false) {
        // User opted out of post-auth product analytics. Drop the event
        // entirely (server-side enforcement — not just a client toggle).
        // Anonymous pre-signup funnel events have no userId and never
        // reach this branch.
        return new Response(null, { status: 204 });
      }
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
