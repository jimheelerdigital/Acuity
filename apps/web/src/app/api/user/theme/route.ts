/**
 * POST /api/user/theme
 *
 * Bearer-token / cookie-auth symmetric endpoint that writes the
 * signed-in user's color-scheme preference. The web app already
 * persists via a server action (actions/save-theme.ts); mobile can't
 * use server actions over the REST boundary so it hits this route.
 *
 * Body: { theme: "light" | "dark" | "system" }
 *   "system" is stored as NULL in the DB — we don't want a stale
 *   "system" string to outlive an OS preference change.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID = new Set(["light", "dark", "system"]);

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    theme?: unknown;
  } | null;
  const theme = typeof body?.theme === "string" ? body.theme : null;
  if (!theme || !VALID.has(theme)) {
    return NextResponse.json(
      { error: "Invalid theme — expected light|dark|system" },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");
  await prisma.user.update({
    where: { id: userId },
    data: { theme: theme === "system" ? null : theme },
  });

  return NextResponse.json({ ok: true });
}
