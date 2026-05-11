/**
 * PUT    /api/admin/adlab/reference-images/[id] — update caption
 * DELETE /api/admin/adlab/reference-images/[id] — delete image + storage file
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

  const { caption } = await req.json();

  const updated = await prisma.adLabReferenceImage.update({
    where: { id: params.id },
    data: { caption },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const image = await prisma.adLabReferenceImage.findUnique({
    where: { id: params.id },
  });

  if (!image) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete from Supabase storage
  try {
    const { supabase } = await import("@/lib/supabase.server");
    const filename = image.imageUrl.split("/").pop();
    if (filename) {
      await supabase.storage.from("adlab-creatives").remove([filename]);
    }
  } catch (err) {
    console.error("[adlab] Storage delete failed:", err);
  }

  await prisma.adLabReferenceImage.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
