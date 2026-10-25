/**
 * GET /api/creators/suggest → { code, firstName } | { none: true }
 *
 * No auth: the app calls it on the sign-up screen, before an account exists.
 * Returns the referrer whose link was tapped from this IP in the last 24h
 * (lib/creators/suggest.ts). The app only PRE-FILLS "Referred by Tess?";
 * nothing is credited until the person confirms.
 */
import { NextRequest, NextResponse } from "next/server";

import { firstNameOf } from "@/lib/creators/money";
import { hashIp, ipFromHeaders, suggestForIpHash } from "@/lib/creators/suggest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { checkRateLimit, identifierFromRequest, limiters, rateLimitedResponse } = await import("@/lib/rate-limit");
  const rl = await checkRateLimit(limiters.userWrite, identifierFromRequest(req, "creator-suggest"));
  if (!rl.success) return rateLimitedResponse(rl);

  const hit = await suggestForIpHash(hashIp(ipFromHeaders(req.headers))).catch(() => null);
  if (!hit) return NextResponse.json({ none: true });

  const { prisma } = await import("@/lib/prisma");
  const c = await prisma.ugcCreator.findUnique({
    where: { id: hit.creatorId },
    select: { referralCode: true, firstName: true, displayName: true, handle: true },
  });
  if (!c?.referralCode) return NextResponse.json({ none: true });
  return NextResponse.json({ code: c.referralCode, firstName: c.firstName ?? firstNameOf(c.displayName, c.handle) });
}
