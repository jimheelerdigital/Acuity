/**
 * GET /get — the App Store-first test's ad link (2026-09-28, per Keenan:
 * "send people directly to the app store to download the app").
 *
 * The app has no Meta SDK, so Meta can't see installs. Ads point here
 * instead of straight at the store: we log the click (with the ad's UTMs and
 * fbclid) as OnboardingEvent "app_store_redirect" under flowVersion
 * "app-store", then redirect to the right store for the phone. The admin
 * Funnel tab reads these clicks next to app signups and in-app purchases.
 *
 *   iPhone/iPad → App Store     Android → Google Play (with install referrer)
 *   anything else → App Store
 *
 * Example ad URL: https://goripple.io/get?utm_source=meta&utm_campaign={{campaign.name}}&utm_content={{ad.id}}
 */
import { NextRequest, NextResponse } from "next/server";

import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/app-access";
import { INTERNAL_UA, hasInternalCookie } from "@/lib/internal-traffic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BOTS = /facebookexternalhit|Facebot|bot\/|crawler|spider|prefetch|prerender|HeadlessChrome/i;

export async function GET(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  const q = req.nextUrl.searchParams;
  const android = /Android/i.test(ua);
  const platform = android ? "android" : /iPhone|iPad|iPod/i.test(ua) ? "ios" : "other";

  if (!BOTS.test(ua)) {
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.onboardingEvent.create({
        data: {
          event: "app_store_redirect",
          value: platform,
          flowVersion: "app-store",
          utmSource: q.get("utm_source"),
          utmMedium: q.get("utm_medium"),
          utmCampaign: q.get("utm_campaign"),
          utmContent: q.get("utm_content"),
          utmTerm: q.get("utm_term"),
          fbclid: q.get("fbclid"),
          browser: ua.slice(0, 500),
          isBot: hasInternalCookie(req.headers.get("cookie")) || INTERNAL_UA.test(ua),
        },
      });
    } catch {
      // Never block the redirect on logging.
    }
  }

  if (android) {
    const referrer = new URLSearchParams();
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content"]) {
      const v = q.get(k);
      if (v) referrer.set(k, v);
    }
    const url = referrer.toString() ? `${PLAY_STORE_URL}&referrer=${encodeURIComponent(referrer.toString())}` : PLAY_STORE_URL;
    return NextResponse.redirect(url, 302);
  }
  return NextResponse.redirect(APP_STORE_URL, 302);
}
