/**
 * POST   /api/creators/posts { url, platform, postedAt } — log a post.
 * DELETE /api/creators/posts?id= — remove a logged post (not once boosted).
 */
import { NextRequest, NextResponse } from "next/server";

import { currentCreatorId } from "@/lib/creators/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PLATFORMS = new Set(["instagram", "tiktok", "youtube", "facebook", "other"]);

export async function POST(req: NextRequest) {
  const creatorId = await currentCreatorId();
  if (!creatorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as
    | { url?: unknown; platform?: unknown; postedAt?: unknown }
    | null;

  let url: URL;
  try {
    url = new URL(String(body?.url ?? "").trim());
  } catch {
    return NextResponse.json({ error: "Paste the full link to the post" }, { status: 400 });
  }
  if (url.protocol !== "https:") {
    return NextResponse.json({ error: "The link must start with https://" }, { status: 400 });
  }
  const platform = String(body?.platform ?? "");
  if (!PLATFORMS.has(platform)) return NextResponse.json({ error: "Pick a platform" }, { status: 400 });
  const postedAt = body?.postedAt ? new Date(String(body.postedAt)) : new Date();
  if (Number.isNaN(postedAt.getTime()) || postedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Pick the date you posted" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  try {
    const post = await prisma.creatorPost.create({
      data: { creatorId, url: url.toString().slice(0, 1000), platform, postedAt },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: post.id });
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "P2002") {
      return NextResponse.json({ error: "You already logged that post" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  const creatorId = await currentCreatorId();
  if (!creatorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const { prisma } = await import("@/lib/prisma");
  const res = await prisma.creatorPost.deleteMany({ where: { id, creatorId, boosted: false } });
  if (res.count === 0) {
    return NextResponse.json({ error: "That post can't be removed" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
