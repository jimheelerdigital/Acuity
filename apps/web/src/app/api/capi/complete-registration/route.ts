/**
 * POST /api/capi/complete-registration — Fire a server-side Meta CAPI
 * CompleteRegistration event with full request context (IP, UA, cookies).
 *
 * Called by the TrackCompleteRegistration browser component after OAuth
 * signups, where the NextAuth callback lacks request headers. Returns
 * the event_id so the browser pixel can deduplicate.
 *
 * Guard: only fires if the authenticated user was created within the
 * last 5 minutes, preventing repeat hits from page refreshes.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import {
  sendConversionEvent,
  generateEventId,
  getClientIp,
  extractFbCookies,
} from "@/lib/meta-capi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify this is a genuinely new signup (created within last 5 minutes)
  const { prisma } = await import("@/lib/prisma");
  const [user, fbclidEvent] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { createdAt: true, email: true, name: true },
    }),
    // Look up fbclid from the user's funnel events (stored on OnboardingEvent)
    prisma.onboardingEvent.findFirst({
      where: { userId: session.user.id, fbclid: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { fbclid: true },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (user.createdAt < fiveMinutesAgo) {
    return NextResponse.json({ error: "Not a new signup", eventId: null }, { status: 200 });
  }

  const eventId = generateEventId("CompleteRegistration");
  const reqHeaders = req.headers;
  const nameParts = (user.name ?? "").trim().split(/\s+/);

  sendConversionEvent({
    eventName: "CompleteRegistration",
    eventId,
    eventSourceUrl: "https://goripple.io/start",
    userData: {
      email: user.email ?? undefined,
      firstName: nameParts[0] || undefined,
      lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined,
      ip: getClientIp(reqHeaders),
      userAgent: reqHeaders.get("user-agent") || undefined,
      fbclid: fbclidEvent?.fbclid ?? undefined,
      ...extractFbCookies(reqHeaders.get("cookie")),
    },
    customData: {
      content_name: "Free Trial Signup",
      currency: "USD",
      value: 0,
    },
  }).catch(() => {}); // fire-and-forget

  console.log(`[capi/complete-registration] Fired for user ${session.user.id}, eventId=${eventId}`);

  return NextResponse.json({ eventId });
}
