/**
 * goripple.io/c/get?t=<token>&s=ios|android — the store links in the
 * "Your Ripple download link" email (POST /api/creators/capture-email).
 *
 * GET renders one button per store. Tapping one POSTs here, which marks the
 * captured email VERIFIED (the person opened the email, so they own the
 * inbox) and 303s to the store. Only verified captures attribute at signup
 * (lib/creators/attribution, Road 3). The verify step is a POST on purpose:
 * mail scanners prefetch GET links, and a prefetch must not prove anything.
 *
 * A bad / expired token still gets the store buttons (they just verify
 * nothing) — the visitor asked for a download link and always gets one.
 */
import { NextRequest, NextResponse } from "next/server";

import { verifyCaptureToken, type CaptureStore } from "@/lib/creators/email-capture";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity";

function storeUrl(store: CaptureStore, code: string | null): string {
  if (store === "ios") return APP_STORE_URL;
  if (!code) return PLAY_URL;
  return `${PLAY_URL}&referrer=${encodeURIComponent(`utm_source=creator&utm_campaign=${code}`)}`;
}

function asStore(v: string | null): CaptureStore | null {
  return v === "ios" || v === "android" ? v : null;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const preferred = asStore(req.nextUrl.searchParams.get("s"));
  const order: CaptureStore[] = preferred === "android" ? ["android", "ios"] : ["ios", "android"];
  const label: Record<CaptureStore, string> = {
    ios: "Get Ripple on the App Store",
    android: "Get Ripple on Google Play",
  };
  const buttons = order
    .map(
      (s, i) => `<form method="post" action="/c/get" style="margin:0 0 12px">
<input type="hidden" name="t" value="${esc(t)}"/><input type="hidden" name="s" value="${s}"/>
<button type="submit" style="width:100%;padding:16px;border-radius:999px;border:0;font-size:16px;font-weight:700;cursor:pointer;${
        i === 0 ? "background:#1B1815;color:#FBF6EF" : "background:transparent;color:#1B1815;border:1.5px solid #1B1815"
      }">${label[s]}</button></form>`
    )
    .join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex"/><title>Get Ripple</title></head>
<body style="margin:0;background:#FBF6EF;color:#1B1815;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<main style="max-width:440px;margin:0 auto;padding:48px 16px">
<h1 style="font-size:26px;line-height:1.2;margin:0 0 8px">Your Ripple download</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 24px;color:#1B1815b3">Pick your phone's store. Sign up with this same email so your invite counts.</p>
${buttons}
</main></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}

export async function POST(req: NextRequest) {
  // application/x-www-form-urlencoded from the buttons above.
  const form = new URLSearchParams((await req.text().catch(() => "")).slice(0, 4096));
  const t = form.get("t") ?? "";
  const store = asStore(form.get("s")) ?? "ios";

  let code: string | null = null;
  const claim = verifyCaptureToken(t);
  if (claim) {
    try {
      const { prisma } = await import("@/lib/prisma");
      // Only the exact capture the token was issued for: a later capture on
      // the same click (a different address) resets the row and is not
      // verified by an old email.
      await prisma.creatorReferralClick.updateMany({
        where: { clickId: claim.clickId, capturedEmail: claim.email, capturedEmailVerifiedAt: null },
        data: { capturedEmailVerifiedAt: new Date() },
      });
      const click = await prisma.creatorReferralClick.findUnique({
        where: { clickId: claim.clickId },
        select: { creator: { select: { referralCode: true } } },
      });
      code = click?.creator.referralCode ?? null;
    } catch (err) {
      safeLog.error("creators.capture-verify-failed", err);
    }
  }
  return NextResponse.redirect(storeUrl(store, code), 303);
}
