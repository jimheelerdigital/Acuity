/**
 * POST /api/user/name
 *
 * Sets the signed-in user's display name. Used by the mobile welcome flow
 * (apps/mobile/app/welcome.tsx) for web-funnel subscribers whose account
 * has no name, so the app can greet them by it from then on.
 *
 * Body: { name: string }  (1–50 chars after trimming; see lib/display-name)
 *
 * Bearer-token or cookie auth, like the other /api/user/* writes.
 */

import { NextRequest, NextResponse } from "next/server";

import { cleanDisplayName } from "@/lib/display-name";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  const name = cleanDisplayName(body?.name);
  if (!name) {
    return NextResponse.json(
      { error: "Name must be 1–50 characters." },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");
  await prisma.user.update({ where: { id: userId }, data: { name } });
  return NextResponse.json({ ok: true, name });
}
