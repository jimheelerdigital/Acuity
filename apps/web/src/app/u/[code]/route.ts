/**
 * /u/[code] — a UGC creator's tracking link (2026-10-06, per Keenan).
 *
 * Every creator gets a unique code (UgcCreator.trackingCode). Their ads, run
 * from Ripple's own accounts, point here, so each signup carries
 * utm_source=ugc, utm_medium=creator, utm_campaign=ugc-<code> into the
 * first-touch attribution cookie on /start (same as /go/[channel]). Any
 * other params on the link (fbclid, utm_content from Meta's URL
 * parameters) pass through. Unknown codes still redirect — never a 404
 * from a live ad.
 */

import { NextRequest, NextResponse } from "next/server";

import { TRACKING_LANDING_PATH } from "@/lib/ugc/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = params.code.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  const dest = new URL(TRACKING_LANDING_PATH, req.nextUrl.origin);
  req.nextUrl.searchParams.forEach((v, k) => dest.searchParams.set(k, v));
  dest.searchParams.set("utm_source", "ugc");
  dest.searchParams.set("utm_medium", "creator");
  dest.searchParams.set("utm_campaign", `ugc-${code || "unknown"}`);
  return NextResponse.redirect(dest, 302);
}
