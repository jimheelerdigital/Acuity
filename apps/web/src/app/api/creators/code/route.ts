/**
 * Road 2 of creator attribution: the optional "Did a creator send you? Enter
 * their code." field in app onboarding (the app field itself is Jimmy's).
 *
 *   GET  /api/creators/code?code=ABC234  → { valid, firstName }   (no auth;
 *        lets the app show "Sent by <name>" before submit, and validate a
 *        code pre-filled from the Play install referrer)
 *   POST /api/creators/code { code }     → writes the referral, source=code
 *        Auth: mobile Bearer or web session. 200 { ok: true, firstName } or
 *        400 { error, message } with a message the app can show as-is.
 *
 * One referral per account, written once: a second code (or one after a
 * web click already attributed the account) returns already_referred.
 */
import { NextRequest, NextResponse } from "next/server";

import { creatorByCode, writeReferral } from "@/lib/creators/attribution";
import { firstNameOf } from "@/lib/creators/money";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MESSAGES: Record<string, string> = {
  invalid: "That code doesn't match a Ripple creator. Check the spelling and try again.",
  already_referred: "Your account is already linked to a creator.",
  not_new: "Creator codes only work on new accounts.",
  self_referral: "Creators can't use their own code.",
  unknown_creator: "That code doesn't match a Ripple creator. Check the spelling and try again.",
  no_user: "Please sign in and try again.",
  error: "Something went wrong. Please try again.",
};

export async function GET(req: NextRequest) {
  const { checkRateLimit, identifierFromRequest, limiters, rateLimitedResponse } = await import("@/lib/rate-limit");
  const rl = await checkRateLimit(limiters.userWrite, identifierFromRequest(req, "creator-code-check"));
  if (!rl.success) return rateLimitedResponse(rl);
  const creator = await creatorByCode(req.nextUrl.searchParams.get("code"));
  if (!creator) return NextResponse.json({ valid: false, message: MESSAGES.invalid });
  return NextResponse.json({
    valid: true,
    code: creator.referralCode,
    firstName: creator.firstName ?? firstNameOf(creator.displayName, creator.handle),
  });
}

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) return NextResponse.json({ error: "no_user", message: MESSAGES.no_user }, { status: 401 });
  const { checkRateLimit, limiters, rateLimitedResponse } = await import("@/lib/rate-limit");
  const rl = await checkRateLimit(limiters.userWrite, `user:creator-code:${userId}`);
  if (!rl.success) return rateLimitedResponse(rl);

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const creator = await creatorByCode(typeof body?.code === "string" ? body.code : null);
  if (!creator) return NextResponse.json({ error: "invalid", message: MESSAGES.invalid }, { status: 400 });

  const r = await writeReferral({ userId, creatorId: creator.id, source: "code" });
  if (!r.ok) {
    return NextResponse.json({ error: r.reason, message: MESSAGES[r.reason] ?? MESSAGES.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, firstName: creator.firstName ?? firstNameOf(creator.displayName, creator.handle) });
}
