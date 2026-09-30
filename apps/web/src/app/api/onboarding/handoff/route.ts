/**
 * GET /api/onboarding/handoff?t=<pass>&f=<funnel path>&to=download|paywall[&session_id=…]
 *
 * Landing for Stripe's hosted checkout when the buyer left the Instagram /
 * Facebook in-app browser to pay with Apple Pay / Google Pay (2026-09-30).
 * Exchanges the signed pass (lib/checkout-handoff.ts) for a normal web
 * session cookie in this browser, then sends them on to the funnel:
 *   to=download → the password + download steps (payment return)
 *   to=paywall  → back to the paywall (they cancelled checkout)
 * Only funnel accounts (created in the last 48h) and only allowlisted funnel
 * paths. A bad or expired pass still lands them on the funnel, just not
 * signed in, so nobody hits a dead end.
 */
import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";

import { verifyHandoff } from "@/lib/checkout-handoff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FUNNELS: Record<string, string> = {
  "/start": "savings",
  "/start-bwk": "savings",
  "/start-test": "paywall",
  "/start-test-bwk": "paywall",
};
const ACCOUNT_WINDOW_MS = 48 * 60 * 60 * 1000;
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const funnel = q.get("f") ?? "/start";
  const path = funnel in FUNNELS ? funnel : "/start";
  const toDownload = q.get("to") === "download";
  const dest = new URL(path, process.env.NEXTAUTH_URL || req.nextUrl.origin);
  if (toDownload) {
    dest.searchParams.set("step", "download");
    dest.searchParams.set("payment", "success");
    const sid = q.get("session_id");
    if (sid && /^cs_[A-Za-z0-9_]+$/.test(sid)) dest.searchParams.set("session_id", sid);
  } else {
    dest.searchParams.set("step", FUNNELS[path]);
  }
  const res = NextResponse.redirect(dest, 303);

  const userId = verifyHandoff(q.get("t"));
  const secret = process.env.NEXTAUTH_SECRET;
  if (!userId || !secret) return res;
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, image: true, createdAt: true },
  });
  if (!user || Date.now() - user.createdAt.getTime() > ACCOUNT_WINDOW_MS) return res;

  // Same token shape as a normal web sign-in (lib/auth.ts jwt callback).
  const token = await encode({
    token: { id: user.id, sub: user.id, email: user.email, name: user.name, picture: user.image },
    secret,
    maxAge: SESSION_MAX_AGE,
  });
  const prod = process.env.NODE_ENV === "production";
  res.cookies.set(prod ? "__Secure-next-auth.session-token" : "next-auth.session-token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: prod,
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
