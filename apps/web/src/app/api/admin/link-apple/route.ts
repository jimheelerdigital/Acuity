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

import { verifyLinkApple } from "@/lib/apple-duplicate-catch";

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

  const { prisma } = await import("@/lib/prisma");
  const [dupe, paid] = await Promise.all([
    prisma.user.findUnique({ where: { id: ids.from }, select: { id: true, email: true, appleSubject: true, totalRecordings: true } }),
    prisma.user.findUnique({ where: { id: ids.to }, select: { id: true, email: true, appleSubject: true } }),
  ]);
  if (!dupe || !paid) return page("Account not found", "One of the two accounts no longer exists.", 404);
  if (paid.appleSubject && !dupe.appleSubject) return page("Already linked", `Sign in with Apple already opens ${paid.email}.`);
  if (!dupe.appleSubject) return page("Nothing to move", `${dupe.email} has no Apple sign-in on it.`, 409);
  if (paid.appleSubject) return page("Not linked", `${paid.email} already has a different Apple sign-in. Linking by hand needed.`, 409);
  if (dupe.totalRecordings > 0) return page("Not linked", `${dupe.email} has ${dupe.totalRecordings} debrief(s), so it isn't an empty duplicate. Linking by hand needed.`, 409);

  const subject = dupe.appleSubject;
  await prisma.$transaction([
    prisma.user.update({ where: { id: dupe.id }, data: { appleSubject: null } }),
    prisma.user.update({ where: { id: paid.id }, data: { appleSubject: subject } }),
    prisma.onboardingEvent.create({ data: { userId: paid.id, event: "apple_dupe_linked", value: dupe.id } }),
  ]);
  return page("Linked ✓", `Sign in with Apple now opens <strong>${paid.email}</strong> (the paid account). They need to sign out of the app and sign in with Apple again, or use the one-tap link we already emailed them.`);
}
