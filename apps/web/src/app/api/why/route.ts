/**
 * POST /api/why { t, text } — optional note after a one-tap cancel reason
 * (lib/cancel-feedback.ts). Token-authenticated, rate limited, 1000 chars max.
 */
import { NextRequest, NextResponse } from "next/server";

import { verifyWhyToken } from "@/lib/cancel-feedback";
import { checkRateLimit, limiters, rateLimitedResponse } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { t?: string; text?: string } | null;
  const userId = verifyWhyToken(body?.t);
  const text = (body?.text ?? "").trim().slice(0, 1000);
  if (!userId || !text) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const rl = await checkRateLimit(limiters.userWrite, `why:${userId}`);
  if (!rl.success) return rateLimitedResponse(rl);
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "bad request" }, { status: 400 });
  await prisma.onboardingEvent.create({ data: { userId, event: "cancel_reason_text", value: text } });
  return NextResponse.json({ ok: true });
}
