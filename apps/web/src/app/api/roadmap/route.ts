/**
 * GET /api/roadmap — public roadmap (2026-10-18).
 *
 * Anyone can read. When the caller is signed in (NextAuth cookie or the
 * mobile bearer), each item carries `votedByMe` so the UI can render
 * the toggle state. Same shape for goripple.io/roadmap and the app's
 * Profile → Roadmap screen.
 *
 * 200 { items: RoadmapItemDTO[], signedIn: boolean }
 */
import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { listRoadmap } from "@/lib/roadmap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  const { prisma } = await import("@/lib/prisma");
  const items = await listRoadmap(prisma, userId);
  return NextResponse.json(
    { items, signedIn: !!userId },
    { headers: { "Cache-Control": "no-store" } }
  );
}
