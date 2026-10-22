/**
 * Custom referral codes from the creator dashboard (2026-10-22).
 *   GET  ?code=TESS  → { available, message? }   (signed-in creator; live check)
 *   POST { code }    → { ok, code } | 400 { error }
 * Rules + uniqueness live in lib/creators/codes.ts (DB-unique, look-alike-proof).
 */
import { NextRequest, NextResponse } from "next/server";

import { isCodeTaken, setCustomCode } from "@/lib/creators/codes";
import { customCodeProblem, normalizeCode } from "@/lib/creators/money";
import { currentCreatorId } from "@/lib/creators/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const creatorId = await currentCreatorId();
  if (!creatorId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const raw = req.nextUrl.searchParams.get("code") ?? "";
  const problem = customCodeProblem(raw);
  if (problem) return NextResponse.json({ available: false, message: problem });
  const code = normalizeCode(raw)!;
  const { prisma } = await import("@/lib/prisma");
  const mine = await prisma.creatorCode.findFirst({
    where: { creatorId, code },
    select: { id: true },
  });
  if (mine) return NextResponse.json({ available: true, message: "That's one of your codes." });
  const taken = await isCodeTaken(code);
  return NextResponse.json(taken ? { available: false, message: "That code is taken. Try another." } : { available: true });
}

export async function POST(req: NextRequest) {
  const creatorId = await currentCreatorId();
  if (!creatorId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { checkRateLimit, limiters, rateLimitedResponse } = await import("@/lib/rate-limit");
  const rl = await checkRateLimit(limiters.userWrite, `creator-code-set:${creatorId}`);
  if (!rl.success) return rateLimitedResponse(rl);
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const r = await setCustomCode(creatorId, typeof body?.code === "string" ? body.code : "", "creator");
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 });
  return NextResponse.json({ ok: true, code: r.code });
}
