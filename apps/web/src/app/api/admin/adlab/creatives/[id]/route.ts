/**
 * PUT /api/admin/adlab/creatives/[id] — update creative (approve, edit copy, etc.)
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const allowedFields = [
    "headline",
    "primaryText",
    "description",
    "cta",
    "approved",
    "complianceStatus",
    "complianceNotes",
  ];

  const data: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) data[key] = body[key];
  }

  const updated = await prisma.adLabCreative.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(updated);
}
