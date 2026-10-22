/**
 * GET /api/admin/creators/view-as?id=<creatorId>  — admin opens a creator's
 * dashboard exactly as they see it (signs a 2-hour creator session and
 * marks it as an admin view, which shows a banner on /creators).
 * GET /api/admin/creators/view-as?exit=1          — leave the admin view.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { ADMIN_VIEW_COOKIE, SESSION_COOKIE, signSessionToken } from "@/lib/creators/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TWO_HOURS = 2 * 60 * 60;

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const origin = req.nextUrl.origin;

  if (req.nextUrl.searchParams.get("exit")) {
    const back = req.cookies.get(ADMIN_VIEW_COOKIE)?.value;
    const res = NextResponse.redirect(new URL(back ? `/admin/creators/${back}` : "/admin/creators", origin));
    for (const name of [SESSION_COOKIE, ADMIN_VIEW_COOKIE]) {
      res.cookies.set(name, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
    }
    return res;
  }

  const id = req.nextUrl.searchParams.get("id") ?? "";
  const { prisma } = await import("@/lib/prisma");
  const c = await prisma.ugcCreator.findUnique({
    where: { id },
    select: { id: true, referralCode: true, dashboardTokenVersion: true },
  });
  if (!c?.referralCode) {
    return NextResponse.json({ error: "This creator has no code yet. Issue one first." }, { status: 400 });
  }
  const res = NextResponse.redirect(new URL("/creators", origin));
  const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: TWO_HOURS };
  res.cookies.set(SESSION_COOKIE, signSessionToken(c.id, c.dashboardTokenVersion), opts);
  res.cookies.set(ADMIN_VIEW_COOKIE, c.id, opts);
  return res;
}
