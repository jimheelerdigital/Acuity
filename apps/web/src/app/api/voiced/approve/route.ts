/**
 * POST /api/voiced/approve — Keenan approved the finished voiced video;
 * hand it to the normal IG/FB publisher (2026-09-30). Idempotent.
 * A POST from a button on the review page, never a GET, so an email
 * link scanner can't approve anything.
 *
 * Auth: the HMAC token from the email. Body: { date, brand, t }
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { isVoicedBrand, isVoicedDate, checkVoicedToken, approveVoiced } = await import("@/lib/content-factory/voiced");
  const body = (await req.json().catch(() => ({}))) as { date?: string; brand?: string; t?: string };
  if (!isVoicedDate(body.date) || !isVoicedBrand(body.brand) || !checkVoicedToken(body.date, body.brand, body.t)) {
    return NextResponse.json({ error: "This link isn't valid." }, { status: 403 });
  }
  try {
    const r = await approveVoiced(body.date, body.brand);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Approve failed" }, { status: 400 });
  }
}
