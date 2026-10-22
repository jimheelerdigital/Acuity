/**
 * GET /creators/login?t=<magic link token> — creator dashboard sign-in.
 * A valid, unexpired link whose version matches the creator's current
 * dashboardTokenVersion sets the 30-day session cookie.
 */
import { NextRequest, NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  signSessionToken,
  verifyMagicLinkToken,
} from "@/lib/creators/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const expired = NextResponse.redirect(new URL("/creators?expired=1", req.url));
  const v = t ? verifyMagicLinkToken(t) : null;
  if (!v) return expired;

  const { prisma } = await import("@/lib/prisma");
  const c = await prisma.ugcCreator.findUnique({
    where: { id: v.creatorId },
    select: { id: true, referralCode: true, dashboardTokenVersion: true },
  });
  if (!c?.referralCode || c.dashboardTokenVersion !== v.version) return expired;

  const res = NextResponse.redirect(new URL("/creators", req.url));
  res.cookies.set(SESSION_COOKIE, signSessionToken(c.id, c.dashboardTokenVersion), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
