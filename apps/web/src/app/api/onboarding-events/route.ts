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
  let body: { event?: string; sessionToken?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const event = body.event;
  if (!event || !VALID_EVENTS.has(event)) {
    return new Response(null, { status: 400 });
  }

  // Try to get userId — will be null for unauthenticated try-flow callers
  const userId = await getAnySessionUserId(req).catch(() => null);
  const sessionToken = body.sessionToken ?? null;

  // Must have at least one identifier
  if (!userId && !sessionToken) {
    return new Response(null, { status: 400 });
  }

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
