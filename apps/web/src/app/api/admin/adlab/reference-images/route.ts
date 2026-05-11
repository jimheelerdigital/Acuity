/**
 * POST /api/admin/adlab/reference-images — upload reference images for an experiment.
 * Accepts multipart form data: experimentId + files[].
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const formData = await req.formData();
  const experimentId = formData.get("experimentId") as string;

  if (!experimentId) {
    return NextResponse.json({ error: "experimentId required" }, { status: 400 });
  }

  const files = formData.getAll("files") as File[];
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const { supabase } = await import("@/lib/supabase.server");
  const created: { id: string; imageUrl: string }[] = [];

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `ref_${experimentId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;

    const { error } = await supabase.storage
      .from("adlab-creatives")
      .upload(filename, buffer, { contentType: file.type || "image/png", upsert: true });

    if (error) {
      console.error("[adlab] Reference image upload failed:", error.message);
      continue;
    }

    const { data } = supabase.storage
      .from("adlab-creatives")
      .getPublicUrl(filename);

    const row = await prisma.adLabReferenceImage.create({
      data: {
        experimentId,
        imageUrl: data.publicUrl,
      },
    });

    created.push({ id: row.id, imageUrl: row.imageUrl });
  }

  return NextResponse.json({ uploaded: created.length, images: created });
}
