/**
 * POST /api/user/consent
 *
 * Mirrors the user's cookie/analytics consent to the DB for cross-
 * device continuity. Optional — unauthenticated callers silently 204
 * because localStorage is still the source of truth for script gating
 * on the client. This endpoint is belt + suspenders for logged-in
 * users so clearing localStorage or switching browsers doesn't require
 * re-consent.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ConsentBody = {
  version?: number;
  acceptedAt?: string;
  analytics?: boolean;
  marketing?: boolean;
};

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    // Silent no-op for unauth — the banner still works via localStorage.
    return new NextResponse(null, { status: 204 });
  }

  const body = (await req.json().catch(() => null)) as ConsentBody | null;
  if (
    !body ||
    typeof body.analytics !== "boolean" ||
    typeof body.marketing !== "boolean"
  ) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const normalized = {
    version: 1,
    acceptedAt: typeof body.acceptedAt === "string"
      ? body.acceptedAt
      : new Date().toISOString(),
    analytics: body.analytics,
    marketing: body.marketing,
  };

  const { prisma } = await import("@/lib/prisma");
  await prisma.user.update({
    where: { id: userId },
    data: { cookieConsent: normalized },
  });

  return NextResponse.json({ ok: true });
}
