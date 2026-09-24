/**
 * /go/[channel] — UTM-tagged bio-link redirect.
 *
 * Social captions can't carry clickable links, so each profile's bio link
 * points here. 2026-09-24 (per Keenan: "custom links for each social media
 * page that push directly to the proper funnel"):
 *   - Lands DIRECTLY on the funnel, not the homepage. The old redirect to
 *     "/" lost the UTMs (the homepage never sets the attribution cookie and
 *     its buttons link to a bare /start) — organic social showed 0
 *     attributable signups, ever.
 *   - Brand-aware: "bwk-" prefixed channels go to the men's funnel.
 *
 *   Ripple (women):  /go/tiktok  /go/instagram  /go/facebook  /go/threads
 *                    /go/youtube /go/pinterest  /go/x          → /start
 *   BWK (men):       /go/bwk-tiktok  /go/bwk-instagram  /go/bwk-facebook
 *                    /go/bwk-youtube /go/bwk-x  …              → /start-bwk
 *
 * UTMs: utm_source=<channel>, utm_medium=social, utm_campaign=bio-link,
 * utm_content=<ripple|bwk>. Unknown channels still redirect
 * (utm_source=social) — never a 404 from a bio link.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const KNOWN_CHANNELS = new Set([
  "tiktok",
  "instagram",
  "pinterest",
  "youtube",
  "facebook",
  "threads",
  "x",
]);

export async function GET(
  req: NextRequest,
  { params }: { params: { channel: string } }
) {
  const raw = params.channel.toLowerCase();
  const isBwk = raw.startsWith("bwk-");
  const bare = isBwk ? raw.slice(4) : raw;
  const channel = KNOWN_CHANNELS.has(bare) ? bare : "social";

  const dest = new URL(isBwk ? "/start-bwk" : "/start", req.nextUrl.origin);
  dest.searchParams.set("utm_source", channel);
  dest.searchParams.set("utm_medium", "social");
  dest.searchParams.set("utm_campaign", "bio-link");
  dest.searchParams.set("utm_content", isBwk ? "bwk" : "ripple");

  return NextResponse.redirect(dest, 302);
}
