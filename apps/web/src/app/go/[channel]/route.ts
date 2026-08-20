/**
 * /go/[channel] — UTM-tagged bio-link redirect (2026-08-16).
 *
 * Social captions can't carry clickable links, so each platform's bio
 * link points here (e.g. goripple.io/go/tiktok). The redirect lands on
 * the homepage with utm_source set to the channel, so social traffic
 * finally shows up in attribution instead of as "direct".
 *
 * Unknown channels still redirect (utm_source=social) — never a 404 from
 * a bio link.
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
  const channel = KNOWN_CHANNELS.has(raw) ? raw : "social";

  const dest = new URL("/", req.nextUrl.origin);
  dest.searchParams.set("utm_source", channel);
  dest.searchParams.set("utm_medium", "social");
  dest.searchParams.set("utm_campaign", "bio-link");

  return NextResponse.redirect(dest, 302);
}
