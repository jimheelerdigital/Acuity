/**
 * /api/user/consent
 *
 * GET — for logged-in users with no local consent record (cleared
 *   localStorage, new device, new browser). Returns the server-side
 *   `User.cookieConsent` if present so the cookie banner can hydrate
 *   localStorage instead of re-prompting. 204 for unauthenticated.
 *
 * POST — mirrors the user's choice to the DB for cross-device
 *   continuity. Optional — unauthenticated callers silently 204
 *   because localStorage is still the source of truth for script
 *   gating on the client.
 *
 * The pre-2026-04-29 bug: writeback existed (POST) but readback
 * didn't, so logged-in users on a fresh browser saw the banner
 * again despite having dismissed it elsewhere. The GET handler
 * closes that gap.
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

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) return new NextResponse(null, { status: 204 });

  const { prisma } = await import("@/lib/prisma");
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { cookieConsent: true },
  });
  return NextResponse.json({ consent: u?.cookieConsent ?? null });
}

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
