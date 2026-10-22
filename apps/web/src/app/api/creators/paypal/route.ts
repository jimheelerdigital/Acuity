/**
 * POST /api/creators/paypal { email } — PayPal fallback for creators Stripe
 * can't onboard. An empty email clears it.
 */
import { NextRequest, NextResponse } from "next/server";

import { currentCreatorId } from "@/lib/creators/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const creatorId = await currentCreatorId();
  if (!creatorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid PayPal email" }, { status: 400 });
  }
  const { prisma } = await import("@/lib/prisma");
  await prisma.ugcCreator.update({ where: { id: creatorId }, data: { paypalEmail: email || null } });
  return NextResponse.json({ ok: true });
}
