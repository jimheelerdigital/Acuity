/**
 * Admin: one roadmap item (2026-10-18).
 *   PATCH  /api/admin/roadmap/:id  → partial update (title, summary, status, sortOrder, shippedVersion)
 *   DELETE /api/admin/roadmap/:id  → remove (votes cascade)
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { parseRoadmapBody, type RoadmapWriteBody } from "@/lib/roadmap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const body = (await req.json().catch(() => ({}))) as RoadmapWriteBody;
  const parsed = parseRoadmapBody(body, { partial: true });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const { prisma } = await import("@/lib/prisma");
  const existing = await prisma.roadmapItem.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const item = await prisma.roadmapItem.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ item });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { prisma } = await import("@/lib/prisma");
  const existing = await prisma.roadmapItem.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.roadmapItem.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
