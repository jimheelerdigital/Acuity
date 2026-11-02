/**
 * POST /api/funnel/price-arm — places a web-funnel visitor in the price test
 * (lib/price-test.ts) and returns { arm, on }. Called once when the funnel
 * mounts. Sets or clears the rp_ptest cookie; no auth, no PII.
 */
import { NextRequest, NextResponse } from "next/server";

import { PTEST_COOKIE, PTEST_SRC_COOKIE, isPriceTestOn, parsePriceArm, pickPriceArm } from "@/lib/price-test";

export const dynamic = "force-dynamic";

const MAX_AGE = 30 * 24 * 3600;

export async function POST(req: NextRequest) {
  // Preview (2026-10-27): ?ptest=low|std on a funnel link pins that arm, test
  // on or off, so the paywall can be reviewed before launch. Checkout then
  // charges the pinned price, exactly as a test visitor would be charged.
  const force = parsePriceArm(req.nextUrl.searchParams.get("force"));
  // Pinned visitors are tagged with where the pin came from (a campaign
  // like "planners", else "preview") so they never count in the 50/50.
  const src = (req.nextUrl.searchParams.get("src") ?? "preview").replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "preview";
  // Test off (2026-11-02, Keenan: "$9.99/$89.99 for all web traffic"): a
  // campaign pin no longer holds, only a preview link does. Ad links still
  // carry ptest=low, so without this the Planners ads would keep charging it.
  if (force && (src === "preview" || (await isPriceTestOn()))) {
    const res = NextResponse.json({ arm: force, on: await isPriceTestOn(), forced: true, src });
    res.cookies.set(PTEST_COOKIE, force, { path: "/", maxAge: MAX_AGE, sameSite: "lax", secure: true });
    res.cookies.set(PTEST_SRC_COOKIE, src, { path: "/", maxAge: MAX_AGE, sameSite: "lax", secure: true });
    return res;
  }
  const on = await isPriceTestOn();
  if (!on) {
    const res = NextResponse.json({ arm: "std", on: false });
    if (req.cookies.get(PTEST_COOKIE)) res.cookies.set(PTEST_COOKIE, "", { path: "/", maxAge: 0 });
    if (req.cookies.get(PTEST_SRC_COOKIE)) res.cookies.set(PTEST_SRC_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }
  const { arm, fresh } = pickPriceArm(req.cookies.get(PTEST_COOKIE)?.value);
  const res = NextResponse.json({ arm, on: true, fresh });
  // Readable by the funnel (not httpOnly): the paywall shows this arm's price.
  if (fresh) {
    res.cookies.set(PTEST_COOKIE, arm, { path: "/", maxAge: MAX_AGE, sameSite: "lax", secure: true });
    if (req.cookies.get(PTEST_SRC_COOKIE)) res.cookies.set(PTEST_SRC_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return res;
}
