/**
 * GET /api/admin/link-apple?t=<signed token>
 *
 * The "Link these accounts" button in the urgent duplicate-Apple-account
 * alert (lib/apple-duplicate-catch.ts). Moves the Apple sign-in from the
 * empty duplicate account onto the paid web account, so Sign in with Apple
 * opens the paid account from then on. The signed token (14 days, HMAC on
 * NEXTAUTH_SECRET, only ever emailed to the founders) is the authorization.
 *
 * Refuses unless: the duplicate still holds an Apple ID and has 0 debriefs,
 * and the paid account has no Apple ID yet. Undo = move it back by hand.
 */
import { NextRequest, NextResponse } from "next/server";

import { linkAppleAccounts, verifyLinkApple } from "@/lib/apple-duplicate-catch";

export const dynamic = "force-dynamic";

function page(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:-apple-system,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;"><h2 style="color:#C4451C;">${title}</h2><p style="color:#374151;line-height:1.6;">${body}</p></div>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: NextRequest) {
  const ids = verifyLinkApple(req.nextUrl.searchParams.get("t"));
  if (!ids) return page("Link expired or invalid", "Ask Claude to link these accounts by hand.", 400);

  const res = await linkAppleAccounts(ids.from, ids.to, "manual");
  if (!res.ok) {
    if (res.reason === "already_linked") return page("Already linked", res.detail);
    if (res.reason === "not_found") return page("Account not found", res.detail, 404);
    return page(res.reason === "no_apple_id" ? "Nothing to move" : "Not linked", res.detail, 409);
  }
  return page("Linked ✓", `Sign in with Apple now opens <strong>${res.paidEmail}</strong> (the paid account). They need to sign out of the app and sign in with Apple again, or use the one-tap link we already emailed them.`);
}
