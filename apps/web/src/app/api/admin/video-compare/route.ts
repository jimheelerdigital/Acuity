/**
 * POST /api/admin/video-compare — side-by-side Higgsfield model test
 * (2026-10-05, per Keenan: "one side by side of each video quality using our
 * higgsfield model"). Uses the same developer-API path as post videos.
 *
 * Body { imageUrl, prompt, models: string[] } → submits one clip per model,
 *   returns [{ model, id }].
 * Body { check: [{ id, model }] } → returns each job's status + video URL.
 *
 * Auth: admin session.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => ({}))) as {
    imageUrl?: string;
    prompt?: string;
    models?: string[];
    check?: { id: string; model: string }[];
  };
  const { submitCoverVideo, checkCoverVideo } = await import("@/lib/content-factory/animate-cover");
  if (body.check?.length) {
    const out = await Promise.all(
      body.check.slice(0, 6).map(async (j) => {
        try {
          return { ...j, ...(await checkCoverVideo(j.id, j.model)) };
        } catch (err) {
          return { ...j, error: String(err).slice(0, 300) };
        }
      })
    );
    return NextResponse.json({ results: out });
  }
  if (!body.imageUrl || !body.prompt || !body.models?.length) {
    return NextResponse.json({ error: "imageUrl, prompt and models required" }, { status: 400 });
  }
  const out = await Promise.all(
    body.models.slice(0, 4).map(async (model) => {
      try {
        return { model, id: await submitCoverVideo({ startImageUrl: body.imageUrl!, prompt: body.prompt!, duration: 5, model }) };
      } catch (err) {
        return { model, error: String(err).slice(0, 300) };
      }
    })
  );
  return NextResponse.json({ jobs: out });
}
