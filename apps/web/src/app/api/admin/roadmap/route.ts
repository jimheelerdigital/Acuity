/**
 * Admin: roadmap items (2026-10-18).
 *   GET  /api/admin/roadmap          → { items } (all, with vote counts)
 *   POST /api/admin/roadmap          → create { title, summary, status?, sortOrder?, shippedVersion? }
 * Guarded by requireAdmin (User.isAdmin).
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { listRoadmap, parseRoadmapBody, type RoadmapWriteBody } from "@/lib/roadmap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { prisma } = await import("@/lib/prisma");
  const items = await listRoadmap(prisma, gate.adminUserId);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const body = (await req.json().catch(() => ({}))) as RoadmapWriteBody;
  const parsed = parseRoadmapBody(body, { partial: false });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { prisma } = await import("@/lib/prisma");
  // partial=false guarantees title + summary are present.
  const { title, summary, ...rest } = parsed.data;
  const item = await prisma.roadmapItem.create({
    data: { title: title!, summary: summary!, ...rest },
  });
  return NextResponse.json({ item }, { status: 201 });
}
