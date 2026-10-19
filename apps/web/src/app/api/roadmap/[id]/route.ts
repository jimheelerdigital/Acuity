/**
 * GET /api/roadmap/:id — one roadmap item with its detail sections
 * (2026-10-19). Public like GET /api/roadmap; `votedByMe` when signed in
 * (web session or mobile bearer). Backs the app's roadmap detail screen.
 *
 * 200 { item: RoadmapItemDetailDTO, signedIn: boolean } · 404
 */
import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { getRoadmapItem } from "@/lib/roadmap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getAnySessionUserId(req);
  const { prisma } = await import("@/lib/prisma");
  const item = await getRoadmapItem(prisma, params.id, userId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    { item, signedIn: !!userId },
    { headers: { "Cache-Control": "no-store" } }
  );
}
