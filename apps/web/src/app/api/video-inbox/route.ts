/**
 * Video inbox (2026-10-29, per Keenan: "send you instagram/youtube/tiktok
 * videos where you can pull them yourself and look at what they do").
 *
 * POST — the iPhone "Send to Ripple" share shortcut. Body:
 *   { "url": "<shared link or text containing one>", "note": "optional", "brand": "ripple|bwk|mythicals|general" }
 * Saves it to the library and queues the watch (inngest/functions/video-inbox.ts).
 * Replies with a one-line `message` the shortcut shows as a notification.
 *
 * GET — the library and playbook as JSON, for Claude sessions and checks.
 *   ?limit=20
 *
 * Auth: `Authorization: Bearer ${VIDEO_INBOX_SECRET}` (or CRON_SECRET), or an admin session.
 */
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

function bearerOk(req: NextRequest): boolean {
  const got = Buffer.from((req.headers.get("authorization") ?? "").trim());
  // Trimmed: a value pasted into Vercel with a stray space or newline still works.
  return [process.env.VIDEO_INBOX_SECRET?.trim(), process.env.CRON_SECRET?.trim()].some((s) => {
    if (!s) return false;
    const want = Buffer.from(`Bearer ${s}`);
    return want.length === got.length && timingSafeEqual(want, got);
  });
}

async function authorized(req: NextRequest): Promise<Response | null> {
  if (bearerOk(req)) return null;
  const guard = await requireAdmin();
  return guard.ok ? null : guard.response;
}

export async function POST(req: NextRequest) {
  const denied = await authorized(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { url?: unknown; note?: unknown; brand?: unknown };
  const { parseVideoUrl, enqueueVideo, VIDEO_BRANDS } = await import("@/lib/video-inbox/watch");

  const parsed = await parseVideoUrl(String(body.url ?? ""));
  if (!parsed) {
    return NextResponse.json(
      { ok: false, message: "That doesn't look like an Instagram, TikTok or YouTube video link." },
      { status: 400 }
    );
  }
  const brandRaw = typeof body.brand === "string" ? body.brand.trim().toLowerCase() : "";
  const brand = VIDEO_BRANDS.find((b) => b === brandRaw) ?? null;
  const note = typeof body.note === "string" ? body.note : null;

  const saved = await enqueueVideo({ ...parsed, note, brand });
  if (!saved.duplicate || saved.status === "QUEUED") {
    const { inngest } = await import("@/inngest/client");
    await inngest.send({ name: "video-inbox/received", data: { id: saved.id } });
  }
  return NextResponse.json({
    ok: true,
    id: saved.id,
    duplicate: saved.duplicate,
    message: saved.duplicate
      ? saved.status === "DONE"
        ? "Already in the library. Check your email for its breakdown."
        : "Already on it. The breakdown is on its way."
      : `Got it. Watching the ${parsed.platform === "youtube" ? "YouTube" : parsed.platform === "tiktok" ? "TikTok" : "Instagram"} video now; the breakdown comes by email.`,
  });
}

export async function GET(req: NextRequest) {
  const denied = await authorized(req);
  if (denied) return denied;
  const { prisma } = await import("@/lib/prisma");
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 20, 1), 100);
  const [videos, lessons] = await Promise.all([
    prisma.videoLesson.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, url: true, platform: true, brand: true, note: true, status: true, error: true,
        author: true, views: true, seenVia: true, breakdown: true, tags: true, createdAt: true,
      },
    }),
    prisma.playbookLesson.findMany({
      where: { status: { in: ["PROPOSED", "APPROVED"] } },
      orderBy: [{ brand: "asc" }, { locked: "desc" }, { strength: "desc" }],
    }),
  ]);
  return NextResponse.json({ videos, lessons });
}
