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
]);

export async function POST(req: NextRequest) {
  let body: { event?: string; sessionToken?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const event = body.event;
  if (!event || !VALID_EVENTS.has(event)) {
    return new Response(null, { status: 400 });
  }

  // Try to get userId from session first, fall back to body.userId
  // (passed by the server component when the session cookie hasn't
  // propagated to the client yet — common on the signup success page).
  let userId = await getAnySessionUserId(req).catch(() => null);
  if (!userId && body.userId) {
    userId = body.userId;
  }
  const sessionToken = body.sessionToken ?? null;

  // Allow events without identifiers — post-signup events may fire
  // before the session cookie propagates, and try-flow events fire
  // from unauthenticated pages. Store the event anyway so we don't
  // lose data. The admin dashboard aggregates by event name, so
  // orphaned events still contribute to funnel counts.
  // (The identifier check was too strict and silently dropped events.)

  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.onboardingEvent.create({
      data: {
        userId,
        sessionToken,
        event,
      },
    });
  } catch (err) {
    // Non-fatal — don't break the user flow for analytics
    // eslint-disable-next-line no-console
    console.error("[onboarding-events] Failed to log event:", err);
  }

  return new Response(null, { status: 204 });
}
