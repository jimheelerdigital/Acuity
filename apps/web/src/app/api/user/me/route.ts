/**
 * GET /api/user/me
 *
 * Thin "refresh my session state" endpoint for the mobile app's
 * foreground-refresh pattern (docs/APPLE_IAP_DECISION.md §5
 * implementation step 2). The mobile app calls this when returning
 * from Safari-based upgrade checkout so the local auth state picks
 * up the new subscriptionStatus without requiring a sign-out /
 * sign-in cycle.
 *
 * Also useful on web for components that need to tail-read
 * subscription state without fetching the whole user row.
 *
 * Returns only the fields the client might legitimately need —
 * nothing sensitive (no Stripe IDs, no push tokens, no isAdmin).
 */

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      timezone: true,
    },
  });

  if (!user) {
    return NextResponse.json({ user: null }, { status: 404 });
  }

  return NextResponse.json(
    { user },
    {
      status: 200,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    }
  );
}
