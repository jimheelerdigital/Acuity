/**
 * POST /api/roadmap/:id/vote — toggle the caller's upvote (2026-10-18).
 *
 * Signed-in only (web session or mobile bearer). One vote per user per
 * item, toggled; shipped items are read-only. 60/hr per user.
 *
 * 200 { voted: boolean, votes: number }
 * 401 / 404 / 409 (shipped) / 429
 */
import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import {
  checkRateLimit,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import { toggleVote } from "@/lib/roadmap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rl = await checkRateLimit(limiters.roadmapVote, `user:${userId}`);
  if (!rl.success) return rateLimitedResponse(rl);

  const { prisma } = await import("@/lib/prisma");
  const result = await toggleVote(prisma, params.id, userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? NextResponse.json({ error: "Not found" }, { status: 404 })
      : NextResponse.json({ error: "Already shipped" }, { status: 409 });
  }
  return NextResponse.json(result);
}
