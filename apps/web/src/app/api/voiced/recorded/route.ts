/**
 * POST /api/voiced/recorded — the phone finished uploading; record it and
 * start the video build (2026-09-30, voiced daily videos). A new upload
 * replaces the previous take and rebuilds.
 *
 * Auth: the HMAC token from the script email. Body: { date, brand, t, path }
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { isVoicedBrand, isVoicedDate, checkVoicedToken, voicedDir, readState, writeState, publicUrl } = await import(
    "@/lib/content-factory/voiced"
  );
  const body = (await req.json().catch(() => ({}))) as { date?: string; brand?: string; t?: string; path?: string };
  if (!isVoicedDate(body.date) || !isVoicedBrand(body.brand) || !checkVoicedToken(body.date, body.brand, body.t)) {
    return NextResponse.json({ error: "This link isn't valid." }, { status: 403 });
  }
  const prefix = `${voicedDir(body.date, body.brand)}/recording-`;
  if (typeof body.path !== "string" || !body.path.startsWith(prefix) || body.path.includes("..")) {
    return NextResponse.json({ error: "Unknown recording." }, { status: 400 });
  }
  const state = await readState(body.date, body.brand);
  if (state?.status === "approved") {
    return NextResponse.json({ error: "This video was already approved and queued to post." }, { status: 409 });
  }
  const head = await fetch(publicUrl(body.path), { method: "HEAD" });
  if (!head.ok) return NextResponse.json({ error: "The upload didn't arrive. Try again." }, { status: 400 });

  await writeState(body.date, body.brand, {
    status: "recorded",
    recordingPath: body.path,
    recordedAt: new Date().toISOString(),
    error: undefined,
  });
  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "content-factory/voiced.build", data: { date: body.date, brand: body.brand } });
  return NextResponse.json({ ok: true });
}
