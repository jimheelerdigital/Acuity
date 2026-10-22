/**
 * goripple.io/c/<CODE> — a creator's referral link (creator platform,
 * 2026-10-22). Logs the click, drops the first-party rp_click cookie (90
 * days; Road 1 of attribution, read at signup by lib/creators/attribution),
 * and sends the visitor to the normal landing page with the creator banner
 * (/with/<CODE>). Unknown codes go to the homepage — never a 404 from a post.
 *
 * Separate from /u/<code> (paid UGC ad tracking via UTMs), which is unchanged.
 */
import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { CLICK_COOKIE, CLICK_COOKIE_DAYS, CODE_COOKIE, cookieDomainFor } from "@/lib/creators/config";
import { firstNameOf, normalizeCode } from "@/lib/creators/money";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BOT_UA = /bot|crawl|spider|preview|facebookexternalhit|slurp|bingpreview|whatsapp|telegram|discord|curl|wget|python|headless/i;

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = normalizeCode(params.code);
  const home = new URL("/", req.nextUrl.origin);
  if (!code) return NextResponse.redirect(home, 302);

  const { prisma } = await import("@/lib/prisma");
  const creator = await prisma.ugcCreator
    .findUnique({
      where: { referralCode: code },
      select: { id: true, firstName: true, displayName: true, handle: true },
    })
    .catch(() => null);
  if (!creator) return NextResponse.redirect(home, 302);

  const dest = new URL(`/with/${code}`, req.nextUrl.origin);
  req.nextUrl.searchParams.forEach((v, k) => dest.searchParams.set(k, v));
  const res = NextResponse.redirect(dest, 302);

  const ua = req.headers.get("user-agent") ?? "";
  const name = creator.firstName ?? firstNameOf(creator.displayName, creator.handle);
  const maxAge = CLICK_COOKIE_DAYS * 24 * 60 * 60;
  res.cookies.set(CODE_COOKIE, `${code}|${name}`, { maxAge, path: "/", domain: cookieDomainFor(req.headers.get("host")), sameSite: "lax", secure: true });
  if (BOT_UA.test(ua)) return res; // link previews never count as clicks

  const clickId = randomUUID();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const utm: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    if (k.startsWith("utm_")) utm[k] = v.slice(0, 200);
  });
  try {
    await prisma.creatorReferralClick.create({
      data: {
        creatorId: creator.id,
        clickId,
        ipHash: ip
          ? createHash("sha256").update(`${process.env.NEXTAUTH_SECRET ?? ""}:${ip}`).digest("hex").slice(0, 32)
          : null,
        userAgent: ua.slice(0, 400) || null,
        referrer: req.headers.get("referer")?.slice(0, 400) ?? null,
        utm: Object.keys(utm).length ? utm : undefined,
      },
    });
    res.cookies.set(CLICK_COOKIE, clickId, { maxAge, path: "/", domain: cookieDomainFor(req.headers.get("host")), sameSite: "lax", secure: true, httpOnly: true });
  } catch (err) {
    safeLog.error("creators.click-log-failed", err, { code });
  }
  return res;
}
