/**
 * POST /api/creators/request-link { email } — email a creator a fresh
 * dashboard sign-in link. Always answers the same way so it can't be used
 * to find out who is a creator.
 */
import { NextRequest, NextResponse } from "next/server";

import {
  checkRateLimit,
  identifierFromRequest,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const check = await checkRateLimit(limiters.auth, identifierFromRequest(req, "creator-link"));
  if (!check.success) return rateLimitedResponse(check);

  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  const creator = await prisma.ugcCreator.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, referralCode: { not: null } },
    select: { id: true },
  });
  if (creator) {
    try {
      const { sendDashboardLink } = await import("@/lib/creators/emails");
      await sendDashboardLink(creator.id, "signin");
    } catch (err) {
      safeLog.error("creators.request-link.send-failed", err, { creatorId: creator.id });
    }
  }
  return NextResponse.json({ ok: true });
}
